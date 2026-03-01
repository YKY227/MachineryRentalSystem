// src/app/rental/[id]/page.tsx
"use client";

import { useEffect, useMemo, useState } from "react";
import Link from "next/link";
import { useParams, useRouter } from "next/navigation";
import {
  ArrowRight,
  CalendarDays,
  CheckCircle2,
  Package,
  Shield,
  Truck,
  Sparkles,
  Factory,
  MapPin,
} from "lucide-react";

import type { Equipment, EquipmentHold } from "@/lib/rental/types";
import { localEquipmentRepo } from "@/lib/rental/equipment-repo";
import { localHoldsRepo } from "@/lib/rental/holds-repo";
import { computeAvailableUnitsForRange } from "@/lib/rental/availability";

type FulfillmentMode = "deliver" | "self_collect";

function formatMoney(n: number) {
  return new Intl.NumberFormat("en-SG", {
    style: "currency",
    currency: "SGD",
    maximumFractionDigits: 0,
  }).format(n);
}

function daysInclusive(startISO: string, endISO: string) {
  const s = new Date(startISO);
  const e = new Date(endISO);
  if (Number.isNaN(s.getTime()) || Number.isNaN(e.getTime())) return 0;
  const ms = e.getTime() - s.getTime();
  const days = Math.floor(ms / (1000 * 60 * 60 * 24)) + 1;
  return days;
}

/**
 * Simple tier logic for MVP:
 * - days >= 28 => monthRate prorated by 30-day "months"
 * - else days >= 7 => weekRate prorated by 7-day "weeks"
 * - else dayRate
 *
 * Later: replace with backend quote endpoint or a shared pricing lib.
 */
function calcRentalSubtotal(e: Equipment, days: number, qty: number) {
  const day = e.pricing.dayRate ?? 0;
  const week = e.pricing.weekRate ?? null;
  const month = e.pricing.monthRate ?? null;

  if (days <= 0 || qty <= 0) return 0;

  let perUnit = day * days;

  if (month && days >= 28) {
    const months = days / 30;
    perUnit = month * months;
  } else if (week && days >= 7) {
    const weeks = days / 7;
    perUnit = week * weeks;
  }

  return Math.round(perUnit * qty);
}

type LocalRentalOrder = {
  id: string; // publicId
  equipmentId: string;
  equipmentTitle: string;
  qty: number;
  start: string;
  end: string;
  fulfillment: FulfillmentMode;
  pricingSnapshot: {
    days: number;
    rentalSubtotal: number;
    deliveryFee: number;
    collectionFee: number;
    deposit: number;
    total: number;
  };
  createdAt: string;
};

const ORDERS_LS_KEY = "cms_rental_orders_v1";

function readOrders(): LocalRentalOrder[] {
  if (typeof window === "undefined") return [];
  try {
    const raw = localStorage.getItem(ORDERS_LS_KEY);
    if (!raw) return [];
    const parsed = JSON.parse(raw);
    return Array.isArray(parsed) ? (parsed as LocalRentalOrder[]) : [];
  } catch {
    return [];
  }
}

