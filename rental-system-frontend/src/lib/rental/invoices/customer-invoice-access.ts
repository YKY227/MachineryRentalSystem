import "server-only";

import { dbRentalDepositRepo } from "@/lib/rental/deposits/db-rental-deposit-repo";
import { dbInvoiceRepo } from "@/lib/rental/invoices/db-invoice-repo";
import { dbPaymentRepo } from "@/lib/rental/invoices/db-payment-repo";
import type { Invoice, InvoicePayment, InvoicePaymentTotals } from "@/lib/rental/invoices/types";
import { dbOrderRepo } from "@/lib/rental/orders/db-order-repo";
import type { RentalOrder } from "@/lib/rental/orders/types";

export type CustomerInvoiceDetail = {
  invoice: Invoice;
  order: RentalOrder;
  payments: InvoicePayment[];
  paymentTotals: InvoicePaymentTotals;
  depositSummary: Awaited<ReturnType<typeof dbRentalDepositRepo.getSummaryByOrderId>>;
};

export async function loadCustomerInvoiceDetail(
  customerId: string,
  invoiceId: string
): Promise<CustomerInvoiceDetail> {
  const invoice = await dbInvoiceRepo.get(invoiceId);
  if (!invoice) throw new Error("Invoice not found");

  const order = await dbOrderRepo.get(invoice.orderId);
  const orderCustomerId = order?.customerId ?? order?.customerSnapshot?.customerId;
  if (!order || orderCustomerId !== customerId) {
    throw new Error("Invoice not found");
  }

  const [{ payments, totals }, depositSummary] = await Promise.all([
    dbPaymentRepo.listWithTotals(invoice.id),
    dbRentalDepositRepo.getSummaryByOrderId(order.id),
  ]);

  return {
    invoice,
    order,
    payments,
    paymentTotals: totals,
    depositSummary,
  };
}
