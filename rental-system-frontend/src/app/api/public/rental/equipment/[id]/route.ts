import { NextResponse } from "next/server";

import { dbRentalEquipmentRepo } from "@/lib/rental/equipment/db-rental-equipment-repo";

export const runtime = "nodejs";

export async function GET(_req: Request, { params }: { params: { id: string } }) {
  try {
    const equipment = await dbRentalEquipmentRepo.getPublicByIdOrSlug(params.id);
    if (!equipment) {
      return NextResponse.json({ error: "Equipment not found" }, { status: 404 });
    }
    return NextResponse.json({ equipment });
  } catch (error) {
    const message = error instanceof Error ? error.message : "Equipment read failed";
    return NextResponse.json({ error: message }, { status: 400 });
  }
}
