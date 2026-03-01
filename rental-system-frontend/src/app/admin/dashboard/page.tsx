// src/app/admin/dashboard/page.tsx
"use client";

import { useMemo } from "react";
import { useUnifiedJobs } from "@/lib/unified-jobs-store";
import { mockDrivers, REGION_LABELS } from "@/lib/mock/drivers";
import type { JobSummary, JobStatus, JobType, RegionCode } from "@/lib/types";

// Helper: group jobs by status
function countByStatus(jobs: JobSummary[], status: JobStatus): number {
  return jobs.filter((j) => j.status === status).length;
}

// Helper: group jobs by type
function countByType(jobs: JobSummary[], type: JobType): number {
  return jobs.filter((j) => j.jobType === type).length;
}

// Helper: parse start time from pickupSlot like "09:00 – 12:00"
function getSlotStart(pickupSlot: string): string {
  const match = pickupSlot.match(/\d{2}:\d{2}/);
  return match ? match[0] : "00:00";
}

// Capacity slots (sample data for now, keyed by driverId)
type SlotKey = "morning" | "midday" | "late";

const SLOT_LABELS: Record<SlotKey, string> = {
  morning: "Morning (8–12)",
  midday: "Midday (12–15)",
  late: "Late (15–18)",
};

// utilisation: 0–1
const mockDriverCapacity: Record<string, Record<SlotKey, number>> = {
  "drv-1": { morning: 0.6, midday: 0.85, late: 0.3 },
  "drv-2": { morning: 0.4, midday: 0.7, late: 0.95 },
  "drv-3": { morning: 0.1, midday: 0.2, late: 0.1 },
};

function capacityBarClass(utilisation: number): string {
  if (utilisation >= 0.9) return "bg-red-500";
  if (utilisation >= 0.7) return "bg-amber-400";
  return "bg-emerald-400";
}

// ✅ Use a safe internal status union for UI (works even if mock has extra/undefined values)
type DriverStatusKey = "online" | "offline" | "break" | "unavailable" | "unknown";

function normalizeDriverStatus(input?: string | null): DriverStatusKey {
  if (!input) return "unknown";
  const s = String(input).toLowerCase();
  if (s === "online") return "online";
  if (s === "offline") return "offline";
  if (s === "break") return "break";
  if (s === "unavailable") return "unavailable";
  return "unknown";
}

function formatStatusLabel(status: DriverStatusKey): string {
  switch (status) {
    case "online":
      return "Online";
    case "offline":
      return "Offline";
    case "break":
      return "On break";
    case "unavailable":
      return "Unavailable";
    default:
      return "Unknown";
  }
}

function formatDateTimeShort(iso?: string | null): string {
  if (!iso) return "—";
  const d = new Date(iso);
  if (Number.isNaN(d.getTime())) return "—";
  return d.toLocaleString("en-SG", {
    day: "2-digit",
    month: "short",
    hour: "2-digit",
    minute: "2-digit",
  });
}

function regionLabel(region?: string | null): string {
  const key = (region ?? "island-wide") as RegionCode;
  return REGION_LABELS[key] ?? "—";
}

