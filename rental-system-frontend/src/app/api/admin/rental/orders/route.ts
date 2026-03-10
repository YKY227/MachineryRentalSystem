import { NextResponse } from "next/server";

import {
  adminUnauthorizedResponse,
  assertAdmin,
  isAdminUnauthorized,
} from "@/lib/auth/admin";
import { dbRentalDepositRepo } from "@/lib/rental/deposits/db-rental-deposit-repo";
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

export async function GET(req: Request) {
  try {
    assertAdmin(req);
    requireOrderEnv();
    const orders = await dbOrderRepo.list();
    const depositSummariesByOrderId = await dbRentalDepositRepo.listByOrderIds(
      orders.map((order) => order.id)
    );
    return NextResponse.json({ orders, depositSummariesByOrderId });
  } catch (e) {
    if (isAdminUnauthorized(e)) return adminUnauthorizedResponse();
    const message = e instanceof Error ? e.message : "Order list failed";
    return NextResponse.json({ error: message }, { status: 400 });
  }
}

export async function POST(req: Request) {
  try {
    assertAdmin(req);
    requireOrderEnv();
    const body = (await req.json()) as { order?: CreateRentalOrderInput } | CreateRentalOrderInput;
    const orderInput = (body as { order?: CreateRentalOrderInput })?.order ?? (body as CreateRentalOrderInput);

    if (!orderInput?.id) {
      return NextResponse.json({ error: "Missing order id" }, { status: 400 });
    }

    const order = await dbOrderRepo.create(orderInput);
    return NextResponse.json({ order }, { status: 201 });
  } catch (e) {
    if (isAdminUnauthorized(e)) return adminUnauthorizedResponse();
    const message = e instanceof Error ? e.message : "Order create failed";
    return NextResponse.json({ error: message }, { status: 400 });
  }
}

export async function DELETE(req: Request) {
  try {
    assertAdmin(req);
    requireOrderEnv();

    if (process.env.NODE_ENV !== "development") {
      return NextResponse.json({ error: "Not allowed in this environment" }, { status: 403 });
    }

    const deleted = await dbOrderRepo.clearAll();
    return NextResponse.json({ ok: true, deleted });
  } catch (e) {
    if (isAdminUnauthorized(e)) return adminUnauthorizedResponse();
    const message = e instanceof Error ? e.message : "Order clear failed";
    return NextResponse.json({ error: message }, { status: 400 });
  }
}
