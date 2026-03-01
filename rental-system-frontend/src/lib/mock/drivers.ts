// src/lib/mock/drivers.ts
import type { Driver, RegionCode, VehicleType } from "@/lib/types";

export const REGION_LABELS: Record<RegionCode, string> = {
  central: "Central",
  east: "East",
  west: "West",
  north: "North",
  "north-east": "North-East",
  "island-wide": "Island-wide",
};

export const VEHICLE_LABELS: Record<VehicleType, string> = {
  bike: "Bike",
  car: "Car",
  van: "Van",
  lorry: "Lorry",
  other: "Other",
};

export const mockDrivers: Driver[] = [
  {
    id: "drv-1",
    code: "DRV-001",
    name: "Alex Tan",
    email: "alex.tan@example.com",
    phone: "+65 9001 0001",
    primaryRegion: "central",
    secondaryRegions: ["east"],
    vehicleType: "van",
    isActive: true,
    maxJobsPerDay: 18,
    maxJobsPerSlot: 6,
    workDayStartHour: 9,
    workDayEndHour: 18,
    // NEW fields
    currentStatus: "online",
    lastSeenAt: "2025-12-01T09:15:00+08:00",
    location: {
      lat: 1.285,
      lng: 103.852,
    },
    vehiclePlate: "SGA 1234 X",
    assignedJobCountToday: 5,
    notes: "Prefers CBD pickups, good with bulky items.",
    authUserId: undefined,
  },
  {
    id: "drv-2",
    code: "DRV-002",
    name: "Siti Rahman",
    email: "siti.rahman@example.com",
    phone: "+65 9002 0002",
    primaryRegion: "east",
    secondaryRegions: ["central", "north-east"],
    vehicleType: "bike",
    isActive: true,
    maxJobsPerDay: 22,
    maxJobsPerSlot: 7,
    workDayStartHour: 8,
    workDayEndHour: 17,
    // NEW fields
    currentStatus: "break",
    lastSeenAt: "2025-12-01T09:05:00+08:00",
    location: {
      lat: 1.345,
      lng: 103.955,
    },
    vehiclePlate: "SGB 5678 Y",
    assignedJobCountToday: 3,
    notes: "Ideal for documents and small parcels.",
    authUserId: undefined,
  },
  {
    id: "drv-3",
    code: "DRV-003",
    name: "Kumar Raj",
    email: "kumar.raj@example.com",
    phone: "+65 9003 0003",
    primaryRegion: "west",
    secondaryRegions: ["central"],
    vehicleType: "lorry",
    isActive: false,
    maxJobsPerDay: 12,
    maxJobsPerSlot: 4,
    workDayStartHour: 9,
    workDayEndHour: 18,
    // NEW fields
    currentStatus: "offline",
    lastSeenAt: "2025-11-30T18:45:00+08:00",
    location: null, // no recent location
    vehiclePlate: "SGC 9101 Z",
    assignedJobCountToday: 0,
    notes: "On standby – usually assigned to oversized / palletized loads.",
    authUserId: undefined,
  },
];
