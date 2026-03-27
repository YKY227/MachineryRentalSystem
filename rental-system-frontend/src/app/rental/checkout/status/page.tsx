"use client";

import { Suspense, useCallback, useEffect, useState } from "react";
import Link from "next/link";
import { LoaderCircle } from "lucide-react";
import { useSearchParams } from "next/navigation";

import type { RentalOrderDepositSummary } from "@/lib/rental/deposits/types";
import type { Invoice } from "@/lib/rental/invoices/types";
import type { RentalOrder, RentalOrderPaymentSession } from "@/lib/rental/orders/types";

const STATUS_POLL_INTERVAL_MS = 2500;
const STATUS_POLL_MAX_ATTEMPTS = 8;

function moneyFromCents(cents: number) {
  return new Intl.NumberFormat("en-SG", {
    style: "currency",
    currency: "SGD",
    minimumFractionDigits: 2,
    maximumFractionDigits: 2,
  }).format((Number.isFinite(cents) ? cents : 0) / 100);
}

function formatStatus(status?: RentalOrderPaymentSession["status"]) {
  switch (status) {
    case "paid":
      return "Payment successful";
    case "failed":
      return "Payment failed";
    case "expired":
      return "Payment expired";
    case "cancelled":
      return "Payment cancelled";
    case "pending":
    default:
      return "Payment pending";
  }
}

function formatCheckoutStatus(input: {
  paymentSession: RentalOrderPaymentSession | null;
  invoice: Invoice | null;
}) {
  if (!input.paymentSession && input.invoice) return "Invoice issued on credit terms";
  return formatStatus(input.paymentSession?.status);
}

function isTerminalCheckoutStatus(status?: RentalOrderPaymentSession["status"]) {
  return status === "paid" || status === "failed" || status === "expired" || status === "cancelled";
}

function formatDepositStatus(status?: RentalOrderDepositSummary["status"]) {
  switch (status) {
    case "held":
      return "Deposit held";
    case "partially_held":
      return "Deposit partially held";
    case "released":
      return "Deposit released";
    case "partially_released":
      return "Deposit partially released";
    case "retained":
      return "Deposit retained";
    case "partially_retained":
      return "Deposit partially retained";
    case "pending":
      return "Deposit pending";
    case "not_required":
    default:
      return "No deposit required";
  }
}

export default function RentalCheckoutStatusPage() {
  return (
    <Suspense
      fallback={
        <div className="mx-auto max-w-4xl p-4">
          <div className="rounded-xl border border-slate-200 bg-white p-6 text-sm text-slate-600">
            Loading payment status...
          </div>
        </div>
      }
    >
      <CheckoutStatusInner />
    </Suspense>
  );
}

