import "server-only";

import {
  computeRentalCustomerCreditControlSummary,
  type RentalCustomerCreditControlSummary,
} from "@/lib/rental/credit-control/db-rental-credit-control";
import { dbRentalCustomerRepo } from "@/lib/rental/customers/db-rental-customer-repo";
import { dbPaymentRepo } from "@/lib/rental/invoices/db-payment-repo";
import type { InvoicePaymentStatus } from "@/lib/rental/invoices/types";
import type { RentalCustomer } from "@/lib/rental/orders/types";
import { supabaseAdmin } from "@/lib/supabase/server";

const ORDERS_TABLE = process.env.SUPABASE_RENTAL_ORDERS_TABLE ?? "rental_orders";
const INVOICE_TABLE = process.env.SUPABASE_INVOICES_TABLE ?? "rental_invoices";
const INVOICE_PAYMENTS_TABLE = process.env.SUPABASE_INVOICE_PAYMENTS_TABLE ?? "rental_invoice_payments";
const INVOICE_EMAILS_TABLE = process.env.SUPABASE_INVOICE_EMAILS_TABLE ?? "rental_invoice_emails";
const PAYMENT_SESSIONS_TABLE =
  process.env.SUPABASE_RENTAL_ORDER_PAYMENT_SESSIONS_TABLE ?? "rental_order_payment_sessions";

type OrderOverviewRow = {
  id: string;
  customer_id: string | null;
  equipment_title: string;
  qty: number;
  start_date: string;
  end_date: string;
  created_at: string;
};

type OrderSessionRow = {
  order_id: string;
  status: "pending" | "paid" | "failed" | "expired" | "cancelled";
  created_at: string;
};

type InvoiceOverviewRow = {
  id: string;
  order_id: string;
  invoice_no: string | null;
  status: "draft" | "issued" | "void";
  issue_date: string | null;
  due_date: string | null;
  total_incl_gst_cents: number | null;
  created_at: string;
};

type PaymentOverviewRow = {
  id: string;
  invoice_id: string;
  amount_cents: number;
  paid_at: string;
  method: string | null;
  reference: string | null;
  created_at: string;
};

type EmailOverviewRow = {
  id: string;
  invoice_id: string;
  type: "sent" | "resent" | "reminder" | "receipt";
  to: string;
  subject: string;
  sent_at: string;
};

export type RentalCustomerRecentOrder = {
  id: string;
  equipmentSummary: string;
  rentalStart: string;
  rentalEnd: string;
  orderStatus: string;
  createdAt: string;
};

export type RentalCustomerRecentInvoice = {
  id: string;
  invoiceNo?: string;
  issueDate?: string;
  status: "draft" | "issued" | "void";
  totalInclGstCents: number;
  paymentStatus: InvoicePaymentStatus;
  dueDate?: string;
};

export type RentalCustomerRecentPayment = {
  id: string;
  paidAt: string;
  amountCents: number;
  method?: string;
  reference?: string;
  invoiceId: string;
  invoiceNo?: string;
  createdAt: string;
};

export type RentalCustomerEmailEvent = {
  id: string;
  invoiceId: string;
  invoiceNo?: string;
  type: "sent" | "resent" | "reminder" | "receipt";
  recipient: string;
  subject: string;
  createdAt: string;
};

export type RentalCustomerFinancialSummary = {
  totalInvoices: number;
  totalPaidCents: number;
  outstandingBalanceCents: number;
  overdueInvoicesCount: number;
};

export type { RentalCustomerCreditControlSummary } from "@/lib/rental/credit-control/db-rental-credit-control";

export type RentalCustomerOverview = {
  customer: RentalCustomer;
  recentOrders: RentalCustomerRecentOrder[];
  recentInvoices: RentalCustomerRecentInvoice[];
  recentPayments: RentalCustomerRecentPayment[];
  emailEvents: RentalCustomerEmailEvent[];
  financialSummary: RentalCustomerFinancialSummary;
  creditControl: RentalCustomerCreditControlSummary;
};

