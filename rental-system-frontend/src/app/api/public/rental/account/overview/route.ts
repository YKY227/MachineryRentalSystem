import { NextResponse } from "next/server";

import {
  assertCustomer,
  customerUnauthorizedResponse,
  isCustomerUnauthorized,
} from "@/lib/auth/customer";
import { loadRentalCustomerPortalOverview } from "@/lib/rental/customers/db-rental-customer-portal-overview";

export const runtime = "nodejs";

export async function GET(req: Request) {
  try {
    const customer = await assertCustomer(req);
    const overview = await loadRentalCustomerPortalOverview(customer.id);
    return NextResponse.json(overview);
  } catch (error) {
    if (isCustomerUnauthorized(error)) return customerUnauthorizedResponse();
    const message = error instanceof Error ? error.message : "Customer account overview failed";
    return NextResponse.json({ error: message }, { status: 400 });
  }
}
