"use client";

import type { AdminJobDetailDto } from "@/lib/api/admin";

function regionLabel(region: string) {
  switch (region) {
    case "central":
      return "Central";
    case "east":
      return "East";
    case "west":
      return "West";
    case "north":
      return "North";
    case "north-east":
      return "North-East";
    case "island-wide":
      return "Island-wide";
    default:
      return region;
  }
}

function jobTypeBadge(type: any) {
  const base =
    "inline-flex items-center rounded-full px-2 py-0.5 text-[10px] font-medium";
  if (type === "scheduled") {
    return (
      <span className={`${base} bg-sky-50 text-sky-700 ring-1 ring-sky-100`}>
        Scheduled
      </span>
    );
  }
  return (
    <span className={`${base} bg-amber-50 text-amber-700 ring-1 ring-amber-100`}>
      Ad-hoc / Urgent
    </span>
  );
}

function statusBadge(status: any) {
  const base =
    "inline-flex items-center rounded-full px-2 py-0.5 text-[10px] font-medium";
  switch (status) {
    case "completed":
      return (
        <span className={`${base} bg-emerald-50 text-emerald-700 ring-1 ring-emerald-200`}>
          Completed
        </span>
      );
    case "failed":
      return (
        <span className={`${base} bg-red-50 text-red-700 ring-1 ring-red-200`}>
          Failed
        </span>
      );
    case "cancelled":
      return (
        <span className={`${base} bg-slate-100 text-slate-500 ring-1 ring-slate-200`}>
          Cancelled
        </span>
      );
    default:
      return (
        <span className={`${base} bg-slate-50 text-slate-700 ring-1 ring-slate-200`}>
          {String(status)}
        </span>
      );
  }
}

export function JobDetailModal({
  open,
  detail,
  loading,
  error,
  onClose,
}: {
  open: boolean;
  detail: AdminJobDetailDto | null;
  loading: boolean;
  error: string | null;
  onClose: () => void;
}) {
  if (!open) return null;

  return (
    <div className="fixed inset-0 z-40 flex items-center justify-center bg-black/40">
      <div className="w-full max-w-3xl rounded-xl bg-white p-5 shadow-xl">
        <div className="mb-3 flex items-center justify-between">
          <h2 className="text-sm font-semibold text-slate-900">
            Job details &amp; proof of delivery
          </h2>
          <button
            type="button"
            onClick={onClose}
            className="text-[11px] text-slate-500 hover:text-slate-800"
          >
            Close ✕
          </button>
        </div>

        {loading && <p className="text-xs text-slate-500">Loading details…</p>}
        {error && <p className="text-xs text-red-600">{error}</p>}

        {detail && (
          <div className="grid gap-4 md:grid-cols-2">
            {/* Summary + stops */}
            <div className="space-y-3">
              <div className="rounded-lg border border-slate-200 bg-slate-50 p-3 text-[11px]">
                <div className="flex items-center justify-between">
                  <div>
                    <p className="font-mono text-[11px] text-slate-700">
                      {detail.job.publicId}
                    </p>
                    <p className="text-xs font-semibold text-slate-900">
                      {detail.job.customerName}
                    </p>
                  </div>
                  <div className="text-right">
                    {statusBadge(detail.job.status as any)}
                    <div className="mt-1 text-[10px] text-slate-500">
                      {jobTypeBadge(detail.job.jobType as any)}
                    </div>
                  </div>
                </div>

                <div className="mt-2 text-[11px] text-slate-600">
                  <p>
                    Pickup: {detail.job.pickupDate} · {detail.job.pickupSlot}
                  </p>
                  <p>
                    Region: {regionLabel(detail.job.pickupRegion)} ·{" "}
                    {detail.job.stopsCount} stops
                  </p>

                  {detail.job.driverName && (
                    <p className="mt-1">
                      Driver: {detail.job.driverName}{" "}
                      {detail.job.driverPhone && (
                        <span className="text-slate-500">
                          · {detail.job.driverPhone}
                        </span>
                      )}
                    </p>
                  )}
                </div>
              </div>

              <div className="rounded-lg border border-slate-200 bg-white p-3 text-[11px]">
                <h3 className="mb-2 text-xs font-semibold text-slate-800">
                  Route &amp; stops
                </h3>

                {detail.stops.length === 0 ? (
                  <p className="text-[11px] text-slate-500">
                    No stops recorded for this job.
                  </p>
                ) : (
                  <ol className="relative border-l border-slate-200 pl-4">
                    {detail.stops
                      .slice()
                      .sort((a, b) => a.sequenceIndex - b.sequenceIndex)
                      .map((stop) => (
                        <li key={stop.id} className="mb-4 last:mb-0">
                          <div className="absolute -left-[7px] mt-1.5 h-3.5 w-3.5 rounded-full border border-slate-300 bg-white" />
                          <div className="ml-2">
                            <p className="text-[10px] uppercase tracking-wide text-slate-500">
                              {stop.type.toUpperCase()} · Stop{" "}
                              {stop.sequenceIndex + 1}
                            </p>
                            <p className="text-[11px] font-semibold text-slate-900">
                              {stop.label}
                            </p>
                            <p className="text-[11px] text-slate-600">
                              {stop.addressLine}{" "}
                              {stop.postalCode && `· S(${stop.postalCode})`}
                            </p>
                            <p className="mt-0.5 text-[11px] text-slate-500">
                              {stop.contactName && (
                                <>
                                  Contact: {stop.contactName}
                                  {stop.contactPhone && ` · ${stop.contactPhone}`}
                                </>
                              )}
                            </p>
                            {stop.completedAt && (
                              <p className="mt-0.5 text-[10px] text-emerald-600">
                                Completed at{" "}
                                {new Date(stop.completedAt).toLocaleString()}
                              </p>
                            )}
                          </div>
                        </li>
                      ))}
                  </ol>
                )}
              </div>
            </div>

            {/* Proof photos */}
            <div className="rounded-lg border border-slate-200 bg-white p-3 text-[11px]">
              <h3 className="mb-2 text-xs font-semibold text-slate-800">
                Proof of delivery photos
              </h3>

              {detail.proofPhotos.length === 0 ? (
                <p className="text-[11px] text-slate-500">
                  No proof photos were captured for this job.
                </p>
              ) : (
                <div className="grid grid-cols-3 gap-2">
                  {detail.proofPhotos.map((photo) => (
                    <button
                      key={photo.id}
                      type="button"
                      onClick={() => window.open(photo.url, "_blank", "noopener")}
                      className="group relative"
                    >
                      <img
                        src={photo.url}
                        alt="Proof"
                        className="h-20 w-full rounded-md border border-slate-200 object-cover group-hover:border-sky-500"
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
              )}

              {detail.proofPhotos.length > 0 && (
                <p className="mt-2 text-[10px] text-slate-500">
                  Click any thumbnail to open the full-size image in a new tab.
                </p>
              )}
            </div>
          </div>
        )}
      </div>
    </div>
  );
}
