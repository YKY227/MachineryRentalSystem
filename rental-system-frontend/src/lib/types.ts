// src/lib/types.ts

// Reuse existing types from the booking store (purely as types)
import type {
  ServiceType,
  RouteType,
  PickupLocation,
  DeliveryPoint,
  DeliveryItem,
  ScheduleInfo,
} from "./booking-store";

export type {
  ServiceType,
  RouteType,
  PickupLocation,
  DeliveryPoint,
  DeliveryItem,
  ScheduleInfo,
} from "./booking-store";
/**
 * How the job was created.
 * Helpful later for analytics / behaviour differences.
 */
export type JobSource = "web" | "whatsapp" | "admin";

/**
 * Scheduled vs ad-hoc jobs (key for assignment policy).
 */
export type JobType = "scheduled" | "ad-hoc";

/**
 * High-level job status, shared by admin dashboard & driver app.
 */
export type JobStatus =
  | "booked"             // Just created, not yet considered by dispatcher
  | "pending-assignment" // Needs auto/manual assignment
  | "assigned"           // Driver allocated, not started
  | "out-for-pickup"     // Driver en route / picking up
  | "in-transit"         // Items being delivered
  | "completed"          // Successfully done
  | "failed"             // Failed delivery (reason required)
  | "cancelled"          // Cancelled by customer/admin
  | "returned";          // Returned to sender / depot


// Add this new union type
export type RoutePattern =
  | "one-to-many"
  | "many-to-one"
  | "one-to-one"
  | "round-trip";


/**
 * How the job was assigned.
 */
export type AssignmentMode = "auto" | "manual";

/**
 * Why auto-assignment failed (used in UI badges & alerts).
 */
export type AssignmentFailureReason =
  | "NO_ELIGIBLE_DRIVER"
  | "NO_CAPACITY"
  | "OUTSIDE_WORKING_HOURS"
  | "NO_REGION_COVERAGE"
  | "NO_VEHICLE_MATCH"
  | "SLA_NOT_POSSIBLE"
  | "CONFIG_DISABLED"
  | "UNKNOWN";

/**
 * Simple region codes for capacity / routing.
 * You can tweak/extend these to match your business later.
 */
export type RegionCode =
  | "central"
  | "east"
  | "west"
  | "north"
  | "north-east"
  | "island-wide";

/**
 * Vehicle / capability hints for drivers.
 */
export type VehicleType = "bike" | "car" | "van" | "lorry" | "other";

/**
 * Driver availability / presence state for dashboards & PWA.
 */
export type DriverStatus = "online" | "offline" | "break" | "unavailable";

/**
 * Core driver record, used by:
 * - Admin Dashboard (Drivers tab)
 * - Assignment engine
 * - Driver PWA (login & job list)
 */
export interface Driver {
  id: string;                 // Internal ID (UUID or DB ID)
  code?: string;              // Optional human-readable code e.g. "DRV-001"

  name: string;
  email: string;
  phone: string;

  // Regions this driver can cover
  primaryRegion: RegionCode;
  secondaryRegions?: RegionCode[];

  vehicleType: VehicleType;

  // 🚗 NEW – plate number (optional, can be required if you prefer)
  vehiclePlate?: string;

  // Whether driver is active & assignable
  isActive: boolean;

  // Capacity settings (simple but extendable)
  maxJobsPerDay: number;      // e.g. 20
  maxJobsPerSlot: number;     // e.g. 5 per time window
  workDayStartHour: number;   // 0–23, e.g. 8
  workDayEndHour: number;     // 0–23, e.g. 18

  notes?: string;

  // Future: link to auth user record, if different
  authUserId?: string;

  // 🔴 Realtime / dashboard fields (all optional so you can phase them in)
  currentStatus?: "online" | "offline" | "break" | "unavailable";
  lastSeenAt?: string; // ISO timestamp

  location?: { lat: number; lng: number } | null;

  // Computed dynamically based on today’s assignments
  assignedJobCountToday?: number;
}

/**
 * Lightweight driver info to embed into Job (so job still
 * keeps a snapshot even if driver record changes later).
 */
export interface DriverSnapshot {
  driverId: string;
  name: string;
  phone: string;
  vehicleType: VehicleType;
  primaryRegion: RegionCode;
}

/**
 * Core Job entity as seen in Admin Dashboard & Driver PWA.
 * This wraps your booking wizard data with extra operational fields.
 */
export interface Job {
  id: string;               // Internal DB ID
  publicId: string;         // Customer-facing Job ID, e.g. "STL-250324-001"
  source: JobSource;

  jobType: JobType;         // "scheduled" | "ad-hoc"
  status: JobStatus;
  assignmentMode?: AssignmentMode; // auto | manual | undefined if not yet assigned

  serviceType: ServiceType;
  routeType: RouteType;

  pickup: PickupLocation;
  deliveries: DeliveryPoint[];
  items: DeliveryItem[];
  schedule: ScheduleInfo;

  // Optional: snapshot of assigned driver
  assignedDriver?: DriverSnapshot;