export default function RentalDetailPage() {
  const params = useParams();
  const router = useRouter();

  const equipmentId = (params?.id as string) ?? "";

  const [loading, setLoading] = useState(true);
  const [equipment, setEquipment] = useState<Equipment | null>(null);
  const [selectedImg, setSelectedImg] = useState(0);

  // booking inputs (MVP)
  const [qty, setQty] = useState(1);
  const [startDate, setStartDate] = useState(() => {
    const d = new Date();
    return d.toISOString().slice(0, 10);
  });
  const [endDate, setEndDate] = useState(() => {
    const d = new Date();
    d.setDate(d.getDate() + 2);
    return d.toISOString().slice(0, 10);
  });

  const [fulfillment, setFulfillment] = useState<FulfillmentMode>("deliver");

  // ✅ NEW: delivery address (only required when deliver)
  const [deliveryAddress, setDeliveryAddress] = useState("");

  // ✅ NEW: holds (maintenance buffers etc.) for availability checks
  const [activeHolds, setActiveHolds] = useState<EquipmentHold[]>([]);

  // MVP fixed fees (you can later switch to region-based or distance-based)
  const deliveryFee = fulfillment === "deliver" ? 60 : 0;
  const collectionFee = fulfillment === "deliver" ? 60 : 0;

  useEffect(() => {
    let mounted = true;
    (async () => {
      const holds = await localHoldsRepo.listActive();
      if (!mounted) return;
      setActiveHolds(holds);
    })();
    return () => {
      mounted = false;
    };
  }, []);

  useEffect(() => {
    let mounted = true;
    (async () => {
      setLoading(true);
      const e = await localEquipmentRepo.getById(equipmentId);
      if (!mounted) return;

      setEquipment(e);
      setSelectedImg(0);

      setLoading(false);
    })();

    return () => {
      mounted = false;
    };
  }, [equipmentId]);

  // ✅ optional UX: if switching to self-collect, clear delivery address
  useEffect(() => {
    if (fulfillment === "self_collect" && deliveryAddress) {
      setDeliveryAddress("");
    }
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [fulfillment]);

  const days = useMemo(
    () => daysInclusive(startDate, endDate),
    [startDate, endDate]
  );

  const minDays = equipment?.pricing?.minDays ?? 1;
  const deposit = equipment?.pricing?.deposit ?? 0;

  // ✅ compute availability for selected date range
  const availability = useMemo(() => {
    if (!equipment) return null;
    if (!startDate || !endDate) return null;

    const orders = readOrders();

    return computeAvailableUnitsForRange({
      equipment,
      orders,
      holds: activeHolds,
      start: startDate,
      end: endDate,
    });
  }, [equipment, startDate, endDate, activeHolds]);

  // total units might be 3, but availableUnits might be 2 (if 1 unit held/ordered overlapping)
  const availableUnitsForRange = availability?.available ?? (equipment?.totalUnits ?? 0);

  // clamp qty when availability changes (prevents qty being > available and getting stuck)
  useEffect(() => {
    setQty((prev) => {
      const next = Math.max(1, Math.min(prev, Math.max(1, availableUnitsForRange)));
      return next;
    });
  }, [availableUnitsForRange]);

  const rentalSubtotal = useMemo(() => {
    if (!equipment) return 0;
    return calcRentalSubtotal(equipment, days, qty);
  }, [equipment, days, qty]);

  const total = useMemo(() => {
    return rentalSubtotal + deliveryFee + collectionFee + deposit;
  }, [rentalSubtotal, deliveryFee, collectionFee, deposit]);

  const inStock = availableUnitsForRange > 0;

  const dateValid = days > 0 && days >= minDays;
  const qtyValid = qty >= 1 && qty <= availableUnitsForRange;

  // ✅ address required only for deliver
  const addressRequired = fulfillment === "deliver";
  const addressValid = !addressRequired || deliveryAddress.trim().length >= 8; // simple MVP rule

  const canProceed =
    !!equipment && inStock && dateValid && qtyValid && addressValid;

  function handleProceed() {
    if (!equipment) return;
    if (!canProceed) return;

    const qp = new URLSearchParams();
    qp.set("equipmentId", equipment.id);
    qp.set("qty", String(qty));
    qp.set("start", startDate);
    qp.set("end", endDate);
    qp.set("fulfillment", fulfillment);

    // ✅ pass address only when deliver
    if (fulfillment === "deliver") qp.set("address", deliveryAddress.trim());

    router.push(`/rental/checkout?${qp.toString()}`);
  }

  if (loading) {
    return (
      <div className="mx-auto max-w-6xl p-4">
        <div className="rounded-xl border border-slate-200 bg-white p-6 text-sm text-slate-600">
          Loading equipment…
        </div>
      </div>
    );
  }

  if (!equipment) {
    return (
      <div className="mx-auto max-w-6xl p-4">
        <div className="flex items-start justify-between gap-4">
          <div>
            <h1 className="text-2xl font-semibold text-slate-900">Not found</h1>
            <p className="mt-1 text-sm text-slate-600">
              This equipment does not exist (or is not available).
            </p>
          </div>
          <Link
            href="/rental"
            className="rounded-lg border border-slate-200 bg-white px-3 py-2 text-sm font-medium text-slate-700 hover:bg-slate-50"
          >
            ← Back to catalog
          </Link>
        </div>
      </div>
    );
  }

  const heroImg = equipment.images?.[selectedImg] ?? equipment.images?.[0] ?? "";

  const catalogueUrl = (equipment as any).catalogueUrl?.trim?.() ?? ""; // adjust once type updated
const trainingVideoUrl = (equipment as any).trainingVideoUrl?.trim?.() ?? "";

const hasCatalogue = !!catalogueUrl;
const hasTrainingVideo = !!trainingVideoUrl;

// optional: basic “safe-ish” check (MVP)
const safeCatalogueUrl = hasCatalogue && /^https?:\/\//i.test(catalogueUrl) ? catalogueUrl : "";
const safeTrainingUrl = hasTrainingVideo && /^https?:\/\//i.test(trainingVideoUrl) ? trainingVideoUrl : "";

  return (
    <div className="mx-auto max-w-6xl p-4">
      {/* Top row */}
      <div className="flex items-start justify-between gap-4">
        <div>
          <p className="text-xs font-semibold uppercase tracking-wide text-slate-500">
            Equipment Rental
          </p>
          <h1 className="mt-1 text-2xl font-semibold text-slate-900">
            {equipment.title}
          </h1>
          <p className="mt-1 text-sm text-slate-600">
            {equipment.brand ?? "—"}
            {equipment.model ? ` • ${equipment.model}` : ""}
          </p>
        </div>

        <Link
          href="/"
          className="rounded-lg border border-slate-200 bg-white px-3 py-2 text-sm font-medium text-slate-700 hover:bg-slate-50"
        >
          ← Back
        </Link>
      </div>

      <div className="mt-6 grid gap-6 lg:grid-cols-12">
        {/* Left: gallery + details */}
        <div className="lg:col-span-7">
          <div className="overflow-hidden rounded-2xl border border-slate-200 bg-white shadow-sm">
            <div className="relative aspect-[16/10] w-full bg-slate-100">
              {heroImg ? (
                <img
                  src={heroImg}
                  alt={equipment.title}
                  className="h-full w-full object-cover"
                />
              ) : (
                <div className="flex h-full w-full items-center justify-center text-slate-400">
                  <Package className="h-10 w-10" />
                </div>
              )}
            </div>

            {/* thumbnails */}
            {equipment.images?.length > 1 && (
              <div className="flex gap-2 overflow-x-auto border-t border-slate-200 p-3">
                {equipment.images.map((url, idx) => {
                  const active = idx === selectedImg;
                  return (
                    <button
                      key={url + idx}
                      type="button"
                      onClick={() => setSelectedImg(idx)}
                      className={[
                        "h-16 w-24 flex-shrink-0 overflow-hidden rounded-lg border",
                        active
                          ? "border-slate-900"
                          : "border-slate-200 hover:border-slate-300",
                      ].join(" ")}
                      aria-label={`Select image ${idx + 1}`}
                    >
                      <img
                        src={url}
                        alt={`${equipment.title} ${idx + 1}`}
                        className="h-full w-full object-cover"
                        loading="lazy"
                      />
                    </button>
                  );
                })}
              </div>
            )}
          </div>

          {/* Overview + Specifications */}
          <div className="mt-6 grid gap-6 md:grid-cols-2">
            {/* Overview */}
            <div className="rounded-2xl border border-slate-200 bg-white p-5 shadow-sm">
              <h2 className="text-sm font-semibold text-slate-900">Overview</h2>
              <p className="mt-2 text-sm text-slate-600">{equipment.shortDesc}</p>

              <div className="mt-4 space-y-2 text-xs text-slate-600">
                <div className="flex items-center gap-2">
                  <CheckCircle2 className="h-4 w-4 text-emerald-600" />
                  {inStock
                    ? `${availableUnitsForRange} unit(s) available for selected dates`
                    : "No units available for selected dates"}
                </div>

                {/* Optional detail: where the availability came from */}
                {availability && (
                  <div className="text-[11px] text-slate-500">
                    Total: {equipment.totalUnits} • Reserved: {availability.reserved} • Held:{" "}
                    {availability.held}
                  </div>
                )}

                <div className="flex items-center gap-2">
                  <CalendarDays className="h-4 w-4 text-slate-500" />
                  Min rental: {minDays} day(s)
                </div>

                {deposit > 0 && (
                  <div className="flex items-center gap-2">
                    <Shield className="h-4 w-4 text-slate-500" />
                    Deposit: {formatMoney(deposit)} (refundable)
                  </div>
                )}
              </div>
            </div>

            {/* Specifications */}
            <div className="rounded-2xl border border-slate-200 bg-white p-5 shadow-sm">
              <h2 className="text-sm font-semibold text-slate-900">Specifications</h2>

              <div className="mt-3 space-y-2">
                {Object.entries(equipment.specs ?? {}).map(([k, v]) => (
                  <div
                    key={k}
                    className="flex items-start justify-between gap-3 rounded-lg bg-slate-50 px-3 py-2"
                  >
                    <div className="text-xs font-medium text-slate-600">{k}</div>
                    <div className="text-xs text-slate-900">{v}</div>
                  </div>
                ))}

                {(!equipment.specs || Object.keys(equipment.specs).length === 0) && (
                  <div className="rounded-lg bg-slate-50 px-3 py-2 text-xs text-slate-500">
                    No specs provided yet.
                  </div>
                )}
              </div>
            </div>
          </div>

          {/* ✅ Resources (Catalogue + Training Video) */}
<div className="mt-6 rounded-2xl border border-slate-200 bg-white p-5 shadow-sm">
  <div className="flex items-center justify-between gap-3">
    <div>
      <h2 className="text-sm font-semibold text-slate-900">Resources</h2>
      <p className="mt-1 text-xs text-slate-500">
        Operator references (optional). Buttons disable if not provided.
      </p>
    </div>
  </div>

  <div className="mt-4 grid gap-3 sm:grid-cols-2">
    {/* Catalogue */}
    {safeCatalogueUrl ? (
      <a
        href={safeCatalogueUrl}
        target="_blank"
        rel="noreferrer"
        className="inline-flex items-center justify-center gap-2 rounded-xl border border-slate-200 bg-white px-4 py-3 text-sm font-semibold text-slate-900 hover:bg-slate-50"
      >
        {/* icon */}
        <Package className="h-4 w-4 text-slate-700" />
        Open catalogue
      </a>
    ) : (
      <button
        type="button"
        disabled
        className="inline-flex cursor-not-allowed items-center justify-center gap-2 rounded-xl border border-slate-200 bg-slate-50 px-4 py-3 text-sm font-semibold text-slate-400"
        title="No catalogue provided"
      >
        <Package className="h-4 w-4 text-slate-300" />
        Catalogue unavailable
      </button>
    )}

    {/* Training video */}
    {safeTrainingUrl ? (
      <a
        href={safeTrainingUrl}
        target="_blank"
        rel="noreferrer"
        className="inline-flex items-center justify-center gap-2 rounded-xl border border-slate-200 bg-white px-4 py-3 text-sm font-semibold text-slate-900 hover:bg-slate-50"
      >
        {/* icon */}
        <Sparkles className="h-4 w-4 text-slate-700" />
        Watch training video
      </a>
    ) : (
      <button
        type="button"
        disabled
        className="inline-flex cursor-not-allowed items-center justify-center gap-2 rounded-xl border border-slate-200 bg-slate-50 px-4 py-3 text-sm font-semibold text-slate-400"
        title="No training video provided"
      >
        <Sparkles className="h-4 w-4 text-slate-300" />
        Training video unavailable
      </button>
    )}
  </div>
</div>

          {/* Key features + Applications */}
          <div className="mt-6 rounded-2xl border border-slate-200 bg-white p-5 shadow-sm">
            <div className="grid gap-6 md:grid-cols-2">
              {/* Key features */}
              <div>
                <div className="flex items-center gap-2 text-sm font-semibold text-slate-900">
                  <Sparkles className="h-4 w-4 text-amber-600" />
                  Key features
                </div>

                <ul className="mt-3 space-y-2 text-sm text-slate-600">
                  {(equipment.keyFeatures?.length
                    ? equipment.keyFeatures
                    : [
                        "Transparent tiered pricing (day / week / month)",
                        "Delivery + collection available, or self-collect option",
                        "Refundable deposit for asset protection (if applicable)",
                      ]
                  ).map((f) => (
                    <li key={f} className="flex items-start gap-2">
                      <span className="mt-1 inline-block h-1.5 w-1.5 rounded-full bg-slate-400" />
                      <span>{f}</span>
                    </li>
                  ))}
                </ul>
              </div>

              {/* Applications */}
              <div className="md:border-l md:border-slate-200 md:pl-6">
                <div className="flex items-center gap-2 text-sm font-semibold text-slate-900">
                  <Factory className="h-4 w-4 text-slate-700" />
                  Applications
                </div>

                <ul className="mt-3 space-y-2 text-sm text-slate-600">
                  {(equipment.applications?.length
                    ? equipment.applications
                    : [
                        "Construction & renovation works",
                        "Events & temporary site setup",
                        "Maintenance & facility operations",
                      ]
                  ).map((a) => (
                    <li key={a} className="flex items-start gap-2">
                      <span className="mt-1 inline-block h-1.5 w-1.5 rounded-full bg-slate-400" />
                      <span>{a}</span>
                    </li>
                  ))}
                </ul>
              </div>
            </div>
          </div>
        </div>

        {/* Right: booking panel */}
        <div className="lg:col-span-5">
          <div className="sticky top-4 rounded-2xl border border-slate-200 bg-white p-5 shadow-sm">
            <h2 className="text-sm font-semibold text-slate-900">
              Create rental booking (MVP)
            </h2>
            <p className="mt-1 text-xs text-slate-500">
              Availability updates based on selected dates (orders + maintenance holds).
            </p>

            {/* Pricing card */}
            <div className="mt-4 rounded-xl border border-slate-200 bg-slate-50 p-4">
              <div className="flex items-baseline justify-between">
                <div className="text-xs text-slate-500">From</div>
                <div className="text-lg font-semibold text-slate-900">
                  {formatMoney(equipment.pricing.dayRate)}
                  <span className="text-xs font-medium text-slate-500">/day</span>
                </div>
              </div>
              <div className="mt-2 grid grid-cols-3 gap-2 text-center">
                <div className="rounded-lg bg-white p-2">
                  <div className="text-[10px] uppercase tracking-wide text-slate-500">
                    Day
                  </div>
                  <div className="text-sm font-semibold text-slate-900">
                    {formatMoney(equipment.pricing.dayRate)}
                  </div>
                </div>
                <div className="rounded-lg bg-white p-2">
                  <div className="text-[10px] uppercase tracking-wide text-slate-500">
                    Week
                  </div>
                  <div className="text-sm font-semibold text-slate-900">
                    {equipment.pricing.weekRate ? formatMoney(equipment.pricing.weekRate) : "—"}
                  </div>
                </div>
                <div className="rounded-lg bg-white p-2">
                  <div className="text-[10px] uppercase tracking-wide text-slate-500">
                    Month
                  </div>
                  <div className="text-sm font-semibold text-slate-900">
                    {equipment.pricing.monthRate ? formatMoney(equipment.pricing.monthRate) : "—"}
                  </div>
                </div>
              </div>
            </div>

            

            {/* Inputs */}
            <div className="mt-4 space-y-3">
              <div className="grid gap-3 sm:grid-cols-2">
                <div>
                  <label className="text-xs font-medium text-slate-700">
                    Start date
                  </label>
                  <input
                    type="date"
                    value={startDate}
                    onChange={(e) => setStartDate(e.target.value)}
                    className="mt-1 w-full rounded-xl border border-slate-200 bg-white px-3 py-2 text-sm outline-none focus:border-slate-400"
                  />
                </div>
                <div>
                  <label className="text-xs font-medium text-slate-700">
                    End date
                  </label>
                  <input
                    type="date"
                    value={endDate}
                    onChange={(e) => setEndDate(e.target.value)}
                    className="mt-1 w-full rounded-xl border border-slate-200 bg-white px-3 py-2 text-sm outline-none focus:border-slate-400"
                  />
                </div>
              </div>

              {!dateValid && (
                <p className="text-xs text-rose-600">
                  Please select a valid date range (min {minDays} day(s)).
                </p>
              )}

              <div>
                <label className="text-xs font-medium text-slate-700">
                  Quantity
                </label>
                <input
                  type="number"
                  min={1}
                  max={Math.max(1, availableUnitsForRange)}
                  value={qty}
                  onChange={(e) => setQty(Math.max(1, Number(e.target.value || 1)))}
                  className="mt-1 w-full rounded-xl border border-slate-200 bg-white px-3 py-2 text-sm outline-none focus:border-slate-400"
                />
                <div className="mt-1 text-xs text-slate-500">
                  Available for selected dates:{" "}
                  <span className="font-semibold text-slate-700">{availableUnitsForRange}</span>
                </div>
                {!qtyValid && (
                  <p className="mt-1 text-xs text-rose-600">
                    Quantity exceeds availability for selected dates.
                  </p>
                )}
              </div>

              <div>
                <label className="text-xs font-medium text-slate-700">Fulfillment</label>
                <div className="mt-2 grid grid-cols-2 gap-2">
                  <button
                    type="button"
                    onClick={() => setFulfillment("deliver")}
                    className={[
                      "inline-flex items-center justify-center gap-2 rounded-xl border px-3 py-2 text-sm font-semibold",
                      fulfillment === "deliver"
                        ? "border-slate-900 bg-slate-900 text-white"
                        : "border-slate-200 bg-white text-slate-700 hover:bg-slate-50",
                    ].join(" ")}
                  >
                    <Truck className="h-4 w-4" />
                    Deliver
                  </button>

                  <button
                    type="button"
                    onClick={() => setFulfillment("self_collect")}
                    className={[
                      "inline-flex items-center justify-center gap-2 rounded-xl border px-3 py-2 text-sm font-semibold",
                      fulfillment === "self_collect"
                        ? "border-slate-900 bg-slate-900 text-white"
                        : "border-slate-200 bg-white text-slate-700 hover:bg-slate-50",
                    ].join(" ")}
                  >
                    <Package className="h-4 w-4" />
                    Self-collect
                  </button>
                </div>

                {/* delivery address */}
                {fulfillment === "deliver" ? (
                  <div className="mt-3">
                    <label className="text-xs font-medium text-slate-700">
                      Delivery address <span className="text-rose-600">*</span>
                    </label>
                    <div className="mt-1 relative">
                      <MapPin className="pointer-events-none absolute left-3 top-2.5 h-4 w-4 text-slate-400" />
                      <input
                        type="text"
                        value={deliveryAddress}
                        onChange={(e) => setDeliveryAddress(e.target.value)}
                        placeholder="e.g. 10 Ubi Crescent, #05-12, Singapore 408564"
                        className={[
                          "w-full rounded-xl border bg-white pl-9 pr-3 py-2 text-sm outline-none",
                          addressValid
                            ? "border-slate-200 focus:border-slate-400"
                            : "border-rose-300 focus:border-rose-400",
                        ].join(" ")}
                      />
                    </div>
                    {!addressValid && (
                      <p className="mt-1 text-xs text-rose-600">
                        Please enter a delivery address to proceed.
                      </p>
                    )}
                  </div>
                ) : (
                  <div className="mt-3 rounded-xl border border-slate-200 bg-slate-50 p-3 text-xs text-slate-600">
                    Warehouse pickup details will be confirmed at checkout.
                  </div>
                )}
              </div>
            </div>

            {/* Quote */}
            <div className="mt-5 rounded-xl border border-slate-200 bg-white p-4">
              <div className="flex items-center justify-between">
                <div className="text-xs font-semibold uppercase tracking-wide text-slate-500">
                  Price estimate
                </div>
                <div className="text-xs text-slate-500">
                  {days > 0 ? `${days} day(s)` : "—"}
                </div>
              </div>

              <div className="mt-3 space-y-2 text-sm">
                <div className="flex items-center justify-between">
                  <span className="text-slate-600">Rental subtotal</span>
                  <span className="font-semibold text-slate-900">
                    {formatMoney(rentalSubtotal)}
                  </span>
                </div>

                <div className="flex items-center justify-between">
                  <span className="text-slate-600">Delivery fee</span>
                  <span className="text-slate-900">{formatMoney(deliveryFee)}</span>
                </div>

                <div className="flex items-center justify-between">
                  <span className="text-slate-600">Collection fee</span>
                  <span className="text-slate-900">{formatMoney(collectionFee)}</span>
                </div>

                <div className="flex items-center justify-between">
                  <span className="text-slate-600">Deposit (refundable)</span>
                  <span className="text-slate-900">{formatMoney(deposit)}</span>
                </div>

                <div className="mt-2 border-t border-slate-200 pt-3">
                  <div className="flex items-center justify-between">
                    <span className="text-slate-700 font-semibold">Total</span>
                    <span className="text-slate-900 font-semibold">
                      {formatMoney(total)}
                    </span>
                  </div>
                </div>

                <p className="mt-2 text-xs text-slate-500">
                  MVP estimate — availability is date-aware (orders + maintenance holds).
                </p>
              </div>
            </div>

            {/* CTA */}
            <button
              type="button"
              onClick={handleProceed}
              disabled={!canProceed}
              className={[
                "mt-4 inline-flex w-full items-center justify-center rounded-xl px-4 py-3 text-sm font-semibold",
                canProceed
                  ? "bg-sky-600 text-white hover:bg-sky-700"
                  : "cursor-not-allowed bg-slate-200 text-slate-500",
              ].join(" ")}
            >
              Proceed to checkout
              <ArrowRight className="ml-2 h-4 w-4" />
            </button>

            {!inStock && (
              <p className="mt-2 text-xs text-rose-600">
                No units available for the selected dates. Try different dates.
              </p>
            )}
          </div>
        </div>
      </div>
    </div>
  );
}
