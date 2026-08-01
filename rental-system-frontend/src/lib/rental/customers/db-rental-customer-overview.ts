import "server-only";

import {
  computeRentalCustomerCreditControlSummary,
  type RentalCustomerCreditControlSummary,
} from "@/lib/rental/credit-control/db-rental-credit-control";
import { dbRentalDamageAssessmentRepo } from "@/lib/rental/damage-assessments/db-rental-damage-assessment-repo";
import type {
  RentalCustomerDamageReviewStatus,
  RentalDamageAssessmentSummary,
} from "@/lib/rental/damage-assessments/types";
import { dbRentalCustomerRepo } from "@/lib/rental/customers/db-rental-customer-repo";
import { dbRentalDepositRepo } from "@/lib/rental/deposits/db-rental-deposit-repo";
import type { RentalOrderDepositStatus } from "@/lib/rental/deposits/types";
import { dbRentalOrderExtensionRepo } from "@/lib/rental/extensions/db-rental-order-extension-repo";
import type { RentalOrderExtensionStatus } from "@/lib/rental/extensions/types";
import { dbPaymentRepo } from "@/lib/rental/invoices/db-payment-repo";
import type { InvoicePaymentStatus } from "@/lib/rental/invoices/types";
import type {
  RentalCustomer,
  RentalOrderInspectionStatus,
  RentalOrderReturnStatus,
} from "@/lib/rental/orders/types";
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
  return_status: RentalOrderReturnStatus | null;
  returned_at: string | null;
  inspection_status: RentalOrderInspectionStatus | null;
  completed_at: string | null;
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
  depositRequiredCents: number;
  depositHeldCents: number;
  depositReleasedCents: number;
  depositRetainedCents: number;
  depositUnresolvedCents: number;
  depositStatus: RentalOrderDepositStatus;
  returnStatus: RentalOrderReturnStatus;
  returnedAt?: string;
  inspectionStatus: RentalOrderInspectionStatus;
  damageReviewStatus?: RentalCustomerDamageReviewStatus;
  completedAt?: string;
  createdAt: string;
};

