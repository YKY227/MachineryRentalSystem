import { NextResponse } from "next/server";
import { revalidatePath } from "next/cache";

import {
  adminUnauthorizedResponse,
  assertAdmin,
  isAdminUnauthorized,
} from "@/lib/auth/admin";
import { deleteRentalOrder } from "@/lib/rental/orders/delete-rental-order-service";

export const runtime = "nodejs";

function revalidateRentalDeletePaths() {
  revalidatePath("/admin/rental/orders");
  revalidatePath("/admin/rental/calendar");
  revalidatePath("/admin/rental/invoices");
  revalidatePath("/rental/account");
}

export async function DELETE(
  req: Request,
  context: { params: Promise<{ id: string }> }
) {
  try {
    assertAdmin(req);
    const { id } = await context.params;
    const result = await deleteRentalOrder(id);
    if (result.status === "deleted") {
      revalidateRentalDeletePaths();
    }
    return NextResponse.json(result);
  } catch (error) {
    if (isAdminUnauthorized(error)) return adminUnauthorizedResponse();
    const message = error instanceof Error ? error.message : "Rental order delete failed";
    const status = message === "Developer delete tools are disabled" ? 403 : 400;
    return NextResponse.json({ error: message }, { status });
  }
}