function CheckoutStatusInner() {
  const searchParams = useSearchParams();
  const sessionId = searchParams?.get("sessionId") ?? "";
  const orderId = searchParams?.get("orderId") ?? "";

  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);
  const [notice, setNotice] = useState<string | null>(null);
  const [order, setOrder] = useState<RentalOrder | null>(null);
  const [paymentSession, setPaymentSession] = useState<RentalOrderPaymentSession | null>(null);
  const [invoice, setInvoice] = useState<Invoice | null>(null);
  const [depositSummary, setDepositSummary] = useState<RentalOrderDepositSummary | null>(null);
  const [isPolling, setIsPolling] = useState(false);
  const [pollAttempts, setPollAttempts] = useState(0);
  const [pollTimedOut, setPollTimedOut] = useState(false);

  useEffect(() => {
    if (typeof window === "undefined") return;
    const nextNotice = window.sessionStorage.getItem("rental_checkout_notice");
    if (!nextNotice) return;
    setNotice(nextNotice);
    window.sessionStorage.removeItem("rental_checkout_notice");
  }, []);

  const loadStatus = useCallback(
    async (options?: { background?: boolean }) => {
      const background = Boolean(options?.background);

      if (!sessionId && !orderId) {
        setError("Missing checkout reference.");
        setLoading(false);
        setIsPolling(false);
        return;
      }

      try {
        setError(null);
        if (background) {
          setIsPolling(true);
        } else {
          setLoading(true);
        }

        const query = sessionId
          ? `sessionId=${encodeURIComponent(sessionId)}`
          : `orderId=${encodeURIComponent(orderId)}`;
        const res = await fetch(`/api/public/rental/checkout/payment-status?${query}`, {
          cache: "no-store",
        });
        const data = await res.json().catch(() => ({}));
        if (!res.ok) throw new Error(data?.error ?? "Failed to load payment status");

        const nextPaymentSession = (data?.paymentSession ?? null) as RentalOrderPaymentSession | null;
        setOrder((data?.order ?? null) as RentalOrder | null);
        setPaymentSession(nextPaymentSession);
        setInvoice((data?.invoice ?? null) as Invoice | null);
        setDepositSummary((data?.depositSummary ?? null) as RentalOrderDepositSummary | null);

        if (!nextPaymentSession || isTerminalCheckoutStatus(nextPaymentSession.status)) {
          setPollTimedOut(false);
        }
      } catch (e) {
        setError(e instanceof Error ? e.message : "Failed to load payment status");
      } finally {
        if (background) {
          setIsPolling(false);
        } else {
          setLoading(false);
        }
      }
    },
    [orderId, sessionId]
  );

  useEffect(() => {
    setPollAttempts(0);
    setPollTimedOut(false);
    loadStatus();
  }, [loadStatus]);

  useEffect(() => {
    if (!sessionId) return;
    if (loading || isPolling || error) return;
    if (!paymentSession || paymentSession.status !== "pending") return;

    if (pollAttempts >= STATUS_POLL_MAX_ATTEMPTS) {
      setPollTimedOut(true);
      return;
    }

    const timer = window.setTimeout(async () => {
      await loadStatus({ background: true });
      setPollAttempts((current) => current + 1);
    }, STATUS_POLL_INTERVAL_MS);

    return () => window.clearTimeout(timer);
  }, [error, isPolling, loadStatus, loading, paymentSession, pollAttempts, sessionId]);

  return (
    <div className="mx-auto max-w-4xl p-4">
      <div className="rounded-2xl border border-slate-200 bg-white p-6 shadow-sm">
        <h1 className="text-2xl font-semibold text-slate-900">Checkout Status</h1>
        <p className="mt-1 text-sm text-slate-600">
          Checkout confirmation is loaded from trusted server-backed order, payment, and invoice state.
        </p>

        {loading ? (
          <div className="mt-6 rounded-xl border border-slate-200 bg-slate-50 p-4 text-sm text-slate-600">
            Checking payment status...
          </div>
        ) : error ? (
          <div className="mt-6 rounded-xl border border-rose-200 bg-rose-50 p-4 text-sm text-rose-700">
            {error}
          </div>
        ) : (
          <div className="mt-6 space-y-4">
            {notice && (
              <div className="rounded-xl border border-amber-200 bg-amber-50 p-4 text-sm text-amber-800">
                {notice}
              </div>
            )}

            <div className="rounded-xl border border-slate-200 bg-slate-50 p-4">
              <div className="text-xs font-semibold uppercase tracking-wide text-slate-500">Status</div>
              <div className="mt-1 text-lg font-semibold text-slate-900">
                {formatCheckoutStatus({ paymentSession, invoice })}
              </div>
            </div>

            {paymentSession?.status === "pending" && (
              <div className="rounded-xl border border-sky-200 bg-sky-50 p-4 text-sm text-sky-900">
                <div className="flex items-start gap-3">
                  <LoaderCircle
                    className={[
                      "mt-0.5 h-5 w-5 shrink-0 text-sky-600",
                      !pollTimedOut ? "animate-spin" : "",
                    ].join(" ")}
                  />
                  <div>
                    <div className="font-semibold">Confirming your payment...</div>
                    <div className="mt-1 text-sky-800">
                      We are still checking for the final payment confirmation from HitPay. This can take a few seconds after you return here.
                    </div>
                    {pollTimedOut && (
                      <div className="mt-2 text-xs text-sky-700">
                        Confirmation is taking longer than usual. You can stay on this page, refresh shortly, or check your account for the latest invoice and payment state.
                      </div>
                    )}
                  </div>
                </div>
              </div>
            )}

            {order && (
              <div className="rounded-xl border border-slate-200 p-4 text-sm">
                <div className="grid gap-3 sm:grid-cols-2">
                  <div>
                    <div className="text-xs text-slate-500">Order ID</div>
                    <div className="font-mono text-slate-900">{order.id}</div>
                  </div>
                  {paymentSession ? (
                    <div>
                      <div className="text-xs text-slate-500">Payment Session</div>
                      <div className="font-mono text-slate-900">{paymentSession.id}</div>
                    </div>
                  ) : invoice ? (
                    <div>
                      <div className="text-xs text-slate-500">Invoice</div>
                      <div className="font-mono text-slate-900">{invoice.invoiceNo ?? invoice.id}</div>
                    </div>
                  ) : null}
                  <div>
                    <div className="text-xs text-slate-500">Equipment</div>
                    <div className="font-medium text-slate-900">{order.equipmentTitle}</div>
                  </div>
                  <div>
                    <div className="text-xs text-slate-500">{paymentSession ? "Amount" : "Invoice Amount"}</div>
                    <div className="font-medium text-slate-900">
                      {paymentSession
                        ? moneyFromCents(paymentSession.amountCents)
                        : moneyFromCents(
                            Math.round(Number(order.pricingSnapshot?.payableTotal ?? 0) * 100)
                          )}
                    </div>
                    {paymentSession && Number(order.pricingSnapshot?.deposit ?? 0) > 0 && (
                      <div className="mt-1 text-xs text-slate-500">
                        Includes refundable deposit of{" "}
                        {moneyFromCents(Math.round(Number(order.pricingSnapshot?.deposit ?? 0) * 100))}
                      </div>
                    )}
                  </div>
                  <div>
                    <div className="text-xs text-slate-500">Rental Period</div>
                    <div className="font-medium text-slate-900">
                      {order.start} to {order.end}
                    </div>
                  </div>
                  <div>
                    <div className="text-xs text-slate-500">{paymentSession ? "Paid At" : "Billing Email"}</div>
                    <div className="font-medium text-slate-900">
                      {paymentSession ? paymentSession.paidAt ?? "-" : order.customerSnapshot?.email ?? "-"}
                    </div>
                  </div>
                  {depositSummary && depositSummary.requiredAmountCents > 0 && (
                    <div className="sm:col-span-2 rounded-lg border border-slate-200 bg-slate-50 p-3">
                      <div className="text-xs text-slate-500">Deposit</div>
                      <div className="mt-1 font-medium text-slate-900">
                        {formatDepositStatus(depositSummary.status)}
                      </div>
                      <div className="mt-1 text-xs text-slate-600">
                        Required: {moneyFromCents(depositSummary.requiredAmountCents)} | Held:{" "}
                        {moneyFromCents(depositSummary.heldAmountCents)} | Released:{" "}
                        {moneyFromCents(depositSummary.releasedAmountCents)} | Retained:{" "}
                        {moneyFromCents(depositSummary.retainedAmountCents)}
                      </div>
                    </div>
                  )}
                </div>
              </div>
            )}
          </div>
        )}

        <div className="mt-6 flex flex-wrap gap-3">
          <Link
            href="/rental/account"
            className="rounded-xl border border-slate-200 bg-white px-4 py-2 text-sm font-semibold text-slate-700 hover:bg-slate-50"
          >
            My account
          </Link>
          <Link
            href="/rental"
            className="rounded-xl bg-slate-900 px-4 py-2 text-sm font-semibold text-white hover:bg-slate-800"
          >
            Back to catalog
          </Link>
          {paymentSession?.status && paymentSession.status !== "paid" && (
            <Link
              href={`/rental/checkout?sessionId=${encodeURIComponent(sessionId)}`}
              className="rounded-xl border border-slate-200 bg-white px-4 py-2 text-sm font-semibold text-slate-700 hover:bg-slate-50"
            >
              Back to checkout
            </Link>
          )}
        </div>
      </div>
    </div>
  );
}