function deriveOrderStatus(input: {
  latestSessionStatus?: OrderSessionRow["status"];
  hasInvoice: boolean;
}): string {
  switch (input.latestSessionStatus) {
    case "paid":
      return "Paid";
    case "pending":
      return "Payment Pending";
    case "failed":
      return "Payment Failed";
    case "expired":
      return "Payment Expired";
    case "cancelled":
      return "Payment Cancelled";
    default:
      return input.hasInvoice ? "Invoiced" : "Booked";
  }
}

export async function loadRentalCustomerOverview(customerId: string): Promise<RentalCustomerOverview> {
  const customer = await dbRentalCustomerRepo.getById(customerId);
  if (!customer) throw new Error("Customer not found");

  const supabase = supabaseAdmin();
  const recentOrderLimit = 12;
  const recentInvoiceLimit = 12;
  const recentPaymentLimit = 12;
  const recentEmailLimit = 10;

  const { data: recentOrdersData, error: recentOrdersError } = await supabase
    .from(ORDERS_TABLE)
    .select("id,customer_id,equipment_title,qty,start_date,end_date,created_at")
    .eq("customer_id", customerId)
    .order("created_at", { ascending: false })
    .limit(recentOrderLimit);
  if (recentOrdersError) throw new Error(`Customer recent orders failed: ${recentOrdersError.message}`);

  const { data: allOrderIdsData, error: allOrderIdsError } = await supabase
    .from(ORDERS_TABLE)
    .select("id")
    .eq("customer_id", customerId);
  if (allOrderIdsError) throw new Error(`Customer order ids failed: ${allOrderIdsError.message}`);

  const recentOrders = (recentOrdersData ?? []) as unknown as OrderOverviewRow[];
  const allOrderIds = ((allOrderIdsData ?? []) as Array<{ id: string }>).map((row) => row.id);

  if (!allOrderIds.length) {
    return {
      customer,
      recentOrders: [],
      recentInvoices: [],
      recentPayments: [],
      emailEvents: [],
      financialSummary: {
        totalInvoices: 0,
        totalPaidCents: 0,
        outstandingBalanceCents: 0,
        overdueInvoicesCount: 0,
      },
      creditControl: await computeRentalCustomerCreditControlSummary({
        customer,
        invoices: [],
      }),
    };
  }

  const [sessionsRes, invoicesRes] = await Promise.all([
    supabase
      .from(PAYMENT_SESSIONS_TABLE)
      .select("order_id,status,created_at")
      .in("order_id", allOrderIds)
      .order("created_at", { ascending: false }),
    supabase
      .from(INVOICE_TABLE)
      .select("id,order_id,invoice_no,status,issue_date,due_date,total_incl_gst_cents,created_at")
      .in("order_id", allOrderIds)
      .order("created_at", { ascending: false }),
  ]);

  if (sessionsRes.error) throw new Error(`Customer payment sessions failed: ${sessionsRes.error.message}`);
  if (invoicesRes.error) throw new Error(`Customer invoices failed: ${invoicesRes.error.message}`);

  const sessions = (sessionsRes.data ?? []) as unknown as OrderSessionRow[];
  const allInvoices = (invoicesRes.data ?? []) as unknown as InvoiceOverviewRow[];

  const latestSessionByOrderId = new Map<string, OrderSessionRow>();
  for (const session of sessions) {
    if (!latestSessionByOrderId.has(session.order_id)) {
      latestSessionByOrderId.set(session.order_id, session);
    }
  }

  const invoiceByOrderId = new Map<string, InvoiceOverviewRow>();
  for (const invoice of allInvoices) {
    if (!invoiceByOrderId.has(invoice.order_id)) {
      invoiceByOrderId.set(invoice.order_id, invoice);
    }
  }

  const totalsByInvoiceId = await dbPaymentRepo.listTotalsByInvoiceIds(
    allInvoices.map((invoice) => ({
      id: invoice.id,
      dueDate: invoice.due_date ?? undefined,
      totalInclGstCents: Number(invoice.total_incl_gst_cents ?? 0),
    }))
  );

  const recentInvoices = allInvoices.slice(0, recentInvoiceLimit).map((invoice) => ({
    id: invoice.id,
    invoiceNo: invoice.invoice_no ?? undefined,
    issueDate: invoice.issue_date ?? undefined,
    status: invoice.status,
    totalInclGstCents: Number(invoice.total_incl_gst_cents ?? 0),
    paymentStatus: totalsByInvoiceId[invoice.id]?.status ?? "unpaid",
    dueDate: invoice.due_date ?? undefined,
  }));

  const invoiceIds = allInvoices.map((invoice) => invoice.id);
  const invoiceNoById = new Map(allInvoices.map((invoice) => [invoice.id, invoice.invoice_no ?? undefined]));

  let recentPayments: RentalCustomerRecentPayment[] = [];
  let emailEvents: RentalCustomerEmailEvent[] = [];

  if (invoiceIds.length) {
    const [paymentsRes, emailsRes] = await Promise.all([
      supabase
        .from(INVOICE_PAYMENTS_TABLE)
        .select("id,invoice_id,amount_cents,paid_at,method,reference,created_at")
        .in("invoice_id", invoiceIds)
        .order("paid_at", { ascending: false })
        .limit(recentPaymentLimit),
      supabase
        .from(INVOICE_EMAILS_TABLE)
        .select("id,invoice_id,type,to,subject,sent_at")
        .in("invoice_id", invoiceIds)
        .order("sent_at", { ascending: false })
        .limit(recentEmailLimit),
    ]);

    if (paymentsRes.error) throw new Error(`Customer payments failed: ${paymentsRes.error.message}`);
    if (emailsRes.error) throw new Error(`Customer email events failed: ${emailsRes.error.message}`);

    recentPayments = ((paymentsRes.data ?? []) as unknown as PaymentOverviewRow[]).map((payment) => ({
      id: payment.id,
      paidAt: payment.paid_at,
      amountCents: Number(payment.amount_cents ?? 0),
      method: payment.method ?? undefined,
      reference: payment.reference ?? undefined,
      invoiceId: payment.invoice_id,
      invoiceNo: invoiceNoById.get(payment.invoice_id),
      createdAt: payment.created_at,
    }));

    emailEvents = ((emailsRes.data ?? []) as unknown as EmailOverviewRow[]).map((event) => ({
      id: event.id,
      invoiceId: event.invoice_id,
      invoiceNo: invoiceNoById.get(event.invoice_id),
      type: event.type,
      recipient: event.to,
      subject: event.subject,
      createdAt: event.sent_at,
    }));
  }

  const financialSummary = allInvoices.reduce<RentalCustomerFinancialSummary>(
    (summary, invoice) => {
      const totals = totalsByInvoiceId[invoice.id];
      const totalPaid = totals?.paidCents ?? 0;
      const balance = totals?.balanceCents ?? Math.max(0, Number(invoice.total_incl_gst_cents ?? 0));
      return {
        totalInvoices: summary.totalInvoices + 1,
        totalPaidCents: summary.totalPaidCents + totalPaid,
        outstandingBalanceCents: summary.outstandingBalanceCents + balance,
        overdueInvoicesCount: summary.overdueInvoicesCount + (totals?.status === "overdue" ? 1 : 0),
      };
    },
    {
      totalInvoices: 0,
      totalPaidCents: 0,
      outstandingBalanceCents: 0,
      overdueInvoicesCount: 0,
    }
  );

  const creditControl = await computeRentalCustomerCreditControlSummary({
    customer,
    invoices: allInvoices.map((invoice) => ({
      id: invoice.id,
      status: invoice.status,
      dueDate: invoice.due_date ?? undefined,
      totalInclGstCents: Number(invoice.total_incl_gst_cents ?? 0),
    })),
  });

  return {
    customer,
    recentOrders: recentOrders.map((order) => ({
      id: order.id,
      equipmentSummary: `${order.equipment_title} x${order.qty}`,
      rentalStart: order.start_date,
      rentalEnd: order.end_date,
      orderStatus: deriveOrderStatus({
        latestSessionStatus: latestSessionByOrderId.get(order.id)?.status,
        hasInvoice: invoiceByOrderId.has(order.id),
      }),
      createdAt: order.created_at,
    })),
    recentInvoices,
    recentPayments,
    emailEvents,
    financialSummary,
    creditControl,
  };
}
