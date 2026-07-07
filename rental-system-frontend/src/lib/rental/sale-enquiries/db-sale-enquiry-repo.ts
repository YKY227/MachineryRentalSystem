import "server-only";

import type {
  EquipmentSaleFulfillmentMode,
  EquipmentSalePriceMode,
  EquipmentSaleStatus,
} from "@/lib/rental/types";
import { supabaseAdmin } from "@/lib/supabase/server";
import type {
  CreateRentalEquipmentSaleEnquiryInput,
  RentalEquipmentSaleEnquiry,
  RentalEquipmentSaleEnquiryStatus,
  UpdateRentalEquipmentSaleEnquiryInput,
} from "./types";

const SALE_ENQUIRIES_TABLE =
  process.env.SUPABASE_RENTAL_EQUIPMENT_SALE_ENQUIRIES_TABLE ??
  "rental_equipment_sale_enquiries";

type SaleEnquiryRow = {
  id: string;
  equipment_id: string;
  equipment_title_snapshot: string;
  sale_status_snapshot: string;
  sale_price_mode_snapshot: string;
  sale_price_cents_snapshot: number | null;
  sale_condition_snapshot: string | null;
  sale_warranty_snapshot: string | null;
  customer_name: string;
  customer_email: string;
  customer_phone: string | null;
  company_name: string | null;
  fulfillment_preference: string | null;
  message: string | null;
  status: string;
  admin_notes: string | null;
  created_at: string;
  updated_at: string;
};

const SALE_ENQUIRY_COLUMNS = [
  "id",
  "equipment_id",
  "equipment_title_snapshot",
  "sale_status_snapshot",
  "sale_price_mode_snapshot",
  "sale_price_cents_snapshot",
  "sale_condition_snapshot",
  "sale_warranty_snapshot",
  "customer_name",
  "customer_email",
  "customer_phone",
  "company_name",
  "fulfillment_preference",
  "message",
  "status",
  "admin_notes",
  "created_at",
  "updated_at",
].join(",");

const SALE_STATUSES = new Set<EquipmentSaleStatus>([
  "available_for_sale",
  "sold",
  "on_request",
  "not_available",
]);
const SALE_PRICE_MODES = new Set<EquipmentSalePriceMode>(["fixed", "request_quote"]);
const FULFILLMENT_MODES = new Set<EquipmentSaleFulfillmentMode>(["deliver", "self_collect"]);
const ENQUIRY_STATUSES = new Set<RentalEquipmentSaleEnquiryStatus>([
  "new",
  "contacted",
  "awaiting_customer",
  "availability_confirmed",
  "quoted",
  "converted",
  "closed_lost",
  "cancelled",
]);

function trimOrNull(value?: string | null) {
  const trimmed = value?.trim();
  return trimmed ? trimmed : null;
}

function toSaleStatus(value: unknown): EquipmentSaleStatus {
  return typeof value === "string" && SALE_STATUSES.has(value as EquipmentSaleStatus)
    ? (value as EquipmentSaleStatus)
    : "not_available";
}

function toSalePriceMode(value: unknown): EquipmentSalePriceMode {
  return typeof value === "string" && SALE_PRICE_MODES.has(value as EquipmentSalePriceMode)
    ? (value as EquipmentSalePriceMode)
    : "request_quote";
}

function toFulfillmentMode(value: unknown): EquipmentSaleFulfillmentMode | undefined {
  return typeof value === "string" && FULFILLMENT_MODES.has(value as EquipmentSaleFulfillmentMode)
    ? (value as EquipmentSaleFulfillmentMode)
    : undefined;
}

function toStatus(value: unknown): RentalEquipmentSaleEnquiryStatus {
  return typeof value === "string" && ENQUIRY_STATUSES.has(value as RentalEquipmentSaleEnquiryStatus)
    ? (value as RentalEquipmentSaleEnquiryStatus)
    : "new";
}

