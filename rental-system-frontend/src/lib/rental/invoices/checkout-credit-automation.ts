import "server-only";

import { dbRentalDepositRepo } from "@/lib/rental/deposits/db-rental-deposit-repo";
import { dbInvoiceRepo } from "@/lib/rental/invoices/db-invoice-repo";
import { sendIssuedInvoiceEmail } from "@/lib/rental/invoices/send-issued-invoice";
import { sendNewOrderNotificationIfNeeded } from "@/lib/rental/orders/new-order-notification-service";
import { dbOrderRepo } from "@/lib/rental/orders/db-order-repo";

type CreditCheckoutResult = {
  orderId: string;
  invoiceId: string;
  invoiceNo?: string;
  invoiceEmailSent: boolean;
};

export async function processCreditCheckoutOrder(orderId: string): Promise<CreditCheckoutResult> {
  const order = await dbOrderRepo.get(orderId);
  if (!order) throw new Error("Linked rental order not found");

  const customer = order.customerSnapshot;
  if (!customer?.email?.trim()) {
    throw new Error("Customer email is required for credit checkout invoicing");
  }

  let invoice = await dbInvoiceRepo.findActiveByOrderId(order.id);
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

  if (invoice.status === "draft") {
    invoice = await dbInvoiceRepo.updateDraft(invoice.id, {
      billTo: {
        name: customer.companyName.trim() || customer.contactName.trim() || "Customer",
        contactName: customer.contactName.trim() || undefined,
        email: customer.email.trim(),
        addressLines: invoice.billTo?.addressLines?.length ? invoice.billTo.addressLines : ["-"],
      },
    });
    invoice = await dbInvoiceRepo.issue(invoice.id);
  }

  await dbRentalDepositRepo.ensureOrderDeposit({
    orderId: order.id,
    customerId: order.customerId,
    requiredAmountCents: Math.round(Number(order.pricingSnapshot?.deposit ?? 0) * 100),
    sourceInvoiceId: invoice.id,
  });

  try {
    await sendNewOrderNotificationIfNeeded(order.id);
  } catch (error) {
    console.error("[checkout-credit-automation] new order notification failed", {
      orderId: order.id,
      error: error instanceof Error ? error.message : "unknown error",
    });
  }

  const emails = await dbInvoiceRepo.listEmails(invoice.id);
  const alreadySent = emails.some((item) => item.type === "sent" || item.type === "resent");
  if (alreadySent) {
    return {
      orderId: order.id,
      invoiceId: invoice.id,
      invoiceNo: invoice.invoiceNo,
      invoiceEmailSent: true,
    };
  }

  await sendIssuedInvoiceEmail({
    invoiceId: invoice.id,
    to: customer.email.trim(),
    subject: `Tax Invoice ${invoice.invoiceNo ?? invoice.id}`,
    message: `Dear ${customer.contactName.trim() || customer.companyName.trim() || "Customer"},\n\nPlease find attached your tax invoice ${invoice.invoiceNo ?? invoice.id}.\n\nThank you.`,
    mode: "send",
  });

  return {
    orderId: order.id,
    invoiceId: invoice.id,
    invoiceNo: invoice.invoiceNo,
    invoiceEmailSent: true,
  };
}


