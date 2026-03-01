// src/lib/api/driver.ts
import { API_BASE_URL, USE_BACKEND } from "@/lib/config";
import type {
  DriverJob,
  DriverJobStatus,
  RegionCode,
  DriverStopType,
  DriverJobStop,
} from "@/lib/types";
import type { ServiceType } from "@/lib/booking-store";

/**
 * Option B2 (scalable):
 * - Driver PWA authenticates -> stores JWT locally
 * - Driver endpoints derive driverId from JWT (preferred)
 *
 * TEMP fallback (only if no JWT):
 * - allow passing driverId as query param (legacy)
 */

const DRIVER_TOKEN_KEY = "cms-driver-token-v1";

function mapBackendJobToDriverJob(j: any) {
  return {
    id: j.id,
    displayId: j.publicId,
    originLabel: j.customerName ?? "Job",
    areaLabel: j.pickupRegion ?? "",
    pickupDate: j.pickupDate,
    pickupWindow: j.pickupSlot,
    totalStops: j.stopsCount ?? 0,
    totalBillableWeightKg: Number(j.totalBillableWeightKg ?? 0),
    status: j.status === "out_for_pickup" ? "pickup"
          : j.status === "in_transit" ? "in-progress"
          : j.status,
    routePattern: j.routeType ?? undefined,
    assignedDriverId: j.currentDriverId ?? null, // important for filtering!
  };
}

function readDriverToken(): string | null {
  if (typeof window === "undefined") return null;
  try {
    return window.localStorage.getItem(DRIVER_TOKEN_KEY);
  } catch {
    return null;
  }
}

function authHeaders(extra?: Record<string, string>) {
  const token = readDriverToken();
  const base: Record<string, string> = { ...(extra ?? {}) };
  if (token) base.Authorization = `Bearer ${token}`;
  return base;
}

// ---- ServiceType normalization ----
// Adjust these to EXACTLY match your ServiceType union in booking-store.ts
function normalizeServiceType(input: unknown): ServiceType {
  const s = String(input ?? "")
    .toLowerCase()
    .replace(/\s+/g, "")
    .replace("_", "-");

  // Express / urgent → express-3h
  if (
    s === "express" ||
    s === "express-3h" ||
    s === "3h" ||
    s === "adhoc" ||
    s === "ad-hoc"
  ) {
    return "express-3h";
  }

  // Next-day variants
  if (s === "nextday" || s === "next-day") {
    return "next-day";
  }

  // Default / standard
  if (s === "standard" || s === "same-day" || s === "sameday") {
    return "same-day";
  }

  // Safe fallback (never return invalid union member)
  return "same-day";
}


// ---- DriverStopType normalization ----
function normalizeStopType(input: unknown): DriverStopType {
  const s = String(input ?? "").toLowerCase();
  if (s === "pickup") return "pickup";
  if (s === "return") return "return";
  // backend may say "delivery" or "dropoff"
  return "delivery";
}

// Backend payload can vary
type RawDriverJobFromBackend = any;

function mapStop(rawStop: any, idx: number): DriverJobStop {
  const rs = rawStop ?? {};
  const seq = rs.sequenceIndex ?? rs.sequence ?? idx + 1;

  const address =
    rs.addressLine ??
    rs.addressLine1 ??
    rs.address ??
    rs.locationAddress ??
    "";

  const completed =
    String(rs.status ?? "").toUpperCase() === "COMPLETED" ||
    String(rs.status ?? "").toLowerCase() === "completed" ||
    Boolean(rs.completedAt) ||
    Boolean(rs.completed);

  return {
    id: String(rs.id ?? `stop-${idx + 1}`),
    type: normalizeStopType(rs.type),
    sequence: Number(seq),

    label: String(rs.label ?? `Stop ${idx + 1}`),
    addressLine1: String(address),
    postalCode: String(rs.postalCode ?? rs.postal_code ?? ""),

    contactName: String(rs.contactName ?? rs.contact_name ?? ""),
    contactPhone: String(rs.contactPhone ?? rs.contact_phone ?? ""),

    remarks: rs.notes ?? rs.remarks ?? undefined,
    completed,
    proofPhotoUrl: rs.proofPhotoUrl ?? null,
  };
}

