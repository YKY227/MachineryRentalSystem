import "server-only";

import { supabaseAdmin } from "@/lib/supabase/server";
import type {
  CreateRentalCheckoutGroupInput,
  CreateRentalCheckoutGroupLineInput,
  RentalCheckoutGroup,
  RentalCheckoutGroupHoldLineResult,
  RentalCheckoutGroupHoldResult,
  RentalCheckoutGroupLine,
  RentalCheckoutGroupLineStatus,
  RentalCheckoutGroupStatus,
} from "./types";
import type { FulfillmentMode, RentalOrderPricingSnapshot } from "@/lib/rental/orders/types";

const GROUPS_TABLE =
  process.env.SUPABASE_RENTAL_CHECKOUT_GROUPS_TABLE ?? "rental_checkout_groups";
const GROUP_LINES_TABLE =
  process.env.SUPABASE_RENTAL_CHECKOUT_GROUP_LINES_TABLE ?? "rental_checkout_group_lines";
const HOLDS_TABLE = process.env.SUPABASE_RENTAL_AVAILABILITY_HOLDS_TABLE ?? "rental_availability_holds";
const ACQUIRE_GROUP_HOLDS_RPC = "acquire_rental_checkout_group_holds";

type GroupRow = {
  id: string;
  customer_id: string;
  customer_name: string;
  customer_email: string;
  customer_phone: string | null;
  company_name: string | null;
  status: string;
  currency: string;
  rental_subtotal_cents: number;
  delivery_fee_cents: number;
  collection_fee_cents: number;
  gst_cents: number;
  deposit_cents: number;
  payable_total_cents: number;
  display_total_cents: number;
  payment_session_id: string | null;
  hold_expires_at: string | null;
  paid_at: string | null;
  converted_at: string | null;
  child_order_ids: string[] | null;
  failure_reason: string | null;
  created_at: string;
  updated_at: string;
};

type GroupLineRow = {
  id: string;
  checkout_group_id: string;
  line_index: number;
  cart_line_id_snapshot: string | null;
  equipment_id: string;
  equipment_title_snapshot: string;
  equipment_image_url_snapshot: string | null;
  qty: number;
  start_date: string;
  end_date: string;
  fulfillment: string;
  delivery_address: string | null;
  pricing_snapshot: RentalOrderPricingSnapshot | null;
  rental_subtotal_cents: number;
  delivery_fee_cents: number;
  collection_fee_cents: number;
  gst_cents: number;
  deposit_cents: number;
  payable_total_cents: number;
  display_total_cents: number;
  hold_id: string | null;
  rental_order_id: string | null;
  invoice_id: string | null;
  invoice_payment_id: string | null;
  status: string;
  failure_reason: string | null;
  created_at: string;
  updated_at: string;
};

const GROUP_COLUMNS = [
  "id",
  "customer_id",
  "customer_name",
  "customer_email",
  "customer_phone",
  "company_name",
  "status",
  "currency",
  "rental_subtotal_cents",
  "delivery_fee_cents",
  "collection_fee_cents",
  "gst_cents",
  "deposit_cents",
  "payable_total_cents",
  "display_total_cents",
  "payment_session_id",
  "hold_expires_at",
  "paid_at",
  "converted_at",
  "child_order_ids",
  "failure_reason",
  "created_at",
  "updated_at",
].join(",");

const LINE_COLUMNS = [
  "id",
  "checkout_group_id",
  "line_index",
  "cart_line_id_snapshot",
  "equipment_id",
  "equipment_title_snapshot",
  "equipment_image_url_snapshot",
  "qty",
  "start_date",
  "end_date",
  "fulfillment",
  "delivery_address",
  "pricing_snapshot",
  "rental_subtotal_cents",
  "delivery_fee_cents",
  "collection_fee_cents",
  "gst_cents",
  "deposit_cents",
  "payable_total_cents",
  "display_total_cents",
  "hold_id",
  "rental_order_id",
  "invoice_id",
  "invoice_payment_id",
  "status",
  "failure_reason",
  "created_at",
  "updated_at",
].join(",");

