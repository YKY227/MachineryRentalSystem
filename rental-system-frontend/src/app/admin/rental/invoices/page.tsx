// src/app/admin/rental/invoices/page.tsx
"use client";

import { useEffect, useMemo, useState } from "react";
import { useRouter } from "next/navigation";
import {
  ArrowLeft,
  BadgeDollarSign,
  CircleDollarSign,
  Clock3,
  Download,
  Filter,
  Mail,
  ReceiptText,
  RefreshCw,
  Search,
  Send,
  ShieldAlert,
} from "lucide-react";

import type {
  Invoice,
  InvoiceEmailEventType,
  InvoiceListItem,
  InvoiceListSortBy,
  InvoiceListSortDir,
  InvoicePaymentStatus,
} from "@/lib/rental/invoices/types";

function moneyFromCents(cents: number) {
  const v = Number.isFinite(cents) ? cents : 0;
  return new Intl.NumberFormat("en-SG", {
    style: "currency",
    currency: "SGD",
    minimumFractionDigits: 2,
    maximumFractionDigits: 2,
  }).format(v / 100);
}

function formatDate(iso?: string) {
  if (!iso) return "-";
  const d = new Date(iso);
  if (Number.isNaN(d.getTime())) return iso;
  return d.toLocaleDateString("en-SG", { year: "numeric", month: "short", day: "2-digit" });
}

function formatDateTime(iso?: string) {
  if (!iso) return "-";
  const d = new Date(iso);
  if (Number.isNaN(d.getTime())) return iso;
  return d.toLocaleString("en-SG", { hour12: true });
}

function statusChip(status: Invoice["status"]) {
  switch (status) {
    case "draft":
      return "bg-slate-100 text-slate-700";
    case "issued":
      return "bg-emerald-100 text-emerald-800";
    case "void":
      return "bg-rose-100 text-rose-800";
    default:
      return "bg-slate-100 text-slate-700";
  }
}

function paymentStatusChip(status: InvoicePaymentStatus) {
  switch (status) {
    case "paid":
      return "bg-emerald-100 text-emerald-800";
    case "partially_paid":
      return "bg-amber-100 text-amber-800";
    case "overdue":
      return "bg-rose-100 text-rose-800";
    case "unpaid":
    default:
      return "bg-slate-100 text-slate-700";
  }
}

function paymentStatusLabel(status: InvoicePaymentStatus) {
  switch (status) {
    case "paid":
      return "Paid";
    case "partially_paid":
      return "Partially Paid";
    case "overdue":
      return "Overdue";
    case "unpaid":
    default:
      return "Unpaid";
  }
}

function emailTypeLabel(type?: InvoiceEmailEventType) {
  switch (type) {
    case "sent":
      return "Sent";
    case "resent":
      return "Resent";
    case "reminder":
      return "Reminder";
    case "receipt":
      return "Receipt";
    default:
      return "No Email";
  }
}

function emailTypeChip(type?: InvoiceEmailEventType) {
  switch (type) {
    case "sent":
      return "bg-sky-100 text-sky-800";
    case "resent":
      return "bg-indigo-100 text-indigo-800";
    case "reminder":
      return "bg-amber-100 text-amber-800";
    case "receipt":
      return "bg-emerald-100 text-emerald-800";
    default:
      return "bg-slate-100 text-slate-500";
  }
}

function emailTypeIcon(type?: InvoiceEmailEventType) {
  switch (type) {
    case "receipt":
      return CircleDollarSign;
    case "reminder":
      return ShieldAlert;
    case "resent":
    case "sent":
      return Send;
    default:
      return Mail;
  }
}

type StatusFilter = "all" | Invoice["status"];
type PaymentStatusFilter = "all" | InvoicePaymentStatus;
type PageSizeOption = 10 | 20 | 50;

type PaginationState = {
  page: number;
  pageSize: number;
  totalItems: number;
  totalPages: number;
};

