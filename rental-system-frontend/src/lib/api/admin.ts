// src/lib/api/admin.ts
import { API_BASE_URL, USE_BACKEND } from "../config";
import type { JobSummary } from "../types";
import { fetchJson, isBackendDown, pingHealth } from "./http";
import type { Driver } from "../types";

type RawJobFromBackend = any;
export type CreateAdminDriverInput = {
  code?: string;
  name: string;
  email?: string;
  phone?: string;

  vehicleType: string;
  vehiclePlate?: string | null;

  primaryRegion: string;
  secondaryRegions?: string[];

  isActive?: boolean;
  maxJobsPerDay?: number;
  maxJobsPerSlot?: number;
  workDayStartHour?: number;
  workDayEndHour?: number;

  notes?: string;
};

type SetPinResponse = {
  ok: boolean;
  driverId: string;
  pinUpdatedAt?: string;
};
/**
 * If we recently detected backend down / wrong route, re-check /health once
 * before hitting real endpoints again. This prevents repeated noisy failures.
 */
async function ensureBackendUp() {
  if (!USE_BACKEND) return;

  // If backend was marked down recently, do a quick health probe first.
  if (isBackendDown()) {
    const ok = await pingHealth(API_BASE_URL);
    if (!ok) {
      throw new Error(
        `[backend-down] Backend is unreachable (health-check failed). ` +
          `Check if backend is running and API_BASE_URL is correct: ${API_BASE_URL}`
      );
    }
  }
}

/**
 * Normalise a raw Job row from Nest/Prisma into our JobSummary shape.
 */
function normaliseJob(raw: RawJobFromBackend): JobSummary {
  const total = raw.totalBillableWeightKg;
  const numericWeight = typeof total === "number" ? total : Number(total ?? 0);

  return {
    ...raw,
    totalBillableWeightKg: numericWeight,
    driverId: raw.currentDriverId ?? raw.driverId ?? null,
  } as JobSummary;
}

/**
 * GET /admin/jobs
 */
// export async function fetchAdminJobs(status?: string): Promise<JobSummary[]> {
//   if (!USE_BACKEND)
//     throw new Error("fetchAdminJobs called while USE_BACKEND=false");
//   await ensureBackendUp();

//   let url = `${API_BASE_URL}/admin/jobs`;
//   if (status) url += `?status=${encodeURIComponent(status)}`;

//   const data = await fetchJson<RawJobFromBackend[]>(url, { method: "GET" });
//   return data.map(normaliseJob);
// }

type JobsPagedResponse<T> = {
  page: number;
  pageSize: number;
  total: number;
  data: T[];
};

/**
 * GET /admin/jobs (paged)
 * Backend returns: { page, pageSize, total, data }
 */
export async function fetchAdminJobs(params?: {
  status?: string;
  page?: number;
  pageSize?: number;
}): Promise<JobsPagedResponse<JobSummary>> {
  const qs = new URLSearchParams();
  if (params?.status) qs.set("status", params.status);
  if (params?.page) qs.set("page", String(params.page));
  if (params?.pageSize) qs.set("pageSize", String(params.pageSize));

  const res = await fetch(`/api/backend/admin/jobs?${qs.toString()}`, {
    method: "GET",
    headers: { "Content-Type": "application/json" },
    cache: "no-store",
  });

  if (!res.ok) {
    const text = await res.text().catch(() => "");
    throw new Error(`Failed to fetch jobs: ${res.status} ${text}`);
  }

  return (await res.json()) as JobsPagedResponse<JobSummary>;
}

/**
 * Convenience wrapper for the 3 tabs:
 * - pending | active | completed
 */
export async function fetchAdminJobsPaged(params: {
  status: "pending" | "active" | "completed";
  page: number;
  pageSize: number;
}): Promise<JobsPagedResponse<JobSummary>> {
  return fetchAdminJobs(params);
}

/**
 * Convenience wrapper
 */
export async function fetchAdminCompletedJobs(): Promise<JobSummary[]> {
  const res = await fetchAdminJobsPaged({ status: "completed", page: 1, pageSize: 50 });
  return res.data as JobSummary[];
}



// ─────────────────────────────────────────────
// Create job from public booking
// ─────────────────────────────────────────────

export interface CreateBookingPayload {
  customerName: string;
  customerEmail?: string;
  customerPhone?: string;
  pickupRegion: string;
  pickupDate: string;
  pickupSlot: string;
  jobType: "scheduled" | "same_day";
  serviceType?: string;
  routeType?: string;
  totalBillableWeightKg?: number;
  stops?: Array<{
    type: "pickup" | "delivery" | "return";
    label: string;
    addressLine: string;
    postalCode?: string;
    region: string;
    contactName?: string;
    contactPhone?: string;
  }>;
}

