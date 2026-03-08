//rental-system-frontend/src/app/api/public/rental/checkout/payment-status/route.ts
import { NextResponse } from "next/server";

import { dbInvoiceRepo } from "@/lib/rental/invoices/db-invoice-repo";
import { dbOrderRepo } from "@/lib/rental/orders/db-order-repo";
import { dbOrderPaymentSessionRepo } from "@/lib/rental/orders/db-order-payment-session-repo";

export const runtime = "nodejs";

function requireCheckoutEnv() {
  const required = ["SUPABASE_URL", "SUPABASE_SERVICE_ROLE_KEY"] as const;
  const missing = required.filter((name) => !process.env[name]);
  if (missing.length) {
    throw new Error(`Missing required env vars: ${missing.join(", ")}`);
  }
}

export async function GET(req: Request) {
  try {
    requireCheckoutEnv();

    const { searchParams } = new URL(req.url);
    const sessionId = (searchParams.get("sessionId") ?? "").trim();
    const orderId = (searchParams.get("orderId") ?? "").trim();
    if (!sessionId && !orderId) {
      return NextResponse.json({ error: "Missing sessionId or orderId" }, { status: 400 });
    }

    if (sessionId) {
      const session = await dbOrderPaymentSessionRepo.get(sessionId);
      if (!session) {
        return NextResponse.json({ error: "Payment session not found" }, { status: 404 });
      }

      const order = await dbOrderRepo.get(session.orderId);
      const invoice = order ? await dbInvoiceRepo.findActiveByOrderId(order.id) : null;
      return NextResponse.json({ order, paymentSession: session, invoice });
    }

    const order = await dbOrderRepo.get(orderId);
    if (!order) {
      return NextResponse.json({ error: "Order not found" }, { status: 404 });
    }

    const invoice = await dbInvoiceRepo.findActiveByOrderId(order.id);
    return NextResponse.json({ order, paymentSession: null, invoice });
  } catch (e) {
    const message = e instanceof Error ? e.message : "Payment status read failed";
    return NextResponse.json({ error: message }, { status: 400 });
  }
}