function toEnquiry(row: SaleEnquiryRow): RentalEquipmentSaleEnquiry {
  return {
    id: row.id,
    equipmentId: row.equipment_id,
    equipmentTitleSnapshot: row.equipment_title_snapshot,
    saleStatusSnapshot: toSaleStatus(row.sale_status_snapshot),
    salePriceModeSnapshot: toSalePriceMode(row.sale_price_mode_snapshot),
    salePriceCentsSnapshot:
      row.sale_price_cents_snapshot === null || row.sale_price_cents_snapshot === undefined
        ? undefined
        : Math.max(0, Math.floor(Number(row.sale_price_cents_snapshot))),
    saleConditionSnapshot: row.sale_condition_snapshot ?? undefined,
    saleWarrantySnapshot: row.sale_warranty_snapshot ?? undefined,
    customerName: row.customer_name,
    customerEmail: row.customer_email,
    customerPhone: row.customer_phone ?? undefined,
    companyName: row.company_name ?? undefined,
    fulfillmentPreference: toFulfillmentMode(row.fulfillment_preference),
    message: row.message ?? undefined,
    status: toStatus(row.status),
    adminNotes: row.admin_notes ?? undefined,
    createdAt: row.created_at,
    updatedAt: row.updated_at,
  };
}

export const dbRentalEquipmentSaleEnquiryRepo = {
  statuses: ENQUIRY_STATUSES,

  async create(input: CreateRentalEquipmentSaleEnquiryInput): Promise<RentalEquipmentSaleEnquiry> {
    const payload = {
      equipment_id: input.equipmentId.trim(),
      equipment_title_snapshot: input.equipmentTitleSnapshot.trim(),
      sale_status_snapshot: input.saleStatusSnapshot,
      sale_price_mode_snapshot: input.salePriceModeSnapshot,
      sale_price_cents_snapshot:
        input.salePriceCentsSnapshot === null || input.salePriceCentsSnapshot === undefined
          ? null
          : Math.max(0, Math.floor(Number(input.salePriceCentsSnapshot))),
      sale_condition_snapshot: trimOrNull(input.saleConditionSnapshot),
      sale_warranty_snapshot: trimOrNull(input.saleWarrantySnapshot),
      customer_name: input.customerName.trim(),
      customer_email: input.customerEmail.trim().toLowerCase(),
      customer_phone: trimOrNull(input.customerPhone),
      company_name: trimOrNull(input.companyName),
      fulfillment_preference: input.fulfillmentPreference ?? null,
      message: trimOrNull(input.message),
      status: "new" satisfies RentalEquipmentSaleEnquiryStatus,
      updated_at: new Date().toISOString(),
    };

    const supabase = supabaseAdmin();
    const { data, error } = await supabase
      .from(SALE_ENQUIRIES_TABLE)
      .insert(payload)
      .select(SALE_ENQUIRY_COLUMNS)
      .single<SaleEnquiryRow>();

    if (error) throw new Error(`Sale enquiry create failed: ${error.message}`);
    return toEnquiry(data);
  },

  async list(options: { status?: RentalEquipmentSaleEnquiryStatus; limit?: number } = {}) {
    const supabase = supabaseAdmin();
    let query = supabase
      .from(SALE_ENQUIRIES_TABLE)
      .select(SALE_ENQUIRY_COLUMNS)
      .order("created_at", { ascending: false })
      .limit(Math.min(Math.max(options.limit ?? 100, 1), 250));

    if (options.status) query = query.eq("status", options.status);

    const { data, error } = await query;
    if (error) throw new Error(`Sale enquiry list failed: ${error.message}`);
    return ((data ?? []) as unknown as SaleEnquiryRow[]).map(toEnquiry);
  },

  async getById(id: string) {
    const supabase = supabaseAdmin();
    const { data, error } = await supabase
      .from(SALE_ENQUIRIES_TABLE)
      .select(SALE_ENQUIRY_COLUMNS)
      .eq("id", id)
      .maybeSingle<SaleEnquiryRow>();

    if (error) throw new Error(`Sale enquiry read failed: ${error.message}`);
    return data ? toEnquiry(data) : null;
  },

  async update(id: string, input: UpdateRentalEquipmentSaleEnquiryInput) {
    const payload: Record<string, unknown> = {
      updated_at: new Date().toISOString(),
    };

    if (input.status !== undefined) {
      if (!ENQUIRY_STATUSES.has(input.status)) throw new Error("Invalid sale enquiry status");
      payload.status = input.status;
    }
    if ("adminNotes" in input) payload.admin_notes = trimOrNull(input.adminNotes);

    const supabase = supabaseAdmin();
    const { data, error } = await supabase
      .from(SALE_ENQUIRIES_TABLE)
      .update(payload)
      .eq("id", id)
      .select(SALE_ENQUIRY_COLUMNS)
      .maybeSingle<SaleEnquiryRow>();

    if (error) throw new Error(`Sale enquiry update failed: ${error.message}`);
    return data ? toEnquiry(data) : null;
  },
};
