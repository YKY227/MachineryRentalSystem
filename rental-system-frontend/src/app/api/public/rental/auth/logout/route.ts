import { NextResponse } from "next/server";

import { clearCustomerAuthCookie } from "@/lib/auth/customer";

export const runtime = "nodejs";

export async function POST() {
  const res = NextResponse.json({ ok: true });
  clearCustomerAuthCookie(res);
  return res;
}
