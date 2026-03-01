// src/lib/rental/seed-equipment.ts
import type { Equipment } from "./types";

// ✅ Default buffer (if an equipment item doesn't set its own)
const DEFAULT_MAINTENANCE_BUFFER_DAYS = 7;

export const seedEquipment: Equipment[] = [
  {
    id: "eq-mini-excavator-1t8",
    title: "Mini Excavator 1.8T",
    category: "earthmoving",
    brand: "Kubota",
    model: "U17 / Similar",
    images: ["/rental/mini-excavator.jpg"],
    shortDesc: "Compact excavator for tight-access trenching and site works.",
    specs: {
      "Operating weight": "1.7–1.9T",
      "Max dig depth": "~2.3m",
      "Width": "~990mm",
      "Power": "Diesel",
    },
    keyFeatures: [
      "Compact width for tight-access works",
      "Smooth hydraulic control for trenching and grading",
      "Low ground pressure rubber tracks (site friendly)",
      "Quick attachment compatibility (subject to availability)",
    ],
    applications: [
      "Trenching for pipes/cables",
      "Landscaping & drainage works",
      "Small demolition & site clearing",
      "Footing excavation for minor works",
    ],
    totalUnits: 3,
    isPublished: true,

    // ✅ NEW: per-equipment maintenance buffer (days)
    maintenanceBufferDays: 7,

    pricing: {
      minDays: 1,
      dayRate: 280,
      weekRate: 1500,
      monthRate: 5200,
      deposit: 800,
    },
    createdAt: new Date().toISOString(),
    updatedAt: new Date().toISOString(),
  },

  {
    id: "eq-scissor-lift-8m",
    title: "Scissor Lift 8m (Electric)",
    category: "lifting",
    brand: "JLG",
    model: "1930ES / Similar",
    images: ["/rental/scissor-lift.jpg"],
    shortDesc: "Indoor/outdoor low-noise scissor lift for maintenance works.",
    specs: {
      "Platform height": "8m",
      "Max load": "230kg",
      "Power": "Electric",
      "Use": "Flat ground",
    },
    keyFeatures: [
      "Electric drive (low-noise, low emissions)",
      "Compact footprint for indoor access",
      "Guardrail platform for stable work area",
      "Easy maneuvering on flat ground",
    ],
    applications: [
      "Ceiling/lighting maintenance",
      "Warehouse & racking access",
      "MEP works (ducting, cabling)",
      "Event setup (indoor venues)",
    ],
    totalUnits: 2,
    isPublished: true,

    // ✅ NEW: override default (example: lifts might need longer checks)
    maintenanceBufferDays: 10,

    pricing: {
      minDays: 1,
      dayRate: 220,
      weekRate: 1200,
      monthRate: 4200,
      deposit: 600,
    },
    createdAt: new Date().toISOString(),
    updatedAt: new Date().toISOString(),
  },

  {
    id: "eq-generator-5kva",
    title: "Portable Generator 5kVA",
    category: "power",
    brand: "Honda",
    model: "EU65is / Similar",
    images: ["/rental/generator.jpg"],
    shortDesc: "Reliable portable generator for sites and event power needs.",
    specs: {
      Output: "5kVA",
      "Fuel type": "Petrol",
      "Noise level": "Low-noise inverter",
      "Run time": "Up to ~8h (varies)",
    },
    keyFeatures: [
      "Stable inverter output for sensitive electronics",
      "Portable design for site/event use",
      "Low-noise operation (typical for inverter models)",
      "Fuel-efficient runtime (load-dependent)",
    ],
    applications: [
      "Site power for tools & lighting",
      "Backup power during outages",
      "Outdoor events & temporary booths",
      "Powering small equipment in remote areas",
    ],
    totalUnits: 6,
    isPublished: true,

    // ✅ NEW: uses default (set explicitly for clarity)
    maintenanceBufferDays: DEFAULT_MAINTENANCE_BUFFER_DAYS,

    pricing: { minDays: 1, dayRate: 90, weekRate: 480, monthRate: 1600, deposit: 200 },
    createdAt: new Date().toISOString(),
    updatedAt: new Date().toISOString(),
  },

  {
    id: "eq-concrete-mixer-120l",
    title: "Concrete Mixer 120L",
    category: "concreting",
    brand: "Generic",
    model: "120L Drum",
    images: ["/rental/concrete-mixer.jpg"],
    shortDesc: "Portable drum mixer for small-to-medium concreting jobs.",
    specs: {
      Capacity: "120L",
      "Power": "Electric",
      "Drum": "Steel",
      "Mobility": "Wheeled",
    },
    keyFeatures: [
      "120L drum size for small-to-medium batches",
      "Wheeled frame for easier movement on site",
      "Simple controls for quick mix cycles",
      "Steel drum for durability",
    ],
    applications: [
      "Small slab/pad pours",
      "Bricklaying mortar mixing",
      "Repair works & patching",
      "General renovation projects",
    ],
    totalUnits: 4,
    isPublished: false,

    // ✅ NEW: smaller tools may need shorter buffer
    maintenanceBufferDays: 3,

    pricing: { minDays: 1, dayRate: 35, weekRate: 160, monthRate: 520, deposit: 80 },
    createdAt: new Date().toISOString(),
    updatedAt: new Date().toISOString(),
  },

  {
    id: "eq-plate-compactor-90kg",
    title: "Plate Compactor 90kg",
    category: "compaction",
    brand: "Wacker Neuson",
    model: "DPU / Similar",
    images: ["/rental/plate-compactor.jpg"],
    shortDesc: "Compactor for soil/sand/base layer compaction and patch works.",
    specs: {
      "Operating weight": "90kg",
      "Fuel type": "Petrol/Diesel",
      "Base plate": "Standard",
      Use: "Outdoor",
    },
    keyFeatures: [
      "High compaction force for base preparation",
      "Balanced 90kg class for maneuverability",
      "Suitable for granular materials (sand/soil/base)",
      "Rugged build for outdoor site conditions",
    ],
    applications: [
      "Paver/kerb base preparation",
      "Driveway & pathway compaction",
      "Trench backfill compaction",
      "Patch and repair works",
    ],
    totalUnits: 5,
    isPublished: true,

    // ✅ NEW: default buffer
    maintenanceBufferDays: DEFAULT_MAINTENANCE_BUFFER_DAYS,

    pricing: { minDays: 1, dayRate: 55, weekRate: 260, monthRate: 850, deposit: 120 },
    createdAt: new Date().toISOString(),
    updatedAt: new Date().toISOString(),
  },
];
