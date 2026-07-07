import type {
  EquipmentSaleFulfillmentMode,
  EquipmentSalePriceMode,
  EquipmentSaleStatus,
} from "@/lib/rental/types";

export const RENTAL_CART_STORAGE_KEY = "rental_cart_v1";
export const RENTAL_CART_VERSION = 1;

export type RentalCartFulfillmentMode = "deliver" | "self_collect";

export type RentalCartPricingPreview = {
  days: number;
  rentalSubtotal: number;
  deliveryFee: number;
  collectionFee: number;
  deposit: number;
  total: number;
};

export type RentalCartRentalLine = {
  id: string;
  type: "rental";
  equipmentId: string;
  equipmentSlug?: string;
  titleSnapshot: string;
  imageUrlSnapshot?: string;
  dayRateSnapshot: number;
  weekRateSnapshot?: number;
  monthRateSnapshot?: number;
  depositSnapshot?: number;
  minDaysSnapshot: number;
  qty: number;
  startDate: string;
  endDate: string;
  fulfillment: RentalCartFulfillmentMode;
  deliveryAddress?: string;
  pricingPreview?: RentalCartPricingPreview;
  addedAt: string;
  updatedAt: string;
};

export type RentalCartSaleLine = {
  id: string;
  type: "sale";
  equipmentId: string;
  equipmentSlug?: string;
  titleSnapshot: string;
  imageUrlSnapshot?: string;
  saleStatusSnapshot: EquipmentSaleStatus;
  salePriceModeSnapshot: EquipmentSalePriceMode;
  salePriceCentsSnapshot?: number;
  saleConditionSnapshot?: string;
  saleWarrantySnapshot?: string;
  fulfillmentPreference?: EquipmentSaleFulfillmentMode;
  message?: string;
  enquiryId?: string;
  enquirySubmittedAt?: string;
  addedAt: string;
  updatedAt: string;
};

export type RentalCartLine = RentalCartRentalLine | RentalCartSaleLine;

export type RentalCart = {
  version: typeof RENTAL_CART_VERSION;
  lines: RentalCartLine[];
  updatedAt: string;
};

export type NewRentalCartRentalLine = Omit<
  RentalCartRentalLine,
  "id" | "addedAt" | "updatedAt"
>;

export type NewRentalCartSaleLine = Omit<
  RentalCartSaleLine,
  "id" | "addedAt" | "updatedAt" | "enquiryId" | "enquirySubmittedAt"
>;

export type NewRentalCartLine = NewRentalCartRentalLine | NewRentalCartSaleLine;
