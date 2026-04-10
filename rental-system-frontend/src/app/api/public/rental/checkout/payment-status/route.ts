import { NextResponse } from "next/server";

import { dbRentalDepositRepo } from "@/lib/rental/deposits/db-rental-deposit-repo";
import { processPaidCheckoutSession } from "@/lib/rental/invoices/checkout-invoice-automation";
import { dbInvoiceRepo } from "@/lib/rental/invoices/db-invoice-repo";
import { dbOrderRepo } from "@/lib/rental/orders/db-order-repo";
import { dbOrderPaymentSessionRepo } from "@/lib/rental/orders/db-order-payment-session-repo";
import { fetchHitPayPaymentRequest } from "@/lib/rental/orders/hitpay";
import type { RentalOrderPaymentSession } from "@/lib/rental/orders/types";

export const runtime = "nodejs";

function requireCheckoutEnv() {
  const required = ["SUPABASE_URL", "SUPABASE_SERVICE_ROLE_KEY"] as const;
  const missing = required.filter((name) => !process.env[name]);
  if (missing.length) {
    throw new Error(`Missing required env vars: ${missing.join(", ")}`);
  }
}

function normalizePaymentSession(session: RentalOrderPaymentSession | null) {
  if (!session) return { paymentSession: null, normalizedFromEvidence: false };
  if (session.status !== "pending") {
    return { paymentSession: session, normalizedFromEvidence: false };
  }

  const hasSuccessfulEvidence = Boolean(
    session.invoiceAppliedAt || session.invoicePaymentId || session.invoiceEmailSentAt
  );

  if (!hasSuccessfulEvidence) {
    return { paymentSession: session, normalizedFromEvidence: false };
  }

  return {
    paymentSession: {
      ...session,
      status: "paid",
      paidAt: session.paidAt ?? session.invoiceAppliedAt ?? session.invoiceEmailSentAt,
    },
    normalizedFromEvidence: true,
  };
}

function describeError(error: unknown) {
  return error instanceof Error ? error.message : "unknown error";
}

function shouldRecoverPaidCheckoutAutomation(session: RentalOrderPaymentSession) {
  return session.status === "paid" && (!session.invoiceAppliedAt || !session.invoiceEmailSentAt);
}

async function refreshCheckoutPaymentSession(session: RentalOrderPaymentSession) {
  if (session.provider !== "hitpay" || !session.providerPaymentRequestId) {
    return session;
  }

  const providerState = await fetchHitPayPaymentRequest(session.providerPaymentRequestId);
  if (
    providerState.status === session.status &&
    (providerState.paidAt ?? "") === (session.paidAt ?? "") &&
    (providerState.referenceNumber || "") === (session.providerReferenceNumber || "")
  ) {
    return session;
  }

  console.info("[checkout-payment-status] refreshed payment session from provider", {
    sessionId: session.id,
    orderId: session.orderId,
    previousStatus: session.status,
    providerStatus: providerState.status,
    hadPaidAt: Boolean(session.paidAt),
    providerPaidAt: providerState.paidAt ?? null,
  });

  return dbOrderPaymentSessionRepo.update(session.id, {
    providerReferenceNumber: providerState.referenceNumber || session.providerReferenceNumber,
    status: providerState.status,
    webhookPayload: {
      ...(session.webhookPayload ?? {}),
      providerStatusCheck: {
        checkedAt: new Date().toISOString(),
        status: providerState.status,
        paidAt: providerState.paidAt ?? null,
      },
    },
    paidAt:
      providerState.status === "paid"
        ? providerState.paidAt ?? session.paidAt ?? new Date().toISOString()
        : session.paidAt,
  });
}

async function reconcileCheckoutSession(session: RentalOrderPaymentSession) {
  let nextSession = session;

  if (session.status === "pending") {
    try {
      nextSession = await refreshCheckoutPaymentSession(session);
    } catch (error) {
      console.error("[checkout-payment-status] provider refresh failed", {
        sessionId: session.id,
        orderId: session.orderId,
        provider: session.provider,
        error: describeError(error),
      });
    }
  }

  if (shouldRecoverPaidCheckoutAutomation(nextSession)) {
    try {
      console.info("[checkout-payment-status] attempting paid checkout recovery", {
        sessionId: nextSession.id,
        orderId: nextSession.orderId,
        invoiceAppliedAt: nextSession.invoiceAppliedAt ?? null,
        invoiceEmailSentAt: nextSession.invoiceEmailSentAt ?? null,
      });
      await processPaidCheckoutSession(nextSession.id);
      const refreshed = await dbOrderPaymentSessionRepo.get(nextSession.id);
      if (refreshed) {
        nextSession = refreshed;
      }
    } catch (error) {
      console.error("[checkout-payment-status] paid checkout recovery failed", {
        sessionId: nextSession.id,
        orderId: nextSession.orderId,
        error: describeError(error),
      });
    }
  }

  return nextSession;
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

      const reconciledSession = await reconcileCheckoutSession(session);
      const order = await dbOrderRepo.get(reconciledSession.orderId);
      const invoice = order ? await dbInvoiceRepo.findActiveByOrderId(order.id) : null;
      const depositSummary = order ? await dbRentalDepositRepo.getSummaryByOrderId(order.id) : null;
      const normalized = normalizePaymentSession(reconciledSession);
      return NextResponse.json({
        order,
        paymentSession: normalized.paymentSession,
        invoice,
        depositSummary,
        normalizedFromEvidence: normalized.normalizedFromEvidence,
      });
    }

    const order = await dbOrderRepo.get(orderId);
    if (!order) {
      return NextResponse.json({ error: "Order not found" }, { status: 404 });
    }

    const invoice = await dbInvoiceRepo.findActiveByOrderId(order.id);
    const depositSummary = await dbRentalDepositRepo.getSummaryByOrderId(order.id);
    return NextResponse.json({
      order,
      paymentSession: null,
      invoice,
      depositSummary,
      normalizedFromEvidence: false,
    });
  } catch (e) {
    const message = e instanceof Error ? e.message : "Payment status read failed";
    return NextResponse.json({ error: message }, { status: 400 });
  }
}
