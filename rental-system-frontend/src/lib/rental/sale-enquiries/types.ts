import type {
  EquipmentSaleFulfillmentMode,
  EquipmentSalePriceMode,
  EquipmentSaleStatus,
} from "@/lib/rental/types";

export type RentalEquipmentSaleEnquiryStatus =
  | "new"
  | "contacted"
  | "awaiting_customer"
  | "availability_confirmed"
  | "quoted"
  | "converted"
  | "closed_lost"
  | "cancelled";

export type RentalEquipmentSaleEnquiry = {
  id: string;
  equipmentId: string;
  equipmentTitleSnapshot: string;
  saleStatusSnapshot: EquipmentSaleStatus;
  salePriceModeSnapshot: EquipmentSalePriceMode;
  salePriceCentsSnapshot?: number;
  saleConditionSnapshot?: string;
  saleWarrantySnapshot?: string;
  customerName: string;
  customerEmail: string;
  customerPhone?: string;
  companyName?: string;
  fulfillmentPreference?: EquipmentSaleFulfillmentMode;
  message?: string;
  status: RentalEquipmentSaleEnquiryStatus;
  adminNotes?: string;
  createdAt: string;
  updatedAt: string;
};

export type CreateRentalEquipmentSaleEnquiryInput = {
  equipmentId: string;
  equipmentTitleSnapshot: string;
  saleStatusSnapshot: EquipmentSaleStatus;
  salePriceModeSnapshot: EquipmentSalePriceMode;
  salePriceCentsSnapshot?: number | null;
  saleConditionSnapshot?: string | null;
  saleWarrantySnapshot?: string | null;
  customerName: string;
  customerEmail: string;
  customerPhone?: string | null;
  companyName?: string | null;
  fulfillmentPreference?: EquipmentSaleFulfillmentMode | null;
  message?: string | null;
};

export type UpdateRentalEquipmentSaleEnquiryInput = {
  status?: RentalEquipmentSaleEnquiryStatus;
  adminNotes?: string | null;
};
