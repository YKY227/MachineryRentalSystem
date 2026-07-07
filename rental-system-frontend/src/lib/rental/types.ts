// src/lib/rental/types.ts

export type EquipmentCategory = string;

export type EquipmentPricing = {
  minDays: number; // e.g. 1 or 3
  dayRate: number; // per unit per day
  weekRate?: number; // optional
  monthRate?: number; // optional
  deposit?: number; // refundable
};

export type EquipmentSaleStatus =
  | "available_for_sale"
  | "sold"
  | "on_request"
  | "not_available";

export type EquipmentSalePriceMode = "fixed" | "request_quote";

export type EquipmentSaleFulfillmentMode = "deliver" | "self_collect";

export type EquipmentSaleSettings = {
  enabled: boolean;
  status: EquipmentSaleStatus;
  priceCents?: number;
  priceMode: EquipmentSalePriceMode;
  condition?: string;
  warranty?: string;
  notes?: string;
  fulfillmentModes?: EquipmentSaleFulfillmentMode[];
};

export type Equipment = {
  id: string;
  slug?: string;
  title: string;
  category: EquipmentCategory;
  brand?: string;
  model?: string;
  description?: string;

  images: string[]; // URLs
  imageUrl?: string;
  shortDesc: string;

  // ✅ content blocks for detail page (optional)
  keyFeatures?: string[];
  applications?: string[];

  specs: Record<string, string>; // simple now, structured later

  totalUnits: number;
  isPublished: boolean;
  catalogueUrl?: string;
  trainingVideoUrl?: string;
  displayOrder?: number;

  // ✅ NEW: default post-rental maintenance buffer (days)
  // Availability logic can treat orders as ending at (endDate + bufferDays)
  maintenanceBufferDays?: number; // default 7 if undefined

  pricing: EquipmentPricing;
  sale?: EquipmentSaleSettings;
  createdAt: string;
  updatedAt: string;
};

export type RentalQuote = {
  days: number;
  unitPrice: number;
  rentalSubtotal: number;
  deliveryFee: number;
  collectionFee: number;
  deposit: number;
  totalDueNow: number;
};

export type HoldType = "maintenance" | "repair" | "admin_hold";
export type HoldStatus = "active" | "completed";

export type EquipmentHold = {
  id: string;
  equipmentId: string;
  qty: number;

  type: HoldType;
  status: HoldStatus;

  startDate: string; // YYYY-MM-DD
  endDate: string; // YYYY-MM-DD (planned)

  releasedAt?: string; // ISO timestamp if completed early
  notes?: string;

  createdAt: string;
  updatedAt: string;
};


