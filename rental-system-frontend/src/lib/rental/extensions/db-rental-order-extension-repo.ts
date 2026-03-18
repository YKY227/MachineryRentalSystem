import "server-only";

import type {
  CreateRentalOrderExtensionInput,
  RentalOrderExtension,
  RentalOrderExtensionStatus,
  UpdateRentalOrderExtensionInput,
} from "@/lib/rental/extensions/types";
import { supabaseAdmin } from "@/lib/supabase/server";

const EXTENSIONS_TABLE =
  process.env.SUPABASE_RENTAL_ORDER_EXTENSIONS_TABLE ?? "rental_order_extensions";

type ExtensionRow = {
  id: string;
  order_id: string;
  customer_id: string;
  current_rental_end: string;
  requested_rental_end: string;
  status: RentalOrderExtensionStatus;
  extension_charge_estimate_cents: number | null;
  final_extension_charge_cents: number | null;
  payment_terms_snapshot: "upfront" | "credit";
  availability_status: "unknown" | "available" | "blocked";
  availability_message: string | null;
  customer_message: string | null;
  review_note: string | null;
  payment_session_id: string | null;
  invoice_id: string | null;
  approved_at: string | null;
  rejected_at: string | null;
  confirmed_at: string | null;
  cancelled_at: string | null;
  created_at: string;
  updated_at: string;
};

const EXTENSION_COLUMNS = [
  "id",
  "order_id",
  "customer_id",
  "current_rental_end",
  "requested_rental_end",
  "status",
  "extension_charge_estimate_cents",
  "final_extension_charge_cents",
  "payment_terms_snapshot",
  "availability_status",
  "availability_message",
  "customer_message",
  "review_note",
  "payment_session_id",
  "invoice_id",
  "approved_at",
  "rejected_at",
  "confirmed_at",
  "cancelled_at",
  "created_at",
  "updated_at",
].join(",");

function nowIso() {
  return new Date().toISOString();
}

function toExtension(row: ExtensionRow): RentalOrderExtension {
  return {
    id: row.id,
    orderId: row.order_id,
    customerId: row.customer_id,
    currentRentalEnd: row.current_rental_end,
    requestedRentalEnd: row.requested_rental_end,
    status: row.status,
    extensionChargeEstimateCents: Math.max(0, Number(row.extension_charge_estimate_cents ?? 0)),
    finalExtensionChargeCents:
      typeof row.final_extension_charge_cents === "number"
        ? Math.max(0, row.final_extension_charge_cents)
        : undefined,
    paymentTermsSnapshot: row.payment_terms_snapshot,
    availabilityStatus: row.availability_status,
    availabilityMessage: row.availability_message ?? undefined,
    customerMessage: row.customer_message ?? undefined,
    reviewNote: row.review_note ?? undefined,
    paymentSessionId: row.payment_session_id ?? undefined,
    invoiceId: row.invoice_id ?? undefined,
    approvedAt: row.approved_at ?? undefined,
    rejectedAt: row.rejected_at ?? undefined,
    confirmedAt: row.confirmed_at ?? undefined,
    cancelledAt: row.cancelled_at ?? undefined,
    createdAt: row.created_at,
    updatedAt: row.updated_at,
  };
}

function toInsert(input: CreateRentalOrderExtensionInput) {
  const now = nowIso();
  return {
    order_id: input.orderId,
    customer_id: input.customerId,
    current_rental_end: input.currentRentalEnd,
    requested_rental_end: input.requestedRentalEnd,
    status: input.status,
    extension_charge_estimate_cents: Math.max(0, Math.round(Number(input.extensionChargeEstimateCents ?? 0))),
    final_extension_charge_cents:
      input.finalExtensionChargeCents === null || input.finalExtensionChargeCents === undefined
        ? null
        : Math.max(0, Math.round(Number(input.finalExtensionChargeCents))),
    payment_terms_snapshot: input.paymentTermsSnapshot,
    availability_status: input.availabilityStatus,
    availability_message: input.availabilityMessage?.trim() || null,
    customer_message: input.customerMessage?.trim() || null,
    review_note: input.reviewNote?.trim() || null,
    payment_session_id: input.paymentSessionId ?? null,
    invoice_id: input.invoiceId ?? null,
    approved_at: input.approvedAt ?? null,
    rejected_at: input.rejectedAt ?? null,
    confirmed_at: input.confirmedAt ?? null,
    cancelled_at: input.cancelledAt ?? null,
    created_at: now,
    updated_at: now,
  };
}