export async function createJobFromBooking(
  payload: CreateBookingPayload
): Promise<RawJobFromBackend> {
  if (!USE_BACKEND)
    throw new Error("createJobFromBooking called while USE_BACKEND=false");
  await ensureBackendUp();

  return fetchJson<RawJobFromBackend>(`${API_BASE_URL}/admin/jobs`, {
    method: "POST",
    headers: { "Content-Type": "application/json" },
    body: JSON.stringify(payload),
  });
}

// ─────────────────────────────────────────────
// Payment success
// ─────────────────────────────────────────────

export async function markJobPaymentSuccess(jobPublicId: string): Promise<{
  ok: boolean;
  jobId: string;
  paymentStatus: string;
}> {
  if (!USE_BACKEND)
    throw new Error("markJobPaymentSuccess called while USE_BACKEND=false");
  await ensureBackendUp();

  return fetchJson(
    `${API_BASE_URL}/tracking/${encodeURIComponent(
      jobPublicId
    )}/payment-success`,
    { method: "POST" }
  );
}

// ─────────────────────────────────────────────
// Assignment
// ─────────────────────────────────────────────

export type AssignJobPayload = {
  driverId: string;
  mode: "auto" | "manual";
};

export async function assignJobOnBackend(
  jobId: string,
  payload: AssignJobPayload
): Promise<JobSummary> {
  if (!USE_BACKEND)
    throw new Error("assignJobOnBackend called while USE_BACKEND=false");
  await ensureBackendUp();

  const raw = await fetchJson<RawJobFromBackend>(
    `${API_BASE_URL}/admin/jobs/${jobId}/assign`,
    {
      method: "PATCH",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify(payload),
    }
  );

  return normaliseJob(raw);
}

export async function autoAssignJobOnBackend(
  jobId: string
): Promise<JobSummary> {
  if (!USE_BACKEND)
    throw new Error("autoAssignJobOnBackend called while USE_BACKEND=false");
  await ensureBackendUp();

  const raw = await fetchJson<RawJobFromBackend>(
    `${API_BASE_URL}/admin/jobs/${jobId}/auto-assign`,
    { method: "POST" }
  );

  return normaliseJob(raw);
}

// ─────────────────────────────────────────────
// Job detail + tracking
// ─────────────────────────────────────────────

export type ProofPhotoDto = {
  id: string;
  jobId: string;
  stopId?: string | null;
  url: string;
  takenAt: string;
};

export type AdminJobStopDto = {
  id: string;
  sequenceIndex: number;
  type: "pickup" | "delivery" | "return";
  label: string;
  addressLine: string;
  postalCode: string | null;
  region: string;
  contactName: string | null;
  contactPhone: string | null;
  status: string;
  completedAt: string | null;
};

export type AdminJobDetailDto = {
  job: JobSummary & {
    driverName?: string | null;
    driverPhone?: string | null;
  };
  stops: AdminJobStopDto[];
  proofPhotos: ProofPhotoDto[];
};

export async function fetchAdminCompletedJobDetail(
  jobId: string
): Promise<AdminJobDetailDto> {
  if (!USE_BACKEND)
    throw new Error(
      "fetchAdminCompletedJobDetail called while USE_BACKEND=false"
    );
  await ensureBackendUp();

  return fetchJson<AdminJobDetailDto>(
    `${API_BASE_URL}/admin/jobs/${jobId}/detail`,
    {
      method: "GET",
    }
  );
}

export async function fetchPublicTrackingJob(
  publicId: string
): Promise<AdminJobDetailDto> {
  if (!USE_BACKEND)
    throw new Error("fetchPublicTrackingJob called while USE_BACKEND=false");
  await ensureBackendUp();

 return fetchJson<AdminJobDetailDto>(
  `${API_BASE_URL}/admin/tracking/${encodeURIComponent(publicId)}`,
  { method: "GET", cache: "no-store" }
);

}

// ─────────────────────────────────────────────
// Pricing
// ─────────────────────────────────────────────

export interface PricingQuoteRequest {
  vehicleType: "motorcycle" | "car" | "van" | "lorry";
  itemCategory: string;
  actualWeightKg: number;
  pickupDateTime: string;
  dimensionsCm?: { length: number; width: number; height: number };
  stops: Array<{ latitude: number; longitude: number; type: string }>;
  isAdHocService?: boolean;
  hasSpecialHandling?: boolean;
}

export interface PricingQuoteResponse {
  currency: string;
  totalPriceCents: number;
  totalDistanceKm: number;
  breakdown: Record<string, number>;
}

export async function fetchPricingQuote(
  payload: PricingQuoteRequest & { signal?: AbortSignal }
): Promise<PricingQuoteResponse> {
  if (!USE_BACKEND)
    throw new Error("fetchPricingQuote called while USE_BACKEND=false");
  await ensureBackendUp();

  const { signal, ...bodyPayload } = payload;

  return fetchJson<PricingQuoteResponse>(`${API_BASE_URL}/pricing/quote`, {
    method: "POST",
    headers: { "Content-Type": "application/json" },
    body: JSON.stringify(bodyPayload),
    signal,
  });
}


