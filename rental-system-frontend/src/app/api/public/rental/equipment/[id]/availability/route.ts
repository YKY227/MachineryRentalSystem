import { NextResponse } from "next/server";

import { dbRentalEquipmentRepo } from "@/lib/rental/equipment/db-rental-equipment-repo";
import { getEquipmentAvailabilityForRange } from "@/lib/rental/holds/db-rental-availability-service";

export const runtime = "nodejs";

export async function GET(req: Request, ctx: { params: Promise<{ id: string }> }) {
  try {
    const { id } = await ctx.params;
    const equipment = await dbRentalEquipmentRepo.getPublicByIdOrSlug(id);
    if (!equipment) {
      return NextResponse.json({ error: "Equipment not found" }, { status: 404 });
    }

    const { searchParams } = new URL(req.url);
    const start = String(searchParams.get("start") ?? "").trim().slice(0, 10);
    const end = String(searchParams.get("end") ?? "").trim().slice(0, 10);
    if (!start || !end) {
      return NextResponse.json({ error: "start and end are required" }, { status: 400 });
    }
    if (end < start) {
      return NextResponse.json({ error: "end must be on or after start" }, { status: 400 });
    }

    const snapshot = await getEquipmentAvailabilityForRange({
      equipmentId: equipment.id,
      start,
      end,
    });

    return NextResponse.json({ equipmentId: equipment.id, start, end, snapshot });
  } catch (error) {
    const message = error instanceof Error ? error.message : "Availability read failed";
    return NextResponse.json({ error: message }, { status: 400 });
  }
}
