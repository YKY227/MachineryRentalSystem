import { NextResponse } from "next/server";

import { isAdminAuthenticated } from "@/lib/auth/admin";
import { getAuthenticatedCustomer } from "@/lib/auth/customer";

export const runtime = "nodejs";

export async function GET(req: Request) {
  try {
    const customer = await getAuthenticatedCustomer(req);
    return NextResponse.json({
      customer,
      adminAuthenticated: isAdminAuthenticated(req),
    });
  } catch (error) {
    const message = error instanceof Error ? error.message : "Customer lookup failed";
    return NextResponse.json({ error: message }, { status: 400 });
  }
}
