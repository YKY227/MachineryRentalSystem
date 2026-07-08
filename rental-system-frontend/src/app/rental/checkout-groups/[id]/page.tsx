"use client";

import { useEffect, useMemo, useState } from "react";
import Link from "next/link";
import { useParams } from "next/navigation";
import { ArrowLeft, Clock, Package } from "lucide-react";

import type { RentalCheckoutGroupPaymentSession } from "@/lib/rental/checkout-groups/payment-session-types";
import type { RentalCheckoutGroup } from "@/lib/rental/checkout-groups/types";

function formatMoneyFromCents(cents?: number) {
  return new Intl.NumberFormat("en-SG", {
    style: "currency",
    currency: "SGD",
    maximumFractionDigits: 0,
  }).format(Math.max(0, Number(cents ?? 0)) / 100);
}

function formatDate(value: string) {
  const date = new Date(`${value}T12:00:00`);
  if (Number.isNaN(date.getTime())) return value;
  return date.toLocaleDateString("en-SG", {
    day: "2-digit",
    month: "short",
    year: "numeric",
  });
}

function formatDateTime(value?: string) {
  if (!value) return "";
  const date = new Date(value);
  if (Number.isNaN(date.getTime())) return value;
  return date.toLocaleString("en-SG", { hour12: true });
}

function statusLabel(status: string) {
  return status.replace(/_/g, " ");
}

function isInactivePaymentStatus(status?: string) {
  return status === "failed" || status === "expired" || status === "cancelled";
}