const GROUP_STATUSES = new Set<RentalCheckoutGroupStatus>([
  "draft",
  "validating",
  "holds_acquired",
  "payment_pending",
  "converting",
  "paid",
  "expired",
  "cancelled",
  "failed",
  "manual_review",
]);

const LINE_STATUSES = new Set<RentalCheckoutGroupLineStatus>([
  "pending",
  "hold_acquired",
  "order_created",
  "invoice_created",
  "paid",
  "failed",
  "released",
  "cancelled",
]);

function nowIso() {
  return new Date().toISOString();
}

function textOrNull(value?: string | null) {
  const trimmed = value?.trim();
  return trimmed ? trimmed : null;
}

function nonNegativeInt(value: unknown) {
  const next = Number(value ?? 0);
  if (!Number.isFinite(next)) return 0;
  return Math.max(0, Math.round(next));
}

function toGroupStatus(value: unknown): RentalCheckoutGroupStatus {
  return typeof value === "string" && GROUP_STATUSES.has(value as RentalCheckoutGroupStatus)
    ? (value as RentalCheckoutGroupStatus)
    : "failed";
}

function toLineStatus(value: unknown): RentalCheckoutGroupLineStatus {
  return typeof value === "string" && LINE_STATUSES.has(value as RentalCheckoutGroupLineStatus)
    ? (value as RentalCheckoutGroupLineStatus)
    : "failed";
}

function toFulfillment(value: unknown): FulfillmentMode {
  return value === "self_collect" ? "self_collect" : "deliver";
}

function toLine(row: GroupLineRow): RentalCheckoutGroupLine {
  return {
    id: row.id,
    checkoutGroupId: row.checkout_group_id,
    lineIndex: Number(row.line_index ?? 0),
    cartLineIdSnapshot: row.cart_line_id_snapshot ?? undefined,
    equipmentId: row.equipment_id,
    equipmentTitleSnapshot: row.equipment_title_snapshot,
    equipmentImageUrlSnapshot: row.equipment_image_url_snapshot ?? undefined,
    qty: Math.max(1, Math.floor(Number(row.qty ?? 1))),
    startDate: row.start_date,
    endDate: row.end_date,
    fulfillment: toFulfillment(row.fulfillment),
    deliveryAddress: row.delivery_address ?? undefined,
    pricingSnapshot: row.pricing_snapshot ?? {
      days: 0,
      rentalSubtotal: 0,
      deliveryFee: 0,
      collectionFee: 0,
      deposit: 0,
      gstAmount: 0,
      payableTotal: 0,
      total: 0,
    },
    rentalSubtotalCents: nonNegativeInt(row.rental_subtotal_cents),
    deliveryFeeCents: nonNegativeInt(row.delivery_fee_cents),
    collectionFeeCents: nonNegativeInt(row.collection_fee_cents),
    gstCents: nonNegativeInt(row.gst_cents),
    depositCents: nonNegativeInt(row.deposit_cents),
    payableTotalCents: nonNegativeInt(row.payable_total_cents),
    displayTotalCents: nonNegativeInt(row.display_total_cents),
    holdId: row.hold_id ?? undefined,
    rentalOrderId: row.rental_order_id ?? undefined,
    invoiceId: row.invoice_id ?? undefined,
    invoicePaymentId: row.invoice_payment_id ?? undefined,
    status: toLineStatus(row.status),
    failureReason: row.failure_reason ?? undefined,
    createdAt: row.created_at,
    updatedAt: row.updated_at,
  };
}

function toGroup(row: GroupRow, lines: RentalCheckoutGroupLine[] = []): RentalCheckoutGroup {
  return {
    id: row.id,
    customerId: row.customer_id,
    customerName: row.customer_name,
    customerEmail: row.customer_email,
    customerPhone: row.customer_phone ?? undefined,
    companyName: row.company_name ?? undefined,
    status: toGroupStatus(row.status),
    currency: row.currency ?? "SGD",
    rentalSubtotalCents: nonNegativeInt(row.rental_subtotal_cents),
    deliveryFeeCents: nonNegativeInt(row.delivery_fee_cents),
    collectionFeeCents: nonNegativeInt(row.collection_fee_cents),
    gstCents: nonNegativeInt(row.gst_cents),
    depositCents: nonNegativeInt(row.deposit_cents),
    payableTotalCents: nonNegativeInt(row.payable_total_cents),
    displayTotalCents: nonNegativeInt(row.display_total_cents),
    paymentSessionId: row.payment_session_id ?? undefined,
    holdExpiresAt: row.hold_expires_at ?? undefined,
    paidAt: row.paid_at ?? undefined,
    convertedAt: row.converted_at ?? undefined,
    childOrderIds: Array.isArray(row.child_order_ids) ? row.child_order_ids.map(String) : [],
    failureReason: row.failure_reason ?? undefined,
    createdAt: row.created_at,
    updatedAt: row.updated_at,
    lines,
  };
}

