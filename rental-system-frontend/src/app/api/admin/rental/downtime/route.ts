import { NextResponse } from "next/server";

import {
  adminUnauthorizedResponse,
  assertAdmin,
  isAdminUnauthorized,
} from "@/lib/auth/admin";
import { previewDowntimeConflicts } from "@/lib/rental/downtime/downtime-conflicts";
import { dbRentalEquipmentDowntimeRepo } from "@/lib/rental/downtime/db-rental-equipment-downtime-repo";
import type { CreateRentalEquipmentDowntimeInput } from "@/lib/rental/downtime/types";
import { dbRentalEquipmentRepo } from "@/lib/rental/equipment/db-rental-equipment-repo";

export const runtime = "nodejs";

type DowntimeBody = {
  equipmentId?: string;
  downtimeType?: CreateRentalEquipmentDowntimeInput["downtimeType"];
  startDate?: string;
  endDate?: string;
  quantityAffected?: number | string;
  unitAssignments?: string[];
  reason?: string | null;
  notes?: string | null;
  previewOnly?: boolean;
  confirmConflicts?: boolean;
};

function parsePositiveInt(value: number | string | undefined, field: string) {
  const parsed = typeof value === "number" ? value : typeof value === "string" ? Number(value.trim()) : Number.NaN;
  if (!Number.isFinite(parsed) || parsed <= 0) throw new Error(`${field} must be greater than 0`);
  return Math.floor(parsed);
}

function normalizeDate(value: string | undefined, field: string) {
  const trimmed = String(value ?? "").trim();
  if (!trimmed) throw new Error(`${field} is required`);
  return trimmed.slice(0, 10);
}

function normalizeUnitAssignments(unitAssignments: string[] | undefined, totalUnits: number) {
  const allowed = new Set(
    Array.from({ length: Math.max(0, totalUnits) }, (_, index) => `unit-${index + 1}`)
  );
  const seen = new Set<string>();
  const normalized: string[] = [];
  for (const unit of unitAssignments ?? []) {
    const trimmed = String(unit ?? "").trim();
    if (!trimmed || seen.has(trimmed)) continue;
    if (!allowed.has(trimmed)) throw new Error(`Unknown unit assignment: ${trimmed}`);
    seen.add(trimmed);
    normalized.push(trimmed);
  }
  return normalized;
}

export async function GET(req: Request) {
  try {
    assertAdmin(req);
    const { searchParams } = new URL(req.url);
    const downtime = await dbRentalEquipmentDowntimeRepo.list({
      equipmentId: searchParams.get("equipmentId")?.trim() || undefined,
      status: (searchParams.get("status")?.trim() as "active" | "cancelled" | null) || undefined,
      startDateLte: searchParams.get("startDateLte")?.trim() || undefined,
      endDateGte: searchParams.get("endDateGte")?.trim() || undefined,
    });
    return NextResponse.json({ downtime });
  } catch (error) {
    if (isAdminUnauthorized(error)) return adminUnauthorizedResponse();
    const message = error instanceof Error ? error.message : "Downtime list failed";
    return NextResponse.json({ error: message }, { status: 400 });
  }
}

export async function POST(req: Request) {
  try {
    assertAdmin(req);
    const body = (await req.json()) as DowntimeBody;
    const equipmentId = String(body.equipmentId ?? "").trim();
    if (!equipmentId) throw new Error("equipmentId is required");

    const equipment = await dbRentalEquipmentRepo.getById(equipmentId);
    if (!equipment) {
      return NextResponse.json({ error: "Equipment not found" }, { status: 404 });
    }

    const totalUnits = Math.max(0, Number(equipment.totalUnits ?? 0));
    const unitAssignments = normalizeUnitAssignments(body.unitAssignments, totalUnits);
    const requestedQuantityAffected = parsePositiveInt(body.quantityAffected, "quantityAffected");
    const quantityAffected = unitAssignments.length > 0 ? unitAssignments.length : requestedQuantityAffected;
    if (quantityAffected > totalUnits) {
      throw new Error("quantityAffected cannot exceed total equipment units");
    }

    const startDate = normalizeDate(body.startDate, "startDate");
    const endDate = normalizeDate(body.endDate, "endDate");
    if (endDate < startDate) throw new Error("endDate must be on or after startDate");

    const conflicts = await previewDowntimeConflicts({
      equipmentId,
      startDate,
      endDate,
      quantityAffected,
      unitAssignments,
    });

    if (body.previewOnly) {
      return NextResponse.json({
        ok: true,
        previewOnly: true,
        quantityAffected: conflicts.derivedQuantityAffected,
        unitAssignments: conflicts.selectedUnits,
        conflicts,
      });
    }

    if (conflicts.hasConflicts && !body.confirmConflicts) {
      return NextResponse.json(
        {
          error: "Downtime overlaps existing operational activity",
          requiresConfirmation: true,
          quantityAffected: conflicts.derivedQuantityAffected,
          unitAssignments: conflicts.selectedUnits,
          conflicts,
        },
        { status: 409 }
      );
    }

    const downtime = await dbRentalEquipmentDowntimeRepo.create({
      equipmentId,
      downtimeType: body.downtimeType ?? "maintenance",
      startDate,
      endDate,
      quantityAffected: conflicts.derivedQuantityAffected,
      unitAssignments: conflicts.selectedUnits,
      reason: body.reason?.trim() || undefined,
      notes: body.notes?.trim() || undefined,
    });

    return NextResponse.json({ downtime, conflicts }, { status: 201 });
  } catch (error) {
    if (isAdminUnauthorized(error)) return adminUnauthorizedResponse();
    const message = error instanceof Error ? error.message : "Downtime create failed";
    return NextResponse.json({ error: message }, { status: 400 });
  }
}
