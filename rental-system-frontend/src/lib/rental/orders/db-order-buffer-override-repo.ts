import "server-only";

import { supabaseAdmin } from "@/lib/supabase/server";
import type {
  RentalOrderBufferOverride,
  RentalOrderBufferOverrideStatus,
} from "@/lib/rental/orders/types";

const ORDER_BUFFER_OVERRIDES_TABLE =
  process.env.SUPABASE_RENTAL_ORDER_BUFFER_OVERRIDES_TABLE ?? "rental_order_buffer_overrides";

type BufferOverrideRow = {
  id: string;
  order_id: string;
  order_unit_index: number;
  override_buffer_end_date: string;
  status: RentalOrderBufferOverrideStatus;
  reason: string | null;
  notes: string | null;
  created_at: string;
  updated_at: string;
};

const BUFFER_OVERRIDE_COLUMNS = [
  "id",
  "order_id",
  "order_unit_index",
  "override_buffer_end_date",
  "status",
  "reason",
  "notes",
  "created_at",
  "updated_at",
].join(",");

function nowIso() {
  return new Date().toISOString();
}

function toBufferOverride(row: BufferOverrideRow): RentalOrderBufferOverride {
  return {
    id: row.id,
    orderId: row.order_id,
    orderUnitIndex: Math.max(0, Number(row.order_unit_index ?? 0)),
    overrideBufferEndDate: row.override_buffer_end_date,
    status: row.status,
    reason: row.reason ?? undefined,
    notes: row.notes ?? undefined,
    createdAt: row.created_at,
    updatedAt: row.updated_at,
  };
}

export const dbOrderBufferOverrideRepo = {
  async listByOrderIds(orderIds: string[]): Promise<Record<string, RentalOrderBufferOverride[]>> {
    if (!orderIds.length) return {};

    const supabase = supabaseAdmin();
    const { data, error } = await supabase
      .from(ORDER_BUFFER_OVERRIDES_TABLE)
      .select(BUFFER_OVERRIDE_COLUMNS)
      .in("order_id", orderIds)
      .order("order_unit_index", { ascending: true })
      .order("created_at", { ascending: false });

    if (error) throw new Error(`Order buffer override list failed: ${error.message}`);

    const grouped: Record<string, RentalOrderBufferOverride[]> = {};
    for (const row of ((data ?? []) as unknown as BufferOverrideRow[]).map(toBufferOverride)) {
      grouped[row.orderId] = [...(grouped[row.orderId] ?? []), row];
    }
    return grouped;
  },

  async findActiveForOrderUnit(orderId: string, orderUnitIndex: number): Promise<RentalOrderBufferOverride | null> {
    const supabase = supabaseAdmin();
    const { data, error } = await supabase
      .from(ORDER_BUFFER_OVERRIDES_TABLE)
      .select(BUFFER_OVERRIDE_COLUMNS)
      .eq("order_id", orderId)
      .eq("order_unit_index", orderUnitIndex)
      .eq("status", "active")
      .order("created_at", { ascending: false })
      .limit(1)
      .maybeSingle<BufferOverrideRow>();

    if (error) throw new Error(`Order buffer override read failed: ${error.message}`);
    return data ? toBufferOverride(data) : null;
  },

  async upsertActive(input: {
    orderId: string;
    orderUnitIndex: number;
    overrideBufferEndDate: string;
    reason?: string | null;
    notes?: string | null;
  }): Promise<RentalOrderBufferOverride> {
    const existing = await this.findActiveForOrderUnit(input.orderId, input.orderUnitIndex);
    const supabase = supabaseAdmin();
    const payload = {
      order_id: input.orderId,
      order_unit_index: Math.max(0, Math.floor(Number(input.orderUnitIndex) || 0)),
      override_buffer_end_date: input.overrideBufferEndDate,
      status: "active" as const,
      reason: input.reason?.trim() || null,
      notes: input.notes?.trim() || null,
      updated_at: nowIso(),
    };

    if (existing) {
      const { data, error } = await supabase
        .from(ORDER_BUFFER_OVERRIDES_TABLE)
        .update(payload)
        .eq("id", existing.id)
        .select(BUFFER_OVERRIDE_COLUMNS)
        .single<BufferOverrideRow>();

      if (error) throw new Error(`Order buffer override update failed: ${error.message}`);
      return toBufferOverride(data);
    }

    const { data, error } = await supabase
      .from(ORDER_BUFFER_OVERRIDES_TABLE)
      .insert({
        ...payload,
        created_at: nowIso(),
      })
      .select(BUFFER_OVERRIDE_COLUMNS)
      .single<BufferOverrideRow>();

    if (error) throw new Error(`Order buffer override create failed: ${error.message}`);
    return toBufferOverride(data);
  },
};
