import { NextResponse } from "next/server";

import {
  adminUnauthorizedResponse,
  assertAdmin,
  isAdminUnauthorized,
} from "@/lib/auth/admin";
import { dbOrderRepo } from "@/lib/rental/orders/db-order-repo";

export const runtime = "nodejs";

export async function POST(req: Request, { params }: { params: { id: string } }) {
  try {
    assertAdmin(req);
    const existing = await dbOrderRepo.get(params.id);
    if (!existing) {
      return NextResponse.json({ error: "Order not found" }, { status: 404 });
    }

    if (existing.newOrderAcknowledgedAt) {
      return NextResponse.json({ order: existing, acknowledged: true, alreadyAcknowledged: true });
    }

    const order = await dbOrderRepo.updateNotificationState(params.id, {
      newOrderAcknowledgedAt: new Date().toISOString(),
    });

    return NextResponse.json({ order, acknowledged: true, alreadyAcknowledged: false });
  } catch (error) {
    if (isAdminUnauthorized(error)) return adminUnauthorizedResponse();
    const message = error instanceof Error ? error.message : "Order acknowledge failed";
    return NextResponse.json({ error: message }, { status: 400 });
  }
}
