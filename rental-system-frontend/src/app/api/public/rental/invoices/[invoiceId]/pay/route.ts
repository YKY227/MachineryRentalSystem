import { NextResponse } from "next/server";

import {
  assertCustomer,
  customerUnauthorizedResponse,
  isCustomerUnauthorized,
} from "@/lib/auth/customer";
import { loadCustomerInvoiceDetail } from "@/lib/rental/invoices/customer-invoice-access";
import { dbOrderPaymentSessionRepo } from "@/lib/rental/orders/db-order-payment-session-repo";
import { createHitPayPaymentRequest } from "@/lib/rental/orders/hitpay";

export const runtime = "nodejs";

type RouteContext = {
  params: Promise<{ invoiceId: string }>;
};

function requireInvoicePaymentEnv() {
  const required = ["SUPABASE_URL", "SUPABASE_SERVICE_ROLE_KEY", "APP_BASE_URL", "HITPAY_API_KEY"] as const;
  const missing = required.filter((name) => !process.env[name]);
  if (missing.length) {
    throw new Error(`Missing required env vars: ${missing.join(", ")}`);
  }
}

function appBaseUrl() {
  return (process.env.APP_BASE_URL ?? process.env.NEXT_PUBLIC_APP_URL ?? "").replace(/\/+$/, "");
}

function getCustomerInvoiceReturnUrl(invoiceId: string, sessionId: string) {
  const baseUrl = appBaseUrl();
  if (!baseUrl) throw new Error("Missing env: APP_BASE_URL");
  const query = new URLSearchParams({
    payment: "submitted",
    sessionId,
  });
  return `${baseUrl}/rental/account/invoices/${encodeURIComponent(invoiceId)}?${query.toString()}`;
}

export async function POST(req: Request, ctx: RouteContext) {
  try {
    requireInvoicePaymentEnv();
    const customer = await assertCustomer(req);
    const { invoiceId } = await ctx.params;

    const detail = await loadCustomerInvoiceDetail(customer.id, invoiceId);
    if (detail.invoice.status !== "issued") {
      return NextResponse.json({ error: "Invoice is not payable" }, { status: 400 });
    }
    if (detail.paymentTotals.balanceCents <= 0) {
      return NextResponse.json({ error: "Invoice is already fully paid" }, { status: 409 });
    }

    const amountCents = detail.paymentTotals.balanceCents;
    const session = await dbOrderPaymentSessionRepo.create({
      orderId: detail.order.id,
      provider: "hitpay",
      amountCents,
      currency: detail.invoice.currency ?? "SGD",
      status: "pending",
      paymentPurpose: `Invoice payment ${detail.invoice.invoiceNo ?? detail.invoice.id}`,
      webhookPayload: {
        paymentMode: "customer_invoice",
        invoiceId: detail.invoice.id,
        customerId: customer.id,
        outstandingAmountCents: amountCents,
      },
    });

    try {
      const paymentRequest = await createHitPayPaymentRequest({
        amountCents,
        currency: detail.invoice.currency ?? "SGD",
        purpose: `Invoice payment ${detail.invoice.invoiceNo ?? detail.invoice.id}`,
        referenceNumber: detail.invoice.id,
        redirectUrl: getCustomerInvoiceReturnUrl(detail.invoice.id, session.id),
      });

      const updatedSession = await dbOrderPaymentSessionRepo.update(session.id, {
        providerPaymentRequestId: paymentRequest.id,
        providerReferenceNumber: paymentRequest.referenceNumber,
        redirectUrl: paymentRequest.url,
        status: paymentRequest.status,
        invoiceId: detail.invoice.id,
        webhookPayload: {
          ...(session.webhookPayload ?? {}),
          providerRequest: paymentRequest.raw,
        },
      });

      return NextResponse.json({
        paymentSession: updatedSession,
        redirectUrl: paymentRequest.url,
        amountCents,
      });
    } catch (error) {
      await dbOrderPaymentSessionRepo
        .update(session.id, {
          status: "failed",
          webhookPayload: {
            ...(session.webhookPayload ?? {}),
            error: error instanceof Error ? error.message : "HitPay create payment request failed",
          },
        })
        .catch(() => null);
      throw error;
    }
  } catch (error) {
    if (isCustomerUnauthorized(error)) return customerUnauthorizedResponse();
    const message = error instanceof Error ? error.message : "Invoice payment start failed";
    const status = message === "Invoice not found" ? 404 : 400;
    return NextResponse.json({ error: message }, { status });
  }
}
