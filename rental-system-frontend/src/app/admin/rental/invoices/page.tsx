// src/app/admin/rental/invoices/page.tsx
"use client";

import { useEffect, useMemo, useState } from "react";
import { useRouter } from "next/navigation";

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
    const issuedCount = items.filter(({ invoice }) => invoice.status === "issued").length;
    const draftCount = items.filter(({ invoice }) => invoice.status === "draft").length;
    const voidCount = items.filter(({ invoice }) => invoice.status === "void").length;
    return { total, totalInclGstCents, issuedCount, draftCount, voidCount };
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
    <div className="mx-auto max-w-6xl p-4">
      <div className="flex items-start justify-between gap-4">
        <div>
          <h1 className="text-2xl font-semibold text-slate-900">Invoices</h1>
          <p className="mt-1 text-sm text-slate-600">
            DB-backed invoice list. Search by invoice no, order ref, customer, or payment status.
          </p>
        </div>

        <div className="flex items-center gap-2">
          <button
            type="button"
            onClick={() => router.push("/admin/rental/orders")}
            className="rounded-lg border border-slate-200 bg-white px-3 py-2 text-sm font-semibold text-slate-700 hover:bg-slate-50"
          >
            Orders
          </button>

          <button
            type="button"
            onClick={() => refresh({ q: searchDraft, status, paymentStatus })}
            className="rounded-lg border border-slate-200 bg-white px-3 py-2 text-sm font-semibold text-slate-700 hover:bg-slate-50"
          >
            Refresh
          </button>

          <button
            type="button"
            onClick={onExportCsv}
            className="rounded-lg bg-slate-900 px-3 py-2 text-sm font-semibold text-white hover:bg-slate-800"
          >
            Export CSV
          </button>

          <button
            type="button"
            onClick={onExportPaymentsCsv}
            className="rounded-lg border border-slate-200 bg-white px-3 py-2 text-sm font-semibold text-slate-700 hover:bg-slate-50"
          >
            Export Payments CSV
          </button>
        </div>
      </div>

      <div className="mt-6 grid gap-3 rounded-2xl border border-slate-200 bg-white p-4 shadow-sm md:grid-cols-12 md:items-center">
        <div className="md:col-span-5">
          <label className="text-xs font-semibold text-slate-600">Search</label>
          <input
            value={searchDraft}
            onChange={(e) => {
              setSearchDraft(e.target.value);
              setQ(e.target.value);
              setPage(1);
            }}
            placeholder="invoice no / customer / contact person"
            className="mt-1 w-full rounded-xl border border-slate-200 bg-white px-3 py-2 text-sm outline-none focus:border-sky-400"
          />
        </div>

        <div className="md:col-span-3">
          <label className="text-xs font-semibold text-slate-600">Lifecycle Status</label>
          <select
            value={status}
            onChange={(e) => {
              setStatus(e.target.value as StatusFilter);
              setPage(1);
            }}
            className="mt-1 w-full rounded-xl border border-slate-200 bg-white px-3 py-2 text-sm outline-none focus:border-sky-400"
          >
            <option value="all">All</option>
            <option value="draft">Draft</option>
            <option value="issued">Issued</option>
            <option value="void">Void</option>
          </select>
        </div>

        <div className="md:col-span-2">
          <label className="text-xs font-semibold text-slate-600">Payment Status</label>
          <select
            value={paymentStatus}
            onChange={(e) => {
              setPaymentStatus(e.target.value as PaymentStatusFilter);
              setPage(1);
            }}
            className="mt-1 w-full rounded-xl border border-slate-200 bg-white px-3 py-2 text-sm outline-none focus:border-sky-400"
          >
            <option value="all">All</option>
            <option value="unpaid">Unpaid</option>
            <option value="partially_paid">Partially Paid</option>
            <option value="paid">Paid</option>
            <option value="overdue">Overdue</option>
          </select>
        </div>

        <div className="md:col-span-2">
          <label className="text-xs font-semibold text-slate-600">Sort</label>
          <div className="mt-1 grid grid-cols-2 gap-2">
            <select
              value={sortBy}
              onChange={(e) => {
                setSortBy(e.target.value as InvoiceListSortBy);
                setPage(1);
              }}
              className="w-full rounded-xl border border-slate-200 bg-white px-3 py-2 text-sm outline-none focus:border-sky-400"
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
              className="w-full rounded-xl border border-slate-200 bg-white px-3 py-2 text-sm outline-none focus:border-sky-400"
            >
              <option value="desc">Desc</option>
              <option value="asc">Asc</option>
            </select>
          </div>
        </div>

        <div className="md:col-span-12 grid grid-cols-1 gap-2 sm:grid-cols-4">
          <div className="rounded-xl border border-slate-200 bg-slate-50 p-3">
            <div className="text-[11px] font-semibold uppercase tracking-wide text-slate-500">Invoices</div>
            <div className="mt-1 text-lg font-semibold text-slate-900">{summary.total}</div>
          </div>
          <div className="rounded-xl border border-slate-200 bg-slate-50 p-3">
            <div className="text-[11px] font-semibold uppercase tracking-wide text-slate-500">Page</div>
            <div className="mt-1 text-lg font-semibold text-slate-900">
              {pagination.page} / {pagination.totalPages}
            </div>
          </div>
          <div className="rounded-xl border border-slate-200 bg-slate-50 p-3">
            <div className="text-[11px] font-semibold uppercase tracking-wide text-slate-500">Page Size</div>
            <select
              value={pageSize}
              onChange={(e) => {
                setPageSize(Number(e.target.value) as PageSizeOption);
                setPage(1);
              }}
              className="mt-1 w-full rounded-lg border border-slate-200 bg-white px-2 py-1 text-sm outline-none focus:border-sky-400"
            >
              <option value={10}>10</option>
              <option value={20}>20</option>
              <option value={50}>50</option>
            </select>
          </div>
          <div className="rounded-xl border border-slate-200 bg-slate-50 p-3">
            <div className="text-[11px] font-semibold uppercase tracking-wide text-slate-500">Showing</div>
            <div className="mt-1 text-lg font-semibold text-slate-900">{items.length}</div>
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
            className="font-semibold text-sky-700 hover:underline"
            onClick={() => router.push("/admin/rental/orders")}
            type="button"
          >
            Orders
          </button>
          .
        </div>
      ) : (
        <div className="mt-6 overflow-hidden rounded-xl border border-slate-200 bg-white">
          <table className="w-full text-left text-sm">
            <thead className="bg-slate-50 text-xs uppercase tracking-wide text-slate-500">
              <tr>
                <th className="px-4 py-3">Invoice</th>
                <th className="px-4 py-3">Order Ref</th>
                <th className="px-4 py-3">Customer</th>
                <th className="px-4 py-3">Issue Date</th>
                <th className="px-4 py-3">Due Date</th>
                <th className="px-4 py-3 text-right">Total (incl GST)</th>
                <th className="px-4 py-3">Status</th>
                <th className="px-4 py-3">Payment</th>
                <th className="px-4 py-3">Last Email</th>
                <th className="px-4 py-3">Actions</th>
              </tr>
            </thead>

            <tbody>
              {items.map(({ invoice, paymentTotals, emailSummary }) => (
                <tr key={invoice.id} className="border-t border-slate-100">
                  <td className="px-4 py-3">
                    <div className="font-semibold text-slate-900">{invoice.invoiceNo ?? "- (draft)"}</div>
                    <div className="text-xs text-slate-500">{invoice.id}</div>
                  </td>

                  <td className="px-4 py-3">
                    <span className="font-mono text-xs font-semibold text-slate-900">{invoice.orderId}</span>
                  </td>

                  <td className="px-4 py-3">
                    <div className="font-medium text-slate-900">{invoice.billTo?.name ?? "-"}</div>
                    <div className="text-xs text-slate-500">{invoice.billTo?.email ?? "-"}</div>
                  </td>

                  <td className="px-4 py-3 text-slate-700">{formatDate(invoice.issueDate)}</td>
                  <td className="px-4 py-3 text-slate-700">{formatDate(invoice.dueDate)}</td>

                  <td className="px-4 py-3 text-right">
                    <div className="font-semibold text-slate-900">{moneyFromCents(invoice.totalInclGstCents)}</div>
                    <div className="text-xs text-slate-500">
                      Balance: {moneyFromCents(paymentTotals.balanceCents)}
                    </div>
                  </td>

                  <td className="px-4 py-3">
                    <span className={["rounded-full px-2 py-1 text-xs font-semibold", statusChip(invoice.status)].join(" ")}>
                      {invoice.status.toUpperCase()}
                    </span>
                  </td>

                  <td className="px-4 py-3">
                    <span className={["rounded-full px-2 py-1 text-xs font-semibold", paymentStatusChip(paymentTotals.status)].join(" ")}>
                      {paymentStatusLabel(paymentTotals.status).toUpperCase()}
                    </span>
                  </td>

                  <td className="px-4 py-3">
                    {emailSummary?.emailCount ? (
                      <div className="space-y-1">
                        <span
                          className={[
                            "inline-flex rounded-full px-2 py-1 text-xs font-semibold",
                            emailTypeChip(emailSummary.lastEmailType),
                          ].join(" ")}
                        >
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
                        View
                      </button>

                      <button
                        type="button"
                        onClick={() => router.push(`/admin/rental/orders`)}
                        className="rounded-lg border border-slate-200 bg-white px-3 py-2 text-xs font-semibold text-slate-700 hover:bg-slate-50"
                        title="Create/view invoices via Orders in MVP"
                      >
                        Go to Orders
                      </button>
                    </div>
                  </td>
                </tr>
              ))}
            </tbody>
          </table>
        </div>
      )}

      {!loading && pagination.totalItems > 0 && (
        <div className="mt-4 flex items-center justify-between gap-3 rounded-xl border border-slate-200 bg-white px-4 py-3">
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

      <div className="mt-4 grid gap-3 sm:grid-cols-3">
        <div className="rounded-xl border border-slate-200 bg-white p-4">
          <div className="text-xs uppercase tracking-wide text-slate-500">Draft</div>
          <div className="mt-1 text-xl font-semibold text-slate-900">{summary.draftCount}</div>
        </div>
        <div className="rounded-xl border border-slate-200 bg-white p-4">
          <div className="text-xs uppercase tracking-wide text-slate-500">Issued</div>
          <div className="mt-1 text-xl font-semibold text-slate-900">{summary.issuedCount}</div>
        </div>
        <div className="rounded-xl border border-slate-200 bg-white p-4">
          <div className="text-xs uppercase tracking-wide text-slate-500">Void</div>
          <div className="mt-1 text-xl font-semibold text-slate-900">{summary.voidCount}</div>
        </div>
      </div>
    </div>
  );
}
