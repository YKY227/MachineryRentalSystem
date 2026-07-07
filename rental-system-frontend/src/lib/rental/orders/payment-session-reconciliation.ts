import "server-only";

import { confirmPaidRentalExtension } from "@/lib/rental/extensions/rental-extension-service";
import { processPaidCheckoutSession } from "@/lib/rental/invoices/checkout-invoice-automation";
import { processPaidCustomerInvoiceSession } from "@/lib/rental/invoices/customer-invoice-payment-automation";
import { dbOrderPaymentSessionRepo } from "@/lib/rental/orders/db-order-payment-session-repo";
import { fetchHitPayPaymentRequest } from "@/lib/rental/orders/hitpay";
import type { RentalOrderPaymentSession } from "@/lib/rental/orders/types";

export type PaymentSessionMode = "checkout" | "customer_invoice" | "order_extension";

type ReconcileSource =
  | "admin_reconcile"
  | "hitpay_webhook"
  | "checkout_status"
  | "customer_invoice_return"
  | "order_extension_return";

export type PaymentSessionReconcileResult = {
  paymentSession: RentalOrderPaymentSession;
  paymentMode: PaymentSessionMode;
  providerStatus?: RentalOrderPaymentSession["status"];
  automationPath?: "checkout" | "customer_invoice" | "order_extension";
  automationStatus: "not_paid" | "applied" | "already_applied" | "manual_review" | "failed" | "skipped";
  manualReviewReason?: string;
};

function describeError(error: unknown) {
  return error instanceof Error ? error.message : "unknown error";
}

function getAutomationStatus(session: RentalOrderPaymentSession | null) {
  const automation = session?.webhookPayload?.automation;
  if (!automation || typeof automation !== "object" || Array.isArray(automation)) return "";
  return String((automation as Record<string, unknown>).status ?? "").trim();
}

function getManualReviewReason(session: RentalOrderPaymentSession | null) {
  const automation = session?.webhookPayload?.automation;
  if (!automation || typeof automation !== "object" || Array.isArray(automation)) return "";
  return String((automation as Record<string, unknown>).reason ?? "").trim();
}

function getAutomationAction(session: RentalOrderPaymentSession | null) {
  const automation = session?.webhookPayload?.automation;
  if (!automation || typeof automation !== "object" || Array.isArray(automation)) return "";
  return String((automation as Record<string, unknown>).action ?? "").trim();
}

function isCheckoutWorkflowComplete(session: RentalOrderPaymentSession) {
  return Boolean(
    session.invoiceAppliedAt &&
      session.invoiceId &&
      session.invoicePaymentId &&
      session.invoiceEmailSentAt &&
      getAutomationStatus(session) === "applied"
  );
}

export function resolvePaymentSessionMode(session: RentalOrderPaymentSession): PaymentSessionMode {
  const paymentMode = String(session.webhookPayload?.paymentMode ?? "").trim();
  if (!paymentMode || paymentMode === "checkout") return "checkout";
  if (paymentMode === "customer_invoice" || paymentMode === "order_extension") return paymentMode;
  throw new Error(`Unsupported payment session mode: ${paymentMode}`);
}

export async function refreshPaymentSessionFromProvider(input: {
  session: RentalOrderPaymentSession;
  source: ReconcileSource;
}) {
  if (input.session.provider !== "hitpay" || !input.session.providerPaymentRequestId) {
    return {
      paymentSession: input.session,
      providerStatus: undefined,
    };
  }

  const providerState = await fetchHitPayPaymentRequest(input.session.providerPaymentRequestId);
  const nextSession = await dbOrderPaymentSessionRepo.update(input.session.id, {
    providerReferenceNumber: providerState.referenceNumber || input.session.providerReferenceNumber,
    status: providerState.status,
    paidAt:
      providerState.status === "paid"
        ? providerState.paidAt ?? input.session.paidAt ?? new Date().toISOString()
        : input.session.paidAt,
    webhookPayload: {
      ...(input.session.webhookPayload ?? {}),
      providerStatusCheck: {
        checkedAt: new Date().toISOString(),
        source: input.source,
        status: providerState.status,
        paidAt: providerState.paidAt ?? null,
      },
    },
  });

  console.info("[payment-session-reconcile] refreshed provider status", {
    paymentSessionId: input.session.id,
    paymentMode: resolvePaymentSessionMode(nextSession),
    source: input.source,
    previousStatus: input.session.status,
    providerStatus: providerState.status,
  });

  return {
    paymentSession: nextSession,
    providerStatus: providerState.status,
  };
}

