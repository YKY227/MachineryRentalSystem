import { NextResponse } from "next/server";

import {
  assertCustomer,
  customerUnauthorizedResponse,
  isCustomerUnauthorized,
} from "@/lib/auth/customer";
import { loadCustomerInvoiceDetail } from "@/lib/rental/invoices/customer-invoice-access";
import { dbOrderPaymentSessionRepo } from "@/lib/rental/orders/db-order-payment-session-repo";
import { createHitPayPaymentRequest, fetchHitPayPaymentRequest } from "@/lib/rental/orders/hitpay";
import type { RentalOrderPaymentSession } from "@/lib/rental/orders/types";

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

function getCustomerInvoiceReturnUrl(invoiceId: string, sessionId: string) {
  const baseUrl = appBaseUrl();
  if (!baseUrl) throw new Error("Missing env: APP_BASE_URL");
  const query = new URLSearchParams({
    payment: "submitted",
    sessionId,
  });
  return `${baseUrl}/rental/account/invoices/${encodeURIComponent(invoiceId)}?${query.toString()}`;
}

function isUniqueConflict(error: unknown) {
  return error instanceof Error && error.message.includes("duplicate key");
}

function appBaseUrl() {
  return (process.env.APP_BASE_URL ?? process.env.NEXT_PUBLIC_APP_URL ?? "").replace(/\/+$/, "");
}

function isReusablePendingSession(session: Awaited<ReturnType<typeof dbOrderPaymentSessionRepo.get>>) {
  return Boolean(session?.providerPaymentRequestId && session.redirectUrl);
}

function pendingSessionResponse(message: string) {
  return NextResponse.json({ error: message }, { status: 409 });
}

function mergeStalePaymentLinkPayload(input: {
  session: RentalOrderPaymentSession;
  reason: string;
  currentAmountCents: number;
  providerStatus?: RentalOrderPaymentSession["status"];
}) {
  return {
    ...(input.session.webhookPayload ?? {}),
    stalePaymentLink: {
      status: input.reason,
      detectedAt: new Date().toISOString(),
      previousAmountCents: input.session.amountCents,
      currentAmountCents: input.currentAmountCents,
      providerStatus: input.providerStatus ?? null,
      message: "Customer invoice payment link amount no longer matches the invoice balance.",
    },
  };
}

async function resolveExistingPendingCustomerInvoiceSession(input: {
  session: RentalOrderPaymentSession | null;
  invoiceId: string;
  amountCents: number;
  currency: string;
}) {
  const { session, invoiceId, amountCents, currency } = input;
  if (!session) return null;

  const sameAmount = session.amountCents === amountCents && session.currency === currency;
  if (sameAmount && isReusablePendingSession(session)) {
    console.info("[customer-invoice-pay] reusing pending payment session", {
      invoiceId,
      paymentSessionId: session.id,
      paymentMode: "customer_invoice",
      amountCents,
    });
    return NextResponse.json({
      paymentSession: session,
      redirectUrl: session.redirectUrl,
      amountCents,
      reused: true,
    });
  }

  if (sameAmount) {
    console.info("[customer-invoice-pay] pending payment session still initializing", {
      invoiceId,
      paymentSessionId: session.id,
      paymentMode: "customer_invoice",
      amountCents,
    });
    return pendingSessionResponse("Payment request is still being prepared. Please retry shortly.");
  }

  if (!session.providerPaymentRequestId) {
    console.warn("[customer-invoice-pay] conflicting pending payment session still initializing", {
      invoiceId,
      paymentSessionId: session.id,
      paymentMode: "customer_invoice",
      previousAmountCents: session.amountCents,
      currentAmountCents: amountCents,
    });
    return pendingSessionResponse(
      "A previous invoice payment request is still being prepared. Please retry shortly."
    );
  }

  let providerState;
  try {
    providerState = await fetchHitPayPaymentRequest(session.providerPaymentRequestId);
  } catch (error) {
    await dbOrderPaymentSessionRepo
      .update(session.id, {
        webhookPayload: mergeStalePaymentLinkPayload({
          session,
          reason: "provider_status_check_failed",
          currentAmountCents: amountCents,
        }),
      })
      .catch(() => null);

    console.warn("[customer-invoice-pay] conflicting payment link status check failed", {
      invoiceId,
      paymentSessionId: session.id,
      paymentMode: "customer_invoice",
      providerPaymentRequestId: session.providerPaymentRequestId,
      previousAmountCents: session.amountCents,
      currentAmountCents: amountCents,
      error: error instanceof Error ? error.message : "unknown error",
    });
    return pendingSessionResponse(
      "An earlier invoice payment link is still active. Please retry after it expires or contact support."
    );
  }

  if (providerState.status === "pending") {
    await dbOrderPaymentSessionRepo.update(session.id, {
      webhookPayload: mergeStalePaymentLinkPayload({
        session,
        reason: "active_pending_amount_mismatch",
        currentAmountCents: amountCents,
        providerStatus: providerState.status,
      }),
    });

    console.warn("[customer-invoice-pay] blocking replacement for active mismatched payment link", {
      invoiceId,
      paymentSessionId: session.id,
      paymentMode: "customer_invoice",
      providerPaymentRequestId: session.providerPaymentRequestId,
      previousAmountCents: session.amountCents,
      currentAmountCents: amountCents,
    });
    return pendingSessionResponse(
      "An earlier invoice payment link for a different amount is still active. Please retry after it expires or contact support."
    );
  }

  const nextPayload = mergeStalePaymentLinkPayload({
    session,
    reason:
      providerState.status === "paid"
        ? "paid_amount_mismatch"
        : "inactive_provider_amount_mismatch",
    currentAmountCents: amountCents,
    providerStatus: providerState.status,
  });

  const updatedSession = await dbOrderPaymentSessionRepo.update(session.id, {
    providerReferenceNumber: providerState.referenceNumber || session.providerReferenceNumber,
    status: providerState.status,
    paidAt:
      providerState.status === "paid"
        ? providerState.paidAt ?? session.paidAt ?? new Date().toISOString()
        : session.paidAt,
    webhookPayload: {
      ...nextPayload,
      providerStatusCheck: {
        checkedAt: new Date().toISOString(),
        source: "customer_invoice_pay_start",
        status: providerState.status,
        paidAt: providerState.paidAt ?? null,
      },
    },
  });

  if (updatedSession.status === "paid") {
    return pendingSessionResponse(
      "An earlier invoice payment link has already been paid and needs review before another payment can be started."
    );
  }

  console.info("[customer-invoice-pay] expired inactive mismatched pending payment session", {
    invoiceId,
    paymentSessionId: session.id,
    paymentMode: "customer_invoice",
    previousAmountCents: session.amountCents,
    currentAmountCents: amountCents,
    providerStatus: providerState.status,
  });

  return null;
}