export default function RentalCheckoutGroupPage() {
  const params = useParams<{ id: string }>();
  const groupId = useMemo(() => {
    const value = params?.id;
    return Array.isArray(value) ? value[0] : value;
  }, [params]);
  const [group, setGroup] = useState<RentalCheckoutGroup | null>(null);
  const [paymentSession, setPaymentSession] = useState<RentalCheckoutGroupPaymentSession | null>(null);
  const [loading, setLoading] = useState(true);
  const [payLoading, setPayLoading] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [payError, setPayError] = useState<string | null>(null);

  useEffect(() => {
    if (!groupId) return;
    let cancelled = false;

    async function loadGroup() {
      try {
        setLoading(true);
        setError(null);
        const res = await fetch(
          `/api/public/rental/checkout-groups/${encodeURIComponent(groupId)}/payment-status`
        );
        const data = await res.json().catch(() => ({}));
        if (!res.ok) throw new Error(data?.error ?? "Unable to load checkout group");
        if (!cancelled) {
          setGroup(data?.group ?? null);
          setPaymentSession(data?.paymentSession ?? null);
        }
      } catch (err) {
        if (!cancelled) {
          setError(err instanceof Error ? err.message : "Unable to load checkout group");
        }
      } finally {
        if (!cancelled) setLoading(false);
      }
    }

    loadGroup();
    return () => {
      cancelled = true;
    };
  }, [groupId]);

  async function handlePayNow() {
    if (!group || payLoading) return;
    try {
      setPayLoading(true);
      setPayError(null);
      const res = await fetch(`/api/public/rental/checkout-groups/${encodeURIComponent(group.id)}/pay`, {
        method: "POST",
      });
      const data = await res.json().catch(() => ({}));
      if (!res.ok) throw new Error(data?.error ?? "Unable to create payment link");
      setGroup(data?.group ?? group);
      setPaymentSession(data?.paymentSession ?? null);
      if (data?.redirectUrl) {
        window.location.href = data.redirectUrl;
      }
    } catch (err) {
      setPayError(err instanceof Error ? err.message : "Unable to create payment link");
    } finally {
      setPayLoading(false);
    }
  }

  const holdIsActive = Boolean(
    group?.holdExpiresAt && new Date(group.holdExpiresAt).getTime() > Date.now()
  );
  const canPay = Boolean(
    holdIsActive &&
      group &&
      (group.status === "holds_acquired" ||
        (group.status === "payment_pending" && isInactivePaymentStatus(paymentSession?.status)))
  );
  const pendingPaymentLink =
    holdIsActive && paymentSession?.status === "pending" && paymentSession.redirectUrl
      ? paymentSession.redirectUrl
      : "";

  return (
    <div className="mx-auto max-w-5xl p-4">
      <Link
        href="/rental/cart"
        className="inline-flex items-center gap-2 text-sm font-medium text-slate-600 hover:text-slate-900"
      >
        <ArrowLeft className="h-4 w-4" />
        Back to cart
      </Link>

      <div className="mt-4 rounded-2xl border border-slate-200 bg-white p-5 shadow-sm">
        <div className="flex flex-col gap-3 sm:flex-row sm:items-start sm:justify-between">
          <div>
            <h1 className="text-2xl font-semibold text-slate-900">Checkout group</h1>
            <p className="mt-1 text-sm text-slate-600">
              Pay for selected rental items together while the temporary holds are active.
            </p>
          </div>
          {group && (
            <span className="rounded-full bg-sky-100 px-3 py-1 text-xs font-semibold capitalize text-sky-800">
              {statusLabel(group.status)}
            </span>
          )}
        </div>

        {loading ? (
          <div className="mt-6 rounded-xl border border-slate-200 bg-slate-50 p-4 text-sm text-slate-600">
            Loading checkout group...
          </div>
        ) : error ? (
          <div className="mt-6 rounded-xl border border-rose-200 bg-rose-50 p-4 text-sm text-rose-700">
            {error}
          </div>
        ) : group ? (
          <div className="mt-6 space-y-6">
            <div className="grid gap-3 text-sm sm:grid-cols-3">
              <div className="rounded-xl bg-slate-50 p-4">
                <div className="text-xs font-semibold uppercase text-slate-500">Group</div>
                <div className="mt-1 break-all font-semibold text-slate-900">{group.id}</div>
              </div>
              <div className="rounded-xl bg-slate-50 p-4">
                <div className="text-xs font-semibold uppercase text-slate-500">Amount due now</div>
                <div className="mt-1 text-lg font-semibold text-slate-900">
                  {formatMoneyFromCents(group.displayTotalCents)}
                </div>
                <p className="mt-1 text-xs text-slate-500">Total charged by HitPay</p>
              </div>
              <div className="rounded-xl bg-slate-50 p-4">
                <div className="text-xs font-semibold uppercase text-slate-500">Hold expiry</div>
                <div className="mt-1 inline-flex items-center gap-2 font-semibold text-slate-900">
                  <Clock className="h-4 w-4" />
                  {group.holdExpiresAt ? formatDateTime(group.holdExpiresAt) : "No active hold"}
                </div>
              </div>
            </div>

            <div className="rounded-xl border border-slate-200 bg-white p-4 text-sm">
              <div className="font-semibold text-slate-900">Payment breakdown</div>
              <div className="mt-3 space-y-2">
                <div className="flex items-center justify-between">
                  <span className="text-slate-600">Rental/service payable</span>
                  <span className="font-semibold text-slate-900">
                    {formatMoneyFromCents(group.payableTotalCents)}
                  </span>
                </div>
                <div className="flex items-center justify-between">
                  <span className="text-slate-600">Deposit</span>
                  <span className="font-semibold text-slate-900">
                    {formatMoneyFromCents(group.depositCents)}
                  </span>
                </div>
                <div className="border-t border-slate-200 pt-2">
                  <div className="flex items-center justify-between">
                    <span className="font-semibold text-slate-900">Total charged by HitPay</span>
                    <span className="font-semibold text-slate-900">
                      {formatMoneyFromCents(group.displayTotalCents)}
                    </span>
                  </div>
                </div>
              </div>
            </div>

            <div className="rounded-xl border border-slate-200 bg-slate-50 p-4 text-sm">
              <div className="flex flex-col gap-3 sm:flex-row sm:items-center sm:justify-between">
                <div>
                  <div className="font-semibold text-slate-900">Group payment</div>
                  {paymentSession ? (
                    <p className="mt-1 text-slate-600">
                      Status: <span className="capitalize">{statusLabel(paymentSession.status)}</span>
                    </p>
                  ) : (
                    <p className="mt-1 text-slate-600">No payment link has been created yet.</p>
                  )}
                  {group.status === "manual_review" && (
                    <p className="mt-2 text-amber-700">
                      This checkout is under manual review. Our team will contact you before any further action.
                    </p>
                  )}
                  {group.status === "paid" && (
                    <p className="mt-2 text-emerald-700">
                      Payment is confirmed and rental orders have been created.
                    </p>
                  )}
                  {!holdIsActive && group.status !== "paid" && group.status !== "manual_review" && (
                    <p className="mt-2 text-amber-700">
                      The temporary holds have expired. Please return to the cart and create a new checkout group.
                    </p>
                  )}
                  {payError && <p className="mt-2 text-rose-700">{payError}</p>}
                </div>

                {canPay ? (
                  <button
                    type="button"
                    onClick={handlePayNow}
                    disabled={payLoading}
                    className="inline-flex items-center justify-center rounded-xl bg-sky-700 px-4 py-2 text-sm font-semibold text-white hover:bg-sky-800 disabled:cursor-not-allowed disabled:bg-slate-300"
                  >
                    {payLoading ? "Preparing payment..." : "Pay now"}
                  </button>
                ) : pendingPaymentLink ? (
                  <a
                    href={pendingPaymentLink}
                    className="inline-flex items-center justify-center rounded-xl bg-sky-700 px-4 py-2 text-sm font-semibold text-white hover:bg-sky-800"
                  >
                    Continue payment
                  </a>
                ) : null}
              </div>
            </div>

            <section>
              <h2 className="text-base font-semibold text-slate-900">Rental lines</h2>
              <div className="mt-3 space-y-3">
                {group.lines.map((line) => (
                  <article key={line.id} className="rounded-xl border border-slate-200 p-4">
                    <div className="flex gap-4">
                      <div className="h-20 w-24 flex-shrink-0 overflow-hidden rounded-lg bg-slate-100">
                        {line.equipmentImageUrlSnapshot ? (
                          <img
                            src={line.equipmentImageUrlSnapshot}
                            alt={line.equipmentTitleSnapshot}
                            className="h-full w-full object-cover"
                          />
                        ) : (
                          <div className="flex h-full w-full items-center justify-center text-slate-400">
                            <Package className="h-6 w-6" />
                          </div>
                        )}
                      </div>
                      <div className="min-w-0 flex-1">
                        <div className="flex flex-col gap-2 sm:flex-row sm:items-start sm:justify-between">
                          <div>
                            <h3 className="font-semibold text-slate-900">
                              {line.equipmentTitleSnapshot}
                            </h3>
                            <p className="mt-1 text-sm text-slate-500">
                              {formatDate(line.startDate)} to {formatDate(line.endDate)} - Qty{" "}
                              {line.qty}
                            </p>
                            <p className="mt-1 text-sm text-slate-500">
                              {line.fulfillment === "deliver" ? "Delivery and collection" : "Self-collect"}
                            </p>
                          </div>
                          <div className="text-left sm:text-right">
                            <div className="text-xs font-semibold uppercase text-slate-500">
                              Line total with deposit
                            </div>
                            <div className="font-semibold text-slate-900">
                              {formatMoneyFromCents(line.displayTotalCents)}
                            </div>
                            <div className="mt-1 text-xs text-slate-500">
                              Payable {formatMoneyFromCents(line.payableTotalCents)} + deposit{" "}
                              {formatMoneyFromCents(line.depositCents)}
                            </div>
                            <div className="mt-1 text-xs capitalize text-slate-500">
                              {statusLabel(line.status)}
                            </div>
                          </div>
                        </div>

                        {line.failureReason && (
                          <div className="mt-3 rounded-lg border border-rose-200 bg-rose-50 px-3 py-2 text-sm text-rose-700">
                            {line.failureReason}
                          </div>
                        )}
                        {group.status === "paid" && line.rentalOrderId && (
                          <Link
                            href={`/rental/checkout/status?orderId=${encodeURIComponent(line.rentalOrderId)}`}
                            className="mt-3 inline-flex text-sm font-semibold text-sky-700 underline"
                          >
                            View rental order
                          </Link>
                        )}
                      </div>
                    </div>
                  </article>
                ))}
              </div>
            </section>

            <div className="rounded-xl border border-amber-200 bg-amber-50 p-4 text-sm text-amber-800">
              Group payment is available only while temporary rental holds are active. Existing
              one-item rental checkout remains available from the cart.
            </div>
          </div>
        ) : (
          <div className="mt-6 rounded-xl border border-slate-200 bg-slate-50 p-4 text-sm text-slate-600">
            Checkout group not found.
          </div>
        )}
      </div>
    </div>
  );
}