function buildListQueryString(input: {
  q?: string;
  status?: StatusFilter;
  paymentStatus?: PaymentStatusFilter;
  page?: number;
  pageSize?: PageSizeOption;
  sortBy?: InvoiceListSortBy;
  sortDir?: InvoiceListSortDir;
}) {
  const params = new URLSearchParams();
  const nextQ = (input.q ?? "").trim();
  const nextStatus = input.status ?? "all";
  const nextPaymentStatus = input.paymentStatus ?? "all";
  const nextPage = input.page ?? 1;
  const nextPageSize = input.pageSize ?? 20;
  const nextSortBy = input.sortBy ?? "created_at";
  const nextSortDir = input.sortDir ?? "desc";

  if (nextQ) params.set("q", nextQ);
  if (nextStatus !== "all") params.set("lifecycleStatus", nextStatus);
  if (nextPaymentStatus !== "all") params.set("paymentStatus", nextPaymentStatus);
  params.set("page", String(nextPage));
  params.set("pageSize", String(nextPageSize));
  params.set("sortBy", nextSortBy);
  params.set("sortDir", nextSortDir);

  return params.toString();
}

export default function AdminInvoicesPage() {
  const router = useRouter();

  const [items, setItems] = useState<InvoiceListItem[]>([]);
  const [status, setStatus] = useState<StatusFilter>("all");
  const [paymentStatus, setPaymentStatus] = useState<PaymentStatusFilter>("all");
  const [q, setQ] = useState("");
  const [searchDraft, setSearchDraft] = useState("");
  const [page, setPage] = useState(1);
  const [pageSize, setPageSize] = useState<PageSizeOption>(20);
  const [sortBy, setSortBy] = useState<InvoiceListSortBy>("created_at");
  const [sortDir, setSortDir] = useState<InvoiceListSortDir>("desc");
  const [pagination, setPagination] = useState<PaginationState>({
    page: 1,
    pageSize: 20,
    totalItems: 0,
    totalPages: 1,
  });
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);

  async function refresh(filters?: {
    q?: string;
    status?: StatusFilter;
    paymentStatus?: PaymentStatusFilter;
    page?: number;
    pageSize?: PageSizeOption;
    sortBy?: InvoiceListSortBy;
    sortDir?: InvoiceListSortDir;
  }) {
    try {
      setLoading(true);
      setError(null);
      const nextQ = (filters?.q ?? q).trim();
      const nextStatus = filters?.status ?? status;
      const nextPaymentStatus = filters?.paymentStatus ?? paymentStatus;
      const nextPage = filters?.page ?? page;
      const nextPageSize = filters?.pageSize ?? pageSize;
      const nextSortBy = filters?.sortBy ?? sortBy;
      const nextSortDir = filters?.sortDir ?? sortDir;
      const query = buildListQueryString({
        q: nextQ,
        status: nextStatus,
        paymentStatus: nextPaymentStatus,
        page: nextPage,
        pageSize: nextPageSize,
        sortBy: nextSortBy,
        sortDir: nextSortDir,
      });
      const res = await fetch(`/api/admin/rental/invoices${query ? `?${query}` : ""}`, {
        cache: "no-store",
        credentials: "include",
      });
      const data = await res.json().catch(() => ({}));
      if (!res.ok) throw new Error(data?.error ?? "Failed to load invoices");
      setItems(Array.isArray(data?.items) ? (data.items as InvoiceListItem[]) : []);
      setPagination({
        page: Number(data?.pagination?.page ?? nextPage),
        pageSize: Number(data?.pagination?.pageSize ?? nextPageSize),
        totalItems: Number(data?.pagination?.totalItems ?? 0),
        totalPages: Math.max(1, Number(data?.pagination?.totalPages ?? 1)),
      });
    } catch (e) {
      setItems([]);
      setPagination((current) => ({
        ...current,
        page: filters?.page ?? page,
        pageSize: filters?.pageSize ?? pageSize,
        totalItems: 0,
        totalPages: 1,
      }));
      setError(e instanceof Error ? e.message : "Failed to load invoices");
    } finally {
      setLoading(false);
    }
  }

  useEffect(() => {
    const timeoutId = window.setTimeout(() => {
      refresh({ q: searchDraft, status, paymentStatus, page, pageSize, sortBy, sortDir });
    }, 250);

    return () => window.clearTimeout(timeoutId);
  }, [searchDraft, status, paymentStatus, page, pageSize, sortBy, sortDir]);

  const summary = useMemo(() => {
    const total = pagination.totalItems;
    const totalInclGstCents = items.reduce((sum, item) => sum + (item.invoice.totalInclGstCents ?? 0), 0);
    const outstandingBalanceCents = items.reduce((sum, item) => sum + (item.paymentTotals.balanceCents ?? 0), 0);
    const overdueCount = items.filter(({ paymentTotals }) => paymentTotals.status === "overdue").length;
    const unpaidCount = items.filter(({ paymentTotals }) => paymentTotals.status === "unpaid").length;
    const partiallyPaidCount = items.filter(({ paymentTotals }) => paymentTotals.status === "partially_paid").length;
    const paidCount = items.filter(({ paymentTotals }) => paymentTotals.status === "paid").length;
    const issuedCount = items.filter(({ invoice }) => invoice.status === "issued").length;
    const draftCount = items.filter(({ invoice }) => invoice.status === "draft").length;
    const voidCount = items.filter(({ invoice }) => invoice.status === "void").length;
    return {
      total,
      totalInclGstCents,
      outstandingBalanceCents,
      overdueCount,
      unpaidCount,
      partiallyPaidCount,
      paidCount,
      issuedCount,
      draftCount,
      voidCount,
    };
  }, [items, pagination.totalItems]);

  function onExportCsv() {
    const query = buildListQueryString({
      q: searchDraft,
      status,
      paymentStatus,
      sortBy,
      sortDir,
    });
    window.location.href = `/api/admin/rental/invoices/export${query ? `?${query}` : ""}`;
  }

  function onExportPaymentsCsv() {
    const params = new URLSearchParams();
    const nextQ = searchDraft.trim();
    const nextSortBy = sortBy === "invoice_number" ? "invoice_number" : "paid_at";

    if (nextQ) params.set("q", nextQ);
    if (paymentStatus !== "all") params.set("paymentStatus", paymentStatus);
    params.set("sortBy", nextSortBy);
    params.set("sortDir", sortDir);

    const query = params.toString();
    window.location.href = `/api/admin/rental/payments/export${query ? `?${query}` : ""}`;
  }

  return (
    <div className="mx-auto max-w-7xl space-y-6 bg-slate-50 p-4">
      <div className="rounded-2xl border border-slate-200 bg-white p-5 shadow-sm">
        <div className="flex flex-col gap-4 xl:flex-row xl:items-start xl:justify-between">
          <div>
            <div className="inline-flex items-center gap-2 rounded-full border border-[#F2C7C2] bg-[#FCE9E7] px-3 py-1 text-[11px] font-semibold uppercase tracking-[0.16em] text-[#B9382E]">
              <ReceiptText className="h-4 w-4" />
              Billing and receivables
            </div>
            <h1 className="mt-3 text-2xl font-semibold text-[#2A2A2A]">Invoices</h1>
            <p className="mt-1 text-sm text-slate-600">
              Track receivables, overdue follow-up, payment progress, and invoice communication from one DB-backed finance workspace.
            </p>
          </div>

          <div className="flex flex-wrap items-center justify-end gap-3 xl:max-w-[430px]">
            <div className="flex flex-wrap items-center gap-2 rounded-2xl border border-slate-200 bg-slate-50 p-1.5">
              <button
                type="button"
                onClick={() => router.push("/admin/rental/orders")}
                className="rounded-xl border border-slate-200 bg-white px-3 py-2 text-sm font-semibold text-slate-700 hover:bg-slate-50"
              >
                <span className="inline-flex items-center gap-2">
                  <ArrowLeft className="h-4 w-4" />
                  Orders
                </span>
              </button>

              <button
                type="button"
                onClick={() => refresh({ q: searchDraft, status, paymentStatus })}
                className="rounded-xl border border-slate-200 bg-white px-3 py-2 text-sm font-semibold text-slate-700 hover:bg-slate-50"
              >
                <span className="inline-flex items-center gap-2">
                  <RefreshCw className="h-4 w-4" />
                  Refresh
                </span>
              </button>

              <button
                type="button"
                onClick={onExportPaymentsCsv}
                className="rounded-xl border border-slate-200 bg-white px-3 py-2 text-sm font-semibold text-slate-700 hover:bg-slate-50"
              >
                <span className="inline-flex items-center gap-2">
                  <BadgeDollarSign className="h-4 w-4" />
                  Export Payments CSV
                </span>
              </button>
            </div>

            <button
              type="button"
              onClick={onExportCsv}
              className="rounded-xl bg-slate-900 px-4 py-2.5 text-sm font-semibold text-white hover:bg-slate-800"
            >
              <span className="inline-flex items-center gap-2">
                <Download className="h-4 w-4" />
                Export CSV
              </span>
            </button>
          </div>
        </div>
      </div>

      <div className="grid gap-4 xl:grid-cols-[minmax(0,1fr)_320px]">
        <div className="grid gap-4 sm:grid-cols-2 xl:grid-cols-4">
          <div className="rounded-2xl border border-rose-200 bg-rose-50 p-4 shadow-sm">
            <div className="flex items-center justify-between gap-3">
              <div className="text-xs uppercase tracking-wide text-rose-700">Overdue</div>
              <Clock3 className="h-4 w-4 text-rose-600" />
            </div>
            <div className="mt-2 text-2xl font-semibold text-rose-900">{summary.overdueCount}</div>
            <div className="mt-1 text-xs text-rose-700">Past due and still unpaid.</div>
          </div>
          <div className="rounded-2xl border border-amber-200 bg-amber-50 p-4 shadow-sm">
            <div className="flex items-center justify-between gap-3">
              <div className="text-xs uppercase tracking-wide text-amber-700">Open receivables</div>
              <BadgeDollarSign className="h-4 w-4 text-amber-600" />
            </div>
            <div className="mt-2 text-2xl font-semibold text-amber-900">
              {summary.unpaidCount + summary.partiallyPaidCount}
            </div>
            <div className="mt-1 text-xs text-amber-700">
              Unpaid {summary.unpaidCount} · partial {summary.partiallyPaidCount}
            </div>
          </div>
          <div className="rounded-2xl border border-slate-200 bg-white p-4 shadow-sm">
            <div className="flex items-center justify-between gap-3">
              <div className="text-xs uppercase tracking-wide text-slate-500">Outstanding balance</div>
              <CircleDollarSign className="h-4 w-4 text-[#D24338]" />
            </div>
            <div className="mt-2 text-2xl font-semibold text-slate-900">{moneyFromCents(summary.outstandingBalanceCents)}</div>
            <div className="mt-1 text-xs text-slate-500">Balance still to be collected in this result set.</div>
          </div>
          <div className="rounded-2xl border border-slate-200 bg-white p-4 shadow-sm">
            <div className="flex items-center justify-between gap-3">
              <div className="text-xs uppercase tracking-wide text-slate-500">Paid invoices</div>
              <BadgeDollarSign className="h-4 w-4 text-emerald-600" />
            </div>
            <div className="mt-2 text-2xl font-semibold text-slate-900">{summary.paidCount}</div>
            <div className="mt-1 text-xs text-slate-500">Fully settled invoices in the current result set.</div>
          </div>
        </div>

        <div className="rounded-2xl border border-slate-200 bg-white p-4 shadow-sm">
          <div className="text-xs uppercase tracking-wide text-slate-500">Lifecycle snapshot</div>
          <div className="mt-3 grid grid-cols-3 divide-x divide-slate-200 overflow-hidden rounded-xl border border-slate-200 bg-slate-50">
            <div className="px-4 py-3">
              <div className="text-[11px] font-semibold uppercase tracking-wide text-slate-400">Draft</div>
              <div className="mt-1 text-xl font-semibold text-slate-900">{summary.draftCount}</div>
            </div>
            <div className="px-4 py-3">
              <div className="text-[11px] font-semibold uppercase tracking-wide text-slate-400">Issued</div>
              <div className="mt-1 text-xl font-semibold text-slate-900">{summary.issuedCount}</div>
            </div>
            <div className="px-4 py-3">
              <div className="text-[11px] font-semibold uppercase tracking-wide text-slate-400">Void</div>
              <div className="mt-1 text-xl font-semibold text-slate-900">{summary.voidCount}</div>
            </div>
          </div>
        </div>
      </div>

      <div className="rounded-2xl border border-slate-200 bg-white p-4 shadow-sm">
        <div className="flex flex-col gap-4 xl:flex-row xl:items-start xl:justify-between">
          <div>
            <div className="inline-flex items-center gap-2 text-sm font-semibold text-slate-900">
              <Filter className="h-4 w-4 text-[#D24338]" />
              Filters and controls
            </div>
            <div className="mt-1 text-xs text-slate-500">
              Search receivables, refine lifecycle and payment state, then adjust list controls.
            </div>
          </div>
          <div className="text-xs text-slate-500">
            Result set total <span className="font-semibold text-slate-700">{moneyFromCents(summary.totalInclGstCents)}</span> ·{" "}
            <span className="font-semibold text-slate-700">{pagination.totalItems}</span> invoices
          </div>
        </div>

        <div className="mt-4 grid gap-3 xl:grid-cols-[minmax(0,1.5fr)_repeat(3,minmax(170px,1fr))]">
          <div>
            <label className="text-xs font-semibold text-slate-600">Search</label>
            <div className="mt-1 flex items-center gap-2 rounded-xl border border-slate-200 bg-slate-50 px-3 py-2">
              <Search className="h-4 w-4 text-slate-400" />
              <input
                value={searchDraft}
                onChange={(e) => {
                  setSearchDraft(e.target.value);
                  setQ(e.target.value);
                  setPage(1);
                }}
                placeholder="invoice no / customer / contact person"
                className="w-full bg-transparent text-sm outline-none"
              />
            </div>
          </div>

          <div>
            <label className="text-xs font-semibold text-slate-600">Lifecycle Status</label>
            <select
              value={status}
              onChange={(e) => {
                setStatus(e.target.value as StatusFilter);
                setPage(1);
              }}
              className="mt-1 w-full rounded-xl border border-slate-200 bg-white px-3 py-2 text-sm outline-none focus:border-[#D24338]"
            >
              <option value="all">All</option>
              <option value="draft">Draft</option>
              <option value="issued">Issued</option>
              <option value="void">Void</option>
            </select>
          </div>

          <div>
            <label className="text-xs font-semibold text-slate-600">Payment Status</label>
            <select
              value={paymentStatus}
              onChange={(e) => {
                setPaymentStatus(e.target.value as PaymentStatusFilter);
                setPage(1);
              }}
              className="mt-1 w-full rounded-xl border border-slate-200 bg-white px-3 py-2 text-sm outline-none focus:border-[#D24338]"
            >
              <option value="all">All</option>
              <option value="unpaid">Unpaid</option>
              <option value="partially_paid">Partially Paid</option>
              <option value="paid">Paid</option>
              <option value="overdue">Overdue</option>
            </select>
          </div>

          <div>
            <label className="text-xs font-semibold text-slate-600">Sort</label>
            <div className="mt-1 grid grid-cols-2 gap-2">
              <select
                value={sortBy}
                onChange={(e) => {
                  setSortBy(e.target.value as InvoiceListSortBy);
                  setPage(1);
                }}
                className="w-full rounded-xl border border-slate-200 bg-white px-3 py-2 text-sm outline-none focus:border-[#D24338]"
              >
                <option value="created_at">Created</option>
                <option value="due_date">Due Date</option>
                <option value="total">Total</option>
                <option value="invoice_number">Invoice No</option>
              </select>
              <select
                value={sortDir}
                onChange={(e) => {
                  setSortDir(e.target.value as InvoiceListSortDir);
                  setPage(1);
                }}
                className="w-full rounded-xl border border-slate-200 bg-white px-3 py-2 text-sm outline-none focus:border-[#D24338]"
              >
                <option value="desc">Desc</option>
                <option value="asc">Asc</option>
              </select>
            </div>
          </div>
        </div>

        <div className="mt-4 flex flex-col gap-3 rounded-2xl border border-slate-200 bg-slate-50 p-3 xl:flex-row xl:items-center xl:justify-between">
          <div className="text-sm text-slate-600">
            Page <span className="font-semibold text-slate-900">{pagination.page}</span> of{" "}
            <span className="font-semibold text-slate-900">{pagination.totalPages}</span> · Showing{" "}
            <span className="font-semibold text-slate-900">{items.length}</span> row{items.length === 1 ? "" : "s"}
          </div>
          <div className="rounded-xl border border-slate-200 bg-white p-2">
            <label className="text-[11px] font-semibold uppercase tracking-wide text-slate-500">Page size</label>
            <select
              value={pageSize}
              onChange={(e) => {
                setPageSize(Number(e.target.value) as PageSizeOption);
                setPage(1);
              }}
              className="mt-1 rounded-lg border border-slate-200 bg-white px-2 py-1 text-sm outline-none focus:border-[#D24338]"
            >
              <option value={10}>10</option>
              <option value={20}>20</option>
              <option value={50}>50</option>
            </select>
          </div>
        </div>
      </div>

      {error && (
        <div className="mt-6 rounded-xl border border-rose-200 bg-rose-50 p-4 text-sm text-rose-700">
          {error}
        </div>
      )}

      {loading ? (
        <div className="mt-6 rounded-xl border border-slate-200 bg-white p-6 text-sm text-slate-600">
          Loading invoices...
        </div>
      ) : items.length === 0 ? (
        <div className="mt-6 rounded-xl border border-slate-200 bg-white p-6 text-sm text-slate-600">
          No invoices found for the current filters. Create one from{" "}
          <button
            className="font-semibold text-[#B9382E] hover:underline"
            onClick={() => router.push("/admin/rental/orders")}
            type="button"
          >
            Orders
          </button>
          .
        </div>
      ) : (
        <div className="mt-6 overflow-hidden rounded-2xl border border-slate-200 bg-white shadow-sm">
          <table className="w-full text-left text-sm">
            <thead className="bg-slate-50 text-xs uppercase tracking-wide text-slate-500">
              <tr>
                <th className="px-4 py-3">Invoice</th>
                <th className="px-4 py-3">Customer</th>
                <th className="px-4 py-3">Billing timeline</th>
                <th className="px-4 py-3 text-right">Amounts</th>
                <th className="px-4 py-3">Lifecycle</th>
                <th className="px-4 py-3">Payment</th>
                <th className="px-4 py-3">Communication</th>
                <th className="px-4 py-3">Actions</th>
              </tr>
            </thead>

            <tbody>
              {items.map(({ invoice, paymentTotals, emailSummary }) => {
                const isOverdue = paymentTotals.status === "overdue";
                const isOpenBalance = paymentTotals.status === "unpaid" || paymentTotals.status === "partially_paid" || paymentTotals.status === "overdue";
                const EmailIcon = emailTypeIcon(emailSummary?.lastEmailType);
                return (
                <tr key={invoice.id} className={`border-t border-slate-100 ${isOverdue ? "bg-rose-50/30" : ""}`}>
                  <td className="px-4 py-3">
                    <div className="font-semibold text-slate-900">{invoice.invoiceNo ?? "- (draft)"}</div>
                    <div className="mt-1 text-xs text-slate-500">{invoice.id}</div>
                    <div className="mt-2 text-xs text-slate-500">
                      Order <span className="font-mono font-semibold text-slate-700">{invoice.orderId}</span>
                    </div>
                  </td>

                  <td className="px-4 py-3">
                    <div className="font-medium text-slate-900">{invoice.billTo?.name ?? "-"}</div>
                    <div className="mt-1 text-xs text-slate-500">{invoice.billTo?.email ?? "-"}</div>
                  </td>

                  <td className="px-4 py-3">
                    <div className="text-sm text-slate-700">Issued {formatDate(invoice.issueDate)}</div>
                    <div className={`mt-2 inline-flex rounded-full px-2 py-1 text-xs font-semibold ${isOverdue ? "bg-rose-100 text-rose-800" : "bg-slate-100 text-slate-700"}`}>
                      Due {formatDate(invoice.dueDate)}
                    </div>
                  </td>

                  <td className="px-4 py-3 text-right">
                    <div className={`font-semibold ${isOpenBalance ? "text-[#2A2A2A]" : "text-slate-900"}`}>
                      {moneyFromCents(paymentTotals.balanceCents)}
                    </div>
                    <div className="mt-1 text-xs text-slate-500">
                      Total {moneyFromCents(invoice.totalInclGstCents)}
                    </div>
                  </td>

                  <td className="px-4 py-3">
                    <span className={["rounded-full px-2 py-1 text-xs font-semibold", statusChip(invoice.status)].join(" ")}>
                      {invoice.status.toUpperCase()}
                    </span>
                  </td>

                  <td className="px-4 py-3">
                    <div className="space-y-2">
                      <span className={["rounded-full px-2 py-1 text-xs font-semibold", paymentStatusChip(paymentTotals.status)].join(" ")}>
                        {paymentStatusLabel(paymentTotals.status).toUpperCase()}
                      </span>
                      {isOpenBalance && (
                        <div className="text-xs text-slate-500">
                          Outstanding <span className="font-semibold text-slate-700">{moneyFromCents(paymentTotals.balanceCents)}</span>
                        </div>
                      )}
                    </div>
                  </td>

                  <td className="px-4 py-3">
                    {emailSummary?.emailCount ? (
                      <div className="space-y-1.5">
                        <span
                          className={[
                            "inline-flex items-center gap-1.5 rounded-full px-2 py-1 text-xs font-semibold",
                            emailTypeChip(emailSummary.lastEmailType),
                          ].join(" ")}
                        >
                          <EmailIcon className="h-3.5 w-3.5" />
                          {emailTypeLabel(emailSummary.lastEmailType).toUpperCase()}
                        </span>
                        <div className="text-xs text-slate-500">{formatDateTime(emailSummary.lastEmailAt)}</div>
                        <div className="text-xs text-slate-400">
                          {emailSummary.emailCount} email{emailSummary.emailCount === 1 ? "" : "s"}
                        </div>
                      </div>
                    ) : (
                      <div className="text-xs text-slate-400">No email sent</div>
                    )}
                  </td>

                  <td className="px-4 py-3">
                    <div className="flex flex-wrap gap-2">
                      <button
                        type="button"
                        onClick={() => router.push(`/admin/rental/invoices/${encodeURIComponent(invoice.id)}`)}
                        className="rounded-lg bg-slate-900 px-3 py-2 text-xs font-semibold text-white hover:bg-slate-800"
                      >
                        <span className="inline-flex items-center gap-2">
                          <ReceiptText className="h-4 w-4" />
                          View invoice
                        </span>
                      </button>

                      <button
                        type="button"
                        onClick={() => router.push(`/admin/rental/orders`)}
                        className="rounded-lg border border-slate-200 bg-white px-3 py-2 text-xs font-semibold text-slate-700 hover:bg-slate-50"
                        title="Create/view invoices via Orders in MVP"
                      >
                        <span className="inline-flex items-center gap-2">
                          <ArrowLeft className="h-4 w-4" />
                          Related order
                        </span>
                      </button>
                    </div>
                  </td>
                </tr>
              )})}
            </tbody>
          </table>
        </div>
      )}

      {!loading && pagination.totalItems > 0 && (
        <div className="mt-4 flex items-center justify-between gap-3 rounded-2xl border border-slate-200 bg-white px-4 py-3 shadow-sm">
          <div className="text-sm text-slate-600">
            Showing page <span className="font-semibold text-slate-900">{pagination.page}</span> of{" "}
            <span className="font-semibold text-slate-900">{pagination.totalPages}</span> ({pagination.totalItems} invoices)
          </div>
          <div className="flex items-center gap-2">
            <button
              type="button"
              disabled={pagination.page <= 1 || loading}
              onClick={() => setPage((current) => Math.max(1, current - 1))}
              className={[
                "rounded-lg px-3 py-2 text-sm font-semibold",
                pagination.page <= 1 || loading
                  ? "bg-slate-100 text-slate-400"
                  : "border border-slate-200 bg-white text-slate-700 hover:bg-slate-50",
              ].join(" ")}
            >
              Previous
            </button>
            <button
              type="button"
              disabled={pagination.page >= pagination.totalPages || loading}
              onClick={() => setPage((current) => Math.min(pagination.totalPages, current + 1))}
              className={[
                "rounded-lg px-3 py-2 text-sm font-semibold",
                pagination.page >= pagination.totalPages || loading
                  ? "bg-slate-100 text-slate-400"
                  : "border border-slate-200 bg-white text-slate-700 hover:bg-slate-50",
              ].join(" ")}
            >
              Next
            </button>
          </div>
        </div>
      )}
    </div>
  );
}
