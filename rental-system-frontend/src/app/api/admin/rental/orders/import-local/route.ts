import { NextResponse } from "next/server";

import {
  adminUnauthorizedResponse,
  assertAdmin,
  isAdminUnauthorized,
} from "@/lib/auth/admin";
import { dbOrderRepo } from "@/lib/rental/orders/db-order-repo";
import type { CreateRentalOrderInput } from "@/lib/rental/orders/types";

export const runtime = "nodejs";

function requireOrderEnv() {
  const required = ["SUPABASE_URL", "SUPABASE_SERVICE_ROLE_KEY"] as const;
  const missing = required.filter((name) => !process.env[name]);
  if (missing.length) {
    throw new Error(`Missing required env vars: ${missing.join(", ")}`);
  }
}

export async function POST(req: Request) {
  try {
    assertAdmin(req);
    requireOrderEnv();

    if (process.env.NODE_ENV !== "development") {
      return NextResponse.json({ error: "Import route is development-only" }, { status: 403 });
    }

    const body = (await req.json()) as { orders?: CreateRentalOrderInput[] };
    const orders = Array.isArray(body?.orders) ? body.orders : [];

    if (!orders.length) {
      return NextResponse.json({ error: "No orders provided" }, { status: 400 });
    }

    const valid = orders.filter((o) => o?.id && o?.equipmentId && o?.start && o?.end);
    const imported = await dbOrderRepo.upsertMany(valid);
    return NextResponse.json({ ok: true, imported: imported.length });
  } catch (e) {
    if (isAdminUnauthorized(e)) return adminUnauthorizedResponse();
    const message = e instanceof Error ? e.message : "Import failed";
    return NextResponse.json({ error: message }, { status: 400 });
  }
}
