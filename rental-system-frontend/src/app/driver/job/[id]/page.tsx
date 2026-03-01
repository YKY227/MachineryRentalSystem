"use client";

import { useMemo, useRef, useState } from "react";
import { useRouter } from "next/navigation";
import { useUnifiedJobs } from "../../../../lib/unified-jobs-store";
import type { DriverJobStop, RoutePattern } from "@/lib/types";
import { uploadProofPhoto } from "@/lib/api/driver-proof";

type JobDetailPageProps = {
  params: { id: string };
};

function statusLabel(status: string) {
  switch (status) {
    case "booked":
      return "Booked";
    case "allocated":
      return "Allocated";
    case "pickup":
      return "Out for pickup";
    case "in-progress":
      return "Delivering to next stop"; // ✅ polished wording
    case "completed":
      return "Completed";
    default:
      return status;
  }
}

function routePatternLabel(pattern?: RoutePattern) {
  switch (pattern) {
    case "one-to-many":
      return "1 → many";
    case "many-to-one":
      return "Many → 1";
    case "round-trip":
      return "Round trip";
    case "one-to-one":
      return "1 → 1";
    default:
      return "";
  }
}

function stopTypeLabel(type: DriverJobStop["type"]) {
  switch (type) {
    case "pickup":
      return "Pickup";
    case "delivery":
      return "Delivery";
    case "return":
      return "Return";
    default:
      return "Stop";
  }
}

function normalizePhoneSG(raw?: string | null): string {
  const digits = String(raw ?? "").replace(/\D/g, "");
  if (!digits) return "";
  // If already has country code (65xxxxxxx)
  if (digits.startsWith("65") && digits.length >= 10) return `+${digits}`;
  // Common SG local: 8 digits
  if (digits.length === 8) return `+65${digits}`;
  // fallback
  return digits.startsWith("+") ? digits : `+${digits}`;
}

function waLink(phoneE164: string, text?: string) {
  const base = `https://wa.me/${phoneE164.replace("+", "")}`;
  const q = text ? `?text=${encodeURIComponent(text)}` : "";
  return `${base}${q}`;
}


