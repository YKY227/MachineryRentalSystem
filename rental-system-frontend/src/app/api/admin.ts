// src/lib/api/admin.ts
import { USE_BACKEND, API_BASE_URL } from '@/lib/config';
import type { JobSummary, RegionCode, JobStatus, JobType, AssignmentMode } from '@/lib/types';
import { mockJobs } from '@/lib/mock/jobs';

// ─────────── Mappers from backend enums → frontend strings ───────────

// Prisma RegionCode: central | east | west | north | north_east | island_wide
function mapRegionFromApi(region: string): RegionCode {
  switch (region) {
    case 'central':
    case 'east':
    case 'west':
    case 'north':
      return region as RegionCode;
    case 'north_east':
      return 'north-east' as RegionCode;
    case 'island_wide':
      return 'island-wide' as RegionCode;
    default:
      throw new Error(`[mapRegionFromApi] Unknown region: ${region}`);
  }
}

// Prisma JobType: scheduled | ad_hoc
function mapJobTypeFromApi(jobType: string): JobType {
  switch (jobType) {
    case 'scheduled':
      return 'scheduled' as JobType;
    case 'ad_hoc':
      return 'ad-hoc' as JobType;
    default:
      throw new Error(`[mapJobTypeFromApi] Unknown jobType: ${jobType}`);
  }
}

// Prisma JobStatus: booked | pending_assign | assigned | out_for_pickup | in_transit | completed | failed | cancelled
function mapJobStatusFromApi(status: string): JobStatus {
  switch (status) {
    case 'booked':
      return 'booked' as JobStatus;
    case 'pending_assign':
      return 'pending-assignment' as JobStatus;
    case 'assigned':
      return 'assigned' as JobStatus;
    case 'out_for_pickup':
      return 'out-for-pickup' as JobStatus;
    case 'in_transit':
      return 'in-transit' as JobStatus;
    case 'completed':
      return 'completed' as JobStatus;
    case 'failed':
      return 'failed' as JobStatus;
    case 'cancelled':
      return 'cancelled' as JobStatus;
    default:
      throw new Error(`[mapJobStatusFromApi] Unknown status: ${status}`);
  }
}

function mapAssignmentModeFromApi(
  mode: string | null,
): AssignmentMode | undefined {
  if (!mode) return undefined;
  switch (mode) {
    case 'auto':
      return 'auto';
    case 'manual':
      return 'manual';
    default:
      return undefined;
  }
}


// Shape returned from Nest `/admin/jobs`
type AdminJobApi = {
  id: string;
  publicId: string | null;
  customerName: string;
  pickupRegion: string;
  pickupDate: string | null;
  pickupSlot: string | null;
  jobType: string;
  status: string;
  assignmentMode: string | null;
  assignmentFailureReason?: string | null;
  stopsCount: number;
  totalBillableWeightKg: string | number | null;
  currentDriverId?: string | null;
  createdAt: string;
};

// Map backend row → your existing JobSummary
function mapJobFromApi(job: AdminJobApi): JobSummary {
  return {
    id: job.id,
    publicId: job.publicId ?? job.id,
    customerName: job.customerName,
    pickupRegion: mapRegionFromApi(job.pickupRegion),
    pickupDate: job.pickupDate ?? '',
    pickupSlot: job.pickupSlot ?? '',
    jobType: mapJobTypeFromApi(job.jobType),
    status: mapJobStatusFromApi(job.status),
    assignmentMode: mapAssignmentModeFromApi(job.assignmentMode),
    driverId: job.currentDriverId ?? undefined,
    stopsCount: job.stopsCount ?? 0,
    totalBillableWeightKg:
      job.totalBillableWeightKg != null
        ? Number(job.totalBillableWeightKg)
        : 0,
    createdAt: job.createdAt,
  };
}

// ─────────── Public function used by /admin/jobs page ───────────

export async function fetchAdminJobs(): Promise<JobSummary[]> {
  if (!USE_BACKEND) {
    // Fallback: use in-memory mock data
    return mockJobs;
  }

    const url = `${API_BASE_URL}/admin/jobs`; // 👉 becomes /api/backend/admin/jobs


  const res = await fetch(`${API_BASE_URL}/admin/jobs`, {
    cache: 'no-store', // always fresh for admin
  });

  if (!res.ok) {
    console.error('Failed to fetch /admin/jobs, status:', res.status);
    // Optional: fallback to mock on error instead of throwing
    return mockJobs;
    // Or if you prefer hard fail:
    // throw new Error(`Failed to fetch /admin/jobs: ${res.status}`);
  }

  const data = (await res.json()) as AdminJobApi[];
  return data.map(mapJobFromApi);
}
