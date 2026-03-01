//src/app/(public-pages)/booking/steps/summary/page.tsx
"use client";

import { useEffect, useMemo, useRef, useState } from "react";
import { useRouter } from "next/navigation";
import { API_BASE_URL } from "@/lib/config";

import { StepLayout } from "@/components/wizard/StepLayout";
import { useBooking } from "@/lib/booking-store";
import { mockEstimatePrice } from "@/lib/pricing";
import { formatCurrency } from "@/lib/utils";
import { USE_BACKEND } from "@/lib/config";
import {
  createJobFromBooking,
  type CreateBookingPayload,
  fetchPricingQuote,
  type PricingQuoteResponse,
} from "@/lib/api/admin";

type BookingStop = NonNullable<CreateBookingPayload["stops"]>[number];

function centsToDollars(cents?: number) {
  return cents && cents > 0 ? formatCurrency(cents / 100) : null;
}

type ServiceType = "express-3h" | "same-day" | "next-day";

function isServiceType(v: any): v is ServiceType {
  return v === "express-3h" || v === "same-day" || v === "next-day";
}

type ViewAllModalState =
  | {
      deliveryId: string;
      title: string;
    }
  | null;

function computeBillableKg(item: {
  weightKg?: number;
  volumetricWeightKg?: number;
  quantity?: number;
}) {
  const vol = item.volumetricWeightKg || 0;
  const actual = item.weightKg || 0;
  const perUnit = vol > actual ? vol : actual;
  const qty = item.quantity || 1;
  return perUnit * qty;
}

/**
 * Truly stable stringify (works with nested objects).
 * Prevents quoteKey "thrashing" that causes repeated calls.
 */
function stableStringify(value: any) {
  const seen = new WeakSet();
  return JSON.stringify(value, function (_key, val) {
    if (val && typeof val === "object") {
      if (seen.has(val)) return;
      seen.add(val);

      if (Array.isArray(val)) return val; // preserve order
      return Object.keys(val)
        .sort()
        .reduce((acc: any, k) => {
          acc[k] = (val as any)[k];
          return acc;
        }, {});
    }
    return val;
  });
}

/** Timeout helper without AbortController (works with your current fetchPricingQuote signature). */
async function withTimeout<T>(promise: Promise<T>, ms: number): Promise<T> {
  return Promise.race([
    promise,
    new Promise<T>((_, reject) =>
      setTimeout(() => reject(new Error("TIMEOUT")), ms)
    ),
  ]);
}

function Modal({
  title,
  onClose,
  children,
}: {
  title: string;
  onClose: () => void;
  children: React.ReactNode;
}) {
  return (
    <div className="fixed inset-0 z-50 flex items-center justify-center bg-black/40 px-4">
      <div className="w-full max-w-2xl rounded-3xl border border-slate-200 bg-white shadow-xl">
        <div className="flex items-center justify-between border-b border-slate-200 px-5 py-4">
          <div>
            <p className="text-xs font-semibold uppercase tracking-wide text-slate-500">
              Items
            </p>
            <h3 className="text-lg font-semibold text-slate-900">{title}</h3>
          </div>
          <button
            type="button"
            onClick={onClose}
            className="rounded-xl px-3 py-2 text-sm font-semibold text-slate-600 hover:bg-slate-50 hover:text-slate-800 focus:outline-none focus:ring-2 focus:ring-sky-400 focus:ring-offset-2"
          >
            Close
          </button>
        </div>

        <div className="max-h-[70vh] overflow-auto px-5 py-4">{children}</div>
      </div>
    </div>
  );
}

