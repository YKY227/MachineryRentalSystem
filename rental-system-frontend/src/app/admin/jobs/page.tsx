"use client";

import Link from "next/link";
import { useRouter } from "next/navigation";
import { useCallback, useEffect, useMemo, useState } from "react";
import {
  fetchAdminJobsPaged,
  autoAssignJobOnBackend,
  deleteAdminJob,
  bulkDeleteAdminJobsByStatus,
  AdminJobDetailDto,
  fetchAdminCompletedJobDetail,
} from "@/lib/api/admin";
import { JobDetailModal } from "@/components/admin/JobDetailModal";

import { useUnifiedJobs } from "@/lib/unified-jobs-store";
import { useAppSettings } from "@/lib/app-settings";

import type {
  JobSummary,
  JobStatus,
  AssignmentMode,
  RegionCode,
  Driver,
  AssignmentConfig,
  HardConstraintKey,
} from "@/lib/types";

import { scoreDriversForJob, pickBestDriver } from "@/lib/assignment";
import { defaultAssignmentConfig } from "@/lib/types";
import { USE_BACKEND, API_BASE_URL } from "@/lib/config";

console.log("[AdminJobsPage] USE_BACKEND =", USE_BACKEND);
console.log("[AdminJobsPage] API_BASE_URL =", API_BASE_URL);

// ─────────────────────────────────────────────
// Small helpers
// ─────────────────────────────────────────────
function formatPickupDate(input?: any) {
  if (!input) return "-";
  if (typeof input === "string" && /^\d{4}-\d{2}-\d{2}$/.test(input)) return input;

  const d = new Date(input);
  if (Number.isNaN(d.getTime())) return String(input);

  return d.toLocaleDateString("en-SG", {
    year: "numeric",
    month: "short",
    day: "2-digit",
  });
}