export type RentalCustomerRecentInvoice = {
  id: string;
  invoiceNo?: string;
  issueDate?: string;
  status: "draft" | "issued" | "void";
  totalInclGstCents: number;
  paymentStatus: InvoicePaymentStatus;
  paidCents: number;
  outstandingBalanceCents: number;
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

export type RentalCustomerRecentExtension = {
  id: string;
  orderId: string;
  equipmentSummary: string;
  currentRentalEnd: string;
  requestedRentalEnd: string;
  status: RentalOrderExtensionStatus;
  extensionChargeEstimateCents: number;
  finalExtensionChargeCents?: number;
  customerMessage?: string;
  paymentRequired: boolean;
  createdAt: string;
  updatedAt: string;
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
  currentBalanceCents: number;
  overdueBalanceCents: number;
  overdueInvoicesCount: number;
  openInvoicesCount: number;
};

export type RentalCustomerAgingSummary = {
  currentCents: number;
  overdue1To30Cents: number;
  overdue31To60Cents: number;
  overdue61PlusCents: number;
};

export type RentalCustomerDepositSummary = {
  totalRequiredCents: number;
  totalHeldCents: number;
  totalOutstandingCents: number;
  heldCount: number;
  pendingCount: number;
};

export type { RentalCustomerCreditControlSummary } from "@/lib/rental/credit-control/db-rental-credit-control";

export type RentalCustomerOverview = {
  customer: RentalCustomer;
  recentOrders: RentalCustomerRecentOrder[];
  recentExtensions: RentalCustomerRecentExtension[];
  recentInvoices: RentalCustomerRecentInvoice[];
  openInvoices: RentalCustomerRecentInvoice[];
  recentPayments: RentalCustomerRecentPayment[];
  emailEvents: RentalCustomerEmailEvent[];
  financialSummary: RentalCustomerFinancialSummary;
  agingSummary: RentalCustomerAgingSummary;
  depositSummary: RentalCustomerDepositSummary;
  creditControl: RentalCustomerCreditControlSummary;
};

function daysOverdueFromDueDate(dueDate?: string | null, now = new Date()): number | null {
  if (!dueDate) return null;
  const dueAt = new Date(dueDate);
  if (Number.isNaN(dueAt.getTime())) return null;
  const diffMs = now.getTime() - dueAt.getTime();
  if (diffMs <= 0) return 0;
  return Math.floor(diffMs / (1000 * 60 * 60 * 24));
}

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

function deriveDamageReviewStatus(input: {
  inspectionStatus: RentalOrderInspectionStatus;
  assessment: RentalDamageAssessmentSummary;
}): RentalCustomerDamageReviewStatus | undefined {
  if (input.assessment.status === "finalized") return "assessment_completed";
  if (input.inspectionStatus === "issues_found" || input.assessment.exists) {
    return "issues_under_review";
  }
  return undefined;
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
    .select("id,customer_id,equipment_title,qty,start_date,end_date,return_status,returned_at,inspection_status,completed_at,created_at")
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
      recentExtensions: [],
      recentInvoices: [],
      openInvoices: [],
      recentPayments: [],
      emailEvents: [],
      financialSummary: {
        totalInvoices: 0,
        totalPaidCents: 0,
        outstandingBalanceCents: 0,
        currentBalanceCents: 0,
        overdueBalanceCents: 0,
        overdueInvoicesCount: 0,
        openInvoicesCount: 0,
      },
      agingSummary: {
        currentCents: 0,
        overdue1To30Cents: 0,
        overdue31To60Cents: 0,
        overdue61PlusCents: 0,
      },
      depositSummary: {
        totalRequiredCents: 0,
        totalHeldCents: 0,
        totalOutstandingCents: 0,
        heldCount: 0,
        pendingCount: 0,
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
  const depositSummariesByOrderId = await dbRentalDepositRepo.listByOrderIds(allOrderIds);
  const assessmentSummariesByOrderId = await dbRentalDamageAssessmentRepo.listSummariesByOrderIds(allOrderIds);
  const extensionsByOrderId = await dbRentalOrderExtensionRepo.listByOrderIds(allOrderIds);

  const recentInvoices = allInvoices.slice(0, recentInvoiceLimit).map((invoice) => ({
    id: invoice.id,
    invoiceNo: invoice.invoice_no ?? undefined,
    issueDate: invoice.issue_date ?? undefined,
    status: invoice.status,
    totalInclGstCents: Number(invoice.total_incl_gst_cents ?? 0),
    paymentStatus: totalsByInvoiceId[invoice.id]?.status ?? "unpaid",
    paidCents: totalsByInvoiceId[invoice.id]?.paidCents ?? 0,
    outstandingBalanceCents:
      totalsByInvoiceId[invoice.id]?.balanceCents ?? Math.max(0, Number(invoice.total_incl_gst_cents ?? 0)),
    dueDate: invoice.due_date ?? undefined,
  }));

  const invoiceIds = allInvoices.map((invoice) => invoice.id);
  const invoiceNoById = new Map(allInvoices.map((invoice) => [invoice.id, invoice.invoice_no ?? undefined]));
  const openInvoices = allInvoices
    .filter((invoice) => (totalsByInvoiceId[invoice.id]?.balanceCents ?? Number(invoice.total_incl_gst_cents ?? 0)) > 0)
    .map((invoice) => ({
      id: invoice.id,
      invoiceNo: invoice.invoice_no ?? undefined,
      issueDate: invoice.issue_date ?? undefined,
      status: invoice.status,
      totalInclGstCents: Number(invoice.total_incl_gst_cents ?? 0),
      paymentStatus: totalsByInvoiceId[invoice.id]?.status ?? "unpaid",
      paidCents: totalsByInvoiceId[invoice.id]?.paidCents ?? 0,
      outstandingBalanceCents:
        totalsByInvoiceId[invoice.id]?.balanceCents ?? Math.max(0, Number(invoice.total_incl_gst_cents ?? 0)),
      dueDate: invoice.due_date ?? undefined,
    }))
    .sort((a, b) => {
      const aTime = a.dueDate ? new Date(a.dueDate).getTime() : Number.MAX_SAFE_INTEGER;
      const bTime = b.dueDate ? new Date(b.dueDate).getTime() : Number.MAX_SAFE_INTEGER;
      return aTime - bTime;
    })
    .slice(0, recentInvoiceLimit);

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

  const now = new Date();
  const financialSummary = allInvoices.reduce<RentalCustomerFinancialSummary>(
    (summary, invoice) => {
      const totals = totalsByInvoiceId[invoice.id];
      const totalPaid = totals?.paidCents ?? 0;
      const balance = totals?.balanceCents ?? Math.max(0, Number(invoice.total_incl_gst_cents ?? 0));
      const isOpen = balance > 0;
      const isOverdue = totals?.status === "overdue";

      return {
        totalInvoices: summary.totalInvoices + 1,
        totalPaidCents: summary.totalPaidCents + totalPaid,
        outstandingBalanceCents: summary.outstandingBalanceCents + balance,
        currentBalanceCents: summary.currentBalanceCents + (isOpen && !isOverdue ? balance : 0),
        overdueBalanceCents: summary.overdueBalanceCents + (isOverdue ? balance : 0),
        overdueInvoicesCount: summary.overdueInvoicesCount + (isOverdue ? 1 : 0),
        openInvoicesCount: summary.openInvoicesCount + (isOpen ? 1 : 0),
      };
    },
    {
      totalInvoices: 0,
      totalPaidCents: 0,
      outstandingBalanceCents: 0,
      currentBalanceCents: 0,
      overdueBalanceCents: 0,
      overdueInvoicesCount: 0,
      openInvoicesCount: 0,
    }
  );

  const agingSummary = allInvoices.reduce<RentalCustomerAgingSummary>(
    (summary, invoice) => {
      const totals = totalsByInvoiceId[invoice.id];
      const balance = totals?.balanceCents ?? Math.max(0, Number(invoice.total_incl_gst_cents ?? 0));
      if (balance <= 0) return summary;

      const overdueDays = daysOverdueFromDueDate(invoice.due_date, now);
      if (overdueDays === null || overdueDays <= 0) {
        summary.currentCents += balance;
      } else if (overdueDays <= 30) {
        summary.overdue1To30Cents += balance;
      } else if (overdueDays <= 60) {
        summary.overdue31To60Cents += balance;
      } else {
        summary.overdue61PlusCents += balance;
      }
      return summary;
    },
    {
      currentCents: 0,
      overdue1To30Cents: 0,
      overdue31To60Cents: 0,
      overdue61PlusCents: 0,
    }
  );

  const depositSummary = Object.values(depositSummariesByOrderId).reduce<RentalCustomerDepositSummary>(
    (summary, deposit) => ({
      totalRequiredCents: summary.totalRequiredCents + deposit.requiredAmountCents,
      totalHeldCents: summary.totalHeldCents + deposit.heldAmountCents,
      totalOutstandingCents: summary.totalOutstandingCents + deposit.unresolvedAmountCents,
      heldCount: summary.heldCount + (deposit.status === "held" ? 1 : 0),
      pendingCount:
        summary.pendingCount +
        (deposit.status === "pending" || deposit.status === "partially_held" ? 1 : 0),
    }),
    {
      totalRequiredCents: 0,
      totalHeldCents: 0,
      totalOutstandingCents: 0,
      heldCount: 0,
      pendingCount: 0,
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
    recentOrders: recentOrders.map((order) => {
      const deposit = depositSummariesByOrderId[order.id] ?? {
        orderId: order.id,
        requiredAmountCents: 0,
        heldAmountCents: 0,
        releasedAmountCents: 0,
        retainedAmountCents: 0,
        unresolvedAmountCents: 0,
        status: "not_required" as const,
      };
      const assessment = assessmentSummariesByOrderId[order.id] ?? {
        orderId: order.id,
        exists: false,
        issueCategories: [],
        estimatedRetentionCents: 0,
      };

      return {
        id: order.id,
        equipmentSummary: `${order.equipment_title} x${order.qty}`,
        rentalStart: order.start_date,
        rentalEnd: order.end_date,
        orderStatus: deriveOrderStatus({
          latestSessionStatus: latestSessionByOrderId.get(order.id)?.status,
          hasInvoice: invoiceByOrderId.has(order.id),
        }),
        depositRequiredCents: deposit.requiredAmountCents,
        depositHeldCents: deposit.heldAmountCents,
        depositReleasedCents: deposit.releasedAmountCents,
        depositRetainedCents: deposit.retainedAmountCents,
        depositUnresolvedCents: deposit.unresolvedAmountCents,
        depositStatus: deposit.status,
        returnStatus: order.return_status ?? "out",
        returnedAt: order.returned_at ?? undefined,
        inspectionStatus: order.inspection_status ?? "not_started",
        damageReviewStatus: deriveDamageReviewStatus({
          inspectionStatus: order.inspection_status ?? "not_started",
          assessment,
        }),
        completedAt: order.completed_at ?? undefined,
        createdAt: order.created_at,
      };
    }),
    recentExtensions: recentOrders.flatMap((order) =>
      (extensionsByOrderId[order.id] ?? []).map((extension) => ({
        id: extension.id,
        orderId: extension.orderId,
        equipmentSummary: `${order.equipment_title} x${order.qty}`,
        currentRentalEnd: extension.currentRentalEnd,
        requestedRentalEnd: extension.requestedRentalEnd,
        status: extension.status,
        extensionChargeEstimateCents: extension.extensionChargeEstimateCents,
        finalExtensionChargeCents: extension.finalExtensionChargeCents,
        customerMessage: extension.customerMessage,
        paymentRequired: extension.status === "approved_pending_payment",
        createdAt: extension.createdAt,
        updatedAt: extension.updatedAt,
      }))
    ),
    recentInvoices,
    openInvoices,
    recentPayments,
    emailEvents,
    financialSummary,
    agingSummary,
    depositSummary,
    creditControl,
  };
}
