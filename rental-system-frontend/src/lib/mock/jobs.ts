// src/lib/mock/jobs.ts
import type { JobSummary } from "@/lib/types";

/**
 * These are ADMIN-side job summaries.
 * Driver-side jobs & stops are derived in unified-jobs-store.ts
 */
export const mockJobs: JobSummary[] = [
  // ────────────────────────────────────────────
  // Alex (drv-1) – ONE pickup → MANY deliveries
  // Tech Hygiene Hub → 3 client offices
  // ────────────────────────────────────────────
  {
    id: "job-1",
    publicId: "STL-251123-1023",
    customerName: "Tech Hygiene Hub",
    pickupRegion: "central",
    pickupDate: "2025-12-02",
    pickupSlot: "09:00 – 12:00",
    jobType: "scheduled",
    status: "out-for-pickup", // JobStatus (will map to DriverJobStatus "pickup")
    assignmentMode: "auto",
    driverId: "drv-1",        // Alex
    stopsCount: 4,            // 1 pickup + 3 deliveries
    totalBillableWeightKg: 18.4,
    createdAt: "2025-11-24T10:15:00Z",
  },

  // ────────────────────────────────────────────
  // Siti (drv-2) – MANY pickups → ONE delivery
  // Collect from 3 locations → deliver to central lab
  // ────────────────────────────────────────────
  {
    id: "job-2",
    publicId: "STL-261123-2045",
    customerName: "Cleanroom Logistics",
    pickupRegion: "east",
    pickupDate: "2025-11-25",
    pickupSlot: "12:00 – 15:00",
    jobType: "scheduled",
    status: "assigned",       // JobStatus (DriverJobStatus "allocated")
    assignmentMode: "auto",
    driverId: "drv-2",        // Siti
    stopsCount: 4,            // 3 pickups + 1 delivery
    totalBillableWeightKg: 12.6,
    createdAt: "2025-11-24T11:05:00Z",
  },

  // ────────────────────────────────────────────
  // Kumar (drv-3) – ROUND TRIP / SEQUENCE
  // A → B → C → back to A
  // ────────────────────────────────────────────
  {
    id: "job-3",
    publicId: "STL-271123-3131",
    customerName: "Warehouse Hub",
    pickupRegion: "west",
    pickupDate: "2025-11-25",
    pickupSlot: "15:00 – 18:00",
    jobType: "scheduled",
    status: "booked",         // not started yet
    assignmentMode: "manual",
    driverId: "drv-3",        // Kumar
    stopsCount: 4,            // A → B → C → A
    totalBillableWeightKg: 32.0,
    createdAt: "2025-11-24T12:30:00Z",
  },

  // ────────────────────────────────────────────
  // Older completed job – shows up in history
  // ────────────────────────────────────────────
  {
    id: "job-4",
    publicId: "STL-241123-0999",
    customerName: "TechHub Co-working",
    pickupRegion: "central",
    pickupDate: "2025-11-24",
    pickupSlot: "09:00 – 12:00",
    jobType: "scheduled",
    status: "completed",
    assignmentMode: "manual",
    driverId: "drv-1",
    stopsCount: 3,
    totalBillableWeightKg: 10.2,
    createdAt: "2025-11-23T09:45:00Z",
  },

  // ────────────────────────────────────────────
  // Another completed job
  // ────────────────────────────────────────────
  {
    id: "job-5",
    publicId: "STL-231123-0998",
    customerName: "EduLink Solutions",
    pickupRegion: "north-east",
    pickupDate: "2025-11-23",
    pickupSlot: "12:00 – 15:00",
    jobType: "scheduled",
    status: "completed",
    assignmentMode: "auto",
    driverId: "drv-2",
    stopsCount: 2,
    totalBillableWeightKg: 7.3,
    createdAt: "2025-11-22T11:00:00Z",
  },
];
