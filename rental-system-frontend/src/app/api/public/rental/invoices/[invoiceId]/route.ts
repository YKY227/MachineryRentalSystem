import { NextResponse } from "next/server";

import {
  assertCustomer,
  customerUnauthorizedResponse,
  isCustomerUnauthorized,
} from "@/lib/auth/customer";
import { loadCustomerInvoiceDetail } from "@/lib/rental/invoices/customer-invoice-access";
import { dbOrderPaymentSessionRepo } from "@/lib/rental/orders/db-order-payment-session-repo";
import { reconcilePaymentSession } from "@/lib/rental/orders/payment-session-reconciliation";

export const runtime = "nodejs";

type RouteContext = {
  params: Promise<{ invoiceId: string }>;
};

async function reconcileReturnedPaymentSession(input: {
  sessionId: string;
  invoiceId: string;
  customerId: string;
}) {
  const session = await dbOrderPaymentSessionRepo.get(input.sessionId);
  if (!session) return;

  const paymentMode = String(session.webhookPayload?.paymentMode ?? "").trim();
  const sessionInvoiceId =
    String(session.webhookPayload?.invoiceId ?? "").trim() || session.invoiceId?.trim() || "";
  const sessionCustomerId = String(session.webhookPayload?.customerId ?? "").trim();
  if (
    paymentMode !== "customer_invoice" ||
    sessionInvoiceId !== input.invoiceId ||
    (sessionCustomerId && sessionCustomerId !== input.customerId)
  ) {
    return;
  }

  await reconcilePaymentSession({
    sessionId: session.id,
    source: "customer_invoice_return",
    refreshProvider: true,
    requireMode: "customer_invoice",
  });
}

export async function GET(req: Request, ctx: RouteContext) {
  try {
    const customer = await assertCustomer(req);
    const { invoiceId } = await ctx.params;
    let detail = await loadCustomerInvoiceDetail(customer.id, invoiceId);
    const sessionId = (new URL(req.url).searchParams.get("sessionId") ?? "").trim();
    if (sessionId) {
      await reconcileReturnedPaymentSession({
        sessionId,
        invoiceId: detail.invoice.id,
        customerId: customer.id,
      });
      detail = await loadCustomerInvoiceDetail(customer.id, invoiceId);
    }

    return NextResponse.json(detail);
  } catch (error) {
    if (isCustomerUnauthorized(error)) return customerUnauthorizedResponse();
    const message = error instanceof Error ? error.message : "Invoice detail failed";
    const status = message === "Invoice not found" ? 404 : 400;
    return NextResponse.json({ error: message }, { status });
  }
}
