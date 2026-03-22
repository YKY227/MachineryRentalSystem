import "server-only";

import { dbInvoiceRepo } from "@/lib/rental/invoices/db-invoice-repo";
import { dbPaymentRepo } from "@/lib/rental/invoices/db-payment-repo";
import { deliverInvoiceEmail } from "@/lib/rental/invoices/email-delivery";
import { dbRentalDepositRepo } from "@/lib/rental/deposits/db-rental-deposit-repo";
import { markAvailabilityHoldConsumed } from "@/lib/rental/holds/db-rental-availability-service";
import { dbOrderRepo } from "@/lib/rental/orders/db-order-repo";
import { sendNewOrderNotificationIfNeeded } from "@/lib/rental/orders/new-order-notification-service";
import { dbOrderPaymentSessionRepo } from "@/lib/rental/orders/db-order-payment-session-repo";

type CheckoutInvoiceAutomationResult = {
  sessionId: string;
  orderId: string;
  invoiceId: string;
  invoicePaymentId: string;
  allocationId: string;
  invoiceEmailSent: boolean;
};

function moneyFromCents(cents: number) {
  const v = Number.isFinite(cents) ? cents : 0;
  return new Intl.NumberFormat("en-SG", {
    style: "currency",
    currency: "SGD",
    minimumFractionDigits: 2,
    maximumFractionDigits: 2,
  }).format(v / 100);
}

function extractCustomerEmail(payload?: Record<string, unknown>) {
  const provider = payload?.provider as Record<string, unknown> | undefined;
  const webhook = payload?.webhook as Record<string, unknown> | undefined;

  const candidates = [
    provider?.email,
    provider?.customer_email,
    webhook?.email,
    webhook?.customer_email,
  ];

  for (const candidate of candidates) {
    if (typeof candidate === "string" && candidate.trim()) return candidate.trim();
  }
  return "";
}

function extractCustomerName(payload?: Record<string, unknown>) {
  const provider = payload?.provider as Record<string, unknown> | undefined;
  const webhook = payload?.webhook as Record<string, unknown> | undefined;

  const candidates = [
    provider?.name,
    provider?.customer_name,
    webhook?.name,
    webhook?.customer_name,
  ];

  for (const candidate of candidates) {
    if (typeof candidate === "string" && candidate.trim()) return candidate.trim();
  }
  return "";
}

function stageError(stage: string, error: unknown) {
  const message = error instanceof Error ? error.message : "unknown error";
  return new Error(`${stage}: ${message}`);
}

function logAutomationFailure(
  stage: string,
  context: Record<string, unknown>,
  error: unknown
) {
  console.error("[checkout-invoice-automation] stage failed", {
    stage,
    ...context,
    error: error instanceof Error ? error.message : "unknown error",
  });
}

