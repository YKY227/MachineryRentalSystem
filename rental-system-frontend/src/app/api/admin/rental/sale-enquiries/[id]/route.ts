import { NextResponse } from "next/server";

import {
  adminUnauthorizedResponse,
  assertAdmin,
  isAdminUnauthorized,
} from "@/lib/auth/admin";
import { dbRentalEquipmentSaleEnquiryRepo } from "@/lib/rental/sale-enquiries/db-sale-enquiry-repo";
import type { RentalEquipmentSaleEnquiryStatus } from "@/lib/rental/sale-enquiries/types";

export const runtime = "nodejs";

type UpdateBody = {
  status?: RentalEquipmentSaleEnquiryStatus;
  adminNotes?: string | null;
};

export async function PATCH(req: Request, { params }: { params: { id: string } }) {
  try {
    assertAdmin(req);
    const existing = await dbRentalEquipmentSaleEnquiryRepo.getById(params.id);
    if (!existing) {
      return NextResponse.json({ error: "Sale enquiry not found" }, { status: 404 });
    }

    const body = (await req.json()) as UpdateBody;
    if (body.status !== undefined && !dbRentalEquipmentSaleEnquiryRepo.statuses.has(body.status)) {
      throw new Error("Invalid sale enquiry status");
    }

    const enquiry = await dbRentalEquipmentSaleEnquiryRepo.update(params.id, {
      status: body.status,
      adminNotes: body.adminNotes,
    });
    if (!enquiry) {
      return NextResponse.json({ error: "Sale enquiry not found" }, { status: 404 });
    }

    return NextResponse.json({ enquiry });
  } catch (error) {
    if (isAdminUnauthorized(error)) return adminUnauthorizedResponse();
    const message = error instanceof Error ? error.message : "Sale enquiry update failed";
    return NextResponse.json({ error: message }, { status: 400 });
  }
}
