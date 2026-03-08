import { NextResponse } from "next/server";

import {
  adminUnauthorizedResponse,
  assertAdmin,
  isAdminUnauthorized,
} from "@/lib/auth/admin";
import { dbRentalCustomerRepo } from "@/lib/rental/customers/db-rental-customer-repo";

export const runtime = "nodejs";

export async function GET(req: Request) {
  try {
    assertAdmin(req);
    const { searchParams } = new URL(req.url);
    const q = searchParams.get("q") ?? "";
    const customers = await dbRentalCustomerRepo.list({ q });
    return NextResponse.json({ customers });
  } catch (error) {
    if (isAdminUnauthorized(error)) return adminUnauthorizedResponse();
    const message = error instanceof Error ? error.message : "Customer list failed";
    return NextResponse.json({ error: message }, { status: 400 });
  }
}