export async function processPaidCheckoutSession(
  paymentSessionId: string
): Promise<CheckoutInvoiceAutomationResult | null> {
  const session = await dbOrderPaymentSessionRepo.get(paymentSessionId);
  if (!session || session.status !== "paid") return null;

  const order = await dbOrderRepo.get(session.orderId);
  if (!order) throw new Error("Linked rental order not found");

  let invoice;
  try {
    invoice = await dbInvoiceRepo.findActiveByOrderId(order.id);
    if (!invoice) {
      invoice = await dbInvoiceRepo.createDraftFromOrder({
        orderId: order.id,
        equipmentTitle: order.equipmentTitle,
        qty: order.qty,
        start: order.start,
        end: order.end,
        pricingSnapshot: order.pricingSnapshot,
      });
    }
  } catch (error) {
    logAutomationFailure("invoice_create_or_reuse", { paymentSessionId, orderId: order.id }, error);
    throw stageError("invoice_create_or_reuse", error);
  }

  const customerEmail = extractCustomerEmail(session.webhookPayload) || order.customerSnapshot?.email?.trim() || "";
  const customerName =
    extractCustomerName(session.webhookPayload) ||
    order.customerSnapshot?.contactName?.trim() ||
    order.customerSnapshot?.companyName?.trim() ||
    "";

  if (invoice.status === "draft") {
    try {
      invoice = await dbInvoiceRepo.updateDraft(invoice.id, {
        billTo: {
          name: customerName || invoice.billTo?.name || "Customer",
          contactName: order.customerSnapshot?.contactName?.trim() || invoice.billTo?.contactName,
          email: customerEmail || invoice.billTo?.email || "",
          addressLines: invoice.billTo?.addressLines?.length ? invoice.billTo.addressLines : ["-"],
        },
      });
    } catch (error) {
      logAutomationFailure(
        "invoice_update_draft",
        { paymentSessionId, orderId: order.id, invoiceId: invoice.id },
        error
      );
      throw stageError("invoice_update_draft", error);
    }

    try {
      invoice = await dbInvoiceRepo.issue(invoice.id);
    } catch (error) {
      logAutomationFailure("invoice_issue", { paymentSessionId, orderId: order.id, invoiceId: invoice.id }, error);
      throw stageError("invoice_issue", error);
    }
  }

  const invoiceAmountCents = Math.max(
    0,
    Math.min(session.amountCents, Math.round(Number(invoice.totalInclGstCents ?? 0)))
  );
  const depositAmountCents = Math.max(0, session.amountCents - invoiceAmountCents);

  let paymentResult;
  try {
    paymentResult = await dbPaymentRepo.recordPaymentForCheckoutSession({
      invoiceId: invoice.id,
      sourcePaymentSessionId: session.id,
      amountCents: invoiceAmountCents,
      paidAt: session.paidAt,
      method: "HitPay",
      reference: session.providerReferenceNumber || session.providerPaymentRequestId || session.id,
      notes: `Public checkout payment via ${session.provider}`,
    });
  } catch (error) {
    logAutomationFailure(
      "invoice_payment_mapping",
      { paymentSessionId, orderId: order.id, invoiceId: invoice.id },
      error
    );
    throw stageError("invoice_payment_mapping", error);
  }

  try {
    await dbRentalDepositRepo.recordCollectedCheckoutSessionDeposit({
      orderId: order.id,
      customerId: order.customerId,
      requiredAmountCents: Math.round(Number(order.pricingSnapshot?.deposit ?? 0) * 100),
      paymentSessionId: session.id,
      amountCents: depositAmountCents,
      invoiceId: invoice.id,
      invoicePaymentId: paymentResult.payment.id,
    });
  } catch (error) {
    logAutomationFailure(
      "deposit_accounting_update",
      { paymentSessionId, orderId: order.id, invoiceId: invoice.id },
      error
    );
    throw stageError("deposit_accounting_update", error);
  }

  const invoiceAppliedAt = session.invoiceAppliedAt ?? new Date().toISOString();
  try {
    await dbOrderPaymentSessionRepo.update(session.id, {
      invoiceId: invoice.id,
      invoicePaymentId: paymentResult.payment.id,
      invoiceAppliedAt,
    });
  } catch (error) {
    logAutomationFailure(
      "idempotency_marker_update_after_payment",
      {
        paymentSessionId,
        orderId: order.id,
        invoiceId: invoice.id,
        invoicePaymentId: paymentResult.payment.id,
        allocationId: paymentResult.allocation.id,
      },
      error
    );
    throw stageError("idempotency_marker_update_after_payment", error);
  }

  try {
    await sendNewOrderNotificationIfNeeded(order.id);
  } catch (error) {
    console.error("[checkout-invoice-automation] new order notification failed", {
      paymentSessionId,
      orderId: order.id,
      error: error instanceof Error ? error.message : "unknown error",
    });
  }

  if (session.invoiceEmailSentAt) {
    console.info("[checkout-invoice-automation] already marked invoice email sent", {
      paymentSessionId,
      orderId: order.id,
      invoiceId: invoice.id,
      invoicePaymentId: paymentResult.payment.id,
      allocationId: paymentResult.allocation.id,
    });
    return {
      sessionId: session.id,
      orderId: order.id,
      invoiceId: invoice.id,
      invoicePaymentId: paymentResult.payment.id,
      allocationId: paymentResult.allocation.id,
      invoiceEmailSent: true,
    };
  }

  if (!customerEmail && !invoice.billTo?.email) {
    console.warn("[checkout-invoice-automation] invoice email skipped due to missing recipient", {
      paymentSessionId,
      orderId: order.id,
      invoiceId: invoice.id,
    });
    return {
      sessionId: session.id,
      orderId: order.id,
      invoiceId: invoice.id,
      invoicePaymentId: paymentResult.payment.id,
      allocationId: paymentResult.allocation.id,
      invoiceEmailSent: false,
    };
  }

  let emails;
  try {
    emails = await dbInvoiceRepo.listEmails(invoice.id);
  } catch (error) {
    logAutomationFailure("invoice_email_history_read", { paymentSessionId, orderId: order.id, invoiceId: invoice.id }, error);
    throw stageError("invoice_email_history_read", error);
  }
  const alreadySent = emails.some((item) => item.type === "sent" || item.type === "resent");
  if (alreadySent) {
    const invoiceEmailSentAt = session.invoiceEmailSentAt ?? new Date().toISOString();
    try {
      await dbOrderPaymentSessionRepo.update(session.id, {
        invoiceId: invoice.id,
        invoicePaymentId: paymentResult.payment.id,
        invoiceEmailSentAt,
      });
    } catch (error) {
      logAutomationFailure(
        "idempotency_marker_update_after_existing_email",
        {
          paymentSessionId,
          orderId: order.id,
          invoiceId: invoice.id,
          invoicePaymentId: paymentResult.payment.id,
          allocationId: paymentResult.allocation.id,
        },
        error
      );
      throw stageError("idempotency_marker_update_after_existing_email", error);
    }
    return {
      sessionId: session.id,
      orderId: order.id,
      invoiceId: invoice.id,
      invoicePaymentId: paymentResult.payment.id,
      allocationId: paymentResult.allocation.id,
      invoiceEmailSent: true,
    };
  }

  const recipient = customerEmail || invoice.billTo?.email || "";
  if (!recipient) {
    console.warn("[checkout-invoice-automation] invoice email skipped after recipient resolution", {
      paymentSessionId,
      orderId: order.id,
      invoiceId: invoice.id,
    });
    return {
      sessionId: session.id,
      orderId: order.id,
      invoiceId: invoice.id,
      invoicePaymentId: paymentResult.payment.id,
      allocationId: paymentResult.allocation.id,
      invoiceEmailSent: false,
    };
  }

  const subject = `Tax Invoice ${invoice.invoiceNo ?? invoice.id}`;
  let delivery;
  try {
    delivery = await deliverInvoiceEmail({
      invoice,
      to: recipient,
      subject,
      html: `
        <div style="font-family:Arial,sans-serif; line-height:1.5">
          <p>Dear ${customerName || invoice.billTo?.name || "Customer"},</p>
          <p>Thank you for your payment. Please find attached your tax invoice <strong>${invoice.invoiceNo ?? invoice.id}</strong>.</p>
          <p><strong>Total Amount:</strong> ${moneyFromCents(invoice.totalInclGstCents)}</p>
          <p><strong>Invoice Amount Paid:</strong> ${moneyFromCents(paymentResult.totals.paidCents)}</p>
          <p><strong>Outstanding Balance:</strong> ${moneyFromCents(paymentResult.totals.balanceCents)}</p>
          ${
            depositAmountCents > 0
              ? `<p><strong>Refundable Deposit Held:</strong> ${moneyFromCents(depositAmountCents)}</p>`
              : ""
          }
          <p>We have attached the invoice PDF for your records.</p>
        </div>
      `,
    });
  } catch (error) {
    logAutomationFailure("invoice_email_send", { paymentSessionId, orderId: order.id, invoiceId: invoice.id }, error);
    throw stageError("invoice_email_send", error);
  }

  const sentAt = new Date().toISOString();
  try {
    await dbInvoiceRepo.createEmailEvent({
      invoiceId: invoice.id,
      type: "sent",
      to: recipient,
      subject,
      provider: delivery.provider,
      status: "sent",
      providerMessageId: delivery.providerMessageId ?? undefined,
      pdfSha256: delivery.pdf.sha256 ?? undefined,
      sentAt,
    });
    await dbInvoiceRepo.appendEmailLog(invoice.id, {
      type: "sent",
      to: recipient,
      subject,
      provider: delivery.provider,
      status: "sent",
      providerMessageId: delivery.providerMessageId ?? undefined,
      pdfSha256: delivery.pdf.sha256 ?? undefined,
    });
  } catch (error) {
    logAutomationFailure("invoice_email_log_write", { paymentSessionId, orderId: order.id, invoiceId: invoice.id }, error);
    throw stageError("invoice_email_log_write", error);
  }

  try {
    await dbOrderPaymentSessionRepo.update(session.id, {
      invoiceId: invoice.id,
      invoicePaymentId: paymentResult.payment.id,
      invoiceEmailSentAt: sentAt,
    });
  } catch (error) {
    logAutomationFailure(
      "idempotency_marker_update_after_email",
      {
        paymentSessionId,
        orderId: order.id,
        invoiceId: invoice.id,
        invoicePaymentId: paymentResult.payment.id,
        allocationId: paymentResult.allocation.id,
      },
      error
    );
    throw stageError("idempotency_marker_update_after_email", error);
  }

  try {
    await markAvailabilityHoldConsumed({
      checkoutReference: order.id,
      orderId: order.id,
      paymentSessionId: session.id,
      notes: "Checkout payment completed",
    });
  } catch (error) {
    logAutomationFailure(
      "availability_hold_consume",
      {
        paymentSessionId,
        orderId: order.id,
        invoiceId: invoice.id,
        invoicePaymentId: paymentResult.payment.id,
      },
      error
    );
    throw stageError("availability_hold_consume", error);
  }

  console.info("[checkout-invoice-automation] completed", {
    paymentSessionId,
    orderId: order.id,
    invoiceId: invoice.id,
    invoicePaymentId: paymentResult.payment.id,
    allocationId: paymentResult.allocation.id,
    recipient,
  });

  return {
    sessionId: session.id,
    orderId: order.id,
    invoiceId: invoice.id,
    invoicePaymentId: paymentResult.payment.id,
    allocationId: paymentResult.allocation.id,
    invoiceEmailSent: true,
  };
}


