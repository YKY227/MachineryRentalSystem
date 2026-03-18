import { NextResponse } from "next/server";
import { revalidatePath } from "next/cache";

import {
  adminUnauthorizedResponse,
  assertAdmin,
  isAdminUnauthorized,
} from "@/lib/auth/admin";
import { deleteRentalOrders } from "@/lib/rental/orders/delete-rental-order-service";

export const runtime = "nodejs";

type BulkDeleteBody = {
  orderIds?: string[];
};

function revalidateRentalDeletePaths() {
  revalidatePath("/admin/rental/orders");
  revalidatePath("/admin/rental/calendar");
  revalidatePath("/admin/rental/invoices");
  revalidatePath("/rental/account");
}

export async function POST(req: Request) {
  try {
    assertAdmin(req);
    const body = (await req.json()) as BulkDeleteBody;
    if (!Array.isArray(body.orderIds) || body.orderIds.length === 0) {
      return NextResponse.json({ error: "orderIds is required" }, { status: 400 });
    }

    const result = await deleteRentalOrders(body.orderIds);
    if (result.deletedCount > 0) {
      revalidateRentalDeletePaths();
    }
    return NextResponse.json(result);
  } catch (error) {
    if (isAdminUnauthorized(error)) return adminUnauthorizedResponse();
    const message = error instanceof Error ? error.message : "Bulk rental order delete failed";
    const status = message === "Developer delete tools are disabled" ? 403 : 400;
    return NextResponse.json({ error: message }, { status });
  }
}
