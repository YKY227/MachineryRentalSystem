import { NextResponse } from "next/server";

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
    requireOrderEnv();
    const body = (await req.json()) as { order?: CreateRentalOrderInput };
    const order = body?.order;
    if (!order?.id) {
      return NextResponse.json({ error: "Missing order id" }, { status: 400 });
    }

    // Public checkout can safely retry the same order id; upsert keeps this idempotent for MVP.
    const rows = await dbOrderRepo.upsertMany([order]);
    return NextResponse.json({ order: rows[0] ?? null });
  } catch (e) {
    const message = e instanceof Error ? e.message : "Order create failed";
    return NextResponse.json({ error: message }, { status: 400 });
  }
}