function regionLabel(region: RegionCode): string {
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

function PaginationBar({
  page,
  pageSize,
  total,
  onPrev,
  onNext,
}: {
  page: number;
  pageSize: number;
  total: number;
  onPrev: () => void;
  onNext: () => void;
}) {
  const start = total === 0 ? 0 : (page - 1) * pageSize + 1;
  const end = Math.min(page * pageSize, total);

  return (
    <div className="flex items-center justify-between px-3 py-2 text-[11px] text-slate-600">
      <div>
        Showing {start} to {end} of {total} results
      </div>
      <div className="flex gap-2">
        <button
          type="button"
          onClick={onPrev}
          disabled={page <= 1}
          className="rounded-lg border border-slate-200 bg-white px-3 py-1.5 font-medium text-slate-700 hover:bg-slate-50 disabled:cursor-not-allowed disabled:opacity-50"
        >
          Previous
        </button>
        <button
          type="button"
          onClick={onNext}
          disabled={end >= total}
          className="rounded-lg border border-slate-200 bg-white px-3 py-1.5 font-medium text-slate-700 hover:bg-slate-50 disabled:cursor-not-allowed disabled:opacity-50"
        >
          Next
        </button>
      </div>
    </div>
  );
}

function TableSkeleton({ rows = 6, cols = 6 }: { rows?: number; cols?: number }) {
  return (
    <div className="overflow-hidden rounded-xl border border-slate-200 bg-white">
      <div className="bg-slate-50 px-3 py-2 text-xs font-medium text-slate-600">Loading…</div>
      <div className="divide-y divide-slate-100">
        {Array.from({ length: rows }).map((_, r) => (
          <div key={r} className="grid grid-cols-12 gap-2 px-3 py-3">
            {Array.from({ length: cols }).map((__, c) => (
              <div key={c} className="col-span-2 h-3 animate-pulse rounded bg-slate-100" />
            ))}
          </div>
        ))}
      </div>
    </div>
  );
}

function statusBadge(status: JobStatus) {
  const base = "inline-flex items-center rounded-full px-2 py-0.5 text-[10px] font-medium";
  switch (status) {
    case "booked":
      return (
        <span className={`${base} bg-slate-50 text-slate-700 ring-1 ring-slate-200`}>Booked</span>
      );
    case "pending-assignment":
      return (
        <span className={`${base} bg-orange-50 text-orange-700 ring-1 ring-orange-200`}>
          Pending assignment
        </span>
      );
    case "assigned":
      return (
        <span className={`${base} bg-indigo-50 text-indigo-700 ring-1 ring-indigo-200`}>Assigned</span>
      );
    case "out-for-pickup":
      return (
        <span className={`${base} bg-blue-50 text-blue-700 ring-1 ring-blue-200`}>Out for pickup</span>
      );
    case "in-transit":
      return (
        <span className={`${base} bg-cyan-50 text-cyan-700 ring-1 ring-cyan-200`}>In transit</span>
      );
    case "completed":
      return (
        <span className={`${base} bg-emerald-50 text-emerald-700 ring-1 ring-emerald-200`}>Completed</span>
      );
    case "failed":
      return (
        <span className={`${base} bg-red-50 text-red-700 ring-1 ring-red-200`}>Failed</span>
      );
    case "cancelled":
      return (
        <span className={`${base} bg-slate-100 text-slate-500 ring-1 ring-slate-200`}>Cancelled</span>
      );
    case "returned":
      return (
        <span className={`${base} bg-purple-50 text-purple-700 ring-1 ring-purple-200`}>Returned</span>
      );
    default:
      return (
        <span className={`${base} bg-slate-50 text-slate-700 ring-1 ring-slate-200`}>{status}</span>
      );
  }
}

function assignmentModeBadge(mode: AssignmentMode | undefined) {
  const base = "inline-flex items-center rounded-full px-2 py-0.5 text-[10px] font-medium";
  if (!mode) {
    return (
      <span className={`${base} bg-slate-50 text-slate-500 ring-1 ring-slate-200`}>Not assigned</span>
    );
  }
  if (mode === "auto") {
    return (
      <span className={`${base} bg-emerald-50 text-emerald-700 ring-1 ring-emerald-200`}>
        Auto-assigned
      </span>
    );
  }
  return (
    <span className={`${base} bg-sky-50 text-sky-700 ring-1 ring-sky-200`}>Manual assign</span>
  );
}

/**
 * Delivery type badge:
 * show original values: "express-3h" | "same-day" | "next-day"
 * - express-3h is stronger color
 */
function deliveryTypeBadge(deliveryType?: string) {
  const base = "inline-flex items-center rounded-full px-2 py-0.5 text-[10px] font-medium";
  const dt = (deliveryType ?? "").toLowerCase();

  if (!dt) {
    return <span className={`${base} bg-slate-50 text-slate-500 ring-1 ring-slate-200`}>-</span>;
  }

  if (dt === "express-3h") {
    return (
      <span className={`${base} bg-rose-50 text-rose-800 ring-1 ring-rose-200`}>
        ⚡ {deliveryType}
      </span>
    );
  }

  if (dt === "same-day") {
    return (
      <span className={`${base} bg-amber-50 text-amber-800 ring-1 ring-amber-200`}>{deliveryType}</span>
    );
  }

  if (dt === "next-day") {
    return (
      <span className={`${base} bg-sky-50 text-sky-800 ring-1 ring-sky-200`}>{deliveryType}</span>
    );
  }

  // fallback (in case backend adds more later)
  return (
    <span className={`${base} bg-slate-50 text-slate-700 ring-1 ring-slate-200`}>{deliveryType}</span>
  );
}

/**
 * Route type badge:
 * expected values: "one-to-many" | "many-to-one" | "round-trip" (or anything else)
 */
function routeTypeBadge(routeType?: string) {
  const base = "inline-flex items-center rounded-full px-2 py-0.5 text-[10px] font-medium";
  const rt = (routeType ?? "").toLowerCase();

  if (!rt) {
    return <span className={`${base} bg-slate-50 text-slate-500 ring-1 ring-slate-200`}>-</span>;
  }

  const labelMap: Record<string, string> = {
    "one-to-many": "1 → many",
    "one_to_many": "1 → many",
    "many-to-one": "many → 1",
    "many_to_one": "many → 1",
    "round-trip": "round trip",
    "round_trip": "round trip",
  };

  const label = labelMap[rt] ?? routeType;

  return (
    <span className={`${base} bg-slate-100 text-slate-700 ring-1 ring-slate-200`}>{label}</span>
  );
}

// ─────────────────────────────────────────────
// Types / local state shapes
// ─────────────────────────────────────────────
type AssignModalState = { open: boolean; job: JobSummary | null };
type AutoAssignSummary = { total: number; assigned: number; failed: number };
type BackendStatus = "idle" | "loading" | "ok" | "error";

export default function AdminJobsPage() {
  const router = useRouter();
  const { developerMode } = useAppSettings();

  // keep unified store (still used for assignment logic & drivers list)
  const { jobSummaries: localJobs, setJobAssignment, drivers } = useUnifiedJobs();

  const PAGE_SIZE = 10;

  // server paged rows + totals
  const [pendingTotal, setPendingTotal] = useState(0);
  const [activeTotal, setActiveTotal] = useState(0);
  const [completedTotal, setCompletedTotal] = useState(0);

  const [pendingRows, setPendingRows] = useState<JobSummary[]>([]);
  const [activeRows, setActiveRows] = useState<JobSummary[]>([]);
  const [completedRows, setCompletedRows] = useState<JobSummary[]>([]);

  const [selectedJobId, setSelectedJobId] = useState<string | null>(null);
  const [detail, setDetail] = useState<AdminJobDetailDto | null>(null);
  const [detailLoading, setDetailLoading] = useState(false);
  const [detailError, setDetailError] = useState<string | null>(null);

  const [pendingPage, setPendingPage] = useState(1);
  const [activePage, setActivePage] = useState(1);
  const [completedPage, setCompletedPage] = useState(1);

  const [backendStatus, setBackendStatus] = useState<BackendStatus>("idle");
  const [backendMessage, setBackendMessage] = useState<string | null>(null);

  const [assignModal, setAssignModal] = useState<AssignModalState>({ open: false, job: null });
  const [selectedDriverId, setSelectedDriverId] = useState<string>("");

  const [assignmentConfig] = useState<AssignmentConfig>(() => structuredClone(defaultAssignmentConfig));
  const [lastAutoAssignSummary, setLastAutoAssignSummary] = useState<AutoAssignSummary | null>(null);

  const [debugDrawer, setDebugDrawer] = useState<{
    open: boolean;
    job: JobSummary | null;
    scores: ReturnType<typeof scoreDriversForJob> | null;
  }>({ open: false, job: null, scores: null });

  const [isDeletingId, setIsDeletingId] = useState<string | null>(null);
  const [isBulkDeleting, setIsBulkDeleting] = useState(false);

  const today = useMemo(() => new Date().toISOString().slice(0, 10), []);

  const activeDrivers = useMemo(() => drivers.filter((d: Driver) => d.isActive), [drivers]);

  const handleOpenDetail = async (job: JobSummary) => {
    setSelectedJobId(job.id);
    setDetail(null);
    setDetailError(null);
    setDetailLoading(true);

    try {
      const data = await fetchAdminCompletedJobDetail(job.id);
      setDetail(data);
    } catch (err: any) {
      console.error("Failed to load job detail", err);
      setDetailError(err?.message ?? "Failed to load job detail");
    } finally {
      setDetailLoading(false);
    }
  };

  const handleCloseDetail = () => {
    setSelectedJobId(null);
    setDetail(null);
    setDetailError(null);
    setDetailLoading(false);
  };

  // ─────────────────────────────────────────────
  // Backend pagination loader (3 sections)
  // ─────────────────────────────────────────────
  useEffect(() => {
    if (!USE_BACKEND) return;

    let cancelled = false;

    async function loadAllSections() {
      try {
        setBackendStatus("loading");
        setBackendMessage(null);

        const [p, a, c] = await Promise.all([
          fetchAdminJobsPaged({ status: "pending", page: pendingPage, pageSize: PAGE_SIZE }),
          fetchAdminJobsPaged({ status: "active", page: activePage, pageSize: PAGE_SIZE }),
          fetchAdminJobsPaged({ status: "completed", page: completedPage, pageSize: PAGE_SIZE }),
        ]);

        if (cancelled) return;

        setPendingRows(p.data as JobSummary[]);
        setPendingTotal(p.total);

        setActiveRows(a.data as JobSummary[]);
        setActiveTotal(a.total);

        setCompletedRows(c.data as JobSummary[]);
        setCompletedTotal(c.total);

        setBackendStatus("ok");
        setBackendMessage("Live paginated data from Nest + Supabase.");
      } catch (err) {
        console.error("[AdminJobsPage] Failed to fetch paged jobs", err);
        if (cancelled) return;

        setBackendStatus("error");
        setBackendMessage("Backend unreachable – showing mock/local data instead.");

        setPendingRows([]);
        setActiveRows([]);
        setCompletedRows([]);
        setPendingTotal(0);
        setActiveTotal(0);
        setCompletedTotal(0);
      }
    }

    loadAllSections();

    return () => {
      cancelled = true;
    };
  }, [pendingPage, activePage, completedPage]);

  // ─────────────────────────────────────────────
  // Local fallback dataset (when USE_BACKEND=false or backend error)
  // ─────────────────────────────────────────────
  const localPendingJobs = useMemo(
    () => localJobs.filter((j) => j.status === "pending-assignment" || j.status === "booked"),
    [localJobs]
  );

  const localActiveJobs = useMemo(
    () => localJobs.filter((j) => j.status !== "pending-assignment" && j.status !== "completed" && j.status !== "cancelled"),
    [localJobs]
  );

  const localCompletedJobs = useMemo(() => localJobs.filter((j) => j.status === "completed"), [localJobs]);

  // Reset local pages when local dataset changes (only matters in fallback mode)
  useEffect(() => {
    if (USE_BACKEND) return;
    setPendingPage(1);
  }, [USE_BACKEND, localPendingJobs.length]);

  useEffect(() => {
    if (USE_BACKEND) return;
    setActivePage(1);
  }, [USE_BACKEND, localActiveJobs.length]);

  useEffect(() => {
    if (USE_BACKEND) return;
    setCompletedPage(1);
  }, [USE_BACKEND, localCompletedJobs.length]);

  const localPendingPaged = useMemo(() => {
    const start = (pendingPage - 1) * PAGE_SIZE;
    return localPendingJobs.slice(start, start + PAGE_SIZE);
  }, [localPendingJobs, pendingPage]);

  const localActivePaged = useMemo(() => {
    const start = (activePage - 1) * PAGE_SIZE;
    return localActiveJobs.slice(start, start + PAGE_SIZE);
  }, [localActiveJobs, activePage]);

  const localCompletedPaged = useMemo(() => {
    const start = (completedPage - 1) * PAGE_SIZE;
    return localCompletedJobs.slice(start, start + PAGE_SIZE);
  }, [localCompletedJobs, completedPage]);

  // Effective rows shown in UI
  const pendingShown = USE_BACKEND ? pendingRows : localPendingPaged;
  const activeShown = USE_BACKEND ? activeRows : localActivePaged;
  const completedShown = USE_BACKEND ? completedRows : localCompletedPaged;

  // Totals shown in header + pagination bars
  const pendingCount = USE_BACKEND ? pendingTotal : localPendingJobs.length;
  const activeCount = USE_BACKEND ? activeTotal : localActiveJobs.length;
  const completedCount = USE_BACKEND ? completedTotal : localCompletedJobs.length;

  // A small merged list used only for driver load estimation + scoring context.
  // (In backend mode, this is NOT the full dataset, but enough for prototype UI.)
  const effectiveForCounts = useMemo<JobSummary[]>(() => {
    if (!USE_BACKEND) return localJobs;
    return [...pendingRows, ...activeRows, ...completedRows];
  }, [USE_BACKEND, localJobs, pendingRows, activeRows, completedRows]);

  const driverJobCounts = useMemo(() => {
    const counts: Record<string, number> = {};
    for (const d of activeDrivers) counts[d.id] = 0;

    for (const job of effectiveForCounts) {
      if (!job.driverId) continue;
      const pd = job.pickupDate ? new Date(job.pickupDate as any).toISOString().slice(0, 10) : "";
      if (pd !== today) continue;
      counts[job.driverId] = (counts[job.driverId] || 0) + 1;
    }
    return counts;
  }, [effectiveForCounts, activeDrivers, today]);

  const getRecommendedDriverId = (job: JobSummary | null): string | null => {
    if (!job) return null;
    if (activeDrivers.length === 0) return null;

    const scores = scoreDriversForJob(job, activeDrivers, assignmentConfig, { driverJobCounts });
    const best = pickBestDriver(scores);
    return best?.driverId ?? null;
  };

  const openAssignModal = (job: JobSummary) => {
    setSelectedDriverId("");
    setAssignModal({ open: true, job });
  };

  const closeAssignModal = () => {
    setAssignModal({ open: false, job: null });
    setSelectedDriverId("");
  };

  const openDebugDrawer = (job: JobSummary) => {
    const scores = scoreDriversForJob(job, activeDrivers, assignmentConfig, { driverJobCounts });
    setDebugDrawer({ open: true, job, scores });
  };

  const closeDebugDrawer = () => setDebugDrawer({ open: false, job: null, scores: null });

  // ─────────────────────────────────────────────
  // Assignment update (local store + refresh current backend pages)
  // ─────────────────────────────────────────────
  const refreshCurrentPages = useCallback(async () => {
    if (!USE_BACKEND) return;
    try {
      const [p, a, c] = await Promise.all([
        fetchAdminJobsPaged({ status: "pending", page: pendingPage, pageSize: PAGE_SIZE }),
        fetchAdminJobsPaged({ status: "active", page: activePage, pageSize: PAGE_SIZE }),
        fetchAdminJobsPaged({ status: "completed", page: completedPage, pageSize: PAGE_SIZE }),
      ]);
      setPendingRows(p.data as JobSummary[]);
      setPendingTotal(p.total);
      setActiveRows(a.data as JobSummary[]);
      setActiveTotal(a.total);
      setCompletedRows(c.data as JobSummary[]);
      setCompletedTotal(c.total);
    } catch (e) {
      console.warn("[AdminJobsPage] refreshCurrentPages failed", e);
    }
  }, [pendingPage, activePage, completedPage]);

  const updateAssignmentLocal = useCallback(
    async (opts: { jobId: string; driverId: string | null; status: JobStatus; mode: AssignmentMode }) => {
      await setJobAssignment(opts);
      await refreshCurrentPages();
    },
    [setJobAssignment, refreshCurrentPages]
  );

  const handleConfirmAssign = async () => {
    if (!assignModal.job || !selectedDriverId) {
      alert("Please select a driver.");
      return;
    }
    const driver = activeDrivers.find((d) => d.id === selectedDriverId);
    if (!driver) {
      alert("Selected driver not found.");
      return;
    }

    try {
      await updateAssignmentLocal({
        jobId: assignModal.job.id,
        driverId: driver.id,
        status: "assigned",
        mode: "manual",
      });
      closeAssignModal();
    } catch (err) {
      console.error("Failed to assign driver", err);
      alert("Failed to assign driver. Please try again.");
    }
  };

  // Fetch ALL pending jobs across pages (backend mode) before auto-assigning.
  async function fetchAllPendingJobs(): Promise<JobSummary[]> {
    const pageSize = 100;
    const first = await fetchAdminJobsPaged({ status: "pending", page: 1, pageSize });
    const total = first.total;
    const out: JobSummary[] = [...(first.data as JobSummary[])];

    const totalPages = Math.ceil(total / pageSize);
    for (let page = 2; page <= totalPages; page++) {
      const res = await fetchAdminJobsPaged({ status: "pending", page, pageSize });
      out.push(...(res.data as JobSummary[]));
    }
    return out;
  }

  const handleAutoAssignPending = async () => {
    const pendingList = USE_BACKEND ? await fetchAllPendingJobs() : localPendingJobs;
    const pending = pendingList.filter((j) => j.status === "pending-assignment");

    if (pending.length === 0) {
      setLastAutoAssignSummary({ total: 0, assigned: 0, failed: 0 });
      return;
    }

    if (USE_BACKEND) {
      let assigned = 0;
      let failed = 0;

      for (const job of pending) {
        try {
          const updated = await autoAssignJobOnBackend(job.id);
          const backendDriverId = (updated as any).driverId ?? (updated as any).currentDriverId ?? null;

          if (!backendDriverId) failed++;
          else assigned++;
        } catch (err) {
          console.error("[AdminJobsPage] autoAssignJobOnBackend failed for", job.id, err);
          failed++;
        }
      }

      setLastAutoAssignSummary({ total: pending.length, assigned, failed });
      await refreshCurrentPages();
      return;
    }

    // frontend fallback scoring
    const tempCounts: Record<string, number> = {};
    for (const d of activeDrivers) tempCounts[d.id] = 0;

    for (const job of localJobs) {
      if (!job.driverId) continue;
      const pd = job.pickupDate ? new Date(job.pickupDate as any).toISOString().slice(0, 10) : "";
      if (pd !== today) continue;
      tempCounts[job.driverId] = (tempCounts[job.driverId] || 0) + 1;
    }

    let assigned = 0;
    let failed = 0;

    for (const job of pending) {
      const scores = scoreDriversForJob(job, activeDrivers, assignmentConfig, { driverJobCounts: tempCounts });
      const best = pickBestDriver(scores);

      if (best) {
        tempCounts[best.driverId] = (tempCounts[best.driverId] || 0) + 1;
        assigned++;
        await updateAssignmentLocal({
          jobId: job.id,
          driverId: best.driverId,
          status: "assigned",
          mode: "auto",
        });
      } else {
        failed++;
      }
    }

    setLastAutoAssignSummary({ total: pending.length, assigned, failed });
  };

  // ─────────────────────────────────────────────
  // Delete actions (Developer mode only)
  // ─────────────────────────────────────────────
  const handleDeleteOne = async (jobId: string) => {
    if (!developerMode) return;

    const ok = confirm("Delete this job permanently? (dev mode)");
    if (!ok) return;

    try {
      setIsDeletingId(jobId);
      await deleteAdminJob(jobId);

      if (USE_BACKEND) await refreshCurrentPages();
    } catch (e: any) {
      console.error(e);
      alert(e?.message ?? "Failed to delete job");
    } finally {
      setIsDeletingId(null);
    }
  };

  const handleBulkDeletePending = async () => {
    if (!developerMode) return;

    const ok = confirm("Delete ALL pending/booked jobs? This cannot be undone.");
    if (!ok) return;

    try {
      setIsBulkDeleting(true);
      await bulkDeleteAdminJobsByStatus("pending-assignment");
      await bulkDeleteAdminJobsByStatus("booked");

      if (USE_BACKEND) {
        setPendingPage(1);
        await refreshCurrentPages();
      }
    } catch (e: any) {
      console.error(e);
      alert(e?.message ?? "Failed bulk delete");
    } finally {
      setIsBulkDeleting(false);
    }
  };

  const handleBulkDeleteCompleted = async () => {
    if (!developerMode) return;

    const ok = confirm("Delete ALL completed jobs? This cannot be undone.");
    if (!ok) return;

    try {
      setIsBulkDeleting(true);
      await bulkDeleteAdminJobsByStatus("completed");

      if (USE_BACKEND) {
        setCompletedPage(1);
        await refreshCurrentPages();
      }
    } catch (e: any) {
      console.error(e);
      alert(e?.message ?? "Failed bulk delete");
    } finally {
      setIsBulkDeleting(false);
    }
  };

  const isLoadingTables = USE_BACKEND && backendStatus === "loading";

  // ─────────────────────────────────────────────
  // Render
  // ─────────────────────────────────────────────
  return (
    <div className="min-h-screen bg-slate-50">
      <div className="mx-auto max-w-6xl px-6 py-8">
        <header className="mb-6 flex items-center justify-between gap-3">
          <div>
            <h1 className="text-2xl font-semibold text-slate-900">Jobs Overview</h1>
            <p className="mt-1 text-sm text-slate-600">
              Monitor jobs, and manually or automatically assign drivers.
            </p>

            <div className="mt-2 flex flex-wrap items-center gap-2 text-[11px]">
              {USE_BACKEND ? (
                <span
                  className={`inline-flex items-center rounded-full px-2 py-0.5 ${
                    backendStatus === "ok"
                      ? "bg-emerald-50 text-emerald-700 ring-1 ring-emerald-200"
                      : backendStatus === "loading"
                      ? "bg-sky-50 text-sky-700 ring-1 ring-sky-200"
                      : "bg-amber-50 text-amber-700 ring-1 ring-amber-200"
                  }`}
                >
                  {backendStatus === "loading" && "Connecting to backend…"}
                  {backendStatus === "ok" && "Live backend (Nest + Supabase)"}
                  {backendStatus === "error" && "Backend error – using mock/local data"}
                </span>
              ) : (
                <span className="inline-flex items-center rounded-full bg-slate-100 px-2 py-0.5 text-[11px] text-slate-600 ring-1 ring-slate-200">
                  Backend disabled – mock dataset only
                </span>
              )}

              {backendMessage && <span className="text-[10px] text-slate-500">{backendMessage}</span>}

              {developerMode && (
                <span className="inline-flex items-center rounded-full bg-rose-50 px-2 py-0.5 text-[11px] text-rose-700 ring-1 ring-rose-200">
                  Developer Mode
                </span>
              )}
            </div>

            {developerMode && (
              <div className="mt-3 flex flex-wrap gap-2">
                <button
                  type="button"
                  onClick={handleBulkDeletePending}
                  disabled={isBulkDeleting || pendingCount === 0}
                  className="inline-flex items-center rounded-lg border border-rose-200 bg-rose-50 px-3 py-1.5 text-[11px] font-medium text-rose-700 hover:bg-rose-100 disabled:cursor-not-allowed disabled:opacity-60"
                >
                  {isBulkDeleting ? "Working…" : "Delete all pending test jobs"}
                </button>

                <button
                  type="button"
                  onClick={handleBulkDeleteCompleted}
                  disabled={isBulkDeleting || completedCount === 0}
                  className="inline-flex items-center rounded-lg border border-slate-200 bg-white px-3 py-1.5 text-[11px] font-medium text-slate-700 hover:bg-slate-50 disabled:cursor-not-allowed disabled:opacity-60"
                >
                  {isBulkDeleting ? "Working…" : "Clear completed jobs"}
                </button>
              </div>
            )}
          </div>

          <div className="flex flex-col items-end text-xs text-slate-500">
            <span>
              Pending: <span className="font-semibold text-orange-600">{pendingCount}</span>
            </span>
            <span>
              Active: <span className="font-semibold text-sky-700">{activeCount}</span>
            </span>
            <span>
              Completed: <span className="font-semibold text-emerald-700">{completedCount}</span>
            </span>
          </div>
        </header>

        {/* Capacity strip */}
        <section className="mb-6">
          <h2 className="mb-2 text-xs font-semibold text-slate-700">Today&apos;s driver load (prototype)</h2>
          <div className="flex flex-wrap gap-2">
            {activeDrivers.map((d) => {
              const count = driverJobCounts[d.id] ?? 0;
              const colour =
                count === 0
                  ? "bg-emerald-50 text-emerald-700 border-emerald-100"
                  : count < 3
                  ? "bg-sky-50 text-sky-700 border-sky-100"
                  : "bg-amber-50 text-amber-700 border-amber-100";

              return (
                <div key={d.id} className={`rounded-lg border px-3 py-2 text-[11px] ${colour}`}>
                  <div className="font-medium">{d.name}</div>
                  <div className="text-[10px]">
                    Jobs today: <span className="font-semibold">{count}</span> / {d.maxJobsPerDay}
                  </div>
                </div>
              );
            })}
          </div>
        </section>

        {/* Pending Assignment */}
        <section className="mb-8">
          <div className="mb-2 flex items-center justify-between gap-3">
            <div>
              <h2 className="text-sm font-semibold text-slate-800">Pending Assignment</h2>
              <p className="text-xs text-slate-500">
                Jobs that need manual review or where auto-assignment hasn&apos;t run yet.
              </p>
            </div>

            <div className="flex flex-col items-end gap-1">
              <button
                type="button"
                onClick={handleAutoAssignPending}
                disabled={pendingCount === 0 || activeDrivers.length === 0}
                className="inline-flex items-center rounded-lg bg-indigo-600 px-3 py-1.5 text-[11px] font-medium text-white hover:bg-indigo-700 disabled:cursor-not-allowed disabled:bg-slate-300"
              >
                Run auto-assign for pending
              </button>

              {lastAutoAssignSummary && (
                <p className="text-[10px] text-slate-500">
                  Last run: {lastAutoAssignSummary.assigned} assigned, {lastAutoAssignSummary.failed} still pending (of{" "}
                  {lastAutoAssignSummary.total} jobs).
                </p>
              )}
            </div>
          </div>

          {isLoadingTables ? (
            <TableSkeleton rows={6} cols={6} />
          ) : pendingCount === 0 ? (
            <div className="rounded-lg border border-dashed border-slate-200 bg-slate-50 px-4 py-6 text-center text-xs text-slate-500">
              No jobs currently pending assignment. Auto-assigned jobs will appear in the active list below.
            </div>
          ) : (
            <div className="overflow-hidden rounded-xl border border-slate-200 bg-white">
              <table className="min-w-full divide-y divide-slate-200 text-xs">
                <thead className="bg-slate-50">
                  <tr>
                    <th className="px-3 py-2 text-left font-medium text-slate-600">Job</th>
                    <th className="px-3 py-2 text-left font-medium text-slate-600">Customer</th>
                    <th className="px-3 py-2 text-left font-medium text-slate-600">Pickup</th>
                    <th className="px-3 py-2 text-left font-medium text-slate-600">Delivery / Route</th>
                    <th className="px-3 py-2 text-left font-medium text-slate-600">Stops / Weight</th>
                    <th className="px-3 py-2 text-right font-medium text-slate-600">Actions</th>
                  </tr>
                </thead>

                <tbody className="divide-y divide-slate-100 bg-white">
                  {pendingShown.map((job) => {
                  const delivery = (job as any).serviceType ?? null;
  const route = (job as any).routeType ?? null;

  // snapshot logging (no live reference confusion)
  console.log("[Pending] delivery/route snapshot:", delivery, route);
  // optional: immutable snapshot of whole object
  // console.log("[Pending] job snapshot:", JSON.parse(JSON.stringify(job)));ined;

 
                    return (
                      <tr
                        key={job.id}
                        onClick={() => handleOpenDetail(job)}
                        className="group cursor-pointer hover:bg-slate-50"
                      >
                        <td className="relative px-3 py-2 align-top">
                          {developerMode && (
                            <button
                              type="button"
                              title="Delete job (dev)"
                              onClick={(e) => {
                                e.stopPropagation();
                                handleDeleteOne(job.id);
                              }}
                              disabled={isDeletingId === job.id}
                              className="absolute right-2 top-2 inline-flex h-6 w-6 items-center justify-center rounded-md border border-rose-200 bg-rose-50 text-[12px] font-bold text-rose-700 opacity-0 hover:bg-rose-100 disabled:opacity-60 group-hover:opacity-100"
                            >
                              ×
                            </button>
                          )}

                          <div className="font-mono text-[11px] text-slate-800">{job.publicId}</div>
                          <div className="mt-1">
                            {statusBadge(job.status)}{" "}
                            <span className="ml-1 inline-block">{assignmentModeBadge(job.assignmentMode)}</span>
                          </div>
                        </td>

                        <td className="px-3 py-2 align-top">
                          <div className="text-xs font-medium text-slate-900">{job.customerName}</div>
                          <div className="text-[11px] text-slate-500">
                            Created: {new Date(job.createdAt as any).toLocaleString("en-SG")}
                          </div>
                        </td>

                        <td className="px-3 py-2 align-top">
                          <div className="text-xs text-slate-800">{formatPickupDate(job.pickupDate)}</div>
                          <div className="text-[11px] text-slate-600">{job.pickupSlot}</div>
                          <div className="mt-0.5 text-[11px] text-slate-500">Region: {regionLabel(job.pickupRegion)}</div>
                        </td>

                      <td className="px-3 py-2 align-top">
  <div className="flex flex-wrap gap-1">
    {deliveryTypeBadge(delivery)}
    {routeTypeBadge(route)}
  </div>
</td>


                        <td className="px-3 py-2 align-top">
                          <div className="text-xs text-slate-800">
                            {job.stopsCount} stop{job.stopsCount > 1 ? "s" : ""}
                          </div>
                          <div className="text-[11px] text-slate-500">
                            {(Number(job.totalBillableWeightKg) || 0).toFixed(1)} kg billable
                          </div>
                        </td>

                        <td className="px-3 py-2 align-top text-right">
                          <div className="inline-flex gap-1">
                            <button
                              type="button"
                              onClick={(e) => {
                                e.stopPropagation();
                                openAssignModal(job);
                              }}
                              className="inline-flex items-center rounded-lg bg-sky-600 px-3 py-1.5 text-[11px] font-medium text-white hover:bg-sky-700"
                            >
                              Assign driver…
                            </button>

                            <button
                              type="button"
                              onClick={(e) => {
                                e.stopPropagation();
                                openDebugDrawer(job);
                              }}
                              className="inline-flex items-center rounded-lg border border-slate-300 px-2 py-1 text-[10px] text-slate-600 hover:bg-slate-100"
                            >
                              Debug
                            </button>
                          </div>
                        </td>
                      </tr>
                    );
                  })}
                </tbody>
              </table>

              <div className="border-t border-slate-200 bg-slate-50">
                <PaginationBar
                  page={pendingPage}
                  pageSize={PAGE_SIZE}
                  total={pendingCount}
                  onPrev={() => setPendingPage((p) => Math.max(1, p - 1))}
                  onNext={() => setPendingPage((p) => (p * PAGE_SIZE >= pendingCount ? p : p + 1))}
                />
              </div>
            </div>
          )}
        </section>

        {/* Active Jobs */}
        <section className="mb-8">
          <div className="mb-2 flex items-center justify-between">
            <h2 className="text-sm font-semibold text-slate-800">Active Jobs</h2>
            <p className="text-xs text-slate-500">Jobs that are assigned or in progress.</p>
          </div>

          {isLoadingTables ? (
            <TableSkeleton rows={6} cols={6} />
          ) : activeCount === 0 ? (
            <div className="rounded-lg border border-dashed border-slate-200 bg-slate-50 px-4 py-6 text-center text-xs text-slate-500">
              No active jobs at the moment.
            </div>
          ) : (
            <div className="overflow-hidden rounded-xl border border-slate-200 bg-white">
              <table className="min-w-full divide-y divide-slate-200 text-xs">
                <thead className="bg-slate-50">
                  <tr>
                    <th className="px-3 py-2 text-left font-medium text-slate-600">Job</th>
                    <th className="px-3 py-2 text-left font-medium text-slate-600">Customer</th>
                    <th className="px-3 py-2 text-left font-medium text-slate-600">Pickup</th>
                    <th className="px-3 py-2 text-left font-medium text-slate-600">Driver</th>
                    <th className="px-3 py-2 text-left font-medium text-slate-600">Delivery / Route</th>
                  </tr>
                </thead>

                <tbody className="divide-y divide-slate-100 bg-white">
                  {activeShown.map((job) => {
                    const driver = job.driverId && drivers.find((d: Driver) => d.id === job.driverId);
                  const delivery = (job as any).serviceType ?? null;
                   const route = (job as any).routeType ?? null;

                    return (
                      <tr
                        key={job.id}
                        onClick={() => handleOpenDetail(job)}
                        className="group cursor-pointer hover:bg-slate-50"
                      >
                        <td className="relative px-3 py-2 align-top">
                          {developerMode && (
                            <button
                              type="button"
                              title="Delete job (dev)"
                              onClick={(e) => {
                                e.stopPropagation();
                                handleDeleteOne(job.id);
                              }}
                              disabled={isDeletingId === job.id}
                              className="absolute right-2 top-2 inline-flex h-6 w-6 items-center justify-center rounded-md border border-rose-200 bg-rose-50 text-[12px] font-bold text-rose-700 opacity-0 hover:bg-rose-100 disabled:opacity-60 group-hover:opacity-100"
                            >
                              ×
                            </button>
                          )}

                          <div className="font-mono text-[11px] text-slate-800">{job.publicId}</div>
                          <div className="mt-1">
                            {statusBadge(job.status)}{" "}
                            <span className="ml-1 inline-block">{assignmentModeBadge(job.assignmentMode)}</span>
                          </div>
                        </td>

                        <td className="px-3 py-2 align-top">
                          <div className="text-xs font-medium text-slate-900">{job.customerName}</div>
                          <div className="text-[11px] text-slate-500">
                            {job.stopsCount} stop{job.stopsCount > 1 ? "s" : ""},{" "}
                            {(Number(job.totalBillableWeightKg) || 0).toFixed(1)} kg
                          </div>
                        </td>

                        <td className="px-3 py-2 align-top">
                          <div className="text-xs text-slate-800">{formatPickupDate(job.pickupDate)}</div>
                          <div className="text-[11px] text-slate-600">{job.pickupSlot}</div>
                          <div className="mt-0.5 text-[11px] text-slate-500">Region: {regionLabel(job.pickupRegion)}</div>
                        </td>

                        <td className="px-3 py-2 align-top">
                          {driver ? (
                            <>
                              <div className="text-xs font-medium text-slate-900">{driver.name}</div>
                              <div className="text-[11px] text-slate-500">
                                {driver.vehicleType.toUpperCase()} · {regionLabel(driver.primaryRegion)}
                              </div>
                            </>
                          ) : (
                            <span className="text-[11px] text-slate-400">(No driver assigned)</span>
                          )}
                        </td>

                      <td className="px-3 py-2 align-top">
  <div className="flex flex-wrap gap-1">
    {deliveryTypeBadge(delivery)}
    {routeTypeBadge(route)}
  </div>
</td>

                      </tr>
                    );
                  })}
                </tbody>
              </table>

              <div className="border-t border-slate-200 bg-slate-50">
                <PaginationBar
                  page={activePage}
                  pageSize={PAGE_SIZE}
                  total={activeCount}
                  onPrev={() => setActivePage((p) => Math.max(1, p - 1))}
                  onNext={() => setActivePage((p) => (p * PAGE_SIZE >= activeCount ? p : p + 1))}
                />
              </div>
            </div>
          )}
        </section>

        {/* Completed (compact) */}
        <section>
          <div className="mb-2 flex items-center justify-between">
            <div>
              <h2 className="text-sm font-semibold text-slate-800">Recently Completed</h2>
              <p className="text-xs text-slate-500">Snapshot of latest completed jobs.</p>
            </div>
            <Link
              href="/admin/jobs/completed"
              className="inline-flex items-center rounded-lg bg-slate-900 px-3 py-1.5 text-[11px] font-medium text-slate-100 hover:bg-slate-800 border border-slate-700"
            >
              Completed jobs &amp; POD →
            </Link>
          </div>

          {isLoadingTables ? (
            <TableSkeleton rows={5} cols={4} />
          ) : completedCount === 0 ? (
            <p className="text-xs text-slate-500">No completed jobs in dataset.</p>
          ) : (
            <div className="overflow-hidden rounded-xl border border-slate-200 bg-white">
              <table className="min-w-full divide-y divide-slate-200 text-xs">
                <thead className="bg-slate-50">
                  <tr>
                    <th className="px-3 py-2 text-left font-medium text-slate-600">Job</th>
                    <th className="px-3 py-2 text-left font-medium text-slate-600">Customer</th>
                    <th className="px-3 py-2 text-left font-medium text-slate-600">Pickup</th>
                    <th className="px-3 py-2 text-left font-medium text-slate-600">Delivery / Route</th>
                  </tr>
                </thead>

                <tbody className="divide-y divide-slate-100 bg-white">
                  {completedShown.map((job) => {
                  const delivery = (job as any).serviceType ?? null;
  const route = (job as any).routeType ?? null;
  
                    return (
                      <tr
                        key={job.id}
                        onClick={() => handleOpenDetail(job)}
                        className="group cursor-pointer hover:bg-slate-50"
                      >
                        <td className="relative px-3 py-2 align-top">
                          {developerMode && (
                            <button
                              type="button"
                              title="Delete job (dev)"
                              onClick={(e) => {
                                e.stopPropagation();
                                handleDeleteOne(job.id);
                              }}
                              disabled={isDeletingId === job.id}
                              className="absolute right-2 top-2 inline-flex h-6 w-6 items-center justify-center rounded-md border border-rose-200 bg-rose-50 text-[12px] font-bold text-rose-700 opacity-0 hover:bg-rose-100 disabled:opacity-60 group-hover:opacity-100"
                            >
                              ×
                            </button>
                          )}

                          <div className="font-mono text-[11px] text-slate-800">{job.publicId}</div>
                          <div className="mt-1">{statusBadge(job.status)}</div>
                        </td>

                        <td className="px-3 py-2 align-top">
                          <div className="text-xs font-medium text-slate-900">{job.customerName}</div>
                          <div className="text-[11px] text-slate-500">
                            {job.stopsCount} stops · {(Number(job.totalBillableWeightKg) || 0).toFixed(1)} kg
                          </div>
                        </td>

                        <td className="px-3 py-2 align-top">
                          <div className="text-xs text-slate-800">{formatPickupDate(job.pickupDate)}</div>
                          <div className="text-[11px] text-slate-600">{job.pickupSlot}</div>
                          <div className="mt-0.5 text-[11px] text-slate-500">Region: {regionLabel(job.pickupRegion)}</div>
                        </td>

                     <td className="px-3 py-2 align-top">
  <div className="flex flex-wrap gap-1">
    {deliveryTypeBadge(delivery)}
    {routeTypeBadge(route)}
  </div>
</td>

                      </tr>
                    );
                  })}
                </tbody>
              </table>

              <div className="border-t border-slate-200 bg-slate-50">
                <PaginationBar
                  page={completedPage}
                  pageSize={PAGE_SIZE}
                  total={completedCount}
                  onPrev={() => setCompletedPage((p) => Math.max(1, p - 1))}
                  onNext={() => setCompletedPage((p) => (p * PAGE_SIZE >= completedCount ? p : p + 1))}
                />
              </div>
            </div>
          )}
        </section>
      </div>

      {/* Assign Driver Modal */}
      {assignModal.open && assignModal.job && (
        <div className="fixed inset-0 z-40 flex items-center justify-center bg-black/40">
          <div className="w-full max-w-md rounded-xl bg-white p-4 shadow-xl">
            <h2 className="text-sm font-semibold text-slate-900">Assign driver</h2>
            <p className="mt-1 text-[11px] text-slate-600">
              Job <span className="font-mono font-medium">{assignModal.job.publicId}</span> · {assignModal.job.customerName}
            </p>

            {(() => {
              const recommendedId = getRecommendedDriverId(assignModal.job);
              const recommendedDriver = recommendedId ? activeDrivers.find((d) => d.id === recommendedId) : undefined;
              if (!recommendedDriver) return null;

              return (
                <p className="mt-2 text-[11px] text-emerald-700">
                  Recommended: <span className="font-medium">{recommendedDriver.name}</span> (
                  {regionLabel(recommendedDriver.primaryRegion)} · {driverJobCounts[recommendedDriver.id] ?? 0} jobs today)
                </p>
              );
            })()}

            <div className="mt-4 space-y-2">
              <label htmlFor="driver-select" className="text-xs font-medium text-slate-700">
                Select driver
              </label>
              <select
                id="driver-select"
                value={selectedDriverId}
                onChange={(e) => setSelectedDriverId(e.target.value)}
                className="w-full rounded-lg border border-slate-200 px-3 py-2 text-sm focus:border-sky-500 focus:outline-none focus:ring-1 focus:ring-sky-500"
              >
                <option value="">-- Choose a driver --</option>
                {activeDrivers.map((d) => {
                  const recommendedId = getRecommendedDriverId(assignModal.job);
                  const isRecommended = d.id === recommendedId;
                  const jobsToday = driverJobCounts[d.id] ?? 0;

                  return (
                    <option key={d.id} value={d.id}>
                      {d.name} · {d.vehicleType.toUpperCase()} · {regionLabel(d.primaryRegion)} · Jobs today: {jobsToday} /{" "}
                      {d.maxJobsPerDay}
                      {isRecommended ? "  ⭐ Recommended" : ""}
                    </option>
                  );
                })}
              </select>
              <p className="text-[11px] text-slate-500">
                In the real system, this list will be filtered by eligibility (region, capacity, working hours, etc.).
              </p>
            </div>

            <div className="mt-4 flex items-center justify-between">
              <button type="button" onClick={closeAssignModal} className="text-xs text-slate-600 hover:text-slate-800">
                Cancel
              </button>
              <button
                type="button"
                onClick={handleConfirmAssign}
                className="inline-flex items-center rounded-lg bg-sky-600 px-4 py-2 text-xs font-medium text-white hover:bg-sky-700"
              >
                Confirm assign
              </button>
            </div>
          </div>
        </div>
      )}

      {/* Debug Drawer */}
      {debugDrawer.open && debugDrawer.job && (
        <div className="fixed inset-0 z-50 flex">
          <div className="absolute inset-0 bg-black/40" onClick={closeDebugDrawer} />
          <div className="relative ml-auto h-full w-full max-w-md bg-white p-5 shadow-xl">
            <h2 className="text-sm font-semibold text-slate-900">Assignment Debug</h2>
            <p className="mt-1 text-[11px] text-slate-600">
              Job <span className="font-mono">{debugDrawer.job.publicId}</span>
            </p>

            <div className="mt-3 rounded-lg border bg-slate-50 p-3 text-[11px] text-slate-700">
              <div className="mb-1 font-semibold text-slate-900">Assignment Policy (weights)</div>
              <div>Region: {assignmentConfig.softRules.regionScore.weight}</div>
              <div>Load: {assignmentConfig.softRules.loadBalanceScore.weight}</div>
              <div>Fairness: {assignmentConfig.softRules.fairnessScore.weight}</div>
            </div>

            <div className="mt-4 text-xs">
              <h3 className="mb-2 text-xs font-semibold text-slate-800">Driver Scoring Breakdown</h3>

              <div className="max-h-[60vh] space-y-2 overflow-y-auto pr-2">
                {debugDrawer.scores?.map((s) => {
                  const driver = activeDrivers.find((d) => d.id === s.driverId);
                  if (!driver) return null;

                  const maxScore = Math.max(...(debugDrawer.scores ?? []).map((x) => x.totalScore));
                  const isWinner = s.totalScore === maxScore;

                  return (
                    <div
                      key={s.driverId}
                      className={`rounded-lg border p-3 ${
                        isWinner ? "border-emerald-400 bg-emerald-50" : "border-slate-200 bg-white"
                      }`}
                    >
                      <div className="font-medium text-slate-900">
                        {driver.name}
                        {isWinner && <span className="ml-1 text-[10px] text-emerald-700">(Recommended)</span>}
                      </div>

                      <div className="mt-1 text-[11px] text-slate-500">
                        Region: {regionLabel(driver.primaryRegion)} · Today load: {driverJobCounts[driver.id] ?? 0}
                      </div>

                      <div className="mt-2 grid grid-cols-2 gap-x-4 gap-y-1 text-[11px]">
                        <div>
                          <span className="font-medium">Region score:</span> {s.components.regionScore.toFixed(2)}
                        </div>
                        <div>
                          <span className="font-medium">Load score:</span> {s.components.loadBalanceScore.toFixed(2)}
                        </div>
                        <div>
                          <span className="font-medium">Fairness:</span> {s.components.fairnessScore.toFixed(2)}
                        </div>
                        <div>
                          <span className="font-medium">Final:</span> {s.totalScore.toFixed(2)}
                        </div>
                      </div>

                      {s.hardConstraints && (
                        <div className="mt-3 text-[11px]">
                          {(Object.entries(s.hardConstraints) as [HardConstraintKey, boolean][]).map(([key, passed]) => (
                            <div key={key} className="flex items-center gap-2">
                              <span className={`h-2 w-2 rounded-full ${passed ? "bg-emerald-500" : "bg-red-500"}`} />
                              <span className="text-slate-600">
                                {key} {passed ? "✓" : "✗"}
                              </span>
                            </div>
                          ))}
                        </div>
                      )}
                    </div>
                  );
                })}
              </div>
            </div>

            <button onClick={closeDebugDrawer} className="mt-4 w-full rounded-lg bg-slate-800 py-2 text-xs text-white hover:bg-slate-900">
              Close
            </button>
          </div>
        </div>
      )}

      <JobDetailModal open={!!selectedJobId} detail={detail} loading={detailLoading} error={detailError} onClose={handleCloseDetail} />
    </div>
  );
}
