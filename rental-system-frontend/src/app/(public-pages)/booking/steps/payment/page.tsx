// src/app/(public-pages)/booking/steps/payment/page.tsx
"use client";

import { useRouter } from "next/navigation";
import { useEffect, useMemo, useState } from "react";
import { markJobPaymentSuccess } from "@/lib/api/admin";
import { StepLayout } from "@/components/wizard/StepLayout";
import { useBooking } from "@/lib/booking-store";
import { mockEstimatePrice } from "@/lib/pricing";
import { formatCurrency } from "@/lib/utils";

type PaymentPageProps = {
  searchParams?: {
    jobId?: string;
  };
};

export default function PaymentPage({ searchParams }: PaymentPageProps) {
  const router = useRouter();
  const jobId = searchParams?.jobId;

  const [submitting, setSubmitting] = useState(false);
  const [error, setError] = useState<string | null>(null);

  const { serviceType, deliveries, items } = useBooking();

  // 10-minute payment window (600 seconds)
  const [secondsLeft, setSecondsLeft] = useState(600);

  // Guard: if no jobId, send back to summary
  useEffect(() => {
    if (!jobId) router.replace("/booking/steps/summary");
  }, [jobId, router]);

  // Countdown timer
  useEffect(() => {
    if (secondsLeft <= 0) return;

    const id = setInterval(() => {
      setSecondsLeft((prev) => (prev > 0 ? prev - 1 : 0));
    }, 1000);

    return () => clearInterval(id);
  }, [secondsLeft]);

  const isExpired = secondsLeft <= 0;

  const minutes = Math.floor(secondsLeft / 60);
  const seconds = secondsLeft % 60;

  // ─────────────────────────────────────────────
  // Reuse pricing logic to show PayNow amount
  // ─────────────────────────────────────────────
  const totalBillableWeight = useMemo(() => {
    if (!items) return 0;
    return items.reduce((sum, item) => {
      const vol = item.volumetricWeightKg || 0;
      const actual = item.weightKg || 0;
      const billablePerUnit = vol > actual ? vol : actual;
      const qty = item.quantity || 1;
      return sum + billablePerUnit * qty;
    }, 0);
  }, [items]);

  const mockDistanceKm = 12;

  const estimatedPrice = useMemo(() => {
    if (!serviceType) return 0;
    return mockEstimatePrice({
      distanceKm: mockDistanceKm,
      totalBillableWeightKg: totalBillableWeight,
      stops: deliveries?.length ?? 0,
      serviceType,
    });
  }, [serviceType, totalBillableWeight, deliveries?.length]);

  // ─────────────────────────────────────────────
  // Button handlers
  // ─────────────────────────────────────────────
  const handlePaymentSuccess = async () => {
    if (!jobId) return;

    if (isExpired) {
      setError(
        "Payment session has expired. Please go back to the summary and restart the payment."
      );
      return;
    }

    try {
      setSubmitting(true);
      setError(null);

      await markJobPaymentSuccess(jobId);

      router.push(
        `/booking/steps/confirmation?jobId=${encodeURIComponent(jobId)}`
      );
    } catch (err: any) {
      console.error("[PaymentPage] Failed to mark payment success", err);
      setError(err?.message ?? "Failed to confirm payment. Please try again.");
    } finally {
      setSubmitting(false);
    }
  };

  const handlePaymentFail = () => {
    if (isExpired) {
      setError(
        "Payment session has expired. Please go back to the summary and restart the payment."
      );
      return;
    }
    setError("Payment failed. Please try again!");
  };

  const handleBack = () => {
    router.push("/booking/steps/summary");
  };

  // ✅ Match SummaryStep button + card styling
  const card = "rounded-3xl border border-slate-200 bg-white p-6 shadow-sm";
  const cardTitle =
    "text-xs font-semibold uppercase tracking-wide text-slate-500";

  const primaryBtn =
    "inline-flex items-center justify-center rounded-xl bg-emerald-600 px-6 py-3 " +
    "text-base font-semibold text-white shadow-sm transition " +
    "hover:bg-emerald-700 focus:outline-none focus:ring-2 focus:ring-emerald-400 focus:ring-offset-2 " +
    "disabled:cursor-not-allowed disabled:opacity-60";

  const dangerBtn =
    "inline-flex items-center justify-center rounded-xl bg-rose-600 px-6 py-3 " +
    "text-base font-semibold text-white shadow-sm transition " +
    "hover:bg-rose-700 focus:outline-none focus:ring-2 focus:ring-rose-300 focus:ring-offset-2 " +
    "disabled:cursor-not-allowed disabled:opacity-60";

  const secondaryBtn =
    "inline-flex items-center justify-center rounded-xl border border-slate-200 bg-white px-5 py-3 " +
    "text-base font-semibold text-slate-700 transition hover:bg-slate-50 " +
    "focus:outline-none focus:ring-2 focus:ring-sky-400 focus:ring-offset-2 " +
    "disabled:cursor-not-allowed disabled:opacity-60";

  return (
    <StepLayout
      title="Make Payment"
      subtitle="Scan the PayNow QR to complete your booking."
      currentStep={8}
      totalSteps={9}
      backHref="/booking/steps/summary"
    >
      <div className="space-y-6">
        {/* Timer banner (match font sizing) */}
        <div className="rounded-3xl border border-slate-200 bg-slate-50 px-6 py-4">
          <div className="flex flex-col gap-2 sm:flex-row sm:items-start sm:justify-between">
            <div className="text-sm text-slate-700">
              {isExpired ? (
                <>
                  Payment session{" "}
                  <span className="font-semibold text-rose-700">
                    has expired.
                  </span>
                </>
              ) : (
                <>
                  Payment session will expire in{" "}
                  <span className="font-semibold text-slate-900">
                    {minutes.toString().padStart(2, "0")}:
                    {seconds.toString().padStart(2, "0")}
                  </span>
                </>
              )}
            </div>
            <div className="text-sm text-slate-500">
              In a live system, the payment gateway controls this expiry.
            </div>
          </div>
        </div>

        {/* Error message */}
        {error && (
          <div className="rounded-2xl border border-rose-200 bg-rose-50 px-4 py-3 text-sm font-semibold text-rose-800">
            {error}
          </div>
        )}

        {/* Main layout */}
        <div className="grid gap-4 md:grid-cols-2">
          {/* Left: PayNow QR mock */}
          <div className={card}>
            <h2 className={cardTitle}>PayNow (Mock)</h2>
            <p className="mt-2 text-sm text-slate-600">
              Scan this QR with your banking app to simulate a PayNow payment.
            </p>

            <div className="mt-5 flex justify-center">
              <div className="flex h-56 w-56 items-center justify-center rounded-3xl border-2 border-dashed border-slate-300 bg-slate-50 text-sm text-slate-400">
                PayNow QR Placeholder
              </div>
            </div>

            <div className="mt-5 space-y-2 text-sm text-slate-700">
              <p>
                Payee:{" "}
                <span className="font-semibold text-slate-900">
                  STL Courier Pte Ltd
                </span>
              </p>
              <p>
                UEN: <span className="font-mono text-slate-900">2025XXXXXA</span>
              </p>
              <p>
                Amount:{" "}
                <span className="font-semibold text-slate-900">
                  {formatCurrency(estimatedPrice)}
                </span>
              </p>
              <p>
                Reference:{" "}
                <span className="font-mono text-slate-900">{jobId ?? "—"}</span>
              </p>
            </div>

            <div className="mt-5 rounded-2xl border border-slate-200 bg-slate-50 px-4 py-3 text-sm text-slate-600">
              Tip: In production, this QR would be generated from a PayNow / gateway
              API with the exact payable amount and reference.
            </div>
          </div>

          {/* Right: actions */}
          <div className={card}>
            <h2 className={cardTitle}>Payment Actions</h2>
            <p className="mt-2 text-sm text-slate-600">
              For this prototype, use the buttons below to simulate payment result.
              In production, you would land here after returning from the payment
              gateway.
            </p>

            <div className="mt-5 flex flex-col gap-3">
              <button
                type="button"
                onClick={handlePaymentSuccess}
                disabled={isExpired || submitting}
                className={primaryBtn}
              >
                {submitting ? "Processing…" : "✓ Payment Successful"}
              </button>

              <button
                type="button"
                onClick={handlePaymentFail}
                disabled={isExpired || submitting}
                className={dangerBtn}
              >
                ✗ Payment Failed
              </button>

              <button
                type="button"
                onClick={handleBack}
                disabled={submitting}
                className={secondaryBtn}
              >
                ← Back to Summary
              </button>
            </div>

            <div className="mt-6 border-t border-slate-200 pt-4 text-sm text-slate-500">
              In a real integration (Stripe/HitPay/PayNow gateway), success/failure
              comes from the provider callback or webhook verification — and you
              should only show confirmation after verifying payment server-side.
            </div>
          </div>
        </div>
      </div>
    </StepLayout>
  );
}