export async function runPaymentSessionAutomation(input: {
  session: RentalOrderPaymentSession;
  source: ReconcileSource;
}): Promise<PaymentSessionReconcileResult> {
  const paymentMode = resolvePaymentSessionMode(input.session);
  if (input.session.status !== "paid") {
    return {
      paymentSession: input.session,
      paymentMode,
      automationStatus: "not_paid",
    };
  }

  const existingAutomationStatus = getAutomationStatus(input.session);
  if (existingAutomationStatus === "manual_review") {
    return {
      paymentSession: input.session,
      paymentMode,
      automationPath: paymentMode,
      automationStatus: "manual_review",
      manualReviewReason: getManualReviewReason(input.session),
    };
  }
  if (
    paymentMode === "customer_invoice" &&
    (input.session.invoiceAppliedAt || existingAutomationStatus === "applied")
  ) {
    return {
      paymentSession: input.session,
      paymentMode,
      automationPath: paymentMode,
      automationStatus: "already_applied",
    };
  }
  if (
    paymentMode === "checkout" &&
    isCheckoutWorkflowComplete(input.session)
  ) {
    return {
      paymentSession: input.session,
      paymentMode,
      automationPath: paymentMode,
      automationStatus: "already_applied",
    };
  }

  console.info("[payment-session-reconcile] running automation", {
    paymentSessionId: input.session.id,
    paymentMode,
    source: input.source,
    automationPath: paymentMode,
  });

  try {
    if (paymentMode === "customer_invoice") {
      await processPaidCustomerInvoiceSession(input.session.id);
    } else if (paymentMode === "order_extension") {
      await confirmPaidRentalExtension(input.session.id);
    } else {
      await processPaidCheckoutSession(input.session.id);
    }
  } catch (error) {
    console.error("[payment-session-reconcile] automation failed", {
      paymentSessionId: input.session.id,
      paymentMode,
      source: input.source,
      automationPath: paymentMode,
      error: describeError(error),
    });
    throw error;
  }

  const refreshed = (await dbOrderPaymentSessionRepo.get(input.session.id)) ?? input.session;
  const automationStatus = getAutomationStatus(refreshed);
  const automationAction = getAutomationAction(refreshed);
  const manualReviewReason = getManualReviewReason(refreshed);
  const resultStatus =
    automationStatus === "manual_review"
      ? "manual_review"
      : automationAction === "already_confirmed"
        ? "already_applied"
      : refreshed.invoiceAppliedAt || automationStatus === "applied"
        ? "applied"
        : "skipped";

  console.info("[payment-session-reconcile] automation completed", {
    paymentSessionId: refreshed.id,
    paymentMode,
    source: input.source,
    automationPath: paymentMode,
    automationStatus: resultStatus,
    manualReviewReason: manualReviewReason || undefined,
  });

  return {
    paymentSession: refreshed,
    paymentMode,
    automationPath: paymentMode,
    automationStatus: resultStatus,
    manualReviewReason: manualReviewReason || undefined,
  };
}

export async function reconcilePaymentSession(input: {
  sessionId: string;
  source: ReconcileSource;
  refreshProvider?: boolean;
  requireMode?: PaymentSessionMode;
}): Promise<PaymentSessionReconcileResult> {
  const session = await dbOrderPaymentSessionRepo.get(input.sessionId);
  if (!session) throw new Error("Payment session not found");

  const paymentMode = resolvePaymentSessionMode(session);
  if (input.requireMode && paymentMode !== input.requireMode) {
    throw new Error(`Payment session mode mismatch: expected ${input.requireMode}, got ${paymentMode}`);
  }

  let nextSession = session;
  let providerStatus: RentalOrderPaymentSession["status"] | undefined;
  if (input.refreshProvider ?? true) {
    const refreshed = await refreshPaymentSessionFromProvider({
      session,
      source: input.source,
    });
    nextSession = refreshed.paymentSession;
    providerStatus = refreshed.providerStatus;
  }

  const result = await runPaymentSessionAutomation({
    session: nextSession,
    source: input.source,
  });

  return {
    ...result,
    providerStatus,
  };
}