export default function AdminDashboardPage() {
  const { jobSummaries: jobs, loaded } = useUnifiedJobs();

  const today = useMemo(() => new Date().toISOString().slice(0, 10), []);

  // Basic counts
  const {
    totalJobs,
    pendingCount,
    activeCount,
    completedCount,
    scheduledCount,
    adHocCount,
    todayJobsCount,
  } = useMemo(() => {
    const totalJobs = jobs.length;
    const pendingCount = countByStatus(jobs, "pending-assignment");
    const completedCount = countByStatus(jobs, "completed");

    const activeCount = jobs.filter(
      (j) =>
        j.status !== "pending-assignment" &&
        j.status !== "completed" &&
        j.status !== "cancelled",
    ).length;

    const scheduledCount = countByType(jobs, "scheduled");
    const adHocCount = countByType(jobs, "ad-hoc");
    const todayJobsCount = jobs.filter((j) => j.pickupDate === today).length;

    return {
      totalJobs,
      pendingCount,
      completedCount,
      activeCount,
      scheduledCount,
      adHocCount,
      todayJobsCount,
    };
  }, [jobs, today]);

  // Upcoming jobs timeline (limit to first 8 for now)
  const upcomingJobs = useMemo(() => {
    const futureOrToday = jobs.filter(
      (j) => j.status !== "completed" && j.status !== "cancelled",
    );

    return futureOrToday
      .slice()
      .sort((a, b) => {
        if (a.pickupDate === b.pickupDate) {
          return getSlotStart(a.pickupSlot).localeCompare(getSlotStart(b.pickupSlot));
        }
        return a.pickupDate.localeCompare(b.pickupDate);
      })
      .slice(0, 8);
  }, [jobs]);

  // ✅ Driver status counts (typed + safe)
  const driverStatusSummary = useMemo((): Record<DriverStatusKey, number> => {
    const counts: Record<DriverStatusKey, number> = {
      online: 0,
      offline: 0,
      break: 0,
      unavailable: 0,
      unknown: 0,
    };

    mockDrivers.forEach((d: any) => {
      const key = normalizeDriverStatus(d?.currentStatus);
      counts[key] = (counts[key] ?? 0) + 1;
    });

    return counts;
  }, []);

  return (
    <div className="min-h-screen bg-slate-50">
      <div className="mx-auto max-w-6xl space-y-8 px-6 py-8">
        {/* Header */}
        <header className="flex flex-col gap-2 sm:flex-row sm:items-center sm:justify-between">
          <div>
            <h1 className="text-2xl font-semibold text-slate-900">
              Operations Dashboard
            </h1>
            <p className="mt-1 text-sm text-slate-600">
              Snapshot of jobs, driver capacity, and upcoming pickups.
            </p>
          </div>
          {!loaded && <p className="text-xs text-slate-400">Loading job data…</p>}
        </header>

        {/* Top stats */}
        <section>
          <div className="grid gap-3 sm:grid-cols-2 lg:grid-cols-4">
            <div className="rounded-xl border border-slate-200 bg-white p-4">
              <p className="text-xs font-medium text-slate-500">Jobs today</p>
              <p className="mt-2 text-2xl font-semibold text-slate-900">
                {todayJobsCount}
              </p>
              <p className="mt-1 text-[11px] text-slate-500">
                Total jobs scheduled for{" "}
                <span className="font-mono">{today}</span>
              </p>
            </div>

            <div className="rounded-xl border border-slate-200 bg-white p-4">
              <p className="text-xs font-medium text-slate-500">Pending assignment</p>
              <p className="mt-2 text-2xl font-semibold text-orange-600">
                {pendingCount}
              </p>
              <p className="mt-1 text-[11px] text-slate-500">
                Jobs waiting for driver allocation.
              </p>
            </div>

            <div className="rounded-xl border border-slate-200 bg-white p-4">
              <p className="text-xs font-medium text-slate-500">Active jobs</p>
              <p className="mt-2 text-2xl font-semibold text-sky-700">
                {activeCount}
              </p>
              <p className="mt-1 text-[11px] text-slate-500">
                In progress, out-for-pickup, or in-transit.
              </p>
            </div>

            <div className="rounded-xl border border-slate-200 bg-white p-4">
              <p className="text-xs font-medium text-slate-500">
                Completed (all time)
              </p>
              <p className="mt-2 text-2xl font-semibold text-emerald-700">
                {completedCount}
              </p>
              <p className="mt-1 text-[11px] text-slate-500">
                Prototype count from unified jobs store.
              </p>
            </div>
          </div>

          <div className="mt-4 grid gap-3 sm:grid-cols-2">
            <div className="rounded-xl border border-slate-200 bg-white p-4">
              <p className="text-xs font-medium text-slate-500">Job mix</p>
              <div className="mt-2 flex items-baseline gap-2">
                <p className="text-xl font-semibold text-slate-900">{totalJobs}</p>
                <p className="text-xs text-slate-500">total jobs</p>
              </div>
              <p className="mt-2 text-[11px] text-slate-500">
                Scheduled:{" "}
                <span className="font-medium text-slate-800">{scheduledCount}</span>{" "}
                · Ad-hoc:{" "}
                <span className="font-medium text-slate-800">{adHocCount}</span>
              </p>
            </div>

            {/* Driver status mini-summary */}
            <div className="rounded-xl border border-slate-200 bg-white p-4">
              <p className="text-xs font-medium text-slate-500">Driver availability</p>
              <div className="mt-2 flex flex-wrap gap-3 text-[11px]">
                <span className="inline-flex items-center gap-1 rounded-full bg-emerald-50 px-2 py-1 text-emerald-700">
                  <span className="h-1.5 w-1.5 rounded-full bg-emerald-500" />
                  Online: {driverStatusSummary.online}
                </span>
                <span className="inline-flex items-center gap-1 rounded-full bg-amber-50 px-2 py-1 text-amber-700">
                  <span className="h-1.5 w-1.5 rounded-full bg-amber-400" />
                  Break: {driverStatusSummary.break}
                </span>
                <span className="inline-flex items-center gap-1 rounded-full bg-slate-50 px-2 py-1 text-slate-600">
                  <span className="h-1.5 w-1.5 rounded-full bg-slate-400" />
                  Offline: {driverStatusSummary.offline}
                </span>
                <span className="inline-flex items-center gap-1 rounded-full bg-rose-50 px-2 py-1 text-rose-700">
                  <span className="h-1.5 w-1.5 rounded-full bg-rose-500" />
                  Unavailable: {driverStatusSummary.unavailable}
                </span>
              </div>
              <p className="mt-2 text-[11px] text-slate-500">
                Based on mock driver presence/status for prototype.
              </p>
            </div>
          </div>
        </section>

        {/* 1️⃣ Driver Status Monitor (detailed) */}
        <section className="grid gap-4 lg:grid-cols-2">
          <div className="rounded-xl border border-slate-200 bg-white p-4">
            <div className="flex items-center justify-between gap-2">
              <h2 className="text-sm font-semibold text-slate-900">
                Driver Status Monitor
              </h2>
              <p className="text-[11px] text-slate-500">
                Live-like view (mock) for PWA presence.
              </p>
            </div>

            <div className="mt-3 space-y-2">
              {mockDrivers.map((d: any) => {
                const status = normalizeDriverStatus(d?.currentStatus);
                const vehicleUpper = String(d?.vehicleType ?? "—").toUpperCase();
                return (
                  <div
                    key={d.id}
                    className="flex items-start justify-between gap-3 rounded-lg border border-slate-200 bg-slate-50 px-3 py-2"
                  >
                    <div>
                      <p className="text-xs font-semibold text-slate-900">{d.name}</p>
                      <p className="text-[11px] text-slate-500">
                        {regionLabel(d.primaryRegion)} · {vehicleUpper} ·{" "}
                        {d.vehiclePlate ?? "—"}
                      </p>
                      <p className="mt-1 text-[11px] text-slate-500">
                        Jobs today:{" "}
                        <span className="font-medium text-slate-800">
                          {d.assignedJobCountToday ?? 0} / {d.maxJobsPerDay ?? "—"}
                        </span>
                      </p>
                      <p className="mt-1 text-[10px] text-slate-400">
                        Last seen: {formatDateTimeShort(d.lastSeenAt)}
                      </p>
                    </div>

                    <div className="flex flex-col items-end gap-1">
                      <span
                        className={`inline-flex items-center rounded-full px-2 py-0.5 text-[10px] font-medium ${
                          status === "online"
                            ? "bg-emerald-50 text-emerald-700"
                            : status === "break"
                            ? "bg-amber-50 text-amber-700"
                            : status === "unavailable"
                            ? "bg-rose-50 text-rose-700"
                            : "bg-slate-50 text-slate-600"
                        }`}
                      >
                        <span
                          className={`mr-1 h-1.5 w-1.5 rounded-full ${
                            status === "online"
                              ? "bg-emerald-500"
                              : status === "break"
                              ? "bg-amber-400"
                              : status === "unavailable"
                              ? "bg-rose-500"
                              : "bg-slate-400"
                          }`}
                        />
                        {formatStatusLabel(status)}
                      </span>

                      {d.location && typeof d.location.lat === "number" && typeof d.location.lng === "number" && (
                        <p className="text-[10px] text-slate-400">
                          Lat {d.location.lat.toFixed(3)}, Lng {d.location.lng.toFixed(3)}
                        </p>
                      )}
                    </div>
                  </div>
                );
              })}
            </div>
          </div>

          {/* 2️⃣ Driver Capacity View (solid bars per slot) */}
          <div className="rounded-xl border border-slate-200 bg-white p-4">
            <div className="flex items-center justify-between gap-2">
              <h2 className="text-sm font-semibold text-slate-900">
                Driver Capacity (Today)
              </h2>
              <p className="text-[11px] text-slate-500">
                Visual “empty slots” by time window (mock sample).
              </p>
            </div>

            <div className="mt-3 overflow-x-auto">
              <table className="min-w-full text-[11px]">
                <thead>
                  <tr className="border-b border-slate-200 text-left text-[10px] text-slate-500">
                    <th className="pb-2 pr-2">Driver</th>
                    <th className="pb-2 pr-2">Region</th>
                    {(Object.keys(SLOT_LABELS) as SlotKey[]).map((slotKey) => (
                      <th key={slotKey} className="pb-2 pr-2">
                        {SLOT_LABELS[slotKey]}
                      </th>
                    ))}
                  </tr>
                </thead>

                <tbody className="align-top">
                  {mockDrivers.map((d: any) => {
                    const cap = mockDriverCapacity[d.id] ?? { morning: 0, midday: 0, late: 0 };
                    return (
                      <tr key={d.id} className="border-b border-slate-100">
                        <td className="py-2 pr-2 text-xs font-medium text-slate-900">
                          {d.name}
                        </td>
                        <td className="py-2 pr-2 text-[11px] text-slate-500">
                          {regionLabel(d.primaryRegion)}
                        </td>

                        {(Object.keys(SLOT_LABELS) as SlotKey[]).map((slot) => {
                          const util = cap[slot] ?? 0;
                          const pct = Math.round(util * 100);
                          return (
                            <td key={slot} className="py-2 pr-2">
                              <div className="w-28">
                                <div className="h-2 w-full rounded-full bg-slate-100">
                                  <div
                                    className={`h-2 rounded-full ${capacityBarClass(util)}`}
                                    style={{ width: `${pct}%` }}
                                  />
                                </div>
                                <p className="mt-1 text-[10px] text-slate-500">
                                  {pct}% of slot
                                </p>
                              </div>
                            </td>
                          );
                        })}
                      </tr>
                    );
                  })}
                </tbody>
              </table>
            </div>

            <p className="mt-2 text-[10px] text-slate-400">
              Colour rules:{" "}
              <span className="font-medium text-emerald-600">Green &lt; 70%</span> ·{" "}
              <span className="font-medium text-amber-600">Amber &lt; 90%</span> ·{" "}
              <span className="font-medium text-red-600">Red ≥ 90%</span>
            </p>
          </div>
        </section>

        {/* 3️⃣ Upcoming Jobs Timeline */}
        <section className="rounded-xl border border-slate-200 bg-white p-4">
          <div className="flex items-center justify-between gap-2">
            <h2 className="text-sm font-semibold text-slate-900">
              Upcoming Jobs Timeline
            </h2>
            <p className="text-[11px] text-slate-500">
              Sorted by pickup date &amp; time window (first 8).
            </p>
          </div>

          {upcomingJobs.length === 0 ? (
            <p className="mt-3 text-xs text-slate-500">
              No upcoming jobs in the current dataset.
            </p>
          ) : (
            <div className="mt-4 overflow-x-auto">
              <ol className="relative border-l border-slate-200 pl-4">
                {upcomingJobs.map((job) => (
                  <li key={job.id} className="mb-4 last:mb-0">
                    <div className="absolute -left-[7px] mt-1 h-3 w-3 rounded-full border border-slate-300 bg-white" />
                    <div className="ml-2">
                      <p className="text-[10px] uppercase tracking-wide text-slate-400">
                        {job.pickupDate} · {getSlotStart(job.pickupSlot)}
                      </p>
                      <p className="text-xs font-semibold text-slate-900">
                        {job.publicId} · {job.customerName}
                      </p>
                      <p className="text-[11px] text-slate-500">
                        {job.stopsCount} stop{job.stopsCount > 1 ? "s" : ""} ·{" "}
                        {(Number(job.totalBillableWeightKg) || 0).toFixed(1)} kg ·{" "}
                        {job.pickupSlot}
                      </p>
                      <p className="mt-0.5 text-[11px] text-slate-500">
                        Region: {regionLabel(job.pickupRegion)}
                      </p>
                    </div>
                  </li>
                ))}
              </ol>
            </div>
          )}
        </section>
      </div>
    </div>
  );
}