export default function SummaryStep() {
  const router = useRouter();

  // Support BOTH new store (pickups array) and old store (pickup single)
  const booking = useBooking() as any;

  const rawServiceType = booking.serviceType as string | null;
  const serviceType = isServiceType(rawServiceType) ? rawServiceType : null;

  const routeType = booking.routeType as string | null;

  const pickups = (booking.pickups as any[] | undefined) ?? undefined; // new
  const pickup = (booking.pickup as any | null) ?? null; // legacy

  const deliveries = (booking.deliveries as any[] | undefined) ?? [];
  const items = (booking.items as any[] | undefined) ?? [];
  const schedule = (booking.schedule as any | null) ?? null;

  const [submitting, setSubmitting] = useState(false);
  const [submitError, setSubmitError] = useState<string | null>(null);

  const isAdHocService = serviceType === "express-3h";
  const hasSpecialHandling = items.some((i) => i.specialHandling);

  // ✅ Normalize pickup list for display + payload building
  const pickupList = useMemo(() => {
    if (Array.isArray(pickups) && pickups.length > 0) return pickups;
    return pickup ? [pickup] : [];
  }, [pickups, pickup]);

  const allowManyPickups = routeType === "many-to-one";
  const pickupsForStops = allowManyPickups ? pickupList : pickupList.slice(0, 1);

  // ✅ UI helpers
  const card = "rounded-3xl border border-slate-200 bg-white p-6 shadow-sm";
  const cardTitle = "text-xs font-semibold uppercase tracking-wide text-slate-500";

  const primaryBtn =
    "inline-flex items-center justify-center rounded-xl bg-emerald-600 px-6 py-3 " +
    "text-base font-semibold text-white shadow-sm transition " +
    "hover:bg-emerald-700 focus:outline-none focus:ring-2 focus:ring-emerald-400 focus:ring-offset-2 " +
    "disabled:cursor-not-allowed disabled:opacity-60";

  const secondaryBtn =
    "inline-flex items-center justify-center rounded-xl border border-slate-200 bg-white px-5 py-3 " +
    "text-base font-semibold text-slate-700 transition hover:bg-slate-50 " +
    "focus:outline-none focus:ring-2 focus:ring-sky-400 focus:ring-offset-2 " +
    "disabled:cursor-not-allowed disabled:opacity-60";

  // 🛡 Wizard guard
  useEffect(() => {
    if (!serviceType) return router.replace("/booking/steps/delivery-type");
    if (!routeType) return router.replace("/booking/steps/route-type");

    const hasPickup = pickupList.length > 0;
    if (!hasPickup) return router.replace("/booking/steps/pickup");

    if (!deliveries || deliveries.length === 0)
      return router.replace("/booking/steps/deliveries");
    if (!items || items.length === 0) return router.replace("/booking/steps/items");
    if (!schedule) return router.replace("/booking/steps/schedule");
  }, [serviceType, routeType, pickupList.length, deliveries, items, schedule, router]);

  const totalBillableWeight = useMemo(() => {
    return items.reduce((sum, item) => sum + computeBillableKg(item), 0);
  }, [items]);

  // ✅ Build deliveryId -> items map once (performance)
  const itemsByDelivery = useMemo(() => {
    const map: Record<string, typeof items> = {};
    for (const it of items) {
      (map[it.deliveryId] ||= []).push(it);
    }
    return map;
  }, [items]);

  // Mock distance for prototype pricing
  const mockDistanceKm = 12;

  // Live pricing quote
  const [liveQuote, setLiveQuote] = useState<PricingQuoteResponse | null>(null);
  const [quoteLoading, setQuoteLoading] = useState(false);
  const [quoteError, setQuoteError] = useState<string | null>(null);

  const fallbackPrice = useMemo(() => {
    if (!serviceType) return 0;
    return mockEstimatePrice({
      distanceKm: mockDistanceKm,
      totalBillableWeightKg: totalBillableWeight,
      stops: deliveries.length,
      serviceType,
    });
  }, [serviceType, totalBillableWeight, deliveries.length]);

  const estimatedPrice =
    liveQuote != null ? liveQuote.totalPriceCents / 100 : fallbackPrice;

  const pickupDateTimeIso = useMemo(() => {
    return schedule?.pickupDate ? `${schedule.pickupDate}T09:00:00+08:00` : null;
  }, [schedule?.pickupDate]);

  const primaryCategory = useMemo(() => {
    return (items && items[0]?.category) || "Parcel";
  }, [items]);

  /**
   * Synthetic stops (prototype only)
   * IMPORTANT: use dropoff (backend often expects "dropoff", not "delivery")
   */
  const syntheticStops = useMemo(() => {
    if (!serviceType || !pickupDateTimeIso) return [];
    if (pickupsForStops.length === 0 || deliveries.length === 0) return [];

    const baseLat = 1.3521;
    const baseLng = 103.8198;
    const legKm = 5;
    const degreesPerKm = 1 / 111;

    const pickupStops = pickupsForStops.map((_: any, i: number) => ({
      latitude: baseLat + i * 0.001,
      longitude: baseLng,
      type: "pickup" as const,
    }));

    const dropoffStops = deliveries.map((_: any, index: number) => {
      const offsetKm = legKm * (index + 1);
      const deltaLat = offsetKm * degreesPerKm;
      return {
        latitude: baseLat + deltaLat,
        longitude: baseLng,
        type: "dropoff" as const,
      };
    });

    return [...pickupStops, ...dropoffStops];
  }, [serviceType, pickupDateTimeIso, pickupsForStops, deliveries]);

  const quotePayload = useMemo(() => {
    if (!USE_BACKEND) return null; // ✅ no misleading "failed" when backend disabled
    if (!serviceType || !pickupDateTimeIso) return null;
    if (syntheticStops.length === 0) return null;

    return {
      vehicleType: "motorcycle" as const,
      itemCategory: primaryCategory,
      actualWeightKg: totalBillableWeight || 0.5,
      pickupDateTime: pickupDateTimeIso,
      stops: syntheticStops,
      isAdHocService,
      hasSpecialHandling,
    };
  }, [
    serviceType,
    pickupDateTimeIso,
    syntheticStops,
    primaryCategory,
    totalBillableWeight,
    isAdHocService,
    hasSpecialHandling,
  ]);

  const quoteKey = useMemo(() => {
    return quotePayload ? stableStringify(quotePayload) : "";
  }, [quotePayload]);

  const lastQuoteKeyRef = useRef<string>("");

useEffect(() => {
  if (!quotePayload || !quoteKey) {
    setLiveQuote(null);
    setQuoteError(null);
    setQuoteLoading(false);
    return;
  }

  // prevent repeats
  if (quoteKey === lastQuoteKeyRef.current) return;
  lastQuoteKeyRef.current = quoteKey;

  let cancelled = false;

  setQuoteLoading(true);
  setQuoteError(null);

  const t = setTimeout(async () => {
    try {
      // IMPORTANT: normalize stop types to what backend likely expects
      // If your QuoteStopDto expects "pickup"/"dropoff", this fixes it.
      // If your backend expects "pickup"/"delivery", change dropoff back to delivery.
      const normalizedPayload = {
        ...quotePayload,
        stops: quotePayload.stops.map((s: any) => ({
          ...s,
          type: s.type === "delivery" ? "dropoff" : s.type, // <-- key fix
          latitude: Number(s.latitude),
          longitude: Number(s.longitude),
        })),
      };

      const url = `${API_BASE_URL}/pricing/quote`;

      console.log("[SummaryStep] POST", url);
      console.log("[SummaryStep] payload", normalizedPayload);

      const res = await fetch(url, {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify(normalizedPayload),
      });

      const text = await res.text(); // read raw first so we can log even if JSON parse fails
      console.log("[SummaryStep] status", res.status);
      console.log("[SummaryStep] raw response", text);

      if (!res.ok) {
        // show backend validation message (usually in JSON)
        throw new Error(`Quote failed (${res.status}): ${text}`);
      }

      const json = JSON.parse(text) as PricingQuoteResponse;

      if (cancelled) return;
      setLiveQuote(json);
    } catch (err: any) {
      if (cancelled) return;
      console.error("[SummaryStep] live quote error:", err);
      setLiveQuote(null);
      setQuoteError(err?.message ?? "Unable to fetch live quote – using prototype estimate instead.");
    } finally {
      if (cancelled) return;
      setQuoteLoading(false);
    }
  }, 250);

  return () => {
    cancelled = true;
    clearTimeout(t);
    setQuoteLoading(false);
  };
}, [quoteKey, quotePayload]);
;

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

  const handleBack = () => {
    router.push("/booking/steps/schedule");
  };

  const [viewAll, setViewAll] = useState<ViewAllModalState>(null);

  async function handleConfirm() {
    if (pickupsForStops.length === 0 || !schedule) {
      setSubmitError("Missing pickup or schedule information.");
      return;
    }

    try {
      setSubmitting(true);
      setSubmitError(null);

      const firstPickup = pickupsForStops[0];

      const customerName =
        firstPickup.companyName?.trim() ||
        firstPickup.contactName?.trim() ||
        "Customer";

      const fallbackRegion = (firstPickup.region as any) || "central";

      const pickupStops: BookingStop[] = pickupsForStops.map((p: any) => ({
        type: "pickup",
        label: p.companyName || p.contactName || "Pickup location",
        addressLine:
          [p.addressLine1, p.addressLine2].filter(Boolean).join(", ") ||
          "Pickup address",
        postalCode: p.postalCode || undefined,
        region: (p.region as any) || fallbackRegion,
        contactName: p.contactName || undefined,
        contactPhone: p.contactPhone || undefined,
      }));

      const deliveryStops: BookingStop[] = deliveries.map((d: any) => ({
        type: "delivery",
        label: d.contactName || d.addressLine1 || "Delivery location",
        addressLine:
          [d.addressLine1, d.addressLine2].filter(Boolean).join(", ") ||
          "Delivery address",
        postalCode: d.postalCode || undefined,
        region: (d.region as any) || fallbackRegion,
        contactName: d.contactName || undefined,
        contactPhone: d.contactPhone || undefined,
      }));

      const stops: BookingStop[] = [...pickupStops, ...deliveryStops];

      const payload: CreateBookingPayload = {
        customerName,
        customerEmail: firstPickup.contactEmail || undefined,
        customerPhone: firstPickup.contactPhone || undefined,
        pickupRegion: fallbackRegion,
        pickupDate: schedule.pickupDate,
        pickupSlot: schedule.pickupSlot,
        jobType: "scheduled",
        serviceType: serviceType ?? undefined,
        routeType: routeType ?? undefined,
        totalBillableWeightKg: totalBillableWeight,
        stops,
      };

      const created = await createJobFromBooking(payload);

      const publicId = created.publicId ?? created.id;
      router.push(`/booking/steps/payment?jobId=${encodeURIComponent(publicId)}`);
    } catch (err: any) {
      console.error("[SummaryStep] Failed to confirm booking", err);
      setSubmitError(err?.message ?? "Failed to confirm booking");
    } finally {
      setSubmitting(false);
    }
  }

  return (
    <StepLayout
      title="Review & Confirm"
      subtitle="Check all details before creating the booking."
      currentStep={7}
      totalSteps={8}
      backHref="/booking/steps/schedule"
    >
      <div className="space-y-8">
        {/* Top row: 2-column layout */}
        <div className="grid gap-4 md:grid-cols-2">
          {/* Left: Combined Service + Stops */}
          <div className={card}>
            <div className="flex items-start justify-between gap-4">
              <div>
                <p className={cardTitle}>Service</p>
                <p className="mt-2 text-xl font-semibold text-slate-900">
                  {serviceLabel}
                </p>
                <p className="mt-1 text-base text-slate-700">
                  Route: <span className="font-semibold">{routeLabel}</span>
                </p>

                <div className="mt-3 flex flex-wrap items-center gap-2">
                  {isAdHocService && (
                    <span className="inline-flex items-center rounded-full bg-rose-50 px-3 py-1 text-sm font-semibold text-rose-700">
                      ⚡ Ad hoc / Express
                    </span>
                  )}
                  {hasSpecialHandling && (
                    <span className="inline-flex items-center rounded-full bg-amber-50 px-3 py-1 text-sm font-semibold text-amber-800">
                      ⚠ Special handling
                    </span>
                  )}
                </div>
              </div>

              {schedule && (
                <div className="text-right">
                  <p className={cardTitle}>Pickup</p>
                  <p className="mt-2 text-base font-semibold text-slate-900">
                    {schedule.pickupDate}
                  </p>
                  <p className="text-sm font-semibold text-sky-700">
                    {schedule.pickupSlot}
                  </p>
                </div>
              )}
            </div>

            <div className="my-5 h-px bg-slate-200" />

            <div className="grid gap-4 sm:grid-cols-2">
              <div>
                <p className={cardTitle}>Stops</p>
                <p className="mt-2 text-lg font-semibold text-slate-900">
                  {pickupStopsCount(pickupsForStops.length)} pickup ·{" "}
                  {deliveries.length} delivery
                  {deliveries.length > 1 ? " points" : " point"}
                </p>
                <p className="mt-1 text-sm text-slate-600">
                  Total stops: {pickupsForStops.length + deliveries.length}
                </p>
              </div>

              <div className="sm:text-right">
                <p className={cardTitle}>Billable Weight</p>
                <p className="mt-2 text-lg font-semibold text-slate-900">
                  {totalBillableWeight.toFixed(2)}{" "}
                  <span className="text-slate-600">kg</span>
                </p>
                <p className="mt-1 text-sm text-slate-600">
                  Based on max(actual vs volumetric) × quantity
                </p>
              </div>
            </div>
          </div>

          {/* Right: Estimated Charges (with breakdown) */}
          <div className={card}>
            <div className="flex items-start justify-between gap-4">
              <div>
                <p className={cardTitle}>Estimated Charges</p>
                <p className="mt-2 text-2xl font-semibold text-slate-900">
                  {quoteLoading ? "Calculating…" : formatCurrency(estimatedPrice)}
                </p>
                <p className="mt-1 text-sm text-slate-600">
                  {liveQuote
                    ? `Pricing engine · ~${liveQuote.totalDistanceKm.toFixed(1)} km`
                    : `Prototype estimate · ${mockDistanceKm} km`}
                </p>
                {quoteError && (
                  <p className="mt-2 text-sm font-semibold text-amber-700">
                    {quoteError}
                  </p>
                )}
              </div>
            </div>

            {liveQuote?.breakdown && (
              <div className="mt-5 rounded-2xl border border-slate-200 bg-slate-50 p-4">
                <p className={cardTitle}>Breakdown</p>

                <ul className="mt-3 space-y-2 text-sm text-slate-700">
                  {centsToDollars((liveQuote.breakdown as any).distanceChargeCents) && (
                    <li className="flex justify-between">
                      <span>Distance charge</span>
                      <span className="font-semibold">
                        {centsToDollars((liveQuote.breakdown as any).distanceChargeCents)}
                      </span>
                    </li>
                  )}

                  {centsToDollars((liveQuote.breakdown as any).weightChargeCents) && (
                    <li className="flex justify-between">
                      <span>Weight charge</span>
                      <span className="font-semibold">
                        {centsToDollars((liveQuote.breakdown as any).weightChargeCents)}
                      </span>
                    </li>
                  )}

                  {centsToDollars((liveQuote.breakdown as any).categorySurchargeCents) && (
                    <li className="flex justify-between">
                      <span>Category surcharge</span>
                      <span className="font-semibold">
                        {centsToDollars((liveQuote.breakdown as any).categorySurchargeCents)}
                      </span>
                    </li>
                  )}

                  {centsToDollars((liveQuote.breakdown as any).multiStopChargeCents) && (
                    <li className="flex justify-between">
                      <span>Additional stops</span>
                      <span className="font-semibold">
                        {centsToDollars((liveQuote.breakdown as any).multiStopChargeCents)}
                      </span>
                    </li>
                  )}

                  {centsToDollars((liveQuote.breakdown as any).peakHourSurchargeCents) && (
                    <li className="flex justify-between text-amber-800">
                      <span>Peak hour surcharge</span>
                      <span className="font-semibold">
                        {centsToDollars((liveQuote.breakdown as any).peakHourSurchargeCents)}
                      </span>
                    </li>
                  )}

                  {centsToDollars((liveQuote.breakdown as any).adHocServiceFeeCents) && (
                    <li className="flex justify-between text-rose-700">
                      <span>Ad hoc service</span>
                      <span className="font-semibold">
                        {centsToDollars((liveQuote.breakdown as any).adHocServiceFeeCents)}
                      </span>
                    </li>
                  )}

                  {centsToDollars((liveQuote.breakdown as any).specialHandlingFeeCents) && (
                    <li className="flex justify-between text-amber-800">
                      <span>Special handling</span>
                      <span className="font-semibold">
                        {centsToDollars((liveQuote.breakdown as any).specialHandlingFeeCents)}
                      </span>
                    </li>
                  )}

                  <li className="mt-2 flex justify-between border-t border-slate-200 pt-3 text-base font-semibold text-slate-900">
                    <span>Total</span>
                    <span>{formatCurrency(liveQuote.totalPriceCents / 100)}</span>
                  </li>
                </ul>
              </div>
            )}
          </div>
        </div>

        {/* Stops grid */}
        <div className="space-y-3">
          <div className="flex items-end justify-between">
            <div>
              <p className={cardTitle}>Stops</p>
              <h2 className="mt-2 text-xl font-semibold text-slate-900">
                Pickup + Deliveries
              </h2>
              <p className="mt-1 text-sm text-slate-600">
                Expand a stop to review details and items.
              </p>
            </div>

            <button
              type="button"
              onClick={() => router.push("/booking/steps/items")}
              className="text-sm font-semibold text-sky-700 hover:text-sky-800"
              disabled={submitting}
            >
              Edit Items →
            </button>
          </div>

          <div className="grid gap-4 md:grid-cols-2">
            {/* Pickup stop(s) */}
            {pickupsForStops.map((p: any, index: number) => (
              <details
                key={(p.id as string) ?? `pickup-${index}`}
                className="group rounded-3xl border border-slate-200 bg-white p-5 shadow-sm"
              >
                <summary className="flex cursor-pointer list-none items-start justify-between gap-4">
                  <div>
                    <p className="text-xs font-semibold uppercase tracking-wide text-slate-500">
                      Pickup{pickupsForStops.length > 1 ? ` #${index + 1}` : ""}
                    </p>
                    <p className="mt-2 text-lg font-semibold text-slate-900">
                      {p.companyName || p.contactName || "Pickup Location"}
                    </p>
                    <p className="mt-1 text-sm text-slate-700">
                      {p.addressLine1}
                      {p.addressLine2 ? `, ${p.addressLine2}` : ""}{" "}
                      {p.postalCode ? `(${p.postalCode})` : ""}
                    </p>
                    <p className="mt-1 text-sm text-slate-600">
                      Contact: {p.contactName} · {p.contactPhone}
                    </p>
                  </div>

                  <span className="mt-1 inline-flex items-center rounded-full border border-slate-200 bg-slate-50 px-3 py-1 text-sm font-semibold text-slate-700 group-open:bg-sky-50 group-open:text-sky-700">
                    <span className="mr-2">▾</span>
                    Details
                  </span>
                </summary>

                <div className="mt-4 border-t border-slate-200 pt-4">
                  {schedule && index === 0 && (
                    <p className="text-sm text-slate-700">
                      Pickup scheduled on{" "}
                      <span className="font-semibold text-slate-900">
                        {schedule.pickupDate}
                      </span>{" "}
                      ·{" "}
                      <span className="font-semibold text-sky-700">
                        {schedule.pickupSlot}
                      </span>
                    </p>
                  )}

                  {p.remarks && (
                    <p className="mt-2 text-sm text-slate-700">
                      Remarks: <span className="text-slate-600">{p.remarks}</span>
                    </p>
                  )}

                  <p className="mt-3 text-sm text-slate-500">
                    Items are listed under delivery stops.
                  </p>
                </div>
              </details>
            ))}

            {/* Delivery stops */}
            {deliveries.map((d: any, idx: number) => {
              const list = itemsByDelivery[d.id] ?? [];
              const preview = list.slice(0, 2);
              const remaining = list.length - preview.length;

              return (
                <details
                  key={d.id}
                  className="group rounded-3xl border border-slate-200 bg-white p-5 shadow-sm"
                >
                  <summary className="flex cursor-pointer list-none items-start justify-between gap-4">
                    <div>
                      <p className="text-xs font-semibold uppercase tracking-wide text-slate-500">
                        Delivery #{idx + 1}
                      </p>
                      <p className="mt-2 text-lg font-semibold text-slate-900">
                        {d.contactName || "Delivery Point"}
                      </p>
                      <p className="mt-1 text-sm text-slate-700">
                        {d.addressLine1}
                        {d.addressLine2 ? `, ${d.addressLine2}` : ""}{" "}
                        {d.postalCode ? `(${d.postalCode})` : ""}
                      </p>
                      <p className="mt-1 text-sm text-slate-600">
                        Recipient: {d.contactName} · {d.contactPhone}
                      </p>
                    </div>

                    <div className="flex flex-col items-end gap-2">
                      <span className="inline-flex items-center rounded-full border border-slate-200 bg-slate-50 px-3 py-1 text-sm font-semibold text-slate-700 group-open:bg-sky-50 group-open:text-sky-700">
                        <span className="mr-2">▾</span>
                        Details
                      </span>

                      <span className="text-sm font-semibold text-slate-700">
                        {list.length} item{list.length === 1 ? "" : "s"}
                      </span>
                    </div>
                  </summary>

                  <div className="mt-4 border-t border-slate-200 pt-4">
                    {d.remarks && (
                      <p className="text-sm text-slate-700">
                        Delivery remarks:{" "}
                        <span className="text-slate-600">{d.remarks}</span>
                      </p>
                    )}

                    {list.length === 0 ? (
                      <p className="mt-3 text-sm font-semibold text-rose-700">
                        No items recorded for this delivery (check Items step).
                      </p>
                    ) : (
                      <>
                        <div className="mt-3 space-y-2">
                          {preview.map((item: any) => {
                            const vol = item.volumetricWeightKg || 0;
                            const actual = item.weightKg || 0;
                            const qty = item.quantity || 1;
                            const billableTotal = computeBillableKg(item);

                            return (
                              <div
                                key={item.id}
                                className="rounded-2xl border border-slate-200 bg-slate-50 px-4 py-3"
                              >
                                <p className="text-base font-semibold text-slate-900">
                                  {item.description || "(No description)"}
                                </p>

                                <p className="mt-1 text-sm text-slate-700">
                                  {item.category} · Qty {qty} · Billable{" "}
                                  <span className="font-semibold">
                                    {billableTotal.toFixed(2)} kg
                                  </span>
                                </p>

                                <p className="mt-1 text-sm text-slate-500">
                                  Actual {actual || 0} kg · Vol {vol || 0} kg
                                </p>

                                {item.specialHandling && (
                                  <p className="mt-2 text-sm font-semibold text-amber-800">
                                    ⚠ Special handling required
                                  </p>
                                )}

                                {item.remarks && (
                                  <p className="mt-2 text-sm text-slate-600">
                                    Remarks: {item.remarks}
                                  </p>
                                )}
                              </div>
                            );
                          })}
                        </div>

                        {remaining > 0 && (
                          <div className="mt-3">
                            <button
                              type="button"
                              onClick={() =>
                                setViewAll({
                                  deliveryId: d.id,
                                  title: `Delivery #${idx + 1} · ${
                                    d.contactName || "Delivery Point"
                                  }`,
                                })
                              }
                              className="inline-flex items-center rounded-xl border border-slate-200 bg-white px-4 py-2 text-sm font-semibold text-sky-700 hover:bg-sky-50 hover:text-sky-800 focus:outline-none focus:ring-2 focus:ring-sky-400 focus:ring-offset-2"
                            >
                              View all items ({list.length}) →
                            </button>
                          </div>
                        )}
                      </>
                    )}
                  </div>
                </details>
              );
            })}
          </div>
        </div>

        {/* Error */}
        {submitError && (
          <div className="rounded-2xl border border-rose-200 bg-rose-50 px-4 py-3 text-sm font-semibold text-rose-800">
            {submitError}
          </div>
        )}

        {/* Footer buttons */}
        <div className="flex flex-col gap-3 sm:flex-row sm:items-center sm:justify-between">
          <button
            type="button"
            onClick={handleBack}
            className={secondaryBtn}
            disabled={submitting}
          >
            ← Back to Schedule
          </button>

          <button
            type="button"
            onClick={handleConfirm}
            disabled={submitting}
            className={primaryBtn}
          >
            {submitting ? "Creating booking…" : "Confirm & Make Payment →"}
          </button>
        </div>
      </div>

      {/* View all modal */}
      {viewAll && (
        <Modal title={viewAll.title} onClose={() => setViewAll(null)}>
          {(() => {
            const list = itemsByDelivery[viewAll.deliveryId] ?? [];
            if (list.length === 0) {
              return (
                <p className="text-sm text-slate-600">
                  No items recorded for this delivery.
                </p>
              );
            }

            return (
              <div className="space-y-3">
                {list.map((item: any) => {
                  const vol = item.volumetricWeightKg || 0;
                  const actual = item.weightKg || 0;
                  const qty = item.quantity || 1;
                  const billableTotal = computeBillableKg(item);

                  return (
                    <div
                      key={item.id}
                      className="rounded-2xl border border-slate-200 bg-white px-4 py-3"
                    >
                      <p className="text-base font-semibold text-slate-900">
                        {item.description || "(No description)"}
                      </p>

                      <p className="mt-1 text-sm text-slate-700">
                        {item.category} · Qty {qty} · Billable{" "}
                        <span className="font-semibold">
                          {billableTotal.toFixed(2)} kg
                        </span>
                      </p>

                      <p className="mt-1 text-sm text-slate-500">
                        Actual {actual || 0} kg · Vol {vol || 0} kg
                      </p>

                      {item.specialHandling && (
                        <p className="mt-2 text-sm font-semibold text-amber-800">
                          ⚠ Special handling required
                        </p>
                      )}

                      {item.remarks && (
                        <p className="mt-2 text-sm text-slate-600">
                          Remarks: {item.remarks}
                        </p>
                      )}
                    </div>
                  );
                })}
              </div>
            );
          })()}
        </Modal>
      )}
    </StepLayout>
  );
}

// tiny helper for nicer wording
function pickupStopsCount(n: number) {
  return n === 1 ? "1" : String(n);
}
