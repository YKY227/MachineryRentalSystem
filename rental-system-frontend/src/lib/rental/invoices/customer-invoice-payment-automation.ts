import "server-only";

import { dbInvoiceRepo } from "@/lib/rental/invoices/db-invoice-repo";
import { dbPaymentRepo } from "@/lib/rental/invoices/db-payment-repo";
import { dbOrderPaymentSessionRepo } from "@/lib/rental/orders/db-order-payment-session-repo";

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
  if (invoice.status !== "issued") throw new Error("Invoice must be issued before payment can be applied");

  const totals = await dbPaymentRepo.getTotals(invoice.id);
  if (totals.balanceCents <= 0) {
    return null;
  }

  const amountToApplyCents = Math.min(session.amountCents, totals.balanceCents);
  if (amountToApplyCents <= 0) {
    return null;
  }

  let paymentResult;
  try {
    paymentResult = await dbPaymentRepo.recordPaymentForCheckoutSession({
      invoiceId: invoice.id,
      sourcePaymentSessionId: session.id,
      amountCents: amountToApplyCents,
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
    await dbOrderPaymentSessionRepo.update(session.id, {
      invoiceId: invoice.id,
      invoicePaymentId: paymentResult.payment.id,
      invoiceAppliedAt: session.invoiceAppliedAt ?? new Date().toISOString(),
      webhookPayload: {
        ...(session.webhookPayload ?? {}),
        automation: {
          status: "applied",
          appliedAmountCents: amountToApplyCents,
          unappliedAmountCents: Math.max(session.amountCents - amountToApplyCents, 0),
        },
      },
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
