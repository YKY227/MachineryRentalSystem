import { NextResponse } from "next/server";

import {
  adminUnauthorizedResponse,
  assertAdmin,
  isAdminUnauthorized,
} from "@/lib/auth/admin";
import { dbRentalEquipmentDowntimeRepo } from "@/lib/rental/downtime/db-rental-equipment-downtime-repo";
import { dbRentalEquipmentRepo } from "@/lib/rental/equipment/db-rental-equipment-repo";

export const runtime = "nodejs";

type RouteContext = {
  params: Promise<{ id: string }>;
};

type UpdateBody = {
  downtimeType?: "maintenance" | "repair" | "inspection" | "admin_hold" | "internal_use";
  startDate?: string;
  endDate?: string;
  quantityAffected?: number | string;
  unitAssignments?: string[];
  reason?: string | null;
  notes?: string | null;
  status?: "active" | "cancelled";
};

function parseOptionalPositiveInt(value: number | string | undefined, field: string) {
  if (value === undefined) return undefined;
  const parsed = typeof value === "number" ? value : typeof value === "string" ? Number(value.trim()) : Number.NaN;
  if (!Number.isFinite(parsed) || parsed <= 0) throw new Error(`${field} must be greater than 0`);
  return Math.floor(parsed);
}

function normalizeUnitAssignments(unitAssignments: string[] | undefined, totalUnits: number) {
  if (unitAssignments === undefined) return undefined;
  const allowed = new Set(
    Array.from({ length: Math.max(0, totalUnits) }, (_, index) => `unit-${index + 1}`)
  );
  const seen = new Set<string>();
  const normalized: string[] = [];
  for (const unit of unitAssignments) {
    const trimmed = String(unit ?? "").trim();
    if (!trimmed || seen.has(trimmed)) continue;
    if (!allowed.has(trimmed)) throw new Error(`Unknown unit assignment: ${trimmed}`);
    seen.add(trimmed);
    normalized.push(trimmed);
  }
  return normalized;
}

export async function PATCH(req: Request, ctx: RouteContext) {
  try {
    assertAdmin(req);
    const { id } = await ctx.params;
    const existing = await dbRentalEquipmentDowntimeRepo.get(id);
    if (!existing) {
      return NextResponse.json({ error: "Downtime not found" }, { status: 404 });
    }

    const body = (await req.json()) as UpdateBody;
    const quantityAffected = parseOptionalPositiveInt(body.quantityAffected, "quantityAffected");
    if (quantityAffected !== undefined || body.unitAssignments !== undefined) {
      const equipment = await dbRentalEquipmentRepo.getById(existing.equipmentId);
      if (!equipment) return NextResponse.json({ error: "Equipment not found" }, { status: 404 });
      const totalUnits = Math.max(0, Number(equipment.totalUnits ?? 0));
      const unitAssignments = normalizeUnitAssignments(body.unitAssignments, totalUnits);
      const effectiveQuantityAffected =
        unitAssignments && unitAssignments.length > 0
          ? unitAssignments.length
          : quantityAffected !== undefined
            ? quantityAffected
            : undefined;
      if (effectiveQuantityAffected !== undefined && effectiveQuantityAffected > totalUnits) {
        throw new Error("quantityAffected cannot exceed total equipment units");
      }
      body.unitAssignments = unitAssignments;
    }

    const startDate = body.startDate?.trim().slice(0, 10) || existing.startDate;
    const endDate = body.endDate?.trim().slice(0, 10) || existing.endDate;
    if (endDate < startDate) throw new Error("endDate must be on or after startDate");

    const downtime = await dbRentalEquipmentDowntimeRepo.update(id, {
      downtimeType: body.downtimeType,
      startDate,
      endDate,
      quantityAffected,
      unitAssignments: body.unitAssignments,
      reason: body.reason === undefined ? undefined : body.reason,
      notes: body.notes === undefined ? undefined : body.notes,
      status: body.status,
    });

    return NextResponse.json({ downtime });
  } catch (error) {
    if (isAdminUnauthorized(error)) return adminUnauthorizedResponse();
    const message = error instanceof Error ? error.message : "Downtime update failed";
    return NextResponse.json({ error: message }, { status: 400 });
  }
}
