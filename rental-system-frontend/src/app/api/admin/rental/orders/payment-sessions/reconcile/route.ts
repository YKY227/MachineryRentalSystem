import { NextResponse } from "next/server";

import {
  adminUnauthorizedResponse,
  assertAdmin,
  isAdminUnauthorized,
} from "@/lib/auth/admin";
import { processPaidCheckoutSession } from "@/lib/rental/invoices/checkout-invoice-automation";
import { dbOrderPaymentSessionRepo } from "@/lib/rental/orders/db-order-payment-session-repo";

export const runtime = "nodejs";

type ReconcileBody = {
  sessionId?: string;
};

export async function POST(req: Request) {
  try {
    assertAdmin(req);

    const body = (await req.json()) as ReconcileBody;
    const sessionId = (body.sessionId ?? "").trim();
    if (!sessionId) {
      return NextResponse.json({ error: "Missing sessionId" }, { status: 400 });
    }

    const session = await dbOrderPaymentSessionRepo.get(sessionId);
    if (!session) {
      return NextResponse.json({ error: "Payment session not found" }, { status: 404 });
    }
    if (session.status !== "paid") {
      return NextResponse.json(
        { error: "Only paid payment sessions can be reconciled" },
        { status: 400 }
      );
    }

    await processPaidCheckoutSession(session.id);
    const refreshed = await dbOrderPaymentSessionRepo.get(session.id);

    return NextResponse.json({
      ok: true,
      paymentSession: refreshed,
    });
  } catch (error) {
    if (isAdminUnauthorized(error)) return adminUnauthorizedResponse();

    const message = error instanceof Error ? error.message : "Payment session reconcile failed";
    return NextResponse.json({ error: message }, { status: 400 });
  }
}