  // For diagnostics / display when auto-assign fails
  assignmentFailureReason?: AssignmentFailureReason;
  assignmentScoreDebug?: {
    selectedDriverId?: string;
    candidates: {
      driverId: string;
      totalScore: number;
      components: Record<string, number>; // e.g. { regionScore: 0.8, loadScore: 0.6 }
      rejected?: boolean;
      rejectionReason?: AssignmentFailureReason;
    }[];
  };

  createdAt: string; // ISO timestamps
  updatedAt: string;
}

// ─────────────────────────────────────────────
// Driver-facing job model (Driver PWA)
// ─────────────────────────────────────────────

export type DriverJobStatus =
  | "booked"
  | "allocated"
  | "pickup"
  | "in-progress"
  | "completed";

export type DriverStopType = "pickup" | "delivery" | "return";

export interface DriverJobStop {
  id: string;
  type: DriverStopType;
  sequence: number;

  label: string;
  addressLine1: string;
  postalCode: string;
  contactName: string;
  contactPhone: string;

  remarks?: string;
  completed?: boolean; // used for offline/local completion in PWA
  /** Latest proof photo URL from backend (if any). */
  proofPhotoUrl?: string | null;
}

export interface JobSummary {
  id: string;                 // internal ID
  publicId: string;           // customer-facing job ID

  customerName: string;
  source?: JobSource;         // optional in the summary for now

  jobType: JobType;           // "scheduled" | "ad-hoc"
  status: JobStatus;
  assignmentMode?: AssignmentMode; // auto | manual | undefined

  pickupRegion: RegionCode;
  pickupDate: string;         // "2025-03-25"
  pickupSlot: string;         // "09:00 – 12:00" or "ASAP (within 3h)"

  driverId?: string | null;   // assigned driver (if any)

  stopsCount: number;
  totalBillableWeightKg: number;

  createdAt: string;          // ISO datetime
}

/**
 * Slimmed-down, driver-friendly view of a job.
 * This is what the Driver PWA uses for:
 * - Today’s jobs list
 * - Job detail view
 * - Offline status + stop completion
 */
export interface DriverJob {
  id: string;          // matches Job.id / JobSummary.id
  displayId: string;   // e.g. "STL-250323-1001"

  // Service type visible to driver
  // (reuse booking ServiceType so it stays consistent)
  serviceType: ServiceType;

  status: DriverJobStatus;

  pickupWindow: string; // "09:00 – 12:00"
  pickupDate: string;   // "2025-12-01"

  totalStops: number;
  totalBillableWeightKg: number;

  originLabel: string;  // e.g. "Tech Hygiene Hub"
  areaLabel: string;    // e.g. "Central / CBD"

  routePattern?: RoutePattern; //route type, one to many, many to one etc.

  // For driver filtering in the PWA
  driverId?: string | null;        // canonical driver id (e.g. "drv-1")
  assignedDriverId?: string | null; // kept for flexibility / future mapping

  stops: DriverJobStop[];
}


/**
 * Keys for the assignment engine.
 * These separate hard constraints vs soft scoring rules.
 */
export type HardConstraintKey =
  | "activeDriver"     // must be active
  | "workingHours"     // must be within driver's work hours
  | "regionMatch"      // pickup region must be in driver's allowed regions
  | "vehicleMatch"     // vehicle must be suitable
  | "slotCapacity";    // driver must have free capacity in that time slot

export type SoftRuleKey =
  | "regionScore"      // prefer drivers closer / region match
  | "loadBalanceScore" // prefer less-loaded drivers
  | "fairnessScore";   // prefer drivers who got fewer jobs recently

export interface AssignmentRuleConfig {
  enabled: boolean;
}

export interface SoftRuleConfig extends AssignmentRuleConfig {
  weight: number; // 0–1, we’ll normalise or just treat as relative weights
}

/**
 * Configurable assignment behaviour.
 * Later this can come from DB / admin UI.
 */
export interface AssignmentConfig {
  // Global toggles
  autoAssignScheduled: boolean; // if false, all scheduled jobs go to manual
  autoAssignExpress: boolean;   // whether to auto-assign express jobs

  // Hard constraints – filter layer
  hardConstraints: Record<HardConstraintKey, AssignmentRuleConfig>;

  // Soft rules – scoring layer
  softRules: Record<SoftRuleKey, SoftRuleConfig>;
}

/**
 * A sensible default configuration you can use in mock data
 * and as initial Admin Settings state.
 */
export const defaultAssignmentConfig: AssignmentConfig = {
  autoAssignScheduled: true,
  autoAssignExpress: true,

  hardConstraints: {
    activeDriver: { enabled: true },
    workingHours: { enabled: true },
    regionMatch: { enabled: true },
    vehicleMatch: { enabled: true },
    slotCapacity: { enabled: true },
  },

  softRules: {
    regionScore: { enabled: true, weight: 0.4 },
    loadBalanceScore: { enabled: true, weight: 0.4 },
    fairnessScore: { enabled: true, weight: 0.2 },
  },
};
