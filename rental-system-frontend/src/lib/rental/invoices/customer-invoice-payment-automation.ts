import "server-only";

import { dbInvoiceRepo } from "@/lib/rental/invoices/db-invoice-repo";
import { dbPaymentRepo } from "@/lib/rental/invoices/db-payment-repo";
import { dbOrderPaymentSessionRepo } from "@/lib/rental/orders/db-order-payment-session-repo";
import type { RentalOrderPaymentSession } from "@/lib/rental/orders/types";

type CustomerInvoicePaymentAutomationResult = {
  sessionId: string;
  invoiceId: string;
  invoicePaymentId: string;
  allocationId: string;
};

function stageError(stage: string, error: unknown) {
  const message = error instanceof Error ? error.message : "unknown error";
  return new Error(`${stage}: ${message}`);
}

function getWebhookString(payload: Record<string, unknown> | undefined, key: string) {
  const direct = payload?.[key];
  if (typeof direct === "string" && direct.trim()) return direct.trim();

  const webhook = payload?.webhook;
  if (webhook && typeof webhook === "object" && !Array.isArray(webhook)) {
    const value = (webhook as Record<string, unknown>)[key];
    if (typeof value === "string" && value.trim()) return value.trim();
  }

  return "";
}

function getStalePaymentLinkReason(payload: Record<string, unknown> | undefined) {
  const dedupeReason = String(payload?.dedupeReason ?? "").trim();
  if (dedupeReason.includes("customer_invoice")) {
    return "stale_customer_invoice_payment_link";
  }

  const supersededAt = String(payload?.supersededAt ?? "").trim();
  if (supersededAt) {
    return "stale_customer_invoice_payment_link";
  }

  const stalePaymentLink = payload?.stalePaymentLink;
  if (!stalePaymentLink || typeof stalePaymentLink !== "object" || Array.isArray(stalePaymentLink)) {
    return "";
  }

  const status = String((stalePaymentLink as Record<string, unknown>).status ?? "").trim();
  if (!status) return "stale_customer_invoice_payment_link";
  if (
    status === "active_pending_amount_mismatch" ||
    status === "inactive_provider_amount_mismatch" ||
    status === "paid_amount_mismatch" ||
    status === "provider_status_check_failed"
  ) {
    return "stale_customer_invoice_payment_link";
  }

  return "";
}

async function markManualReview(input: {
  session: RentalOrderPaymentSession;
  invoiceId: string;
  reason: string;
  balanceCents: number;
}) {
  const existingAutomation = input.session.webhookPayload?.automation;
  if (
    existingAutomation &&
    typeof existingAutomation === "object" &&
    !Array.isArray(existingAutomation) &&
    (existingAutomation as Record<string, unknown>).status === "manual_review" &&
    (existingAutomation as Record<string, unknown>).reason === input.reason
  ) {
    return;
  }

  const reviewedAt = new Date().toISOString();
  console.warn("[customer-invoice-payment] paid session requires manual review", {
    invoiceId: input.invoiceId,
    paymentSessionId: input.session.id,
    paymentMode: "customer_invoice",
    reason: input.reason,
    sessionAmountCents: input.session.amountCents,
    balanceCents: input.balanceCents,
  });

  await dbOrderPaymentSessionRepo.update(input.session.id, {
    invoiceId: input.invoiceId,
    webhookPayload: {
      ...(input.session.webhookPayload ?? {}),
      automation: {
        status: "manual_review",
        reason: input.reason,
        reviewedAt,
        sessionAmountCents: input.session.amountCents,
        balanceCents: input.balanceCents,
        unappliedAmountCents: input.session.amountCents,
      },
    },
  });
}

async function markApplied(input: {
  session: RentalOrderPaymentSession;
  invoiceId: string;
  invoicePaymentId: string;
  appliedAmountCents: number;
}) {
  await dbOrderPaymentSessionRepo.update(input.session.id, {
    invoiceId: input.invoiceId,
    invoicePaymentId: input.invoicePaymentId,
    invoiceAppliedAt: input.session.invoiceAppliedAt ?? new Date().toISOString(),
    webhookPayload: {
      ...(input.session.webhookPayload ?? {}),
      paymentMode: "customer_invoice",
      invoiceId: input.invoiceId,
      automation: {
        status: "applied",
        appliedAmountCents: input.appliedAmountCents,
        unappliedAmountCents: Math.max(input.session.amountCents - input.appliedAmountCents, 0),
      },
    },
  });
}

