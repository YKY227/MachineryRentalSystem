import { NextResponse } from "next/server";

import {
  adminUnauthorizedResponse,
  assertAdmin,
  isAdminUnauthorized,
} from "@/lib/auth/admin";
import { loadRentalCustomerOverview } from "@/lib/rental/customers/db-rental-customer-overview";

export const runtime = "nodejs";

export async function GET(req: Request, { params }: { params: { id: string } }) {
  try {
    assertAdmin(req);
    const overview = await loadRentalCustomerOverview(params.id);
    return NextResponse.json(overview);
  } catch (error) {
    if (isAdminUnauthorized(error)) return adminUnauthorizedResponse();
    const message = error instanceof Error ? error.message : "Customer overview failed";
    const status = message === "Customer not found" ? 404 : 400;
    return NextResponse.json({ error: message }, { status });
  }
}