export default function DriverJobDetailPage({ params }: JobDetailPageProps) {
  const router = useRouter();
  const { id } = params;

  const {
    driverJobs: jobs,
    pendingActions,
    loaded,
    markDriverJobStatus: markJobStatus,
    markDriverStopCompleted: markStopCompleted,
  } = useUnifiedJobs();

  const job = useMemo(() => jobs.find((j) => j.id === id), [jobs, id]);

  // ─────────────────────────────────────────────
  // Photo upload + viewer local state
  // ─────────────────────────────────────────────
  const [activeStopId, setActiveStopId] = useState<string | null>(null);
  const [uploadingStopId, setUploadingStopId] = useState<string | null>(null);
  const [uploadError, setUploadError] = useState<string | null>(null);

  // stopId -> array of photo URLs uploaded this session
  const [localProofs, setLocalProofs] = useState<Record<string, string[]>>({});

  // simple image viewer
  const [viewer, setViewer] = useState<{ open: boolean; url: string | null }>({
    open: false,
    url: null,
  });

  const fileInputRef = useRef<HTMLInputElement | null>(null);

  const handleOpenFilePicker = (stopId: string) => {
    setActiveStopId(stopId);
    setUploadError(null);
    fileInputRef.current?.click();
  };

  const handleFileChange: React.ChangeEventHandler<HTMLInputElement> = async (
    event
  ) => {
    const file = event.target.files?.[0];
    if (!file || !job || !activeStopId) {
      event.target.value = "";
      return;
    }

    try {
      setUploadingStopId(activeStopId);
      setUploadError(null);

      const proof = await uploadProofPhoto(job.id, file, activeStopId);

      // ✅ store URL locally for instant feedback
      setLocalProofs((prev) => ({
        ...prev,
        [activeStopId]: [...(prev[activeStopId] ?? []), proof.url],
      }));
    } catch (err: any) {
      console.error("[DriverJobDetailPage] upload failed", err);
      setUploadError(err?.message ?? "Failed to upload photo.");
    } finally {
      setUploadingStopId(null);
      event.target.value = "";
    }
  };

  // ─────────────────────────────────────────────
  // Guards & helpers (requirements enforcement)
  // ─────────────────────────────────────────────
  const canInteractWithStops = job ? job.status !== "allocated" : false;

  function hasProofForStop(stop: DriverJobStop): boolean {
    if (stop.proofPhotoUrl) return true;
    const local = localProofs[stop.id];
    return Array.isArray(local) && local.length > 0;
  }

  function canCompleteStop(stop: DriverJobStop): boolean {
    if (!canInteractWithStops) return false; // ✅ Requirement #1
    if (stop.completed) return false;
    return hasProofForStop(stop); // ✅ Requirement #3
  }

  function allStopsHaveProof(): boolean {
    if (!job) return false;
    return job.stops.every((s) => hasProofForStop(s));
  }

  function allStopsCompleted(): boolean {
    if (!job) return false;
    return job.stops.every((s) => s.completed);
  }

  async function markStopCompletedWithGuards(stop: DriverJobStop) {
    if (!job) return;

    if (!canInteractWithStops) {
      alert("Start the job first: tap “Mark out for pickup”.");
      return;
    }

    if (!hasProofForStop(stop)) {
      alert("Please upload at least one photo before marking this stop completed.");
      return;
    }

    // Mark this stop
    await markStopCompleted(job.id, stop.id);

    // ✅ Requirement #2: auto move status when pickups done
    // If job is in pickup stage and all pickup stops are completed => set "in-progress"
    const pickupStops = job.stops.filter((s) => s.type === "pickup");
    const allPickupsDone = pickupStops.length > 0 && pickupStops.every((s) => s.completed || s.id === stop.id);
    if (job.status === "pickup" && allPickupsDone) {
      // "Delivering to next stop"
      await markJobStatus(job.id, "in-progress");
    }
  }

  async function completeJobWithGuards() {
    if (!job) return;

    if (!canInteractWithStops) {
      alert("Start the job first: tap “Mark out for pickup”.");
      return;
    }

    // ✅ Requirement #3: cannot complete job if any stop has no proof
    if (!allStopsHaveProof()) {
      alert("Cannot complete job: Please upload at least one photo for every stop.");
      return;
    }

    if (!allStopsCompleted()) {
      alert("Cannot complete job: Please mark all stops as completed first.");
      return;
    }

    await markJobStatus(job.id, "completed");
  }

  function removeLocalPhoto(stopId: string, url: string) {
    setLocalProofs((prev) => {
      const arr = prev[stopId] ?? [];
      const next = arr.filter((u) => u !== url);
      return { ...prev, [stopId]: next };
    });
  }

  // ─────────────────────────────────────────────

  if (!loaded) {
    return (
      <div className="flex min-h-[60vh] items-center justify-center text-xs text-slate-400">
        Loading job…
      </div>
    );
  }

  if (!job) {
    return (
      <div className="min-h-screen bg-slate-950 px-4 py-8 text-slate-50">
        <button
          type="button"
          onClick={() => router.push("/driver/jobs")}
          className="mb-4 text-xs text-slate-400 hover:text-slate-200"
        >
          ← Back to jobs
        </button>
        <p className="text-sm font-semibold">Job not found</p>
        <p className="mt-1 text-xs text-slate-400">
          This job ID is not in the current dataset.
        </p>
      </div>
    );
  }

  const hasPendingForJob = pendingActions.some((a) => a.jobId === job.id);

  return (
    <div className="min-h-screen bg-slate-950">
      {/* Image Viewer (Requirement #4) */}
      {viewer.open && viewer.url && (
        <div
          className="fixed inset-0 z-50 flex items-center justify-center bg-black/70 px-4"
          onClick={() => setViewer({ open: false, url: null })}
        >
          <div className="max-w-md w-full" onClick={(e) => e.stopPropagation()}>
            <div className="rounded-xl border border-slate-700 bg-slate-950 p-2">
              <img
                src={viewer.url}
                alt="Proof"
                className="w-full rounded-lg object-contain"
              />
              <div className="mt-2 flex justify-end">
                <button
                  type="button"
                  className="rounded-lg border border-slate-700 px-3 py-1 text-[11px] text-slate-200 hover:border-sky-500"
                  onClick={() => setViewer({ open: false, url: null })}
                >
                  Close
                </button>
              </div>
            </div>
          </div>
        </div>
      )}

      <header className="sticky top-0 z-20 border-b border-slate-800 bg-slate-950/95 px-4 py-3 backdrop-blur">
        <div className="mx-auto flex max-w-md items-center justify-between gap-2">
          <button
            type="button"
            onClick={() => router.push("/driver/jobs")}
            className="text-xs text-slate-400 hover:text-slate-100"
          >
            ← Jobs
          </button>
          <div className="text-right">
            <p className="text-[11px] font-mono text-slate-400">{job.displayId}</p>
            <p className="text-xs font-semibold text-slate-50">{statusLabel(job.status)}</p>
            {job.routePattern && (
              <p className="mt-0.5 text-[10px] text-slate-300">
                Route type: {routePatternLabel(job.routePattern)}
              </p>
            )}
            {hasPendingForJob && <p className="text-[10px] text-amber-300">Pending sync…</p>}
          </div>
        </div>
      </header>

      <main className="mx-auto max-w-md space-y-4 px-4 py-4">
        {/* Hidden file input shared by all stops */}
        <input
          ref={fileInputRef}
          type="file"
          accept="image/*"
          capture="environment"
          className="hidden"
          onChange={handleFileChange}
        />

        {/* Job meta */}
        <section className="rounded-xl border border-slate-800 bg-slate-900/70 p-4">
          <div className="flex items-start justify-between gap-2">
            <div>
              <p className="text-[11px] uppercase tracking-wide text-slate-400">Pickup</p>
              <p className="text-sm font-semibold text-slate-50">{job.originLabel}</p>
              <p className="text-[11px] text-slate-400">{job.areaLabel}</p>
            </div>
            <div className="text-right text-[11px] text-slate-300">
              <p>{job.pickupDate}</p>
              <p className="font-medium">{job.pickupWindow}</p>
              <p className="mt-1 text-slate-400">
                {job.totalStops} stops · {job.totalBillableWeightKg.toFixed(1)} kg
              </p>
            </div>
          </div>

          {/* Driver actions */}
          <div className="mt-3 flex flex-wrap gap-2">
            <button
              type="button"
              onClick={() => markJobStatus(job.id, "pickup")}
              disabled={job.status !== "allocated"}
              className={[
                "flex-1 rounded-lg px-3 py-2 text-xs font-medium",
                job.status !== "allocated"
                  ? "bg-slate-800 text-slate-400 cursor-not-allowed"
                  : "bg-sky-600 text-white hover:bg-sky-700",
              ].join(" ")}
            >
              Mark out for pickup
            </button>

            <button
              type="button"
              className="flex-1 rounded-lg border border-slate-600 px-3 py-2 text-xs font-medium text-slate-100 hover:border-sky-500 hover:text-sky-100"
            >
              Open in Maps
            </button>

            {/* ✅ Requirement #3: completion only if all stops completed + photos */}
            <button
              type="button"
              onClick={completeJobWithGuards}
              disabled={job.status === "completed"}
              className={[
                "w-full rounded-lg px-3 py-2 text-xs font-semibold",
                job.status === "completed"
                  ? "bg-emerald-900/40 text-emerald-200 border border-emerald-700"
                  : "border border-emerald-700 text-emerald-200 hover:bg-emerald-900/30",
              ].join(" ")}
            >
              {job.status === "completed" ? "Job completed" : "Complete job"}
            </button>
          </div>

          {!canInteractWithStops && (
            <p className="mt-2 text-[10px] text-amber-300">
              Start the job first to enable stop actions.
            </p>
          )}

          {hasPendingForJob && (
            <p className="mt-2 text-[10px] text-amber-300">
              Changes stored locally – will sync when online &amp; connected to server.
            </p>
          )}
        </section>

        {/* Stops timeline */}
        <section className="rounded-xl border border-slate-800 bg-slate-900/70 p-4">
          <h2 className="mb-3 text-xs font-semibold uppercase tracking-wide text-slate-400">
            Route &amp; Stops
          </h2>

          <ol className="relative border-l border-slate-700 pl-4">
            {job.stops
              .slice()
              .sort((a, b) => a.sequence - b.sequence)
              .map((stop) => {
                const hasPendingForStop = pendingActions.some(
                  (a) => a.jobId === job.id && a.stopId === stop.id
                );

                const localUrls = localProofs[stop.id] ?? [];
                const hasProof = hasProofForStop(stop);
                const canComplete = canCompleteStop(stop);

                const stopActionsDisabled = !canInteractWithStops;

                return (
                  <li key={stop.id} className="mb-5 last:mb-0">
                    <div className="absolute -left-[7px] mt-1.5 h-3.5 w-3.5 rounded-full border border-slate-500 bg-slate-900" />
                    <div className="ml-2 text-[11px] text-slate-200">
                      <p className="text-[10px] uppercase tracking-wide text-slate-400">
                        {stopTypeLabel(stop.type)} · Stop {stop.sequence}
                      </p>

                      <p className="font-semibold text-slate-50">{stop.label}</p>
                      <p className="text-slate-400">
                        {stop.addressLine1} · S({stop.postalCode})
                      </p>
                      <p className="mt-0.5 text-slate-400">
                        Contact: {stop.contactName} · {stop.contactPhone}
                      </p>

                      {stop.remarks && (
                        <p className="mt-0.5 text-slate-500">Remarks: {stop.remarks}</p>
                      )}

                      {/* Server proof */}
                      {stop.proofPhotoUrl && (
                        <div className="mt-2 flex flex-wrap items-center gap-2">
                          <button
                            type="button"
                            onClick={() => setViewer({ open: true, url: stop.proofPhotoUrl! })}
                            className="inline-block"
                            title="View photo"
                          >
                            <img
                              src={stop.proofPhotoUrl}
                              alt="Proof"
                              className="h-12 w-12 rounded-md border border-slate-700 object-cover"
                              onError={(e) => {
                                // make broken images obvious
                                (e.currentTarget as HTMLImageElement).style.opacity = "0.4";
                              }}
                            />
                          </button>
                          <span className="self-center text-[10px] text-slate-500">
                            Latest proof from server
                          </span>
                        </div>
                      )}

                      {/* Local proofs */}
                      {localUrls.length > 0 && (
                        <div className="mt-2 flex flex-wrap gap-2">
                          {localUrls.map((url, idx) => (
                            <div key={`${url}-${idx}`} className="relative">
                              <button
                                type="button"
                                onClick={() => setViewer({ open: true, url })}
                                className="inline-block"
                                title="View photo"
                              >
                                <img
                                  src={url}
                                  alt={`Proof ${idx + 1}`}
                                  className="h-12 w-12 rounded-md border border-slate-700 object-cover"
                                  onError={(e) => {
                                    (e.currentTarget as HTMLImageElement).style.opacity = "0.4";
                                  }}
                                />
                              </button>

                              {/* ✅ Requirement #4: delete option (local only) */}
                              <button
                                type="button"
                                onClick={() => removeLocalPhoto(stop.id, url)}
                                className="absolute -right-2 -top-2 rounded-full border border-slate-700 bg-slate-950 px-1.5 py-0.5 text-[10px] text-slate-200 hover:border-rose-500"
                                title="Remove photo"
                              >
                                ✕
                              </button>
                            </div>
                          ))}
                        </div>
                      )}

                      {!hasProof && (
                        <p className="mt-2 text-[10px] text-amber-300">
                          Upload a photo to enable completion.
                        </p>
                      )}

                      <div className="mt-2 flex flex-wrap items-center gap-2">
                        {/* ✅ Requirement #1 + #3 */}
                        <button
                          type="button"
                          disabled={!canComplete}
                          onClick={() => markStopCompletedWithGuards(stop)}
                          className={[
                            "rounded-md border px-2 py-1 text-[10px]",
                            stop.completed
                              ? "border-emerald-400 text-emerald-300"
                              : canComplete
                              ? "border-slate-600 text-slate-100 hover:border-sky-500"
                              : "border-slate-700 text-slate-500 opacity-60 cursor-not-allowed",
                          ].join(" ")}
                        >
                          {stop.completed ? "Completed" : "Mark completed"}
                        </button>

                        {/* ✅ Requirement #1 */}
                        {(() => {
                        const phone = normalizePhoneSG(stop.contactPhone);
                        const msg = `Hi ${stop.contactName ?? ""}, I'm your driver for job ${job.displayId}. I'm at Stop ${stop.sequence}.`;
                        const disabled = !phone;

                        return (
                          <div className="flex gap-2">
                            <a
                              href={disabled ? undefined : `tel:${phone}`}
                              className={[
                                "rounded-md border px-2 py-1 text-[10px]",
                                disabled
                                  ? "border-slate-700 text-slate-500 opacity-60 pointer-events-none"
                                  : "border-slate-600 text-slate-100 hover:border-sky-500",
                              ].join(" ")}
                            >
                              Call
                            </a>

                            <a
                              href={disabled ? undefined : waLink(phone, msg)}
                              target="_blank"
                              rel="noopener noreferrer"
                              className={[
                                "rounded-md border px-2 py-1 text-[10px]",
                                disabled
                                  ? "border-slate-700 text-slate-500 opacity-60 pointer-events-none"
                                  : "border-slate-600 text-slate-100 hover:border-sky-500",
                              ].join(" ")}
                            >
                              WhatsApp
                            </a>
                          </div>
                        );
                      })()}


                        {/* ✅ Requirement #1 */}
                        <button
                          type="button"
                          onClick={() => handleOpenFilePicker(stop.id)}
                          disabled={stopActionsDisabled || uploadingStopId === stop.id}
                          className={[
                            "rounded-md border px-2 py-1 text-[10px]",
                            stopActionsDisabled
                              ? "border-slate-700 text-slate-500 opacity-60 cursor-not-allowed"
                              : "border-slate-600 text-slate-100 hover:border-sky-500",
                            uploadingStopId === stop.id ? "opacity-60" : "",
                          ].join(" ")}
                        >
                          {uploadingStopId === stop.id ? "Uploading…" : "Take / Upload photo"}
                        </button>

                        {hasPendingForStop && (
                          <span className="text-[10px] text-amber-300">Pending sync…</span>
                        )}
                      </div>
                    </div>
                  </li>
                );
              })}
          </ol>

          {uploadError && <p className="mt-3 text-[10px] text-red-400">{uploadError}</p>}

          <p className="mt-4 text-[11px] text-slate-500">
            Photos are uploaded to the server as proof of pickup/delivery. In a real deployment,
            customers will be able to see these on the tracking page.
          </p>
        </section>
      </main>
    </div>
  );
}
