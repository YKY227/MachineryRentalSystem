import { dbInvoiceRepo } from "@/lib/rental/invoices/db-invoice-repo";
import { dbPaymentRepo } from "@/lib/rental/invoices/db-payment-repo";
import type { Invoice, InvoicePayment, InvoicePaymentStatus } from "@/lib/rental/invoices/types";
import { supabaseAdmin } from "@/lib/supabase/server";

const INVOICE_PAYMENTS_TABLE = process.env.SUPABASE_INVOICE_PAYMENTS_TABLE ?? "rental_invoice_payments";

const PAYMENT_STATUSES = new Set<InvoicePaymentStatus>(["unpaid", "partially_paid", "paid", "overdue"]);
const SORT_BY_VALUES = new Set(["paid_at", "created_at", "amount", "invoice_number"] as const);
const SORT_DIR_VALUES = new Set(["asc", "desc"] as const);

type PaymentsLedgerSortBy = "paid_at" | "created_at" | "amount" | "invoice_number";
type PaymentsLedgerSortDir = "asc" | "desc";

type PaymentLedgerRow = {
  id: string;
  invoice_id: string;
  amount_cents: number;
  paid_at: string;
  method: string | null;
  reference: string | null;
  notes: string | null;
  created_at: string;
};

export type AdminPaymentsLedgerQuery = {
  q: string;
  paymentMethod?: string;
  paymentStatus?: InvoicePaymentStatus;
  dateFrom?: string;
  dateTo?: string;
  sortBy: PaymentsLedgerSortBy;
  sortDir: PaymentsLedgerSortDir;
};

export type AdminPaymentsLedgerItem = {
  payment: InvoicePayment;
  invoice: Invoice;
  invoicePaymentStatus: InvoicePaymentStatus;
  invoicePaidCents: number;
  invoiceBalanceCents: number;
};

function normalizeDateFrom(value?: string) {
  const raw = (value ?? "").trim();
  if (!raw) return undefined;
  if (/^\d{4}-\d{2}-\d{2}$/.test(raw)) return `${raw}T00:00:00.000Z`;
  const parsed = new Date(raw);
  return Number.isNaN(parsed.getTime()) ? undefined : parsed.toISOString();
}

function normalizeDateTo(value?: string) {
  const raw = (value ?? "").trim();
  if (!raw) return undefined;
  if (/^\d{4}-\d{2}-\d{2}$/.test(raw)) return `${raw}T23:59:59.999Z`;
  const parsed = new Date(raw);
  return Number.isNaN(parsed.getTime()) ? undefined : parsed.toISOString();
}

function toPayment(row: PaymentLedgerRow): InvoicePayment {
  return {
    id: row.id,
    invoiceId: row.invoice_id,
    amountCents: Number(row.amount_cents ?? 0),
    paidAt: row.paid_at,
    method: row.method ?? undefined,
    reference: row.reference ?? undefined,
    notes: row.notes ?? undefined,
    createdAt: row.created_at,
  };
}

export function parseAdminPaymentsLedgerQuery(searchParams: URLSearchParams): AdminPaymentsLedgerQuery {
  const paymentStatusRaw = (searchParams.get("paymentStatus") ?? "").trim();
  const sortByRaw = (searchParams.get("sortBy") ?? "paid_at").trim();
  const sortDirRaw = (searchParams.get("sortDir") ?? "desc").trim();

  return {
    q: (searchParams.get("q") ?? "").trim().toLowerCase(),
    paymentMethod: (searchParams.get("paymentMethod") ?? "").trim() || undefined,
    paymentStatus: PAYMENT_STATUSES.has(paymentStatusRaw as InvoicePaymentStatus)
      ? (paymentStatusRaw as InvoicePaymentStatus)
      : undefined,
    dateFrom: normalizeDateFrom(searchParams.get("dateFrom") ?? undefined),
    dateTo: normalizeDateTo(searchParams.get("dateTo") ?? undefined),
    sortBy: SORT_BY_VALUES.has(sortByRaw as PaymentsLedgerSortBy)
      ? (sortByRaw as PaymentsLedgerSortBy)
      : "paid_at",
    sortDir: SORT_DIR_VALUES.has(sortDirRaw as PaymentsLedgerSortDir)
      ? (sortDirRaw as PaymentsLedgerSortDir)
      : "desc",
  };
}

