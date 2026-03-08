import { NextResponse } from "next/server";

import { getAuthenticatedCustomer } from "@/lib/auth/customer";

export const runtime = "nodejs";

export async function GET(req: Request) {
  try {
    const customer = await getAuthenticatedCustomer(req);
    return NextResponse.json({ customer });
  } catch (error) {
    const message = error instanceof Error ? error.message : "Customer lookup failed";
    return NextResponse.json({ error: message }, { status: 400 });
  }
}
