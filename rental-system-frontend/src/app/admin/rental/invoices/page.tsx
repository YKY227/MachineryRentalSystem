// src/app/admin/rental/invoices/page.tsx
"use client";

import { useEffect, useMemo, useState } from "react";
import { useRouter } from "next/navigation";

import { localInvoiceRepo, INVOICES_LS_KEY } from "@/lib/rental/invoices/local-invoice-repo";
import type { Invoice } from "@/lib/rental/invoices/types";

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
  if (!iso) return "—";
  const d = new Date(iso);
  if (Number.isNaN(d.getTime())) return iso;
  return d.toLocaleDateString("en-SG", { year: "numeric", month: "short", day: "2-digit" });
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

type StatusFilter = "all" | Invoice["status"];

export default function AdminInvoicesPage() {
  const router = useRouter();

  const [items, setItems] = useState<Invoice[]>([]);
  const [status, setStatus] = useState<StatusFilter>("all");
  const [q, setQ] = useState("");

  function refresh() {
    setItems(localInvoiceRepo.list());
  }

  useEffect(() => {
    refresh();
  }, []);

  const filtered = useMemo(() => {
    const query = q.trim().toLowerCase();

    return items.filter((inv) => {
      if (status !== "all" && inv.status !== status) return false;

      if (!query) return true;

      const hay = [
        inv.invoiceNo ?? "",
        inv.orderId ?? "",
        inv.billTo?.name ?? "",
        inv.billTo?.email ?? "",
      ]
        .join(" ")
        .toLowerCase();

      return hay.includes(query);
    });
  }, [items, status, q]);

  const summary = useMemo(() => {
    const total = filtered.length;
    const totalInclGstCents = filtered.reduce((sum, inv) => sum + (inv.totalInclGstCents ?? 0), 0);
    const issuedCount = filtered.filter((x) => x.status === "issued").length;
    const draftCount = filtered.filter((x) => x.status === "draft").length;
    const voidCount = filtered.filter((x) => x.status === "void").length;
    return { total, totalInclGstCents, issuedCount, draftCount, voidCount };
  }, [filtered]);

  function clearAllInvoices() {
    const ok = window.confirm(
      "Clear ALL invoices from localStorage?\n\nThis is for demo only and cannot be undone."
    );
    if (!ok) return;
    localStorage.removeItem(INVOICES_LS_KEY);
    refresh();
  }

  return (
    <div className="mx-auto max-w-6xl p-4">
      <div className="flex items-start justify-between gap-4">
        <div>
          <h1 className="text-2xl font-semibold text-slate-900">Invoices (Mock)</h1>
          <p className="mt-1 text-sm text-slate-600">
            Frontend-only (localStorage). Create invoices from Orders. Search by invoice no, order ref, or customer.
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
            onClick={refresh}
            className="rounded-lg border border-slate-200 bg-white px-3 py-2 text-sm font-semibold text-slate-700 hover:bg-slate-50"
          >
            Refresh
          </button>

          <button
            type="button"
            onClick={clearAllInvoices}
            className="rounded-lg border border-rose-200 bg-rose-50 px-3 py-2 text-sm font-semibold text-rose-700 hover:bg-rose-100"
            title="Demo only: clears local invoice storage"
          >
            Clear invoices
          </button>
        </div>
      </div>

      {/* Controls */}
      <div className="mt-6 grid gap-3 rounded-2xl border border-slate-200 bg-white p-4 shadow-sm md:grid-cols-12 md:items-center">
        <div className="md:col-span-5">
          <label className="text-xs font-semibold text-slate-600">Search</label>
          <input
            value={q}
            onChange={(e) => setQ(e.target.value)}
            placeholder="invoice no / order ref / customer"
            className="mt-1 w-full rounded-xl border border-slate-200 bg-white px-3 py-2 text-sm outline-none focus:border-sky-400"
          />
        </div>

        <div className="md:col-span-3">
          <label className="text-xs font-semibold text-slate-600">Status</label>
          <select
            value={status}
            onChange={(e) => setStatus(e.target.value as StatusFilter)}
            className="mt-1 w-full rounded-xl border border-slate-200 bg-white px-3 py-2 text-sm outline-none focus:border-sky-400"
          >
            <option value="all">All</option>
            <option value="draft">Draft</option>
            <option value="issued">Issued</option>
            <option value="void">Void</option>
          </select>
        </div>

        <div className="md:col-span-4 grid grid-cols-3 gap-2">
          <div className="rounded-xl border border-slate-200 bg-slate-50 p-3">
            <div className="text-[11px] font-semibold uppercase tracking-wide text-slate-500">Invoices</div>
            <div className="mt-1 text-lg font-semibold text-slate-900">{summary.total}</div>
          </div>
          <div className="rounded-xl border border-slate-200 bg-slate-50 p-3">
            <div className="text-[11px] font-semibold uppercase tracking-wide text-slate-500">Issued</div>
            <div className="mt-1 text-lg font-semibold text-slate-900">{summary.issuedCount}</div>
          </div>
          <div className="rounded-xl border border-slate-200 bg-slate-50 p-3">
            <div className="text-[11px] font-semibold uppercase tracking-wide text-slate-500">Total (incl GST)</div>
            <div className="mt-1 text-lg font-semibold text-slate-900">
              {moneyFromCents(summary.totalInclGstCents)}
            </div>
          </div>
        </div>
      </div>

      {/* Table */}
      {filtered.length === 0 ? (
        <div className="mt-6 rounded-xl border border-slate-200 bg-white p-6 text-sm text-slate-600">
          No invoices found. Create one from{" "}
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
                <th className="px-4 py-3 text-right">Total (incl GST)</th>
                <th className="px-4 py-3">Status</th>
                <th className="px-4 py-3">Actions</th>
              </tr>
            </thead>

            <tbody>
              {filtered.map((inv) => (
                <tr key={inv.id} className="border-t border-slate-100">
                  <td className="px-4 py-3">
                    <div className="font-semibold text-slate-900">{inv.invoiceNo ?? "— (draft)"}</div>
                    <div className="text-xs text-slate-500">{inv.id}</div>
                  </td>

                  <td className="px-4 py-3">
                    <span className="font-mono text-xs font-semibold text-slate-900">{inv.orderId}</span>
                  </td>

                  <td className="px-4 py-3">
                    <div className="font-medium text-slate-900">{inv.billTo?.name ?? "—"}</div>
                    <div className="text-xs text-slate-500">{inv.billTo?.email ?? "—"}</div>
                  </td>

                  <td className="px-4 py-3 text-slate-700">{formatDate(inv.issueDate)}</td>

                  <td className="px-4 py-3 text-right">
                    <div className="font-semibold text-slate-900">{moneyFromCents(inv.totalInclGstCents)}</div>
                    <div className="text-xs text-slate-500">
                      Excl GST: {moneyFromCents(inv.subtotalExclGstCents)}
                    </div>
                  </td>

                  <td className="px-4 py-3">
                    <span className={["rounded-full px-2 py-1 text-xs font-semibold", statusChip(inv.status)].join(" ")}>
                      {inv.status.toUpperCase()}
                    </span>
                  </td>

                  <td className="px-4 py-3">
                    <div className="flex flex-wrap gap-2">
                      <button
                        type="button"
                        onClick={() => router.push(`/admin/rental/invoices/${encodeURIComponent(inv.id)}`)}
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

          <div className="border-t border-slate-100 bg-slate-50 p-3 text-xs text-slate-500">
            Invoices are stored in localStorage key: <span className="font-mono">{INVOICES_LS_KEY}</span>.
          </div>
        </div>
      )}

      {/* Lightweight breakdown */}
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