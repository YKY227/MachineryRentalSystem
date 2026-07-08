import "server-only";

import { supabaseAdmin } from "@/lib/supabase/server";
import { getRentalEquipmentAvailabilityConfig } from "@/lib/rental/server-equipment-config";
import type {
  CreateRentalOrderInput,
  RentalOrder,
  RentalOrderInspectionStatus,
  RentalOrderReturnStatus,
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
  maintenance_buffer_days_applied: number | null;
  fulfillment: "deliver" | "self_collect";
  pricing_snapshot: RentalOrder["pricingSnapshot"] | null;
  customer_snapshot: RentalOrder["customerSnapshot"] | null;
  return_status: RentalOrderReturnStatus | null;
  returned_at: string | null;
  return_notes: string | null;
  inspection_status: RentalOrderInspectionStatus | null;
  inspection_notes: string | null;
  completed_at: string | null;
  checkout_group_id: string | null;
  checkout_group_line_id: string | null;
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
  "maintenance_buffer_days_applied",
  "fulfillment",
  "pricing_snapshot",
  "customer_snapshot",
  "return_status",
  "returned_at",
  "return_notes",
  "inspection_status",
  "inspection_notes",
  "completed_at",
  "checkout_group_id",
  "checkout_group_line_id",
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
    maintenanceBufferDaysApplied:
      row.maintenance_buffer_days_applied === null || row.maintenance_buffer_days_applied === undefined
        ? undefined
        : Math.max(0, Number(row.maintenance_buffer_days_applied)),
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
    returnStatus: row.return_status ?? "out",
    returnedAt: row.returned_at ?? undefined,
    returnNotes: row.return_notes ?? undefined,
    inspectionStatus: row.inspection_status ?? "not_started",
    inspectionNotes: row.inspection_notes ?? undefined,
    completedAt: row.completed_at ?? undefined,
    checkoutGroupId: row.checkout_group_id ?? undefined,
    checkoutGroupLineId: row.checkout_group_line_id ?? undefined,
    createdAt: row.created_at,
    updatedAt: row.updated_at,
  };
}

function toInsert(input: CreateRentalOrderInput, maintenanceBufferDaysApplied: number) {
  const now = nowIso();
  return {
    id: input.id,
    customer_id: input.customerId ?? input.customerSnapshot.customerId ?? null,
    equipment_id: input.equipmentId,
    equipment_title: input.equipmentTitle,
    qty: Math.max(1, Math.floor(Number(input.qty) || 1)),
    start_date: input.start,
    end_date: input.end,
    maintenance_buffer_days_applied: Math.max(0, Math.floor(Number(maintenanceBufferDaysApplied) || 0)),
    fulfillment: input.fulfillment,
    pricing_snapshot: input.pricingSnapshot,
    customer_snapshot: input.customerSnapshot,
    return_status: input.returnStatus ?? "out",
    returned_at: input.returnedAt ?? null,
    return_notes: input.returnNotes?.trim() || null,
    inspection_status: input.inspectionStatus ?? "not_started",
    inspection_notes: input.inspectionNotes?.trim() || null,
    completed_at: input.completedAt ?? null,
    checkout_group_id: input.checkoutGroupId ?? null,
    checkout_group_line_id: input.checkoutGroupLineId ?? null,
    created_at: now,
    updated_at: now,
  };
}

async function resolveMaintenanceBufferDaysApplied(inputs: CreateRentalOrderInput[]) {
  if (!inputs.length) return new Map<string, number>();

  const supabase = supabaseAdmin();
  const existingIds = inputs.map((input) => input.id).filter(Boolean);
  const { data, error } = await supabase
    .from(ORDERS_TABLE)
    .select("id,maintenance_buffer_days_applied")
    .in("id", existingIds);

  if (error) throw new Error(`Order buffer snapshot lookup failed: ${error.message}`);

  const snapshotByOrderId = new Map<string, number>();
  for (const row of (data ?? []) as Array<{ id: string; maintenance_buffer_days_applied: number | null }>) {
    if (typeof row.maintenance_buffer_days_applied === "number") {
      snapshotByOrderId.set(row.id, Math.max(0, Math.floor(row.maintenance_buffer_days_applied)));
    }
  }

  const equipmentIdsToResolve = [...new Set(
    inputs
      .filter((input) => !snapshotByOrderId.has(input.id))
      .map((input) => input.equipmentId)
      .filter(Boolean)
  )];

  const configEntries = await Promise.all(
    equipmentIdsToResolve.map(async (equipmentId) => [
      equipmentId,
      await getRentalEquipmentAvailabilityConfig(equipmentId),
    ] as const)
  );
  const configByEquipmentId = new Map(configEntries);

  for (const input of inputs) {
    if (snapshotByOrderId.has(input.id)) continue;
    if (input.maintenanceBufferDaysApplied !== undefined) {
      snapshotByOrderId.set(
        input.id,
        Math.max(0, Math.floor(Number(input.maintenanceBufferDaysApplied) || 0))
      );
      continue;
    }

    const config = configByEquipmentId.get(input.equipmentId);
    if (!config) {
      throw new Error(`Missing equipment availability configuration for ${input.equipmentId}`);
    }
    snapshotByOrderId.set(input.id, config.maintenanceBufferDays);
  }

  return snapshotByOrderId;
}