export const dbRentalOrderExtensionRepo = {
  async create(input: CreateRentalOrderExtensionInput): Promise<RentalOrderExtension> {
    const supabase = supabaseAdmin();
    const { data, error } = await supabase
      .from(EXTENSIONS_TABLE)
      .insert(toInsert(input))
      .select(EXTENSION_COLUMNS)
      .single<ExtensionRow>();

    if (error) throw new Error(`Extension create failed: ${error.message}`);
    return toExtension(data);
  },

  async get(id: string): Promise<RentalOrderExtension | null> {
    const supabase = supabaseAdmin();
    const { data, error } = await supabase
      .from(EXTENSIONS_TABLE)
      .select(EXTENSION_COLUMNS)
      .eq("id", id)
      .maybeSingle<ExtensionRow>();

    if (error) throw new Error(`Extension read failed: ${error.message}`);
    return data ? toExtension(data) : null;
  },

  async listByOrderId(orderId: string): Promise<RentalOrderExtension[]> {
    const supabase = supabaseAdmin();
    const { data, error } = await supabase
      .from(EXTENSIONS_TABLE)
      .select(EXTENSION_COLUMNS)
      .eq("order_id", orderId)
      .order("created_at", { ascending: false });

    if (error) throw new Error(`Extension list by order failed: ${error.message}`);
    return ((data ?? []) as unknown as ExtensionRow[]).map(toExtension);
  },

  async listByOrderIds(orderIds: string[]): Promise<Record<string, RentalOrderExtension[]>> {
    if (!orderIds.length) return {};

    const supabase = supabaseAdmin();
    const { data, error } = await supabase
      .from(EXTENSIONS_TABLE)
      .select(EXTENSION_COLUMNS)
      .in("order_id", orderIds)
      .order("created_at", { ascending: false });

    if (error) throw new Error(`Extension list by orders failed: ${error.message}`);

    const grouped: Record<string, RentalOrderExtension[]> = {};
    for (const row of (data ?? []) as unknown as ExtensionRow[]) {
      const extension = toExtension(row);
      grouped[extension.orderId] = [...(grouped[extension.orderId] ?? []), extension];
    }
    return grouped;
  },

  async findOpenByOrderId(orderId: string): Promise<RentalOrderExtension | null> {
    const supabase = supabaseAdmin();
    const { data, error } = await supabase
      .from(EXTENSIONS_TABLE)
      .select(EXTENSION_COLUMNS)
      .eq("order_id", orderId)
      .in("status", ["availability_blocked", "awaiting_admin_review", "approved_pending_payment"])
      .order("created_at", { ascending: false })
      .limit(1)
      .maybeSingle<ExtensionRow>();

    if (error) throw new Error(`Open extension lookup failed: ${error.message}`);
    return data ? toExtension(data) : null;
  },

  async update(id: string, patch: UpdateRentalOrderExtensionInput): Promise<RentalOrderExtension> {
    const payload: Record<string, unknown> = {
      updated_at: nowIso(),
    };

    if (patch.currentRentalEnd !== undefined) payload.current_rental_end = patch.currentRentalEnd;
    if (patch.requestedRentalEnd !== undefined) payload.requested_rental_end = patch.requestedRentalEnd;
    if (patch.status !== undefined) payload.status = patch.status;
    if (patch.extensionChargeEstimateCents !== undefined) {
      payload.extension_charge_estimate_cents = Math.max(
        0,
        Math.round(Number(patch.extensionChargeEstimateCents))
      );
    }
    if (patch.finalExtensionChargeCents !== undefined) {
      payload.final_extension_charge_cents =
        patch.finalExtensionChargeCents === null
          ? null
          : Math.max(0, Math.round(Number(patch.finalExtensionChargeCents)));
    }
    if (patch.paymentTermsSnapshot !== undefined) payload.payment_terms_snapshot = patch.paymentTermsSnapshot;
    if (patch.availabilityStatus !== undefined) payload.availability_status = patch.availabilityStatus;
    if (patch.availabilityMessage !== undefined) payload.availability_message = patch.availabilityMessage?.trim() || null;
    if (patch.customerMessage !== undefined) payload.customer_message = patch.customerMessage?.trim() || null;
    if (patch.reviewNote !== undefined) payload.review_note = patch.reviewNote?.trim() || null;
    if (patch.paymentSessionId !== undefined) payload.payment_session_id = patch.paymentSessionId;
    if (patch.invoiceId !== undefined) payload.invoice_id = patch.invoiceId;
    if (patch.approvedAt !== undefined) payload.approved_at = patch.approvedAt;
    if (patch.rejectedAt !== undefined) payload.rejected_at = patch.rejectedAt;
    if (patch.confirmedAt !== undefined) payload.confirmed_at = patch.confirmedAt;
    if (patch.cancelledAt !== undefined) payload.cancelled_at = patch.cancelledAt;

    const supabase = supabaseAdmin();
    const { data, error } = await supabase
      .from(EXTENSIONS_TABLE)
      .update(payload)
      .eq("id", id)
      .select(EXTENSION_COLUMNS)
      .single<ExtensionRow>();

    if (error) throw new Error(`Extension update failed: ${error.message}`);
    return toExtension(data);
  },
};