function compareValues(
  left: string | number | undefined,
  right: string | number | undefined,
  sortDir: PaymentsLedgerSortDir
) {
  const direction = sortDir === "asc" ? 1 : -1;
  const leftValue = left ?? "";
  const rightValue = right ?? "";

  if (typeof leftValue === "number" || typeof rightValue === "number") {
    return (Number(leftValue) - Number(rightValue)) * direction;
  }

  return String(leftValue).localeCompare(String(rightValue)) * direction;
}

function sortLedgerItems(items: AdminPaymentsLedgerItem[], sortBy: PaymentsLedgerSortBy, sortDir: PaymentsLedgerSortDir) {
  return [...items].sort((a, b) => {
    switch (sortBy) {
      case "created_at":
        return compareValues(a.payment.createdAt, b.payment.createdAt, sortDir);
      case "amount":
        return compareValues(a.payment.amountCents, b.payment.amountCents, sortDir);
      case "invoice_number":
        return compareValues(a.invoice.invoiceNo ?? "", b.invoice.invoiceNo ?? "", sortDir);
      case "paid_at":
      default:
        return compareValues(a.payment.paidAt, b.payment.paidAt, sortDir);
    }
  });
}

export async function loadAdminPaymentsLedger(query: AdminPaymentsLedgerQuery): Promise<AdminPaymentsLedgerItem[]> {
  const supabase = supabaseAdmin();
  let paymentsQuery = supabase
    .from(INVOICE_PAYMENTS_TABLE)
    .select("id,invoice_id,amount_cents,paid_at,method,reference,notes,created_at");

  if (query.dateFrom) paymentsQuery = paymentsQuery.gte("paid_at", query.dateFrom);
  if (query.dateTo) paymentsQuery = paymentsQuery.lte("paid_at", query.dateTo);
  if (query.paymentMethod) paymentsQuery = paymentsQuery.eq("method", query.paymentMethod);

  const dbSortColumn =
    query.sortBy === "created_at"
      ? "created_at"
      : query.sortBy === "amount"
        ? "amount_cents"
        : "paid_at";

  const { data, error } = await paymentsQuery.order(dbSortColumn, { ascending: query.sortDir === "asc" });

  if (error) throw new Error(`Payments ledger read failed: ${error.message}`);

  const payments = ((data ?? []) as PaymentLedgerRow[]).map(toPayment);
  if (!payments.length) return [];

  const invoices = await dbInvoiceRepo.listByIds(
    Array.from(new Set(payments.map((payment) => payment.invoiceId)))
  );
  const invoiceById = new Map(invoices.map((invoice) => [invoice.id, invoice]));
  const totalsByInvoiceId = await dbPaymentRepo.listTotalsByInvoiceIds(invoices);

  const filteredItems = payments
    .map((payment) => {
      const invoice = invoiceById.get(payment.invoiceId);
      if (!invoice) return null;
      const totals = totalsByInvoiceId[invoice.id];
      if (!totals) return null;

      return {
        payment,
        invoice,
        invoicePaymentStatus: totals.status,
        invoicePaidCents: totals.paidCents,
        invoiceBalanceCents: totals.balanceCents,
      } satisfies AdminPaymentsLedgerItem;
    })
    .filter((item): item is AdminPaymentsLedgerItem => Boolean(item))
    .filter((item) => {
      if (query.paymentStatus && item.invoicePaymentStatus !== query.paymentStatus) return false;
      if (!query.q) return true;

      const haystack = [
        item.invoice.invoiceNo ?? "",
        item.invoice.billTo?.name ?? "",
        item.invoice.billTo?.contactName ?? "",
        item.payment.reference ?? "",
      ]
        .join(" ")
        .toLowerCase();

      return haystack.includes(query.q);
    });

  return sortLedgerItems(filteredItems, query.sortBy, query.sortDir);
}
