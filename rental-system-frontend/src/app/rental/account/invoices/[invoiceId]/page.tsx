"use client";

import Link from "next/link";
import { useParams, useSearchParams } from "next/navigation";
import { useEffect, useState } from "react";

import type { RentalOrderDepositSummary } from "@/lib/rental/deposits/types";
import type { Invoice, InvoicePayment, InvoicePaymentTotals } from "@/lib/rental/invoices/types";
import type { RentalOrder } from "@/lib/rental/orders/types";

type CustomerInvoiceDetailResponse = {
  invoice: Invoice;
  order: RentalOrder;
  payments: InvoicePayment[];
  paymentTotals: InvoicePaymentTotals;
  depositSummary: RentalOrderDepositSummary | null;
};

function moneyFromCents(cents: number) {
  return new Intl.NumberFormat("en-SG", {
    style: "currency",
    currency: "SGD",
    minimumFractionDigits: 2,
    maximumFractionDigits: 2,
  }).format((Number.isFinite(cents) ? cents : 0) / 100);
}

function formatDate(value?: string) {
  if (!value) return "-";
  const date = new Date(value);
  if (Number.isNaN(date.getTime())) return value;
  return date.toLocaleDateString("en-SG", {
    day: "2-digit",
    month: "short",
    year: "numeric",
  });
}

function invoiceStatusLabel(status: Invoice["status"]) {
  switch (status) {
    case "issued":
      return "Issued";
    case "void":
      return "Void";
    case "draft":
    default:
      return "Draft";
  }
}

function paymentStatusLabel(status: InvoicePaymentTotals["status"]) {
  switch (status) {
    case "paid":
      return "Paid";
    case "partially_paid":
      return "Partially paid";
    case "overdue":
      return "Overdue";
    case "unpaid":
    default:
      return "Unpaid";
  }
}

