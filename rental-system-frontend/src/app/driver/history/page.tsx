// src/app/driver/history/page.tsx
"use client";

import { useMemo } from "react";
import Link from "next/link";

import { useUnifiedJobs } from "@/lib/unified-jobs-store";
import { useDriverIdentity } from "@/lib/use-driver-identity";
import type { DriverJob } from "@/lib/types";

export default function DriverHistoryPage() {
  const { driverJobs, loaded } = useUnifiedJobs();
  const { driver } = useDriverIdentity();

  type DriverJobWithDriverId = DriverJob & {
    driverId?: string | null;
    assignedDriverId?: string | null;
  };

  const { completed, active } = useMemo(() => {
    const all = driverJobs as DriverJobWithDriverId[];

    if (!driver) {
      return {
        completed: [] as DriverJobWithDriverId[],
        active: [] as DriverJobWithDriverId[],
      };
    }

    const anyTagged = all.some(
      (j) => j.driverId != null || j.assignedDriverId != null
    );

    const visibleJobs = anyTagged
      ? all.filter(
          (j) =>
            j.driverId === driver.id || j.assignedDriverId === driver.id
        )
      : all;

    const completedJobs = visibleJobs.filter((j) => j.status === "completed");
    const activeJobs = visibleJobs.filter((j) => j.status !== "completed");

    return { completed: completedJobs, active: activeJobs };
  }, [driverJobs, driver]);

  if (!loaded) {
    return (
      <div className="flex min-h-[60vh] items-center justify-center text-xs text-slate-400">
        Loading history…
      </div>
    );
  }

  if (!driver) {
    return (
      <div className="flex min-h-[60vh] items-center justify-center text-xs text-slate-400">
        No driver selected. Please log in again.
      </div>
    );
  }

  return (
    <div className="min-h-screen bg-slate-950 px-4 py-4 text-slate-50">
      <header className="mb-4">
        <h1 className="text-sm font-semibold">Job History</h1>
        <p className="text-[11px] text-slate-400">
          Completed and in-progress jobs for {driver.name}.
        </p>
      </header>

      {/* Active / non-completed jobs (quick access) */}
      {active.length > 0 && (
        <section className="mb-6">
          <h2 className="mb-2 text-xs font-semibold uppercase tracking-wide text-slate-400">
            Still In Progress
          </h2>
          <div className="space-y-3">
            {active.map((job) => (
              <Link
                key={job.id}
                href={`/driver/job/${job.id}`}
                className="block rounded-xl border border-slate-800 bg-slate-900/70 p-3 text-xs hover:border-sky-500 hover:bg-slate-900"
              >
                <div className="flex items-center justify-between gap-2">
                  <div>
                    <p className="font-mono text-[11px] text-slate-400">
                      {job.displayId}
                    </p>
                    <p className="text-sm font-semibold text-slate-50">
                      {job.originLabel}
                    </p>
                    <p className="text-[11px] text-slate-400">
                      {job.areaLabel}
                    </p>
                  </div>
                  <div className="text-right text-[11px] text-slate-300">
                    <p>{job.pickupDate}</p>
                    <p className="font-medium">{job.pickupWindow}</p>
                    <p className="mt-1 text-slate-400">
                      {job.totalStops} stops ·{" "}
                      {job.totalBillableWeightKg.toFixed(1)} kg
                    </p>
                    <p className="mt-0.5 text-[10px] text-amber-300">
                      In progress (offline data)
                    </p>
                  </div>
                </div>
              </Link>
            ))}
          </div>
        </section>
      )}

      {/* Completed jobs */}
      <section>
        <h2 className="mb-2 text-xs font-semibold uppercase tracking-wide text-slate-400">
          Completed Jobs
        </h2>

        {completed.length === 0 ? (
          <p className="text-[11px] text-slate-500">
            No completed jobs recorded for this driver in the current offline
            dataset.
          </p>
        ) : (
          <div className="space-y-3">
            {completed.map((job) => (
  <Link
    key={job.id}
    href={`/driver/job/${job.id}`}
    className="block rounded-xl border border-slate-800 bg-slate-900/70 p-3 text-xs hover:border-sky-500 hover:bg-slate-900"
  >
    <div className="flex items-center justify-between gap-2">
      <div>
        <p className="font-mono text-[11px] text-slate-400">{job.displayId}</p>
        <p className="text-sm font-semibold text-slate-50">{job.originLabel}</p>
        <p className="text-[11px] text-slate-400">{job.areaLabel}</p>
      </div>
      <div className="text-right text-[11px] text-slate-300">
        <p>{job.pickupDate}</p>
        <p className="font-medium">{job.pickupWindow}</p>
        <p className="mt-1 text-slate-400">
          {job.totalStops} stops · {job.totalBillableWeightKg.toFixed(1)} kg
        </p>
        <p className="mt-0.5 text-[10px] text-emerald-300">
          Completed (offline data)
        </p>
      </div>
    </div>
  </Link>
))}

          </div>
        )}
      </section>
    </div>
  );
}
