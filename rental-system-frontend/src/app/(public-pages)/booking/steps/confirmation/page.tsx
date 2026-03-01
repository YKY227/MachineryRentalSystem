// src/app/(public-pages)/booking/steps/confirmation/page.tsx
"use client";

import { useEffect, useMemo, useState } from "react";
import { useRouter } from "next/navigation";

import { StepLayout } from "@/components/wizard/StepLayout";
import { useBooking, type ServiceType } from "@/lib/booking-store";
import { mockEstimatePrice } from "@/lib/pricing";
import { formatCurrency } from "@/lib/utils";

type ConfirmationStepProps = {
  searchParams?: {
    jobId?: string;
  };
};

// ✅ Narrow serviceType for pricing.ts type
type PricingServiceType = Exclude<ServiceType, null>;
function isPricingServiceType(v: any): v is PricingServiceType {
  return v === "same-day" || v === "next-day" || v === "express-3h";
}

export default function ConfirmationStep({ searchParams }: ConfirmationStepProps) {
  const router = useRouter();
  const {
    serviceType,
    routeType,
    pickups,
    deliveries,
    items,
    schedule,
    resetBooking,
  } = useBooking();

  const jobId = searchParams?.jobId;

  // ✅ Normalize pickup list (store is array already, but keep defensive)
  const pickupList = useMemo(() => (Array.isArray(pickups) ? pickups : []), [pickups]);

  const allowManyPickups = routeType === "many-to-one";
  const pickupsForDisplay = allowManyPickups ? pickupList : pickupList.slice(0, 1);

  // Accordion open states
  const [pickupOpenMap, setPickupOpenMap] = useState<Record<string, boolean>>(() => ({}));
  const [deliveryOpenMap, setDeliveryOpenMap] = useState<Record<string, boolean>>(() => ({}));

  // 🛡 Guard
  useEffect(() => {
    if (!jobId) {
      router.replace("/booking/steps/summary");
      return;
    }

    const hasPickup = pickupList.length > 0;

    if (
      !serviceType ||
      !routeType ||
      !hasPickup ||
      !deliveries?.length ||
      !items?.length ||
      !schedule
    ) {
      router.replace("/booking/steps/delivery-type");
    }
  }, [
    jobId,
    serviceType,
    routeType,
    pickupList.length,
    deliveries?.length,
    items?.length,
    schedule,
    router,
  ]);

  // Keep pickup accordion map in sync
  useEffect(() => {
    if (!pickupsForDisplay.length) return;

    setPickupOpenMap((prev) => {
      const next: Record<string, boolean> = { ...prev };

      for (const p of pickupsForDisplay) {
        if (next[p.id] === undefined) next[p.id] = true; // default open
      }

      for (const key of Object.keys(next)) {
        if (!pickupsForDisplay.some((p) => p.id === key)) delete next[key];
      }

      return next;
    });
  }, [pickupsForDisplay]);

  // Keep delivery accordion map in sync
  useEffect(() => {
    if (!deliveries?.length) return;

    setDeliveryOpenMap((prev) => {
      const next: Record<string, boolean> = { ...prev };
      for (const d of deliveries) {
        if (next[d.id] === undefined) next[d.id] = false; // default collapsed
      }
      for (const key of Object.keys(next)) {
        if (!deliveries.some((d) => d.id === key)) delete next[key];
      }
      return next;
    });
  }, [deliveries]);

  // ─────────────────────────────────────────────
  // Pricing recap
  // ─────────────────────────────────────────────
  const totalBillableWeight = useMemo(() => {
    return (items ?? []).reduce((sum, item) => {
      const vol = item.volumetricWeightKg || 0;
      const actual = item.weightKg || 0;
      const billablePerUnit = vol > actual ? vol : actual;
      const qty = item.quantity || 1;
      return sum + billablePerUnit * qty;
    }, 0);
  }, [items]);

  const mockDistanceKm = 12;

  const stopsCount = (pickupsForDisplay.length || 0) + (deliveries?.length || 0);

  const estimatedPrice = useMemo(() => {
    if (!isPricingServiceType(serviceType)) return 0;

    return mockEstimatePrice({
      distanceKm: mockDistanceKm,
      totalBillableWeightKg: totalBillableWeight,
      stops: deliveries?.length ?? 0, // pricing engine expects delivery stops count in your mock
      serviceType, // ✅ now narrowed correctly
    });
  }, [serviceType, totalBillableWeight, deliveries?.length]);

  const serviceLabel =
    serviceType === "same-day"
      ? "Same Day Delivery"
      : serviceType === "next-day"
      ? "Next Day Delivery"
      : serviceType === "express-3h"
      ? "3-Hour Express"
      : "-";

  const routeLabel =
    routeType === "one-to-many"
      ? "One pickup → Many deliveries"
      : routeType === "many-to-one"
      ? "Many pickups → One delivery"
      : routeType === "one-to-one"
      ? "One pickup → One delivery"
      : routeType === "round-trip"
      ? "Round trip / sequence"
      : "-";

  const handleNewBooking = () => {
    resetBooking();
    router.push("/booking/steps/delivery-type");
  };

  const handleTrackJob = () => {
    if (!jobId) return;
    router.push(`/tracking/${encodeURIComponent(jobId)}`);
  };

  // ✅ Styling helpers
  const card = "rounded-3xl border border-slate-200 bg-white p-6 shadow-sm";
  const cardTitle = "text-xs font-semibold uppercase tracking-wide text-slate-500";

  const primaryBtn =
    "inline-flex items-center justify-center rounded-xl bg-slate-900 px-6 py-3 " +
    "text-base font-semibold text-white shadow-sm transition " +
    "hover:bg-slate-800 focus:outline-none focus:ring-2 focus:ring-slate-400 focus:ring-offset-2 " +
    "disabled:cursor-not-allowed disabled:opacity-60";

  const secondaryBtn =
    "inline-flex items-center justify-center rounded-xl border border-slate-200 bg-white px-5 py-3 " +
    "text-base font-semibold text-slate-700 transition hover:bg-slate-50 " +
    "focus:outline-none focus:ring-2 focus:ring-sky-400 focus:ring-offset-2 " +
    "disabled:cursor-not-allowed disabled:opacity-60";

  return (
    <StepLayout
      title="Booking Created"
      subtitle="Your courier request has been submitted to the operations team."
      currentStep={9}
      totalSteps={9}
      backHref="/booking/steps/summary"
    >
      <div className="space-y-6">
        {/* Success banner */}
        <div className="rounded-3xl border border-emerald-200 bg-emerald-50 px-6 py-5">
          <div className="flex items-start gap-4">
            <div className="mt-0.5 flex h-10 w-10 shrink-0 items-center justify-center rounded-full bg-emerald-500 text-base font-bold text-white">
              ✓
            </div>
            <div className="text-emerald-950">
              <p className="text-base font-semibold">Booking submitted successfully.</p>
              <p className="mt-1 text-sm text-emerald-950/80">
                Our team will check delivery capacity and confirm the slot. You&apos;ll be contacted if any
                rescheduling is required.
              </p>
            </div>
          </div>
        </div>

        {/* Key info row */}
        <div className="grid gap-4 md:grid-cols-3">
          <div className={card}>
            <h2 className={cardTitle}>Job ID</h2>
            <p className="mt-2 text-lg font-semibold text-slate-900">{jobId ?? "—"}</p>
            <p className="mt-2 text-sm text-slate-600">
              Use this ID when contacting support or checking status.
            </p>
          </div>

          <div className={card}>
            <h2 className={cardTitle}>Service &amp; Schedule</h2>
            <p className="mt-2 text-lg font-semibold text-slate-900">{serviceLabel}</p>
            <p className="mt-1 text-sm text-slate-700">
              Route: <span className="font-semibold">{routeLabel}</span>
            </p>

            {schedule && (
              <p className="mt-2 text-sm text-slate-600">
                Pickup on <span className="font-semibold text-slate-900">{schedule.pickupDate}</span> · Slot{" "}
                <span className="font-semibold text-slate-900">{schedule.pickupSlot}</span>
              </p>
            )}
          </div>

          <div className={card}>
            <h2 className={cardTitle}>Summary</h2>
            <p className="mt-2 text-lg font-semibold text-slate-900">
              {deliveries?.length ?? 0} delivery point{deliveries && deliveries.length > 1 ? "s" : ""}
            </p>
            <div className="mt-2 text-sm text-slate-600">
              <div>
                Stops <span className="font-semibold text-slate-900">{stopsCount}</span>
              </div>
              <div>
                Est. charges{" "}
                <span className="font-semibold text-slate-900">{formatCurrency(estimatedPrice)}</span>
              </div>
              <div>Billable weight {totalBillableWeight.toFixed(2)} kg</div>
            </div>
          </div>
        </div>

        {/* Accordions */}
        <div className="grid gap-4 md:grid-cols-2">
          {/* Pickups */}
          <div className={card}>
            <p className={cardTitle}>Pickup Location{pickupsForDisplay.length > 1 ? "s" : ""}</p>

            <div className="mt-4 space-y-3">
              {pickupsForDisplay.map((p, idx) => {
                const isOpen = !!pickupOpenMap[p.id];

                return (
                  <div key={p.id} className="rounded-3xl border border-slate-200 bg-slate-50">
                    <button
                      type="button"
                      onClick={() =>
                        setPickupOpenMap((prev) => ({ ...prev, [p.id]: !prev[p.id] }))
                      }
                      className="flex w-full items-start justify-between gap-3 px-5 py-4 text-left"
                      aria-expanded={isOpen}
                    >
                      <div>
                        <p className="text-base font-semibold text-slate-900">
                          Pickup #{idx + 1} · {p.companyName || p.contactName || "Pickup Location"}
                        </p>
                        <p className="mt-1 text-sm text-slate-600">
                          {p.addressLine1}
                          {p.addressLine2 ? `, ${p.addressLine2}` : ""}
                          {p.postalCode ? ` (${p.postalCode})` : ""}
                        </p>
                      </div>

                      <span
                        className={[
                          "mt-0.5 inline-flex h-9 w-9 items-center justify-center rounded-full border border-slate-200 bg-white text-slate-700 transition",
                          isOpen ? "rotate-180" : "",
                        ].join(" ")}
                      >
                        ▾
                      </span>
                    </button>

                    {isOpen && (
                      <div className="px-5 pb-4">
                        <div className="rounded-2xl border border-slate-200 bg-white px-4 py-3">
                          <p className="text-sm text-slate-700">
                            <span className="font-semibold text-slate-900">Contact:</span>{" "}
                            {p.contactName} · {p.contactPhone}
                          </p>

                          {p.remarks && (
                            <p className="mt-2 text-sm text-slate-700">
                              <span className="font-semibold text-slate-900">Remarks:</span> {p.remarks}
                            </p>
                          )}

                          {schedule && (
                            <p className="mt-2 text-sm text-slate-700">
                              <span className="font-semibold text-slate-900">Schedule:</span>{" "}
                              {schedule.pickupDate} · {schedule.pickupSlot}
                            </p>
                          )}
                        </div>
                      </div>
                    )}
                  </div>
                );
              })}
            </div>
          </div>

          {/* Deliveries */}
          <div className={card}>
            <div className="flex items-start justify-between gap-3">
              <div>
                <p className={cardTitle}>Delivery Overview</p>
                <p className="mt-2 text-lg font-semibold text-slate-900">
                  {deliveries?.length ?? 0} destination{deliveries && deliveries.length > 1 ? "s" : ""}
                </p>
                <p className="mt-1 text-sm text-slate-600">
                  Expand a destination to see recipient + remarks.
                </p>
              </div>
            </div>

            <div className="mt-5 space-y-3">
              {deliveries?.map((d, idx) => {
                const isOpen = !!deliveryOpenMap[d.id];

                return (
                  <div key={d.id} className="rounded-3xl border border-slate-200 bg-slate-50">
                    <button
                      type="button"
                      onClick={() =>
                        setDeliveryOpenMap((prev) => ({ ...prev, [d.id]: !prev[d.id] }))
                      }
                      aria-expanded={isOpen}
                      className="flex w-full items-start justify-between gap-3 px-5 py-4 text-left"
                    >
                      <div>
                        <p className="text-base font-semibold text-slate-900">
                          Delivery Point #{idx + 1}
                        </p>
                        <p className="mt-1 text-sm text-slate-700">
                          {d.addressLine1}
                          {d.addressLine2 ? `, ${d.addressLine2}` : ""}{" "}
                          {d.postalCode ? `(${d.postalCode})` : ""}
                        </p>
                      </div>

                      <span
                        className={[
                          "mt-0.5 inline-flex h-9 w-9 items-center justify-center rounded-full border border-slate-200 bg-white text-slate-700 transition",
                          isOpen ? "rotate-180" : "",
                        ].join(" ")}
                      >
                        ▾
                      </span>
                    </button>

                    {isOpen && (
                      <div className="px-5 pb-4">
                        <div className="rounded-2xl border border-slate-200 bg-white px-4 py-3">
                          <p className="text-sm text-slate-700">
                            <span className="font-semibold text-slate-900">Recipient:</span>{" "}
                            {d.contactName} · {d.contactPhone}
                          </p>

                          {d.remarks && (
                            <p className="mt-2 text-sm text-slate-700">
                              <span className="font-semibold text-slate-900">Remarks:</span>{" "}
                              {d.remarks}
                            </p>
                          )}
                        </div>
                      </div>
                    )}
                  </div>
                );
              })}
            </div>
          </div>
        </div>

        {/* Actions */}
        <div className="rounded-3xl border border-slate-200 bg-white px-6 py-5 shadow-sm">
          <div className="flex flex-col gap-4 md:flex-row md:items-center md:justify-between">
            <p className="text-sm text-slate-600">
              STL team will assign a driver and update you on any changes. You can track this job anytime using the Job ID above.
            </p>

            <div className="flex flex-wrap gap-3">
              <button type="button" onClick={handleTrackJob} disabled={!jobId} className={secondaryBtn}>
                Track this job →
              </button>

              <button type="button" onClick={handleNewBooking} className={primaryBtn}>
                + Book another job
              </button>
            </div>
          </div>
        </div>
      </div>
    </StepLayout>
  );
}