function toLineResult(value: unknown): RentalCheckoutGroupHoldLineResult {
  const row = value && typeof value === "object" ? (value as Record<string, unknown>) : {};
  return {
    lineId: typeof row.lineId === "string" ? row.lineId : undefined,
    lineIndex: Math.max(0, Math.floor(Number(row.lineIndex ?? 0))),
    cartLineId: typeof row.cartLineId === "string" ? row.cartLineId : undefined,
    equipmentId: typeof row.equipmentId === "string" ? row.equipmentId : undefined,
    ok: Boolean(row.ok),
    status: toLineStatus(row.status),
    holdId: typeof row.holdId === "string" ? row.holdId : undefined,
    holdExpiresAt: typeof row.holdExpiresAt === "string" ? row.holdExpiresAt : undefined,
    reasonCode: typeof row.reasonCode === "string" ? row.reasonCode : undefined,
    message: typeof row.message === "string" ? row.message : undefined,
    availableQty: row.availableQty === undefined ? undefined : Number(row.availableQty),
    requestedQty: row.requestedQty === undefined ? undefined : Number(row.requestedQty),
    committedQty: row.committedQty === undefined ? undefined : Number(row.committedQty),
    heldQty: row.heldQty === undefined ? undefined : Number(row.heldQty),
    downtimeQty: row.downtimeQty === undefined ? undefined : Number(row.downtimeQty),
    totalUnits: row.totalUnits === undefined ? undefined : Number(row.totalUnits),
  };
}

function toHoldResult(value: unknown): RentalCheckoutGroupHoldResult {
  const row = value && typeof value === "object" ? (value as Record<string, unknown>) : {};
  const rawLineResults = Array.isArray(row.lineResults) ? row.lineResults : [];
  return {
    ok: Boolean(row.ok),
    groupId: typeof row.groupId === "string" ? row.groupId : undefined,
    status: toGroupStatus(row.status),
    holdExpiresAt: typeof row.holdExpiresAt === "string" ? row.holdExpiresAt : undefined,
    message: typeof row.message === "string" ? row.message : undefined,
    lineResults: rawLineResults.map(toLineResult),
  };
}