export default function RentalCustomerInvoiceDetailPage() {
  const params = useParams();
  const searchParams = useSearchParams();
  const invoiceId = String(params?.invoiceId ?? "");
  const paymentQueryState = searchParams?.get("payment") ?? "";

  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);
  const [paying, setPaying] = useState(false);
  const [paymentError, setPaymentError] = useState<string | null>(null);
  const [detail, setDetail] = useState<CustomerInvoiceDetailResponse | null>(null);

  useEffect(() => {
    let mounted = true;

    (async () => {
      try {
        setLoading(true);
        const res = await fetch(`/api/public/rental/invoices/${encodeURIComponent(invoiceId)}`, {
          cache: "no-store",
        });
        const data = await res.json().catch(() => ({}));
        if (!mounted) return;
        if (!res.ok) throw new Error(data?.error ?? "Failed to load invoice");
        setDetail((data ?? null) as CustomerInvoiceDetailResponse | null);
      } catch (nextError) {
        if (!mounted) return;
        setError(nextError instanceof Error ? nextError.message : "Failed to load invoice");
      } finally {
        if (mounted) setLoading(false);
      }
    })();

    return () => {
      mounted = false;
    };
  }, [invoiceId]);

  if (loading) {
    return (
      <div className="mx-auto max-w-5xl p-4">
        <div className="rounded-2xl border border-slate-200 bg-white p-6 text-sm text-slate-600 shadow-sm">
          Loading invoice...
        </div>
      </div>
    );
  }

  if (error || !detail) {
    return (
      <div className="mx-auto max-w-5xl p-4">
        <div className="rounded-2xl border border-rose-200 bg-rose-50 p-6 text-sm text-rose-700 shadow-sm">
          {error ?? "Invoice not found."}
        </div>
      </div>
    );
  }

  const { invoice, order, paymentTotals, payments, depositSummary } = detail;
  const canDownloadPdf = invoice.status === "issued";
  const canPayNow = invoice.status === "issued" && paymentTotals.balanceCents > 0;
  const paymentNotice =
    paymentQueryState === "submitted"
      ? "Payment submitted. Invoice status will update after webhook confirmation is processed."
      : null;

  async function handlePayNow() {
    if (!canPayNow || paying) return;

    try {
      setPaying(true);
      setPaymentError(null);
      const res = await fetch(`/api/public/rental/invoices/${encodeURIComponent(invoice.id)}/pay`, {
        method: "POST",
        headers: { "Content-Type": "application/json" },
      });
      const data = await res.json().catch(() => ({}));
      if (!res.ok) throw new Error(data?.error ?? "Failed to start invoice payment");

      const redirectUrl = String(data?.redirectUrl ?? "").trim();
      if (!redirectUrl) throw new Error("Missing hosted payment URL");
      window.location.href = redirectUrl;
    } catch (nextError) {
      setPaymentError(nextError instanceof Error ? nextError.message : "Failed to start invoice payment");
      setPaying(false);
    }
  }

  return (
    <div className="mx-auto max-w-5xl p-4">
      <div className="flex flex-wrap items-start justify-between gap-4">
        <div>
          <p className="text-xs font-semibold uppercase tracking-wide text-slate-500">Customer invoice</p>
          <h1 className="mt-1 text-2xl font-semibold text-slate-900">{invoice.invoiceNo ?? invoice.id}</h1>
          <p className="mt-1 text-sm text-slate-600">
            Order {order.id} | {order.equipmentTitle}
          </p>
        </div>
        <div className="flex flex-wrap gap-3">
          <Link
            href="/rental/account"
            className="rounded-xl border border-slate-200 bg-white px-4 py-2 text-sm font-semibold text-slate-700 hover:bg-slate-50"
          >
            Back to account
          </Link>
          {canPayNow && (
            <button
              type="button"
              onClick={handlePayNow}
              disabled={paying}
              className="rounded-xl border border-emerald-200 bg-emerald-600 px-4 py-2 text-sm font-semibold text-white hover:bg-emerald-700 disabled:bg-emerald-300"
            >
              {paying ? "Redirecting..." : "Pay Now"}
            </button>
          )}
          {canDownloadPdf && (
            <a
              href={`/api/public/rental/invoices/${encodeURIComponent(invoice.id)}/pdf`}
              className="rounded-xl bg-slate-900 px-4 py-2 text-sm font-semibold text-white hover:bg-slate-800"
            >
              Download PDF
            </a>
          )}
        </div>
      </div>

      {paymentNotice && (
        <div className="mt-6 rounded-2xl border border-amber-200 bg-amber-50 p-4 text-sm text-amber-800">
          {paymentNotice}
        </div>
      )}

      {paymentError && (
        <div className="mt-6 rounded-2xl border border-rose-200 bg-rose-50 p-4 text-sm text-rose-700">
          {paymentError}
        </div>
      )}

      <div className="mt-6 grid gap-6 lg:grid-cols-3">
        <section className="rounded-2xl border border-slate-200 bg-white p-5 shadow-sm lg:col-span-2">
          <h2 className="text-sm font-semibold text-slate-900">Invoice summary</h2>
          <div className="mt-4 grid gap-4 md:grid-cols-2">
            <Field label="Invoice number" value={invoice.invoiceNo ?? invoice.id} />
            <Field label="Lifecycle status" value={invoiceStatusLabel(invoice.status)} />
            <Field label="Issue date" value={formatDate(invoice.issueDate)} />
            <Field label="Due date" value={formatDate(invoice.dueDate)} />
            <Field label="Payment status" value={paymentStatusLabel(paymentTotals.status)} />
            <Field label="Linked order" value={order.id} />
          </div>

          <div className="mt-6 overflow-hidden rounded-xl border border-slate-200">
            <table className="w-full text-left text-sm">
              <thead className="bg-slate-50 text-xs uppercase tracking-wide text-slate-500">
                <tr>
                  <th className="px-4 py-3">Description</th>
                  <th className="px-4 py-3 text-right">Qty</th>
                  <th className="px-4 py-3 text-right">Amount</th>
                </tr>
              </thead>
              <tbody>
                {invoice.items.map((item, index) => (
                  <tr key={`${item.description}-${index}`} className="border-t border-slate-100">
                    <td className="px-4 py-3 text-slate-900">{item.description}</td>
                    <td className="px-4 py-3 text-right text-slate-700">{item.qty}</td>
                    <td className="px-4 py-3 text-right font-semibold text-slate-900">
                      {moneyFromCents(item.amountExclGstCents)}
                    </td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
        </section>

        <section className="rounded-2xl border border-slate-200 bg-white p-5 shadow-sm">
          <h2 className="text-sm font-semibold text-slate-900">Amounts</h2>
          <div className="mt-4 space-y-3 text-sm">
            <AmountRow label="Total amount" value={moneyFromCents(invoice.totalInclGstCents)} />
            <AmountRow label="Paid amount" value={moneyFromCents(paymentTotals.paidCents)} />
            <AmountRow label="Outstanding" value={moneyFromCents(paymentTotals.balanceCents)} />
            <AmountRow
              label="Deposit"
              value={moneyFromCents(typeof invoice.depositCents === "number" ? invoice.depositCents : 0)}
            />
          </div>

          {depositSummary && depositSummary.requiredAmountCents > 0 && (
            <div className="mt-6 rounded-xl border border-slate-200 bg-slate-50 p-4 text-xs text-slate-600">
              <div className="font-semibold text-slate-900">Deposit status</div>
              <div className="mt-2">Required: {moneyFromCents(depositSummary.requiredAmountCents)}</div>
              <div>Held: {moneyFromCents(depositSummary.heldAmountCents)}</div>
              <div>Released: {moneyFromCents(depositSummary.releasedAmountCents)}</div>
              <div>Retained: {moneyFromCents(depositSummary.retainedAmountCents)}</div>
              <div>Unresolved: {moneyFromCents(depositSummary.unresolvedAmountCents)}</div>
              <div>Status: {depositSummary.status}</div>
            </div>
          )}
        </section>
      </div>

      <section className="mt-6 rounded-2xl border border-slate-200 bg-white p-5 shadow-sm">
        <h2 className="text-sm font-semibold text-slate-900">Payment history</h2>
        {payments.length === 0 ? (
          <p className="mt-4 text-sm text-slate-600">No payments recorded for this invoice yet.</p>
        ) : (
          <div className="mt-4 overflow-hidden rounded-xl border border-slate-200">
            <table className="w-full text-left text-sm">
              <thead className="bg-slate-50 text-xs uppercase tracking-wide text-slate-500">
                <tr>
                  <th className="px-4 py-3">Paid at</th>
                  <th className="px-4 py-3 text-right">Amount</th>
                  <th className="px-4 py-3">Method</th>
                  <th className="px-4 py-3">Reference</th>
                  <th className="px-4 py-3 text-right">Receipt</th>
                </tr>
              </thead>
              <tbody>
                {payments.map((payment) => (
                  <tr key={payment.id} className="border-t border-slate-100">
                    <td className="px-4 py-3 text-slate-700">{formatDate(payment.paidAt)}</td>
                    <td className="px-4 py-3 text-right font-semibold text-slate-900">
                      {moneyFromCents(payment.amountCents)}
                    </td>
                    <td className="px-4 py-3 text-slate-700">{payment.method ?? "-"}</td>
                    <td className="px-4 py-3 text-slate-700">{payment.reference ?? "-"}</td>
                    <td className="px-4 py-3 text-right">
                      <a
                        href={`/api/public/rental/payments/${encodeURIComponent(payment.id)}/receipt`}
                        className="rounded-lg border border-slate-200 bg-white px-3 py-1.5 text-xs font-semibold text-slate-700 hover:bg-slate-50"
                      >
                        Download Receipt
                      </a>
                    </td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
        )}
      </section>
    </div>
  );
}

function Field(input: { label: string; value: string }) {
  return (
    <div>
      <div className="text-xs font-semibold uppercase tracking-wide text-slate-500">{input.label}</div>
      <div className="mt-1 text-sm text-slate-900">{input.value}</div>
    </div>
  );
}

function AmountRow(input: { label: string; value: string }) {
  return (
    <div className="flex items-center justify-between rounded-xl border border-slate-200 bg-slate-50 px-3 py-2">
      <span className="text-slate-600">{input.label}</span>
      <span className="font-semibold text-slate-900">{input.value}</span>
    </div>
  );
}
