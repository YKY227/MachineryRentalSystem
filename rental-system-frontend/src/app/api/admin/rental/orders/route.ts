import { NextResponse } from "next/server";

import {
  adminUnauthorizedResponse,
  assertAdmin,
  isAdminUnauthorized,
} from "@/lib/auth/admin";
import { dbRentalDamageAssessmentRepo } from "@/lib/rental/damage-assessments/db-rental-damage-assessment-repo";
import { dbRentalDepositRepo } from "@/lib/rental/deposits/db-rental-deposit-repo";
import { dbOrderBufferOverrideRepo } from "@/lib/rental/orders/db-order-buffer-override-repo";
import { dbOrderRepo } from "@/lib/rental/orders/db-order-repo";
import type { CreateRentalOrderInput } from "@/lib/rental/orders/types";
import { dbAdminSettingsRepo } from "@/lib/settings/db-admin-settings-repo";

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
    const bufferOverridesByOrderId = await dbOrderBufferOverrideRepo.listByOrderIds(
      orders.map((order) => order.id)
    );
    const depositSummariesByOrderId = await dbRentalDepositRepo.listByOrderIds(
      orders.map((order) => order.id)
    );
    const assessmentSummariesByOrderId = await dbRentalDamageAssessmentRepo.listSummariesByOrderIds(
      orders.map((order) => order.id)
    );
    const operationsPolicy = await dbAdminSettingsRepo.getOperationsPolicy();
    return NextResponse.json({
      orders,
      depositSummariesByOrderId,
      assessmentSummariesByOrderId,
      bufferOverridesByOrderId,
      developerDeleteEnabled: operationsPolicy.enableDeveloperDeleteTools,
    });
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
    return NextResponse.json({ error: "Use the dedicated developer delete endpoints" }, { status: 405 });
  } catch (e) {
    if (isAdminUnauthorized(e)) return adminUnauthorizedResponse();
    const message = e instanceof Error ? e.message : "Order clear failed";
    return NextResponse.json({ error: message }, { status: 400 });
  }
}
