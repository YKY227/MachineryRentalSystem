import { NextResponse } from "next/server";

import { dbRentalEquipmentRepo } from "@/lib/rental/equipment/db-rental-equipment-repo";

export const runtime = "nodejs";

export async function GET() {
  try {
    const equipment = await dbRentalEquipmentRepo.listPublic();
    return NextResponse.json({ equipment });
  } catch (error) {
    const message = error instanceof Error ? error.message : "Equipment list failed";
    return NextResponse.json({ error: message }, { status: 400 });
  }
}
