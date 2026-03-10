import "server-only";

import { supabaseAdmin } from "@/lib/supabase/server";

const HOLDS_TABLE = process.env.SUPABASE_RENTAL_AVAILABILITY_HOLDS_TABLE ?? "rental_availability_holds";
const ACQUIRE_HOLD_RPC = "acquire_rental_availability_hold";

export type RentalAvailabilityHoldStatus = "active" | "released" | "consumed";

export type RentalAvailabilityHold = {
  id: string;
  checkoutReference: string;
  equipmentId: string;
  customerId?: string;
  orderId?: string;
  paymentSessionId?: string;
  qty: number;
  rentalStart: string;
  rentalEnd: string;
  status: RentalAvailabilityHoldStatus;
  expiresAt: string;
  releasedAt?: string;
  consumedAt?: string;
  notes?: string;
  createdAt: string;
  updatedAt: string;
};

type HoldRow = {
  id: string;
  checkout_reference: string;
  equipment_id: string;
  customer_id: string | null;
  order_id: string | null;
  payment_session_id: string | null;
  qty: number;
  rental_start: string;
  rental_end: string;
  status: RentalAvailabilityHoldStatus;
  expires_at: string;
  released_at: string | null;
  consumed_at: string | null;
  notes: string | null;
  created_at: string;
  updated_at: string;
};

const HOLD_COLUMNS = [
  "id",
  "checkout_reference",
  "equipment_id",
  "customer_id",
  "order_id",
  "payment_session_id",
  "qty",
  "rental_start",
  "rental_end",
  "status",
  "expires_at",
  "released_at",
  "consumed_at",
  "notes",
  "created_at",
  "updated_at",
].join(",");

function nowIso() {
  return new Date().toISOString();
}

function toHold(row: HoldRow): RentalAvailabilityHold {
  return {
    id: row.id,
    checkoutReference: row.checkout_reference,
    equipmentId: row.equipment_id,
    customerId: row.customer_id ?? undefined,
    orderId: row.order_id ?? undefined,
    paymentSessionId: row.payment_session_id ?? undefined,
    qty: Math.max(0, Number(row.qty ?? 0)),
    rentalStart: row.rental_start,
    rentalEnd: row.rental_end,
    status: row.status,
    expiresAt: row.expires_at,
    releasedAt: row.released_at ?? undefined,
    consumedAt: row.consumed_at ?? undefined,
    notes: row.notes ?? undefined,
    createdAt: row.created_at,
    updatedAt: row.updated_at,
  };
}

export const dbRentalAvailabilityHoldRepo = {
  async acquire(input: {
    checkoutReference: string;
    equipmentId: string;
    customerId?: string;
    qty: number;
    rentalStart: string;
    rentalEnd: string;
    expiresAt: string;
    totalUnits: number;
    maintenanceBufferDays: number;
  }): Promise<RentalAvailabilityHold> {
    const supabase = supabaseAdmin();
    const { data, error } = await supabase.rpc(ACQUIRE_HOLD_RPC, {
      p_checkout_reference: input.checkoutReference,
      p_equipment_id: input.equipmentId,
      p_customer_id: input.customerId ?? null,
      p_qty: input.qty,
      p_rental_start: input.rentalStart,
      p_rental_end: input.rentalEnd,
      p_expires_at: input.expiresAt,
      p_total_units: input.totalUnits,
      p_maintenance_buffer_days: input.maintenanceBufferDays,
    });

    if (error) throw error;
    return toHold(data as HoldRow);
  },

  async listByEquipment(equipmentId: string): Promise<RentalAvailabilityHold[]> {
    const supabase = supabaseAdmin();
    const { data, error } = await supabase
      .from(HOLDS_TABLE)
      .select(HOLD_COLUMNS)
      .eq("equipment_id", equipmentId)
      .order("created_at", { ascending: false });

    if (error) throw new Error(`Availability holds read failed: ${error.message}`);
    return ((data ?? []) as unknown as HoldRow[]).map(toHold);
  },

  async getActiveByCheckoutReference(checkoutReference: string): Promise<RentalAvailabilityHold | null> {
    const supabase = supabaseAdmin();
    const { data, error } = await supabase
      .from(HOLDS_TABLE)
      .select(HOLD_COLUMNS)
      .eq("checkout_reference", checkoutReference)
      .eq("status", "active")
      .gt("expires_at", nowIso())
      .order("created_at", { ascending: false })
      .limit(1)
      .maybeSingle<HoldRow>();

    if (error) throw new Error(`Availability hold read failed: ${error.message}`);
    return data ? toHold(data) : null;
  },

  async updateActiveByCheckoutReference(
    checkoutReference: string,
    patch: {
      orderId?: string;
      paymentSessionId?: string;
      expiresAt?: string;
      notes?: string;
    }
  ): Promise<RentalAvailabilityHold | null> {
    const updatePayload: Record<string, unknown> = {
      updated_at: nowIso(),
    };
    if (patch.orderId !== undefined) updatePayload.order_id = patch.orderId;
    if (patch.paymentSessionId !== undefined) updatePayload.payment_session_id = patch.paymentSessionId;
    if (patch.expiresAt !== undefined) updatePayload.expires_at = patch.expiresAt;
    if (patch.notes !== undefined) updatePayload.notes = patch.notes;

    const supabase = supabaseAdmin();
    const { data, error } = await supabase
      .from(HOLDS_TABLE)
      .update(updatePayload)
      .eq("checkout_reference", checkoutReference)
      .eq("status", "active")
      .gt("expires_at", nowIso())
      .select(HOLD_COLUMNS)
      .order("created_at", { ascending: false })
      .limit(1)
      .maybeSingle<HoldRow>();

    if (error) throw new Error(`Availability hold update failed: ${error.message}`);
    return data ? toHold(data) : null;
  },

  async releaseActiveByCheckoutReference(checkoutReference: string, notes?: string): Promise<void> {
    const supabase = supabaseAdmin();
    const now = nowIso();
    const { error } = await supabase
      .from(HOLDS_TABLE)
      .update({
        status: "released",
        released_at: now,
        updated_at: now,
        notes: notes ?? undefined,
      })
      .eq("checkout_reference", checkoutReference)
      .eq("status", "active")
      .gt("expires_at", now);

    if (error) throw new Error(`Availability hold release failed: ${error.message}`);
  },

  async consumeActiveByCheckoutReference(input: {
    checkoutReference: string;
    orderId?: string;
    paymentSessionId?: string;
    notes?: string;
  }): Promise<void> {
    const supabase = supabaseAdmin();
    const now = nowIso();
    const { error } = await supabase
      .from(HOLDS_TABLE)
      .update({
        status: "consumed",
        order_id: input.orderId ?? undefined,
        payment_session_id: input.paymentSessionId ?? undefined,
        consumed_at: now,
        updated_at: now,
        notes: input.notes ?? undefined,
      })
      .eq("checkout_reference", input.checkoutReference)
      .eq("status", "active")
      .gt("expires_at", now);

    if (error) throw new Error(`Availability hold consume failed: ${error.message}`);
  },
};
