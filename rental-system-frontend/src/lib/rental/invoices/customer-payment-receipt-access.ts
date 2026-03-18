import "server-only";

import { dbInvoiceRepo } from "@/lib/rental/invoices/db-invoice-repo";
import { dbPaymentRepo } from "@/lib/rental/invoices/db-payment-repo";
import type { Invoice, InvoicePayment, InvoicePaymentTotals } from "@/lib/rental/invoices/types";
import { dbOrderRepo } from "@/lib/rental/orders/db-order-repo";

export type CustomerPaymentReceiptDetail = {
  invoice: Invoice;
  payment: InvoicePayment;
  paymentTotals: InvoicePaymentTotals;
};

export async function loadCustomerPaymentReceiptDetail(
  customerId: string,
  paymentId: string
): Promise<CustomerPaymentReceiptDetail> {
  const payment = await dbPaymentRepo.getById(paymentId);
  if (!payment) throw new Error("Payment not found");

  const invoice = await dbInvoiceRepo.get(payment.invoiceId);
  if (!invoice) throw new Error("Payment not found");

  const order = await dbOrderRepo.get(invoice.orderId);
  const orderCustomerId = order?.customerId ?? order?.customerSnapshot?.customerId;
  if (!order || orderCustomerId !== customerId) {
    throw new Error("Payment not found");
  }

  const paymentTotals = await dbPaymentRepo.getTotals(invoice.id);

  return {
    invoice,
    payment,
    paymentTotals,
  };
}
