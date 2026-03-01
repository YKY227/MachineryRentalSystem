// src/app/driver/jobs/page.tsx
"use client";

import Link from "next/link";
import { useEffect, useMemo } from "react";
import { useRouter } from "next/navigation";

import { useUnifiedJobs } from "@/lib/unified-jobs-store";
import { useDriverIdentity } from "@/lib/use-driver-identity";
import type { DriverJob, RoutePattern, DriverJobStatus } from "@/lib/types";
import { getDriverToken, clearDriverToken } from "@/lib/driver-auth";

// ─────────────────────────────────────────────
// Small helpers
// ─────────────────────────────────────────────
function statusLabel(status: DriverJobStatus | string) {
  switch (status) {
    case "booked":
      return "Booked";
    case "allocated":
      return "Allocated";
    case "pickup":
      return "Out for pickup";
    case "in-progress":
      return "In progress";
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

// Normalise pickupDate to "YYYY-MM-DD"
function toDateKey(value: string | null | undefined): string {
  if (!value) return "";
  return value.slice(0, 10);
}

// Defensively parse weight (string | number → number)
function toWeightNumber(weight: unknown): number {
  if (typeof weight === "number") return weight;
  if (typeof weight === "string") {
    const n = Number(weight);
    return Number.isFinite(n) ? n : 0;
  }
  return 0;
}

// ─────────────────────────────────────────────
// Page component
// ─────────────────────────────────────────────
export default function DriverJobsPage() {
  const router = useRouter();
  const { driverJobs, loaded: jobsLoaded, refreshDriverJobs, driverJobsLoading } = useUnifiedJobs();
  
  const { driver, loaded: identityLoaded, logoutDriver } = useDriverIdentity();

  
  // Debug identity
  useEffect(() => {
    console.log("[DriverJobsPage] identity", {
      identityLoaded,
      driver,
    });
  }, [identityLoaded, driver]);

  // Auth guard: wait until identity is loaded, then check token
  useEffect(() => {
    if (!identityLoaded) return;

    const token = getDriverToken();
    console.log("[DriverJobsPage] auth-check", {
      path: typeof window !== "undefined" ? window.location.pathname : "(server)",
      tokenKey: "cms-driver-token-v1",
      hasToken: Boolean(token),
      tokenLen: token?.length,
    });

    if (!token) {
      console.warn(
        "[DriverJobsPage] missing token -> clearing identity + redirect to /driver/login",
      );
      clearDriverToken();
      logoutDriver();
      router.replace("/driver/login");
    }
  }, [identityLoaded, logoutDriver, router]);

  // ✅ pull latest assigned jobs from backend (ONLY after identity + token)
useEffect(() => {
  if (!identityLoaded) return;

  const token = getDriverToken();
  if (!token) return; // auth guard will redirect

  if (!driver?.id) return; // wait for driver identity

  let cancelled = false;

  (async () => {
    try {
      await refreshDriverJobs();
      if (!cancelled) console.log("[DriverJobsPage] refreshDriverJobs ok");
    } catch (e) {
      if (!cancelled) console.error("[DriverJobsPage] refreshDriverJobs failed", e);
    }
  })();

  return () => {
    cancelled = true;
  };
}, [identityLoaded, driver?.id, refreshDriverJobs]);

  // Narrow type locally to allow optional driverId/assignedDriverId
  type DriverJobWithDriverId = DriverJob & {
    driverId?: string | null;
    assignedDriverId?: string | null;
  };

  // ✅ UPDATED: include overdueJobs bucket
  const { overdueJobs, todaysJobs, upcomingJobs } = useMemo(() => {
    const all = driverJobs as DriverJobWithDriverId[];

    if (!driver) {
      return {
        overdueJobs: [] as DriverJobWithDriverId[],
        todaysJobs: [] as DriverJobWithDriverId[],
        upcomingJobs: [] as DriverJobWithDriverId[],
      };
    }

    const anyTagged = all.some(
      (j) => j.driverId != null || j.assignedDriverId != null,
    );

    const visibleJobs = anyTagged
      ? all.filter((j) => j.driverId === driver.id || j.assignedDriverId === driver.id)
      : all;

    const todayStr = new Date().toISOString().slice(0, 10);

    const overdue = visibleJobs.filter((j) => {
      const dateKey = toDateKey(j.pickupDate);
      return dateKey < todayStr && j.status !== "completed";
    });

    const todays = visibleJobs.filter((j) => {
      const dateKey = toDateKey(j.pickupDate);
      return dateKey === todayStr && j.status !== "completed";
    });

    const upcoming = visibleJobs.filter((j) => {
      const dateKey = toDateKey(j.pickupDate);
      return dateKey > todayStr && j.status !== "completed";
    });

    console.log("[DriverJobsPage] jobs", {
      total: all.length,
      anyTagged,
      visible: visibleJobs.length,
      overdue: overdue.length,
      todays: todays.length,
      upcoming: upcoming.length,
    });

    // Optional: show overdue first by nearest date
    overdue.sort((a, b) => toDateKey(b.pickupDate).localeCompare(toDateKey(a.pickupDate)));

    return { overdueJobs: overdue, todaysJobs: todays, upcomingJobs: upcoming };
  }, [driverJobs, driver]);

  // Wait for identity first (prevents flashing wrong state)
  if (!identityLoaded) {
    return (
      <div className="flex min-h-[60vh] items-center justify-center text-xs text-slate-400">
        Loading driver…
      </div>
    );
  }

  if (!jobsLoaded) {
    return (
      <div className="flex min-h-[60vh] items-center justify-center text-xs text-slate-400">
        Loading jobs…
      </div>
    );
  }
  if (driverJobsLoading) {
  return (
    <div className="flex min-h-[60vh] items-center justify-center text-xs text-slate-400">
      Syncing your jobs…
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

  // ✅ UPDATED: include overdueJobs
  const hasAnyJobs =
    overdueJobs.length > 0 || todaysJobs.length > 0 || upcomingJobs.length > 0;

  return (
    <div className="min-h-screen bg-slate-950 px-4 py-4 text-slate-50">
      <header className="mb-4">
        <p className="text-[11px] uppercase tracking-wide text-slate-500">
          Welcome,
        </p>
        <h1 className="text-lg font-semibold">{driver.name ?? "Driver"}</h1>
        <p className="text-[11px] text-slate-400">
          Your assigned runs (overdue, today, and upcoming).
        </p>
      </header>

      {!hasAnyJobs && (
        <div className="rounded-xl border border-dashed border-slate-700 bg-slate-900/70 px-4 py-6 text-center text-xs text-slate-400">
          No jobs currently assigned to you.
          <br />
          Once the admin assigns jobs to your driver ID, they&apos;ll appear here.
        </div>
      )}

      {/* ✅ NEW: Overdue / Past Jobs */}
      {overdueJobs.length > 0 && (
        <section className="mb-6">
          <h2 className="mb-2 text-xs font-semibold uppercase tracking-wide text-amber-300">
            Overdue / Past Jobs
          </h2>
          <div className="space-y-3">
            {overdueJobs.map((job) => {
              const weight = toWeightNumber(job.totalBillableWeightKg);
              const dateKey = toDateKey(job.pickupDate);

              return (
                <Link
                  key={job.id}
                  href={`/driver/job/${job.id}`}
                  className="block rounded-2xl border border-amber-800/40 bg-slate-900/80 p-4 text-xs transition hover:border-amber-400 hover:bg-slate-900"
                >
                  <div className="mb-2 flex items-center justify-between gap-2">
                    <p className="font-mono text-[11px] text-slate-400">
                      {job.displayId}
                    </p>

                    <span className="rounded-full border border-amber-400 bg-amber-900/40 px-2 py-0.5 text-[10px] font-medium text-amber-100">
                      {statusLabel(job.status)}
                    </span>

                    {job.routePattern && (
                      <span className="rounded-full border border-slate-600 bg-slate-800/80 px-2 py-0.5 text-[9px] font-medium text-slate-100">
                        Route: {routePatternLabel(job.routePattern)}
                      </span>
                    )}
                  </div>

                  <div className="mb-3">
                    <p className="text-sm font-semibold text-slate-50">
                      {job.originLabel}
                    </p>
                    <p className="text-[11px] text-slate-400">
                      Area: {job.areaLabel}
                    </p>
                  </div>

                  <div className="mb-3 flex items-start justify-between gap-4 text-[11px] text-slate-300">
                    <div>
                      <p className="text-slate-400">Pickup</p>
                      <p className="font-medium">
                        {dateKey} · {job.pickupWindow}
                      </p>
                    </div>
                    <div className="text-right">
                      <p className="text-slate-400">Stops / Weight</p>
                      <p className="font-medium">
                        {job.totalStops} stops · {weight.toFixed(1)} kg
                      </p>
                    </div>
                  </div>

                  <div className="flex items-center justify-between text-[10px] text-slate-400">
                    <span>Tap to view route &amp; stops →</span>
                    <span className="font-medium text-amber-200">View job</span>
                  </div>
                </Link>
              );
            })}
          </div>
        </section>
      )}

      {todaysJobs.length > 0 && (
        <section className="mb-6">
          <h2 className="mb-2 text-xs font-semibold uppercase tracking-wide text-slate-400">
            Today&apos;s Jobs
          </h2>
          <div className="space-y-3">
            {todaysJobs.map((job) => {
              const weight = toWeightNumber(job.totalBillableWeightKg);
              const dateKey = toDateKey(job.pickupDate);

              return (
                <Link
                  key={job.id}
                  href={`/driver/job/${job.id}`}
                  className="block rounded-2xl border border-slate-800 bg-slate-900/80 p-4 text-xs transition hover:border-sky-500 hover:bg-slate-900"
                >
                  <div className="mb-2 flex items-center justify-between gap-2">
                    <p className="font-mono text-[11px] text-slate-400">
                      {job.displayId}
                    </p>
                    <span className="rounded-full border border-sky-500 bg-sky-900/60 px-2 py-0.5 text-[10px] font-medium text-sky-100">
                      {statusLabel(job.status)}
                    </span>
                    {job.routePattern && (
                      <span className="rounded-full border border-slate-600 bg-slate-800/80 px-2 py-0.5 text-[9px] font-medium text-slate-100">
                        Route: {routePatternLabel(job.routePattern)}
                      </span>
                    )}
                  </div>

                  <div className="mb-3">
                    <p className="text-sm font-semibold text-slate-50">
                      {job.originLabel}
                    </p>
                    <p className="text-[11px] text-slate-400">
                      Area: {job.areaLabel}
                    </p>
                  </div>

                  <div className="mb-3 flex items-start justify-between gap-4 text-[11px] text-slate-300">
                    <div>
                      <p className="text-slate-400">Pickup</p>
                      <p className="font-medium">
                        {dateKey} · {job.pickupWindow}
                      </p>
                    </div>
                    <div className="text-right">
                      <p className="text-slate-400">Stops / Weight</p>
                      <p className="font-medium">
                        {job.totalStops} stops · {weight.toFixed(1)} kg
                      </p>
                    </div>
                  </div>

                  <div className="flex items-center justify-between text-[10px] text-slate-400">
                    <span>Tap to view route &amp; stops →</span>
                    <span className="font-medium text-sky-300">View job</span>
                  </div>
                </Link>
              );
            })}
          </div>
        </section>
      )}

      {upcomingJobs.length > 0 && (
        <section>
          <h2 className="mb-2 text-xs font-semibold uppercase tracking-wide text-slate-400">
            Upcoming Jobs
          </h2>
          <div className="space-y-3">
            {upcomingJobs.map((job) => {
              const weight = toWeightNumber(job.totalBillableWeightKg);
              const dateKey = toDateKey(job.pickupDate);

              return (
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
                      <p className="text-[11px] text-slate-400">{job.areaLabel}</p>
                    </div>
                    <div className="text-right text-[11px] text-slate-300">
                      <p>{dateKey}</p>
                      <p className="font-medium">{job.pickupWindow}</p>
                      <p className="mt-1 text-slate-400">
                        {job.totalStops} stops · {weight.toFixed(1)} kg
                      </p>
                      <p className="mt-0.5 text-[10px] text-slate-500">
                        Not started
                      </p>
                    </div>
                  </div>
                </Link>
              );
            })}
          </div>
        </section>
      )}
    </div>
  );
}
