import { NextResponse } from "next/server";

import {
  adminUnauthorizedResponse,
  assertAdmin,
  isAdminUnauthorized,
} from "@/lib/auth/admin";
import { dbOrderRepo } from "@/lib/rental/orders/db-order-repo";

export const runtime = "nodejs";

type RouteContext = {
  params: Promise<{ id: string }>;
};

function requireOrderEnv() {
  const required = ["SUPABASE_URL", "SUPABASE_SERVICE_ROLE_KEY"] as const;
  const missing = required.filter((name) => !process.env[name]);
  if (missing.length) {
    throw new Error(`Missing required env vars: ${missing.join(", ")}`);
  }
}

export async function GET(req: Request, ctx: RouteContext) {
  try {
    assertAdmin(req);
    requireOrderEnv();
    const { id } = await ctx.params;
    const order = await dbOrderRepo.get(id);
    if (!order) return NextResponse.json({ error: "Order not found" }, { status: 404 });
    return NextResponse.json({ order });
  } catch (e) {
    if (isAdminUnauthorized(e)) return adminUnauthorizedResponse();
    const message = e instanceof Error ? e.message : "Order read failed";
    return NextResponse.json({ error: message }, { status: 400 });
  }
}