export const dbRentalCheckoutGroupRepo = {
  async createGroup(input: CreateRentalCheckoutGroupInput): Promise<RentalCheckoutGroup> {
    const supabase = supabaseAdmin();
    const { data, error } = await supabase
      .from(GROUPS_TABLE)
      .insert({
        customer_id: input.customerId,
        customer_name: input.customerName.trim(),
        customer_email: input.customerEmail.trim().toLowerCase(),
        customer_phone: textOrNull(input.customerPhone),
        company_name: textOrNull(input.companyName),
        status: "draft",
        currency: input.currency ?? "SGD",
        rental_subtotal_cents: nonNegativeInt(input.rentalSubtotalCents),
        delivery_fee_cents: nonNegativeInt(input.deliveryFeeCents),
        collection_fee_cents: nonNegativeInt(input.collectionFeeCents),
        gst_cents: nonNegativeInt(input.gstCents),
        deposit_cents: nonNegativeInt(input.depositCents),
        payable_total_cents: nonNegativeInt(input.payableTotalCents),
        display_total_cents: nonNegativeInt(input.displayTotalCents),
        updated_at: nowIso(),
      })
      .select(GROUP_COLUMNS)
      .single<GroupRow>();

    if (error) throw new Error(`Checkout group create failed: ${error.message}`);
    return toGroup(data);
  },

  async createLines(groupId: string, lines: CreateRentalCheckoutGroupLineInput[]) {
    if (!lines.length) return [];
    const supabase = supabaseAdmin();
    const { data, error } = await supabase
      .from(GROUP_LINES_TABLE)
      .insert(
        lines.map((line) => ({
          checkout_group_id: groupId,
          line_index: line.lineIndex,
          cart_line_id_snapshot: textOrNull(line.cartLineIdSnapshot),
          equipment_id: line.equipmentId,
          equipment_title_snapshot: line.equipmentTitleSnapshot.trim(),
          equipment_image_url_snapshot: textOrNull(line.equipmentImageUrlSnapshot),
          qty: Math.max(1, Math.floor(Number(line.qty) || 1)),
          start_date: line.startDate,
          end_date: line.endDate,
          fulfillment: line.fulfillment,
          delivery_address: line.fulfillment === "deliver" ? textOrNull(line.deliveryAddress) : null,
          pricing_snapshot: line.pricingSnapshot,
          rental_subtotal_cents: nonNegativeInt(line.rentalSubtotalCents),
          delivery_fee_cents: nonNegativeInt(line.deliveryFeeCents),
          collection_fee_cents: nonNegativeInt(line.collectionFeeCents),
          gst_cents: nonNegativeInt(line.gstCents),
          deposit_cents: nonNegativeInt(line.depositCents),
          payable_total_cents: nonNegativeInt(line.payableTotalCents),
          display_total_cents: nonNegativeInt(line.displayTotalCents),
          status: "pending",
          updated_at: nowIso(),
        }))
      )
      .select(LINE_COLUMNS);

    if (error) throw new Error(`Checkout group lines create failed: ${error.message}`);
    return ((data ?? []) as unknown as GroupLineRow[]).map(toLine);
  },

  async getGroupWithLines(groupId: string): Promise<RentalCheckoutGroup | null> {
    const supabase = supabaseAdmin();
    const [{ data: groupData, error: groupError }, { data: lineData, error: lineError }] =
      await Promise.all([
        supabase.from(GROUPS_TABLE).select(GROUP_COLUMNS).eq("id", groupId).maybeSingle<GroupRow>(),
        supabase
          .from(GROUP_LINES_TABLE)
          .select(LINE_COLUMNS)
          .eq("checkout_group_id", groupId)
          .order("line_index", { ascending: true }),
      ]);

    if (groupError) throw new Error(`Checkout group read failed: ${groupError.message}`);
    if (lineError) throw new Error(`Checkout group lines read failed: ${lineError.message}`);
    if (!groupData) return null;
    return toGroup(groupData, ((lineData ?? []) as unknown as GroupLineRow[]).map(toLine));
  },

  async updateGroupStatus(
    groupId: string,
    status: RentalCheckoutGroupStatus,
    failureReason?: string | null
  ) {
    const supabase = supabaseAdmin();
    const { error } = await supabase
      .from(GROUPS_TABLE)
      .update({
        status,
        failure_reason: textOrNull(failureReason),
        updated_at: nowIso(),
      })
      .eq("id", groupId);

    if (error) throw new Error(`Checkout group status update failed: ${error.message}`);
  },

  async linkHoldToLine(lineId: string, holdId: string) {
    const supabase = supabaseAdmin();
    const { error } = await supabase
      .from(GROUP_LINES_TABLE)
      .update({
        hold_id: holdId,
        status: "hold_acquired",
        failure_reason: null,
        updated_at: nowIso(),
      })
      .eq("id", lineId);

    if (error) throw new Error(`Checkout group line hold link failed: ${error.message}`);
  },

  async linkPaymentSession(groupId: string, paymentSessionId: string) {
    const supabase = supabaseAdmin();
    const { error } = await supabase
      .from(GROUPS_TABLE)
      .update({
        payment_session_id: paymentSessionId,
        status: "payment_pending",
        failure_reason: null,
        updated_at: nowIso(),
      })
      .eq("id", groupId);

    if (error) throw new Error(`Checkout group payment link failed: ${error.message}`);
  },

  async markPaid(groupId: string, input: { paymentSessionId: string; childOrderIds: string[] }) {
    const now = nowIso();
    const supabase = supabaseAdmin();
    const { error } = await supabase
      .from(GROUPS_TABLE)
      .update({
        payment_session_id: input.paymentSessionId,
        status: "paid",
        paid_at: now,
        converted_at: now,
        child_order_ids: input.childOrderIds,
        failure_reason: null,
        updated_at: now,
      })
      .eq("id", groupId);

    if (error) throw new Error(`Checkout group paid marker update failed: ${error.message}`);
  },

  async beginPaidConversion(groupId: string, paymentSessionId: string): Promise<RentalCheckoutGroup | null> {
    const supabase = supabaseAdmin();
    const { data, error } = await supabase
      .from(GROUPS_TABLE)
      .update({
        payment_session_id: paymentSessionId,
        status: "converting",
        failure_reason: null,
        updated_at: nowIso(),
      })
      .eq("id", groupId)
      .in("status", ["holds_acquired", "payment_pending"])
      .is("converted_at", null)
      .select(GROUP_COLUMNS)
      .maybeSingle<GroupRow>();

    if (error) throw new Error(`Checkout group conversion claim failed: ${error.message}`);
    return data ? toGroup(data) : null;
  },

  async markManualReview(groupId: string, reason: string, paymentSessionId?: string) {
    const supabase = supabaseAdmin();
    const { error } = await supabase
      .from(GROUPS_TABLE)
      .update({
        payment_session_id: paymentSessionId ?? undefined,
        status: "manual_review",
        failure_reason: reason,
        updated_at: nowIso(),
      })
      .eq("id", groupId)
      .neq("status", "paid");

    if (error) throw new Error(`Checkout group manual review marker failed: ${error.message}`);
  },

  async linkOrderToLine(lineId: string, orderId: string) {
    const supabase = supabaseAdmin();
    const { error } = await supabase
      .from(GROUP_LINES_TABLE)
      .update({
        rental_order_id: orderId,
        status: "order_created",
        failure_reason: null,
        updated_at: nowIso(),
      })
      .eq("id", lineId);

    if (error) throw new Error(`Checkout group line order link failed: ${error.message}`);
  },

  async linkInvoiceToLine(input: {
    lineId: string;
    invoiceId: string;
    invoicePaymentId: string;
  }) {
    const supabase = supabaseAdmin();
    const { error } = await supabase
      .from(GROUP_LINES_TABLE)
      .update({
        invoice_id: input.invoiceId,
        invoice_payment_id: input.invoicePaymentId,
        status: "paid",
        failure_reason: null,
        updated_at: nowIso(),
      })
      .eq("id", input.lineId);

    if (error) throw new Error(`Checkout group line invoice link failed: ${error.message}`);
  },

  async markLineFailures(
    groupId: string,
    failures: Array<{ lineId?: string; lineIndex?: number; failureReason: string }>
  ) {
    const supabase = supabaseAdmin();
    for (const failure of failures) {
      let query = supabase
        .from(GROUP_LINES_TABLE)
        .update({
          status: "failed",
          failure_reason: failure.failureReason,
          updated_at: nowIso(),
        })
        .eq("checkout_group_id", groupId);

      query = failure.lineId
        ? query.eq("id", failure.lineId)
        : query.eq("line_index", Number(failure.lineIndex ?? -1));

      const { error } = await query;
      if (error) throw new Error(`Checkout group line failure update failed: ${error.message}`);
    }
  },

  async acquireHolds(groupId: string): Promise<RentalCheckoutGroupHoldResult> {
    const supabase = supabaseAdmin();
    const { data, error } = await supabase.rpc(ACQUIRE_GROUP_HOLDS_RPC, {
      p_checkout_group_id: groupId,
    });

    if (error) throw new Error(`Checkout group hold acquisition failed: ${error.message}`);
    return toHoldResult(data);
  },

  async releaseGroupHolds(groupId: string, notes = "Checkout group holds released") {
    const supabase = supabaseAdmin();
    const now = nowIso();
    const { error } = await supabase
      .from(HOLDS_TABLE)
      .update({
        status: "released",
        released_at: now,
        notes,
        updated_at: now,
      })
      .eq("checkout_group_id", groupId)
      .eq("status", "active")
      .gt("expires_at", now);

    if (error) throw new Error(`Checkout group holds release failed: ${error.message}`);
  },
};