export type UpdateRentalOrderOperationalInput = {
  returnStatus?: RentalOrderReturnStatus;
  returnedAt?: string | null;
  returnNotes?: string | null;
  inspectionStatus?: RentalOrderInspectionStatus;
  inspectionNotes?: string | null;
  completedAt?: string | null;
};

export type UpdateRentalOrderPeriodInput = {
  end?: string;
};

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

  async listActiveForReturnReminders(limit = 50): Promise<RentalOrder[]> {
    const supabase = supabaseAdmin();
    const { data, error } = await supabase
      .from(ORDERS_TABLE)
      .select(ORDER_COLUMNS)
      .eq("return_status", "out")
      .is("completed_at", null)
      .order("end_date", { ascending: true })
      .limit(Math.max(1, Math.floor(Number(limit) || 50)));

    if (error) throw new Error(`Active reminder order list failed: ${error.message}`);
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
    const maintenanceBufferDaysApplied =
      (await resolveMaintenanceBufferDaysApplied([input])).get(input.id) ?? 0;
    const payload = toInsert(input, maintenanceBufferDaysApplied);
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
    const maintenanceBufferByOrderId = await resolveMaintenanceBufferDaysApplied(inputs);
    const payload = inputs.map((input) =>
      toInsert(input, maintenanceBufferByOrderId.get(input.id) ?? 0)
    );
    const { data, error } = await supabase
      .from(ORDERS_TABLE)
      .upsert(payload, { onConflict: "id" })
      .select(ORDER_COLUMNS);

    if (error) throw new Error(`Order upsert failed: ${error.message}`);
    return ((data ?? []) as unknown as RentalOrderRow[]).map(toOrder);
  },

  async updateOperational(id: string, input: UpdateRentalOrderOperationalInput): Promise<RentalOrder> {
    const payload: Record<string, unknown> = {
      updated_at: nowIso(),
    };

    if (input.returnStatus !== undefined) payload.return_status = input.returnStatus;
    if (input.returnedAt !== undefined) payload.returned_at = input.returnedAt;
    if (input.returnNotes !== undefined) payload.return_notes = input.returnNotes?.trim() || null;
    if (input.inspectionStatus !== undefined) payload.inspection_status = input.inspectionStatus;
    if (input.inspectionNotes !== undefined) {
      payload.inspection_notes = input.inspectionNotes?.trim() || null;
    }
    if (input.completedAt !== undefined) payload.completed_at = input.completedAt;

    const supabase = supabaseAdmin();
    const { data, error } = await supabase
      .from(ORDERS_TABLE)
      .update(payload)
      .eq("id", id)
      .select(ORDER_COLUMNS)
      .single<RentalOrderRow>();

    if (error) throw new Error(`Order operational update failed: ${error.message}`);
    return toOrder(data);
  },

  async updatePeriod(id: string, input: UpdateRentalOrderPeriodInput): Promise<RentalOrder> {
    const payload: Record<string, unknown> = {
      updated_at: nowIso(),
    };
    if (input.end !== undefined) payload.end_date = input.end;

    const supabase = supabaseAdmin();
    const { data, error } = await supabase
      .from(ORDERS_TABLE)
      .update(payload)
      .eq("id", id)
      .select(ORDER_COLUMNS)
      .single<RentalOrderRow>();

    if (error) throw new Error(`Order period update failed: ${error.message}`);
    return toOrder(data);
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