// ─────────────────────────────────────────────
// Drivers
// ─────────────────────────────────────────────

export async function createAdminDriver(
  payload: CreateAdminDriverInput
): Promise<Driver> {
  if (!USE_BACKEND)
    throw new Error("createAdminDriver called while USE_BACKEND=false");
  await ensureBackendUp();

  const mapRegion = (r: string) =>
    r === "north-east" ? "north_east" : r === "island-wide" ? "island_wide" : r;

  // 🔧 VehicleType normalization:
  // - If backend expects the same values (bike/car/van/lorry/other), keep as-is.
  // - If backend expects "motorcycle" instead of "bike", map it here.
  // - If backend expects uppercase enums, do .toUpperCase().
  const mapVehicleType = (v: string) => {
  const clean = (v ?? "").trim().toLowerCase();
  const allowed = new Set(["bike", "car", "van", "lorry"]);
  if (!allowed.has(clean)) {
    throw new Error(`Invalid vehicleType "${v}". Allowed: bike, car, van, lorry`);
  }
  return clean;
};


  // Drop empty strings (prevents DTO validation failures on optional fields)
  const clean = <T extends Record<string, any>>(obj: T) => {
    const out: any = {};
    for (const [k, v] of Object.entries(obj)) {
      if (v === undefined || v === null) continue;
      if (typeof v === "string" && v.trim() === "") continue;
      out[k] = typeof v === "string" ? v.trim() : v;
    }
    return out as Partial<T>;
  };

  const token =
    typeof window === "undefined"
      ? null
      : window.localStorage.getItem("cms-admin-token-v1");

  const normalized: CreateAdminDriverInput = clean({
    ...payload,
    code: payload.code ? payload.code.toUpperCase().trim() : undefined, // ✅ important
    vehicleType: mapVehicleType(payload.vehicleType),
    primaryRegion: payload.primaryRegion ? mapRegion(payload.primaryRegion) : payload.primaryRegion,
    secondaryRegions: Array.isArray(payload.secondaryRegions)
      ? payload.secondaryRegions.map(mapRegion)
      : payload.secondaryRegions,
    notes: payload.notes?.trim() || undefined,
  }) as CreateAdminDriverInput;

  return fetchJson<Driver>(`${API_BASE_URL}/admin/drivers`, {
    method: "POST",
    headers: {
      "Content-Type": "application/json",
      ...(token ? { Authorization: `Bearer ${token}` } : {}),
    },
    body: JSON.stringify(normalized),
  });
}


export async function deleteAdminDriver(id: string) {
  if (!USE_BACKEND)
    throw new Error("deleteAdminDriver called while USE_BACKEND=false");
  await ensureBackendUp();

  return fetchJson(`${API_BASE_URL}/admin/drivers/${id}`, { method: "DELETE" });
}

export async function setAdminDriverPin(driverId: string, pin: string): Promise<SetPinResponse> {
  if (!USE_BACKEND) throw new Error("setAdminDriverPin called while USE_BACKEND=false");
  await ensureBackendUp();

  const cleanPin = pin.trim();

  // Optional guard (keeps bugs out if UI misses validation)
  if (!/^\d{6}$/.test(cleanPin)) {
    throw new Error("PIN must be exactly 6 digits");
  }

  const token =
    typeof window === "undefined" ? null : window.localStorage.getItem("cms-admin-token-v1");

  return fetchJson<SetPinResponse>(`${API_BASE_URL}/admin/drivers/${driverId}/pin`, {
    method: "PATCH",
    headers: {
      "Content-Type": "application/json",
      ...(token ? { Authorization: `Bearer ${token}` } : {}),
    },
    body: JSON.stringify({ pin: cleanPin }),
  });
}

export async function resetAdminDriverPin(driverId: string, pin: string) {
  if (!USE_BACKEND)
    throw new Error("resetAdminDriverPin called while USE_BACKEND=false");
  await ensureBackendUp();

  return fetchJson(`${API_BASE_URL}/admin/drivers/${driverId}/reset-pin`, {
    method: "POST",
    headers: { "Content-Type": "application/json" },
    body: JSON.stringify({ pin }),
  });
}


export async function deleteAdminJob(jobId: string) {
  const res = await fetch(`/api/backend/admin/jobs/${jobId}`, {
    method: "DELETE",
    headers: { "Content-Type": "application/json" },
  });
  if (!res.ok) {
    const text = await res.text().catch(() => "");
    throw new Error(`Failed to delete job: ${res.status} ${text}`);
  }
  return true;
}

/**
 * Bulk delete by status.
 * Example: DELETE /admin/jobs?status=pending-assignment
 */
export async function bulkDeleteAdminJobsByStatus(status: string) {
  const res = await fetch(`/api/backend/admin/jobs?status=${encodeURIComponent(status)}`, {
    method: "DELETE",
  });
  if (!res.ok) {
    const text = await res.text().catch(() => "");
    throw new Error(`Failed bulk delete: ${res.status} ${text}`);
  }
  return true;
}