export async function processPaidCustomerInvoiceSession(
  paymentSessionId: string
): Promise<CustomerInvoicePaymentAutomationResult | null> {
  const session = await dbOrderPaymentSessionRepo.get(paymentSessionId);
  if (!session || session.status !== "paid") return null;

  const paymentMode = String(session.webhookPayload?.paymentMode ?? "").trim();
  if (paymentMode !== "customer_invoice") return null;

  const invoiceId =
    String(session.webhookPayload?.invoiceId ?? "").trim() || session.invoiceId?.trim() || "";
  if (!invoiceId) throw new Error("Linked invoice not found for customer invoice payment session");

  const invoice = await dbInvoiceRepo.get(invoiceId);
  if (!invoice) throw new Error("Invoice not found");

  const existingPayment = await dbPaymentRepo.findBySourcePaymentSessionId(session.id);
  if (existingPayment) {
    const paymentResult = await dbPaymentRepo.recordPaymentForCheckoutSession({
      invoiceId: invoice.id,
      sourcePaymentSessionId: session.id,
      amountCents: existingPayment.amountCents,
      paidAt: session.paidAt,
      method: "HitPay",
      reference:
        getWebhookString(session.webhookPayload, "reference_number") ||
        session.providerReferenceNumber ||
        session.providerPaymentRequestId ||
        session.id,
      notes: "Customer portal invoice payment via HitPay",
    });
    await markApplied({
      session,
      invoiceId: invoice.id,
      invoicePaymentId: paymentResult.payment.id,
      appliedAmountCents: paymentResult.payment.amountCents,
    });
    return {
      sessionId: session.id,
      invoiceId: invoice.id,
      invoicePaymentId: paymentResult.payment.id,
      allocationId: paymentResult.allocation.id,
    };
  }

  const stalePaymentLinkReason = getStalePaymentLinkReason(session.webhookPayload);
  if (stalePaymentLinkReason) {
    const totals = await dbPaymentRepo.getTotals(invoice.id);
    await markManualReview({
      session,
      invoiceId: invoice.id,
      reason: stalePaymentLinkReason,
      balanceCents: totals.balanceCents,
    });
    return null;
  }

  if (invoice.status !== "issued") throw new Error("Invoice must be issued before payment can be applied");

  const totals = await dbPaymentRepo.getTotals(invoice.id);
  if (totals.balanceCents <= 0) {
    await markManualReview({
      session,
      invoiceId: invoice.id,
      reason: "invoice_already_paid",
      balanceCents: totals.balanceCents,
    });
    return null;
  }

  if (session.amountCents !== totals.balanceCents) {
    await markManualReview({
      session,
      invoiceId: invoice.id,
      reason: "session_amount_mismatch",
      balanceCents: totals.balanceCents,
    });
    return null;
  }

  let paymentResult;
  try {
    paymentResult = await dbPaymentRepo.recordPaymentForCheckoutSession({
      invoiceId: invoice.id,
      sourcePaymentSessionId: session.id,
      amountCents: session.amountCents,
      paidAt: session.paidAt,
      method: "HitPay",
      reference:
        getWebhookString(session.webhookPayload, "reference_number") ||
        session.providerReferenceNumber ||
        session.providerPaymentRequestId ||
        session.id,
      notes: "Customer portal invoice payment via HitPay",
    });
  } catch (error) {
    throw stageError("invoice_payment_mapping", error);
  }

  try {
    await markApplied({
      session,
      invoiceId: invoice.id,
      invoicePaymentId: paymentResult.payment.id,
      appliedAmountCents: session.amountCents,
    });
  } catch (error) {
    throw stageError("payment_session_update", error);
  }

  return {
    sessionId: session.id,
    invoiceId: invoice.id,
    invoicePaymentId: paymentResult.payment.id,
    allocationId: paymentResult.allocation.id,
  };
}
