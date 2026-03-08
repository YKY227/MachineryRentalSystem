import "server-only";

import { supabaseAdmin } from "@/lib/supabase/server";
import type {
  CreateRentalOrderInput,
  RentalOrder,
} from "@/lib/rental/orders/types";

const ORDERS_TABLE = process.env.SUPABASE_RENTAL_ORDERS_TABLE ?? "rental_orders";

type RentalOrderRow = {
  id: string;
  customer_id: string | null;
  equipment_id: string;
  equipment_title: string;
  qty: number;
  start_date: string;
  end_date: string;
  fulfillment: "deliver" | "self_collect";
  pricing_snapshot: RentalOrder["pricingSnapshot"] | null;
  customer_snapshot: RentalOrder["customerSnapshot"] | null;
  created_at: string;
  updated_at: string;
};

const ORDER_COLUMNS = [
  "id",
  "customer_id",
  "equipment_id",
  "equipment_title",
  "qty",
  "start_date",
  "end_date",
  "fulfillment",
  "pricing_snapshot",
  "customer_snapshot",
  "created_at",
  "updated_at",
].join(",");

function nowIso() {
  return new Date().toISOString();
}

function toOrder(row: RentalOrderRow): RentalOrder {
  return {
    id: row.id,
    customerId: row.customer_id ?? undefined,
    equipmentId: row.equipment_id,
    equipmentTitle: row.equipment_title,
    qty: row.qty,
    start: row.start_date,
    end: row.end_date,
    fulfillment: row.fulfillment,
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
    customerSnapshot: row.customer_snapshot ?? undefined,
    createdAt: row.created_at,
    updatedAt: row.updated_at,
  };
}

function toInsert(input: CreateRentalOrderInput) {
  const now = nowIso();
  return {
    id: input.id,
    customer_id: input.customerId ?? input.customerSnapshot.customerId ?? null,
    equipment_id: input.equipmentId,
    equipment_title: input.equipmentTitle,
    qty: Math.max(1, Math.floor(Number(input.qty) || 1)),
    start_date: input.start,
    end_date: input.end,
    fulfillment: input.fulfillment,
    pricing_snapshot: input.pricingSnapshot,
    customer_snapshot: input.customerSnapshot,
    created_at: now,
    updated_at: now,
  };
}

export const dbOrderRepo = {
  async list(): Promise<RentalOrder[]> {
    const supabase = supabaseAdmin();
    const { data, error } = await supabase
      .from(ORDERS_TABLE)
      .select(ORDER_COLUMNS)
      .order("created_at", { ascending: false });

    if (error) throw new Error(`Order list failed: ${error.message}`);
    return ((data ?? []) as unknown as RentalOrderRow[]).map(toOrder);
  },

  async get(id: string): Promise<RentalOrder | null> {
    const supabase = supabaseAdmin();
    const { data, error } = await supabase
      .from(ORDERS_TABLE)
      .select(ORDER_COLUMNS)
      .eq("id", id)
      .maybeSingle<RentalOrderRow>();

    if (error) throw new Error(`Order read failed: ${error.message}`);
    return data ? toOrder(data) : null;
  },

  async create(input: CreateRentalOrderInput): Promise<RentalOrder> {
    const supabase = supabaseAdmin();
    const payload = toInsert(input);
    const { data, error } = await supabase
      .from(ORDERS_TABLE)
      .insert(payload)
      .select(ORDER_COLUMNS)
      .single<RentalOrderRow>();

    if (error) throw new Error(`Order create failed: ${error.message}`);
    return toOrder(data);
  },

  async upsertMany(inputs: CreateRentalOrderInput[]): Promise<RentalOrder[]> {
    if (!inputs.length) return [];

    const supabase = supabaseAdmin();
    const payload = inputs.map(toInsert);
    const { data, error } = await supabase
      .from(ORDERS_TABLE)
      .upsert(payload, { onConflict: "id" })
      .select(ORDER_COLUMNS);

    if (error) throw new Error(`Order upsert failed: ${error.message}`);
    return ((data ?? []) as unknown as RentalOrderRow[]).map(toOrder);
  },

  async clearAll(): Promise<number> {
    const supabase = supabaseAdmin();
    const { data, error } = await supabase
      .from(ORDERS_TABLE)
      .delete()
      .neq("id", "")
      .select("id");

    if (error) throw new Error(`Order clear failed: ${error.message}`);
    return (data ?? []).length;
  },
};
