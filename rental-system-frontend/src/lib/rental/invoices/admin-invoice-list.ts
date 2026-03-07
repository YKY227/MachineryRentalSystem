import { dbInvoiceRepo } from "@/lib/rental/invoices/db-invoice-repo";
import { dbPaymentRepo } from "@/lib/rental/invoices/db-payment-repo";
import type {
  InvoiceListItem,
  InvoiceListSortBy,
  InvoiceListSortDir,
  InvoicePaymentStatus,
  InvoiceStatus,
} from "@/lib/rental/invoices/types";

const LIFECYCLE_STATUSES = new Set<InvoiceStatus>(["draft", "issued", "void"]);
const PAYMENT_STATUSES = new Set<InvoicePaymentStatus>(["unpaid", "partially_paid", "paid", "overdue"]);
const SORT_BY_VALUES = new Set<InvoiceListSortBy>(["created_at", "due_date", "total", "invoice_number"]);
const SORT_DIR_VALUES = new Set<InvoiceListSortDir>(["asc", "desc"]);
const PAGE_SIZES = new Set([10, 20, 50]);

export type AdminInvoiceListQuery = {
  lifecycleStatus?: InvoiceStatus;
  paymentStatus?: InvoicePaymentStatus;
  q: string;
  page: number;
  pageSize: number;
  sortBy: InvoiceListSortBy;
  sortDir: InvoiceListSortDir;
};

export function parseAdminInvoiceListQuery(searchParams: URLSearchParams): AdminInvoiceListQuery {
  const lifecycleStatusRaw = (searchParams.get("lifecycleStatus") ?? "").trim();
  const paymentStatusRaw = (searchParams.get("paymentStatus") ?? "").trim();
  const q = (searchParams.get("q") ?? "").trim().toLowerCase();
  const pageRaw = Number(searchParams.get("page") ?? "1");
  const pageSizeRaw = Number(searchParams.get("pageSize") ?? "20");
  const sortByRaw = (searchParams.get("sortBy") ?? "created_at").trim();
  const sortDirRaw = (searchParams.get("sortDir") ?? "desc").trim();

  return {
    lifecycleStatus: LIFECYCLE_STATUSES.has(lifecycleStatusRaw as InvoiceStatus)
      ? (lifecycleStatusRaw as InvoiceStatus)
      : undefined,
    paymentStatus: PAYMENT_STATUSES.has(paymentStatusRaw as InvoicePaymentStatus)
      ? (paymentStatusRaw as InvoicePaymentStatus)
      : undefined,
    q,
    page: Number.isFinite(pageRaw) && pageRaw > 0 ? Math.floor(pageRaw) : 1,
    pageSize: PAGE_SIZES.has(pageSizeRaw) ? pageSizeRaw : 20,
    sortBy: SORT_BY_VALUES.has(sortByRaw as InvoiceListSortBy)
      ? (sortByRaw as InvoiceListSortBy)
      : "created_at",
    sortDir: SORT_DIR_VALUES.has(sortDirRaw as InvoiceListSortDir)
      ? (sortDirRaw as InvoiceListSortDir)
      : "desc",
  };
}

async function attachEmailSummaries(items: InvoiceListItem[]): Promise<InvoiceListItem[]> {
  if (!items.length) return items;

  const summariesByInvoiceId = await dbInvoiceRepo.listEmailSummariesByInvoiceIds(
    items.map((item) => item.invoice.id)
  );

  return items.map((item) => ({
    ...item,
    emailSummary: summariesByInvoiceId[item.invoice.id],
  }));
}

function filterDerivedItems(items: InvoiceListItem[], query: AdminInvoiceListQuery): InvoiceListItem[] {
  return items.filter((item) => {
    if (query.paymentStatus && item.paymentTotals.status !== query.paymentStatus) return false;
    if (!query.q) return true;

    const haystack = [
      item.invoice.invoiceNo ?? "",
      item.invoice.billTo?.name ?? "",
      item.invoice.billTo?.contactName ?? "",
      item.invoice.billTo?.email ?? "",
    ]
      .join(" ")
      .toLowerCase();

    return haystack.includes(query.q);
  });
}

export async function loadAdminInvoiceListPage(query: AdminInvoiceListQuery): Promise<{
  items: InvoiceListItem[];
  totalItems: number;
  page: number;
  pageSize: number;
  totalPages: number;
}> {
  let items: InvoiceListItem[];
  let totalItems: number;

  if (!query.paymentStatus && !query.q) {
    const pageResult = await dbInvoiceRepo.listPage({
      lifecycleStatus: query.lifecycleStatus,
      page: query.page,
      pageSize: query.pageSize,
      sortBy: query.sortBy,
      sortDir: query.sortDir,
    });

    items = await attachEmailSummaries(await dbPaymentRepo.buildInvoiceListItems(pageResult.invoices));
    totalItems = pageResult.totalItems;
  } else {
    const invoices = await dbInvoiceRepo.listAll({
      lifecycleStatus: query.lifecycleStatus,
      sortBy: query.sortBy,
      sortDir: query.sortDir,
    });
    const derivedItems = filterDerivedItems(
      await attachEmailSummaries(await dbPaymentRepo.buildInvoiceListItems(invoices)),
      query
    );

    totalItems = derivedItems.length;
    const from = (query.page - 1) * query.pageSize;
    items = derivedItems.slice(from, from + query.pageSize);
  }

  return {
    items,
    totalItems,
    page: query.page,
    pageSize: query.pageSize,
    totalPages: Math.max(1, Math.ceil(totalItems / query.pageSize)),
  };
}

export async function loadAdminInvoiceListExport(query: AdminInvoiceListQuery): Promise<InvoiceListItem[]> {
  const invoices = await dbInvoiceRepo.listAll({
    lifecycleStatus: query.lifecycleStatus,
    sortBy: query.sortBy,
    sortDir: query.sortDir,
  });

  return filterDerivedItems(
    await attachEmailSummaries(await dbPaymentRepo.buildInvoiceListItems(invoices)),
    query
  );
}