async function createCustomerInvoicePaymentSession(input: {
  orderId: string;
  invoiceId: string;
  invoiceNo?: string;
  customerId: string;
  amountCents: number;
  currency: string;
}) {
  return dbOrderPaymentSessionRepo.create({
    orderId: input.orderId,
    provider: "hitpay",
    amountCents: input.amountCents,
    currency: input.currency,
    status: "pending",
    paymentPurpose: `Invoice payment ${input.invoiceNo ?? input.invoiceId}`,
    invoiceId: input.invoiceId,
    webhookPayload: {
      paymentMode: "customer_invoice",
      invoiceId: input.invoiceId,
      customerId: input.customerId,
      outstandingAmountCents: input.amountCents,
    },
  });
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
    const currency = detail.invoice.currency ?? "SGD";
    const existingSession = await dbOrderPaymentSessionRepo.findPendingCustomerInvoiceSessionForInvoice({
      invoiceId: detail.invoice.id,
      currency,
    });
    const existingResponse = await resolveExistingPendingCustomerInvoiceSession({
      session: existingSession,
      invoiceId: detail.invoice.id,
      amountCents,
      currency,
    });
    if (existingResponse) return existingResponse;

    async function createPendingSession() {
      return createCustomerInvoicePaymentSession({
        orderId: detail.order.id,
        invoiceId: detail.invoice.id,
        invoiceNo: detail.invoice.invoiceNo,
        customerId: customer.id,
        amountCents,
        currency,
      });
    }

    let session;
    try {
      session = await createPendingSession();
    } catch (error) {
      if (!isUniqueConflict(error)) throw error;

      const duplicate = await dbOrderPaymentSessionRepo.findPendingCustomerInvoiceSessionForInvoice({
        invoiceId: detail.invoice.id,
        currency,
      });
      const duplicateResponse = await resolveExistingPendingCustomerInvoiceSession({
        session: duplicate,
        invoiceId: detail.invoice.id,
        amountCents,
        currency,
      });
      if (duplicateResponse) return duplicateResponse;

      session = await createPendingSession();
    }

    console.info("[customer-invoice-pay] created pending payment session", {
      invoiceId: detail.invoice.id,
      paymentSessionId: session.id,
      paymentMode: "customer_invoice",
      amountCents,
    });

    try {
      const paymentRequest = await createHitPayPaymentRequest({
        amountCents,
        currency,
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
          paymentMode: "customer_invoice",
          invoiceId: detail.invoice.id,
          customerId: customer.id,
          outstandingAmountCents: amountCents,
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
