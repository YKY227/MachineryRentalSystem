// src/app/(public-pages)/tracking/[jobId]/page.tsx
"use client";

import { useEffect, useMemo, useState } from "react";
import { useRouter } from "next/navigation";
import { fetchPublicTrackingJob, type AdminJobDetailDto } from "@/lib/api/admin";

const STATUS_STEPS = [
  {
    id: "booked",
    label: "Booked",
    description: "Job has been created in the system.",
  },
  {
    id: "allocated",
    label: "Allocated",
    description: "A driver has been assigned.",
  },
  {
    id: "pickup",
    label: "Out for pickup",
    description: "Driver is heading to the pickup point.",
  },
  {
    id: "completed",
    label: "Completed",
    description: "All deliveries have been completed.",
  },
];

type TrackingPageProps = {
  params: { jobId: string };
};

function statusToStepIndex(status: string | null | undefined): number {
  if (!status) return 0;

  switch (status) {
    case "completed":
      return 3;

    case "in-progress":
    case "pickup":
      return 2;

    case "allocated":
      return 1;

    case "booked":
    default:
      return 0;
  }
}

export default function TrackingPage({ params }: TrackingPageProps) {
  const router = useRouter();
  const { jobId } = params; // this is the PUBLIC ID e.g. "STL-241123-0999"

  const [detail, setDetail] = useState<AdminJobDetailDto | null>(null);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);

  useEffect(() => {
    async function load() {
      setLoading(true);
      setError(null);
      try {
        const data = await fetchPublicTrackingJob(jobId); 
        console.log("[TrackingPage] backend status:", data?.job?.status);
console.log("[TrackingPage] proofPhotos:", data?.proofPhotos?.length);
        setDetail(data);
      } catch (e: any) {
        console.error("[TrackingPage] Failed to load tracking job", e);
        setError(e?.message ?? "Failed to load job status. Please try again.");
      } finally {
        setLoading(false);
      }
    }
    if (jobId) {
      load();
    }
  }, [jobId]);

  const currentStepIndex = useMemo(() => {
    if (!detail?.job) return 0;
    return statusToStepIndex(detail.job.status);
  }, [detail]);

  const proofPhotos = detail?.proofPhotos ?? [];

  return (
    <div className="min-h-screen bg-slate-50">
      <main className="mx-auto max-w-3xl px-4 py-8">
        {/* Header */}
        <div className="mb-6 flex items-center justify-between gap-3">
          <div>
            <h1 className="text-lg font-semibold text-slate-900">Track Job</h1>
            <p className="text-xs text-slate-500">
              Status updates for your courier booking.
            </p>
          </div>

          <button
            type="button"
            onClick={() => router.push("/")}
            className="rounded-lg border border-slate-300 px-3 py-1.5 text-xs font-medium text-slate-700 hover:border-sky-400 hover:text-sky-700"
          >
            ← Back to Home
          </button>
        </div>

        {/* Job ID card */}
        <div className="mb-6 rounded-xl border border-slate-200 bg-white p-4">
          <p className="text-xs font-semibold uppercase tracking-wide text-slate-500">
            Job ID
          </p>
          <p className="mt-1 font-mono text-sm font-semibold text-slate-900">
            {detail?.job?.publicId ?? jobId}
          </p>
          {detail?.job?.customerName && (
            <p className="mt-1 text-[11px] text-slate-600">
              Customer:{" "}
              <span className="font-medium text-slate-900">
                {detail.job.customerName}
              </span>
            </p>
          )}
          <p className="mt-1 text-[11px] text-slate-500">
            Keep this ID for reference when you contact support or check status.
          </p>
        </div>

        {/* Loading / error states */}
        {loading && (
          <div className="mb-6 rounded-xl border border-slate-200 bg-white p-4 text-xs text-slate-500">
            Loading latest status…
          </div>
        )}
        {error && !loading && (
          <div className="mb-6 rounded-xl border border-red-100 bg-red-50 p-4 text-xs text-red-700">
            {error}
          </div>
        )}

        {/* Only show details when we have data */}
        {detail && !loading && !error && (
          <>
            {/* Timeline */}
            <section className="rounded-xl border border-slate-200 bg-white p-4">
              <h2 className="mb-3 text-xs font-semibold uppercase tracking-wide text-slate-500">
                Delivery Timeline
              </h2>

              <ol className="relative border-l border-slate-200 pl-4">
                {STATUS_STEPS.map((step, index) => {
                  const isCompleted = index < currentStepIndex;
                  const isCurrent = index === currentStepIndex;

                  return (
                    <li key={step.id} className="mb-6 last:mb-0">
                      <div
                        className="absolute -left-[7px] mt-1.5 h-3.5 w-3.5 rounded-full border bg-white"
                        style={{
                          borderColor: isCurrent
                            ? "#0ea5e9" // sky-500
                            : isCompleted
                            ? "#22c55e" // green-500
                            : "#cbd5f5", // slate-ish
                          backgroundColor: isCompleted
                            ? "#22c55e"
                            : isCurrent
                            ? "#0ea5e9"
                            : "#ffffff",
                        }}
                      />

                      <div className="ml-2">
                        <p className="text-xs font-semibold text-slate-900">
                          {step.label}{" "}
                          {isCurrent && (
                            <span className="ml-1 rounded-full bg-sky-50 px-2 py-0.5 text-[10px] font-medium text-sky-700">
                              Current
                            </span>
                          )}
                          {isCompleted && !isCurrent && (
                            <span className="ml-1 rounded-full bg-emerald-50 px-2 py-0.5 text-[10px] font-medium text-emerald-700">
                              Done
                            </span>
                          )}
                        </p>
                        <p className="mt-0.5 text-[11px] text-slate-500">
                          {step.description}
                        </p>
                      </div>
                    </li>
                  );
                })}
              </ol>

              <p className="mt-4 text-[11px] text-slate-500">
                Status is updated automatically based on the driver&apos;s app
                and operations dashboard.
              </p>
            </section>

            {/* Proof of Delivery Photos */}
            <section className="mt-6 rounded-xl border border-slate-200 bg-white p-4">
              <h2 className="mb-2 text-xs font-semibold uppercase tracking-wide text-slate-500">
                Proof of Delivery Photos
              </h2>

              {proofPhotos.length === 0 ? (
                <p className="text-[11px] text-slate-500">
                  No proof photos are available yet. Photos will appear here once
                  the driver has completed the delivery.
                </p>
              ) : (
                <>
                  <div className="grid grid-cols-3 gap-2">
                    {proofPhotos.map((photo) => (
                      <button
                        key={photo.id}
                        type="button"
                        onClick={() =>
                          window.open(photo.url, "_blank", "noopener")
                        }
                        className="group relative"
                      >
                        <img
                          src={photo.url}
                          alt="Proof of delivery"
                          className="h-24 w-full rounded-md border border-slate-200 object-cover group-hover:border-sky-500"
                        />
                        <span className="absolute bottom-1 right-1 rounded bg-black/60 px-1 text-[9px] text-white">
                          {new Date(photo.takenAt).toLocaleTimeString([], {
                            hour: "2-digit",
                            minute: "2-digit",
                          })}
                        </span>
                      </button>
                    ))}
                  </div>
                  <p className="mt-2 text-[10px] text-slate-500">
                    Tap any thumbnail to open the full-size image in a new tab.
                  </p>
                </>
              )}
            </section>
          </>
        )}

        {/* Actions */}
        <div className="mt-6 flex flex-wrap gap-2">
          <button
            type="button"
            onClick={() => router.push("/booking/steps/delivery-type")}
            className="inline-flex items-center rounded-lg bg-slate-900 px-4 py-2 text-xs font-medium text-white hover:bg-slate-800"
          >
            + Book another job
          </button>

          <button
            type="button"
            onClick={() => router.push("/")}
            className="inline-flex items-center rounded-lg border border-slate-300 px-4 py-2 text-xs font-medium text-slate-700 hover:border-sky-400 hover:text-sky-700"
          >
            Back to homepage
          </button>
        </div>
      </main>
    </div>
  );
}
