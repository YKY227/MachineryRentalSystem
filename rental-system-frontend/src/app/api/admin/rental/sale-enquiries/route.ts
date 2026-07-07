import { NextResponse } from "next/server";

import {
  adminUnauthorizedResponse,
  assertAdmin,
  isAdminUnauthorized,
} from "@/lib/auth/admin";
import { dbRentalEquipmentSaleEnquiryRepo } from "@/lib/rental/sale-enquiries/db-sale-enquiry-repo";
import type { RentalEquipmentSaleEnquiryStatus } from "@/lib/rental/sale-enquiries/types";

export const runtime = "nodejs";

export async function GET(req: Request) {
  try {
    assertAdmin(req);
    const { searchParams } = new URL(req.url);
    const status = searchParams.get("status")?.trim() as RentalEquipmentSaleEnquiryStatus | undefined;
    const limitRaw = searchParams.get("limit")?.trim();
    const limit = limitRaw ? Number(limitRaw) : undefined;

    if (status && !dbRentalEquipmentSaleEnquiryRepo.statuses.has(status)) {
      throw new Error("Invalid sale enquiry status");
    }

    const enquiries = await dbRentalEquipmentSaleEnquiryRepo.list({
      status,
      limit: Number.isFinite(limit) ? limit : undefined,
    });
    return NextResponse.json({ enquiries });
  } catch (error) {
    if (isAdminUnauthorized(error)) return adminUnauthorizedResponse();
    const message = error instanceof Error ? error.message : "Sale enquiry list failed";
    return NextResponse.json({ error: message }, { status: 400 });
  }
}
