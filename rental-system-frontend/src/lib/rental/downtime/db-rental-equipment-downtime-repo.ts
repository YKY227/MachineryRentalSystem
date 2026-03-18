import "server-only";

import type {
  CreateRentalEquipmentDowntimeInput,
  RentalEquipmentDowntime,
  UpdateRentalEquipmentDowntimeInput,
} from "@/lib/rental/downtime/types";
import { supabaseAdmin } from "@/lib/supabase/server";

const DOWNTIME_TABLE = process.env.SUPABASE_RENTAL_EQUIPMENT_DOWNTIME_TABLE ?? "rental_equipment_downtime";

type DowntimeRow = {
  id: string;
  equipment_id: string;
  downtime_type: RentalEquipmentDowntime["downtimeType"];
  start_date: string;
  end_date: string;
  quantity_affected: number;
  unit_assignments: string[] | null;
  status: RentalEquipmentDowntime["status"];
  reason: string | null;
  notes: string | null;
  created_at: string;
  updated_at: string;
};

const DOWNTIME_COLUMNS = [
  "id",
  "equipment_id",
  "downtime_type",
  "start_date",
  "end_date",
  "quantity_affected",
  "unit_assignments",
  "status",
  "reason",
  "notes",
  "created_at",
  "updated_at",
].join(",");

function nowIso() {
  return new Date().toISOString();
}

function normalizeUnitAssignments(value: string[] | null | undefined) {
  const seen = new Set<string>();
  const normalized: string[] = [];
  for (const item of value ?? []) {
    const trimmed = String(item ?? "").trim();
    if (!trimmed || seen.has(trimmed)) continue;
    seen.add(trimmed);
    normalized.push(trimmed);
  }
  return normalized;
}

function toDowntime(row: DowntimeRow): RentalEquipmentDowntime {
  return {
    id: row.id,
    equipmentId: row.equipment_id,
    downtimeType: row.downtime_type,
    startDate: row.start_date,
    endDate: row.end_date,
    quantityAffected: Math.max(0, Number(row.quantity_affected ?? 0)),
    unitAssignments: normalizeUnitAssignments(row.unit_assignments),
    status: row.status,
    reason: row.reason ?? undefined,
    notes: row.notes ?? undefined,
    createdAt: row.created_at,
    updatedAt: row.updated_at,
  };
}

export const dbRentalEquipmentDowntimeRepo = {
  async list(filters?: {
    equipmentId?: string;
    status?: RentalEquipmentDowntime["status"];
    startDateLte?: string;
    endDateGte?: string;
  }): Promise<RentalEquipmentDowntime[]> {
    const supabase = supabaseAdmin();
    let query = supabase.from(DOWNTIME_TABLE).select(DOWNTIME_COLUMNS);
    if (filters?.equipmentId) query = query.eq("equipment_id", filters.equipmentId);
    if (filters?.status) query = query.eq("status", filters.status);
    if (filters?.startDateLte) query = query.lte("start_date", filters.startDateLte);
    if (filters?.endDateGte) query = query.gte("end_date", filters.endDateGte);

    const { data, error } = await query.order("start_date", { ascending: true }).order("created_at", { ascending: false });
    if (error) throw new Error(`Downtime list failed: ${error.message}`);
    return ((data ?? []) as unknown as DowntimeRow[]).map(toDowntime);
  },

  async get(id: string): Promise<RentalEquipmentDowntime | null> {
    const supabase = supabaseAdmin();
    const { data, error } = await supabase
      .from(DOWNTIME_TABLE)
      .select(DOWNTIME_COLUMNS)
      .eq("id", id)
      .maybeSingle<DowntimeRow>();

    if (error) throw new Error(`Downtime read failed: ${error.message}`);
    return data ? toDowntime(data) : null;
  },

  async create(input: CreateRentalEquipmentDowntimeInput): Promise<RentalEquipmentDowntime> {
    const now = nowIso();
    const unitAssignments = normalizeUnitAssignments(input.unitAssignments);
    const quantityAffected =
      unitAssignments.length > 0
        ? unitAssignments.length
        : Math.max(1, Math.floor(Number(input.quantityAffected)));
    const supabase = supabaseAdmin();
    const { data, error } = await supabase
      .from(DOWNTIME_TABLE)
      .insert({
        equipment_id: input.equipmentId,
        downtime_type: input.downtimeType,
        start_date: input.startDate,
        end_date: input.endDate,
        quantity_affected: quantityAffected,
        unit_assignments: unitAssignments,
        status: input.status ?? "active",
        reason: input.reason?.trim() || null,
        notes: input.notes?.trim() || null,
        created_at: now,
        updated_at: now,
      })
      .select(DOWNTIME_COLUMNS)
      .single<DowntimeRow>();

    if (error) throw new Error(`Downtime create failed: ${error.message}`);
    return toDowntime(data);
  },

  async update(id: string, input: UpdateRentalEquipmentDowntimeInput): Promise<RentalEquipmentDowntime> {
    const payload: Record<string, unknown> = {
      updated_at: nowIso(),
    };
    let normalizedAssignments: string[] | undefined;
    if (input.downtimeType !== undefined) payload.downtime_type = input.downtimeType;
    if (input.startDate !== undefined) payload.start_date = input.startDate;
    if (input.endDate !== undefined) payload.end_date = input.endDate;
    if (input.unitAssignments !== undefined) {
      normalizedAssignments = normalizeUnitAssignments(input.unitAssignments);
      payload.unit_assignments = normalizedAssignments;
    }
    if (input.quantityAffected !== undefined) {
      payload.quantity_affected = Math.max(1, Math.floor(Number(input.quantityAffected)));
    }
    if (normalizedAssignments && normalizedAssignments.length > 0) {
      payload.quantity_affected = normalizedAssignments.length;
    }
    if (input.status !== undefined) payload.status = input.status;
    if (input.reason !== undefined) payload.reason = input.reason?.trim() || null;
    if (input.notes !== undefined) payload.notes = input.notes?.trim() || null;

    const supabase = supabaseAdmin();
    const { data, error } = await supabase
      .from(DOWNTIME_TABLE)
      .update(payload)
      .eq("id", id)
      .select(DOWNTIME_COLUMNS)
      .single<DowntimeRow>();

    if (error) throw new Error(`Downtime update failed: ${error.message}`);
    return toDowntime(data);
  },
};
