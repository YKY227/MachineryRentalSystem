import type {
  Equipment,
  EquipmentSaleFulfillmentMode,
  EquipmentSalePriceMode,
  EquipmentSaleStatus,
} from "@/lib/rental/types";

export type RentalEquipment = Equipment;

export type RentalEquipmentListScope = "admin" | "public";

export type UpsertRentalEquipmentInput = {
  id?: string;
  slug?: string;
  title: string;
  category: string;
  brand?: string;
  model?: string;
  description?: string;
  shortDesc?: string;
  totalUnits: number;
  maintenanceBufferDays?: number;
  dayRate: number;
  weekRate?: number | null;
  monthRate?: number | null;
  minDays: number;
  depositAmount?: number;
  imageUrls?: string[];
  catalogueUrl?: string;
  trainingVideoUrl?: string;
  keyFeatures?: string[];
  applications?: string[];
  specs?: Record<string, string>;
  isPublished?: boolean;
  displayOrder?: number;
  saleEnabled?: boolean;
  saleStatus?: EquipmentSaleStatus;
  salePriceCents?: number | null;
  salePriceMode?: EquipmentSalePriceMode;
  saleCondition?: string;
  saleWarranty?: string;
  saleNotes?: string;
  saleFulfillmentModes?: EquipmentSaleFulfillmentMode[] | null;
};

export type UpdateRentalEquipmentInput = Partial<UpsertRentalEquipmentInput>;
