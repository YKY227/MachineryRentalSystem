import { NextResponse } from "next/server";

import {
  adminUnauthorizedResponse,
  assertAdmin,
  isAdminUnauthorized,
} from "@/lib/auth/admin";
import { dbRentalEquipmentRepo } from "@/lib/rental/equipment/db-rental-equipment-repo";
import {
  normalizeEquipmentPatchBody,
  type EquipmentPatchBody,
} from "@/lib/rental/equipment/equipment-patch";
import { getRentalEquipmentInventoryProtection } from "@/lib/rental/equipment/equipment-inventory-protection-service";
import type { UpdateRentalEquipmentInput } from "@/lib/rental/equipment/types";
import type { Equipment } from "@/lib/rental/types";

export const runtime = "nodejs";

function assertValidSalePricing(existing: Equipment, patch: UpdateRentalEquipmentInput) {
  const saleEnabled = patch.saleEnabled ?? existing.sale?.enabled ?? false;
  const salePriceMode = patch.salePriceMode ?? existing.sale?.priceMode ?? "request_quote";
  const salePriceCents =
    patch.salePriceCents !== undefined ? patch.salePriceCents : existing.sale?.priceCents;

  if (
    saleEnabled &&
    salePriceMode === "fixed" &&
    (!Number.isInteger(salePriceCents) || Number(salePriceCents) <= 0)
  ) {
    throw new Error("salePriceCents must be a positive integer when fixed sale pricing is enabled");
  }
}

export async function GET(req: Request, { params }: { params: { id: string } }) {
  try {
    assertAdmin(req);
    const equipment = await dbRentalEquipmentRepo.getById(params.id);
    if (!equipment) {
      return NextResponse.json({ error: "Equipment not found" }, { status: 404 });
    }
    const inventoryProtection = await getRentalEquipmentInventoryProtection(params.id);
    return NextResponse.json({ equipment, inventoryProtection });
  } catch (error) {
    if (isAdminUnauthorized(error)) return adminUnauthorizedResponse();
    const message = error instanceof Error ? error.message : "Equipment read failed";
    return NextResponse.json({ error: message }, { status: 400 });
  }
}

export async function PATCH(req: Request, { params }: { params: { id: string } }) {
  try {
    assertAdmin(req);
    const existing = await dbRentalEquipmentRepo.getById(params.id);
    if (!existing) {
      return NextResponse.json({ error: "Equipment not found" }, { status: 404 });
    }

    const body = (await req.json()) as EquipmentPatchBody;
    const patch = normalizeEquipmentPatchBody(body);
    assertValidSalePricing(existing, patch);
    const inventoryProtection = await getRentalEquipmentInventoryProtection(params.id);

    if (
      patch.totalUnits !== undefined &&
      patch.totalUnits < inventoryProtection.protectedMinimum
    ) {
      return NextResponse.json(
        {
          error: "Cannot reduce total units below currently committed or unavailable units.",
          details: inventoryProtection,
        },
        { status: 400 }
      );
    }

    const equipment = await dbRentalEquipmentRepo.update(params.id, patch);
    const nextInventoryProtection = await getRentalEquipmentInventoryProtection(params.id);
    return NextResponse.json({ equipment, inventoryProtection: nextInventoryProtection });
  } catch (error) {
    if (isAdminUnauthorized(error)) return adminUnauthorizedResponse();
    const message = error instanceof Error ? error.message : "Equipment update failed";
    return NextResponse.json({ error: message }, { status: 400 });
  }
}