function normaliseBackendJobToDriverJob(raw: RawDriverJobFromBackend): DriverJob {
  const statusMap: Record<string, DriverJobStatus> = {
    booked: "allocated",
    assigned: "allocated",
    out_for_pickup: "pickup",
    "out-for-pickup": "pickup",
    in_transit: "in-progress",
    "in-transit": "in-progress",
    completed: "completed",
    failed: "allocated",
    cancelled: "allocated",
    returned: "allocated",
  };

  const pickupRegionRaw: string | undefined =
    raw?.pickupRegion ?? raw?.pickup_region ?? raw?.pickup?.region;

  const pickupDateRaw: string | undefined =
    raw?.pickupDate ?? raw?.pickup_date ?? raw?.scheduleInfo?.pickupDate;

  const pickupSlot: string | undefined =
    raw?.pickupSlot ?? raw?.pickup_slot ?? raw?.scheduleInfo?.pickupSlot;

  const publicId: string =
    raw?.publicId ?? raw?.public_id ?? raw?.displayId ?? raw?.id ?? "—";

  const stopsFromBackend: any[] = Array.isArray(raw?.stops)
    ? raw.stops
    : Array.isArray(raw?.jobStops)
      ? raw.jobStops
      : [];

  const stops = stopsFromBackend.map(mapStop);

  const regionMap: Record<string, RegionCode> = {
    central: "central",
    east: "east",
    west: "west",
    north: "north",
    north_east: "north-east",
    "north-east": "north-east",
    island_wide: "island-wide",
    "island-wide": "island-wide",
  };

  const pickupRegionKey = String(pickupRegionRaw ?? "")
    .toLowerCase()
    .replace("-", "_");

  const pickupRegionFrontend: RegionCode =
    regionMap[pickupRegionKey] ?? "central";

  const pickupDate =
    typeof pickupDateRaw === "string" && pickupDateRaw.length >= 10
      ? pickupDateRaw.slice(0, 10)
      : new Date().toISOString().slice(0, 10);

  const backendStatus = String(raw?.status ?? "").toLowerCase();
  const driverStatus: DriverJobStatus = statusMap[backendStatus] ?? "allocated";

  const driverId =
    raw?.currentDriverId ??
    raw?.driverId ??
    raw?.assignedDriverId ??
    raw?.currentDriver?.id ??
    null;

  return {
    id: String(raw?.id ?? ""),
    displayId: String(publicId),
    status: driverStatus,

    serviceType: normalizeServiceType(raw?.serviceType ?? "same-day"),

    pickupDate,
    pickupWindow: String(pickupSlot ?? "TBC"),

    totalStops: stops.length,
    totalBillableWeightKg: Number(raw?.totalBillableWeightKg ?? 0),

    originLabel: String(raw?.customerName ?? raw?.originLabel ?? "Job"),
    areaLabel: pickupRegionFrontend,

    routePattern: String(raw?.routeType ?? raw?.routePattern ?? "one-to-one") as any,

    driverId,
    assignedDriverId: driverId,

    stops,
  };
}

/**
 * Fetch jobs assigned to the current driver.
 * Preferred (B2): GET /driver/jobs with Authorization: Bearer <jwt>
 * TEMP fallback: GET /driver/jobs?driverId=...
 */
export async function fetchDriverJobs(driverId?: string): Promise<DriverJob[]> {
  if (!USE_BACKEND) {
    console.warn("fetchDriverJobs called while USE_BACKEND=false");
    return [];
  }

  const token = readDriverToken();

  const url =
    token || !driverId
      ? `${API_BASE_URL}/driver/jobs`
      : `${API_BASE_URL}/driver/jobs?driverId=${encodeURIComponent(driverId)}`;

  const res = await fetch(url, {
    method: "GET",
    headers: authHeaders({ "Content-Type": "application/json" }),
  });

  if (!res.ok) {
    const text = await res.text().catch(() => "");
    throw new Error(`Failed to fetch driver jobs: ${res.status} ${res.statusText} ${text}`);
  }

  const raw = (await res.json()) as RawDriverJobFromBackend[];
  if (!Array.isArray(raw)) return [];
  return raw.map(normaliseBackendJobToDriverJob);
}

export async function updateDriverJobStatusOnBackend(
  jobId: string,
  status: DriverJobStatus
): Promise<DriverJob> {
  if (!USE_BACKEND) throw new Error("Backend disabled");

  const res = await fetch(`${API_BASE_URL}/driver/jobs/${jobId}/status`, {
    method: "PATCH",
    headers: authHeaders({ "Content-Type": "application/json" }),
    body: JSON.stringify({ status }),
  });

  if (!res.ok) {
    const text = await res.text().catch(() => "");
    throw new Error(
      `Failed to update driver job status for ${jobId}: ${res.status} ${res.statusText} ${text}`
    );
  }

  return normaliseBackendJobToDriverJob(await res.json());
}

export async function markDriverJobStopOnBackend(
  jobId: string,
  stopId: string
): Promise<DriverJob> {
  if (!USE_BACKEND) throw new Error("Backend disabled");

  const res = await fetch(`${API_BASE_URL}/driver/jobs/${jobId}/stops/${stopId}`, {
    method: "PATCH",
    headers: authHeaders({ "Content-Type": "application/json" }),
    body: JSON.stringify({}),
  });

  if (!res.ok) {
    const text = await res.text().catch(() => "");
    throw new Error(
      `Failed to mark stop ${stopId} for job ${jobId}: ${res.status} ${res.statusText} ${text}`
    );
  }

  return normaliseBackendJobToDriverJob(await res.json());
}

export type ProofPhotoDto = {
  id: string;
  url: string;
  takenAt: string;
  stopId?: string | null;
  jobId?: string;
  driverId?: string | null;
};

export async function uploadProofPhotoOnBackend(opts: {
  jobId: string;
  stopId?: string | null;
  file: File;
}): Promise<ProofPhotoDto> {
  const { jobId, stopId, file } = opts;

  if (!USE_BACKEND) throw new Error("Backend disabled");

  const form = new FormData();
  form.append("file", file);
  if (stopId) form.append("stopId", stopId);

  const res = await fetch(`${API_BASE_URL}/driver/jobs/${jobId}/proof`, {
    method: "POST",
    headers: authHeaders(), // DO NOT set Content-Type for FormData
    body: form,
  });

  if (!res.ok) {
    const text = await res.text().catch(() => "");
    throw new Error(
      `Failed to upload proof photo for job ${jobId}: ${res.status} ${res.statusText} ${text}`
    );
  }

  const json = (await res.json()) as any;
  const proof = json?.proof ?? json;

  return {
    id: String(proof.id),
    url: String(proof.url),
    takenAt: String(proof.takenAt ?? new Date().toISOString()),
    stopId: proof.stopId ?? stopId ?? null,
    jobId: proof.jobId ?? jobId,
    driverId: proof.driverId ?? null,
  };
}
