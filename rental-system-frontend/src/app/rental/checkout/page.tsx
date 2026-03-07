// src/app/rental/checkout/page.tsx
"use client";

import { Suspense, useEffect, useMemo, useState } from "react";
import Link from "next/link";
import { useRouter, useSearchParams } from "next/navigation";
import {
  ArrowRight,
  CalendarDays,
  CheckCircle2,
  Package,
  Shield,
  Truck,
  ClipboardList,
} from "lucide-react";

import type { Equipment, EquipmentHold } from "@/lib/rental/types";
import { localEquipmentRepo } from "@/lib/rental/equipment-repo";
import { localHoldsRepo } from "@/lib/rental/holds-repo";
import { computeAvailableUnitsForRange } from "@/lib/rental/availability";
import type { CreateRentalOrderInput } from "@/lib/rental/orders/types";

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
  return Math.floor(ms / (1000 * 60 * 60 * 24)) + 1;
}

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

function toInt(v: string | null, fallback: number) {
  const n = Number(v);
  if (!Number.isFinite(n)) return fallback;
  return Math.max(1, Math.floor(n));
}

function safeMode(v: string | null): FulfillmentMode {
  return v === "self_collect" ? "self_collect" : "deliver";
}

function newPublicId() {
  const d = new Date();
  const dd = String(d.getDate()).padStart(2, "0");
  const mm = String(d.getMonth() + 1).padStart(2, "0");
  const yy = String(d.getFullYear()).slice(-2);
  const rand = Math.floor(1000 + Math.random() * 9000);
  return `RNT-${dd}${mm}${yy}-${rand}`;
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

function writeOrders(items: LocalRentalOrder[]) {
  if (typeof window === "undefined") return;
  localStorage.setItem(ORDERS_LS_KEY, JSON.stringify(items));
}

async function persistOrderToDb(order: CreateRentalOrderInput) {
  const res = await fetch("/api/public/rental/orders", {
    method: "POST",
    headers: { "Content-Type": "application/json" },
    body: JSON.stringify({ order }),
  });

  if (!res.ok) {
    const data = await res.json().catch(() => ({}));
    throw new Error(data?.error ?? "Failed to persist order to DB");
  }
}

function addDaysISO(dateISO: string, days: number) {
  const d = new Date(dateISO + "T00:00:00");
  if (Number.isNaN(d.getTime())) return dateISO;
  d.setDate(d.getDate() + days);
  return d.toISOString().slice(0, 10);
}

function nextDayISO(dateISO: string) {
  return addDaysISO(dateISO, 1);
}

/**
 * ✅ This outer component exists ONLY to satisfy Next's requirement:
 * useSearchParams() must be under a Suspense boundary.
 */
export default function RentalCheckoutPage() {
  return (
    <Suspense
      fallback={
        <div className="mx-auto max-w-6xl p-4">
          <div className="rounded-xl border border-slate-200 bg-white p-6 text-sm text-slate-600">
            Loading checkout…
          </div>
        </div>
      }
    >
      <CheckoutInner />
    </Suspense>
  );
}

function CheckoutInner() {
  const router = useRouter();
  const searchParams = useSearchParams();

  // ✅ null-safe
  const getParam = (key: string): string | null => {
    return searchParams?.get(key) ?? null;
  };

  const equipmentId = getParam("equipmentId") ?? "";
  const qty = toInt(getParam("qty"), 1);
  const start = getParam("start") ?? "";
  const end = getParam("end") ?? "";
  const fulfillment = safeMode(getParam("fulfillment"));

  const [loading, setLoading] = useState(true);
  const [equipment, setEquipment] = useState<Equipment | null>(null);

  const [confirming, setConfirming] = useState(false);
  const [confirmedId, setConfirmedId] = useState<string | null>(null);

  // MVP fixed fees
  const deliveryFee = fulfillment === "deliver" ? 60 : 0;
  const collectionFee = fulfillment === "deliver" ? 60 : 0;

  // ✅ holds for availability checks
  const [activeHolds, setActiveHolds] = useState<EquipmentHold[]>([]);

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
      setLoading(false);
    })();

    return () => {
      mounted = false;
    };
  }, [equipmentId]);

  const days = useMemo(() => {
    if (!start || !end) return 0;
    return daysInclusive(start, end);
  }, [start, end]);

  const minDays = equipment?.pricing?.minDays ?? 1;
  const deposit = equipment?.pricing?.deposit ?? 0;

  const rentalSubtotal = useMemo(() => {
    if (!equipment) return 0;
    return calcRentalSubtotal(equipment, days, qty);
  }, [equipment, days, qty]);

  const total = useMemo(() => {
    return rentalSubtotal + deliveryFee + collectionFee + deposit;
  }, [rentalSubtotal, deliveryFee, collectionFee, deposit]);

  // ✅ availability (orders + holds)
  const availability = useMemo(() => {
    if (!equipment || !start || !end) return null;
    const orders = readOrders();
    return computeAvailableUnitsForRange({
      equipment,
      orders,
      holds: activeHolds,
      start,
      end,
    });
  }, [equipment, start, end, activeHolds]);

  const availableUnits = availability?.available ?? (equipment?.totalUnits ?? 0);

  const valid =
    !!equipment &&
    qty >= 1 &&
    qty <= availableUnits &&
    days > 0 &&
    days >= minDays;

  async function confirmBooking() {
    if (!equipment || !valid) return;

    setConfirming(true);
    await new Promise((r) => setTimeout(r, 250));

    const id = newPublicId();

    const order: LocalRentalOrder = {
      id,
      equipmentId: equipment.id,
      equipmentTitle: equipment.title,
      qty,
      start,
      end,
      fulfillment,
      pricingSnapshot: {
        days,
        rentalSubtotal,
        deliveryFee,
        collectionFee,
        deposit,
        total,
      },
      createdAt: new Date().toISOString(),
    };

    const prev = readOrders();
    writeOrders([order, ...prev]);
    // TODO: remove localStorage write once all dependent pages are fully DB-backed.
    // Compatibility mode (Option B): keep local write + persist to DB for admin pages.
    try {
      await persistOrderToDb({
        id: order.id,
        equipmentId: order.equipmentId,
        equipmentTitle: order.equipmentTitle,
        qty: order.qty,
        start: order.start,
        end: order.end,
        fulfillment: order.fulfillment,
        pricingSnapshot: order.pricingSnapshot,
      });
    } catch (e) {
      console.error("[checkout] DB order persistence failed", e);
    }

    // ✅ Option B: auto-create maintenance hold after rental ends
    // If you added equipment.maintenanceBufferDays, it will be used.
    // Otherwise defaults to 7 days.
    const bufferDays = (equipment as any).maintenanceBufferDays ?? 7;

    // hold starts the day AFTER rental end
    const holdStart = nextDayISO(end);
    // inclusive hold end (7 days buffer => holdStart..holdStart+6)
    const holdEnd = addDaysISO(holdStart, Math.max(0, bufferDays - 1));

    await localHoldsRepo.create({
      equipmentId: equipment.id,
      qty,
      type: "maintenance",
      status: "active",
      startDate: holdStart,
      endDate: holdEnd,
      notes: `Auto maintenance buffer after order ${id} (${bufferDays} day(s))`,
    });

    // refresh holds state so availability updates immediately in the app session
    const holdsNow = await localHoldsRepo.listActive();
    setActiveHolds(holdsNow);

    setConfirmedId(id);
    setConfirming(false);
  }

  if (loading) {
    return (
      <div className="mx-auto max-w-6xl p-4">
        <div className="rounded-xl border border-slate-200 bg-white p-6 text-sm text-slate-600">
          Loading checkout…
        </div>
      </div>
    );
  }

  if (!equipment) {
    return (
      <div className="mx-auto max-w-6xl p-4">
        <div className="flex items-start justify-between gap-4">
          <div>
            <h1 className="text-2xl font-semibold text-slate-900">Checkout</h1>
            <p className="mt-1 text-sm text-slate-600">
              Equipment not found. Please go back and select an item again.
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

  // Success state
  if (confirmedId) {
    return (
      <div className="mx-auto max-w-4xl p-4">
        <div className="rounded-2xl border border-emerald-200 bg-emerald-50 p-6">
          <div className="flex items-start gap-3">
            <CheckCircle2 className="mt-0.5 h-6 w-6 text-emerald-700" />
            <div className="flex-1">
              <h1 className="text-xl font-semibold text-emerald-900">
                Booking confirmed
              </h1>
              <p className="mt-1 text-sm text-emerald-800">
                Your rental request has been recorded (MVP). Payment integration will be added later.
              </p>

              <div className="mt-3 rounded-xl bg-white/70 p-4">
                <div className="text-xs uppercase tracking-wide text-emerald-700">
                  Rental Reference
                </div>
                <div className="mt-1 text-2xl font-semibold text-emerald-900">
                  {confirmedId}
                </div>

                <div className="mt-4 grid gap-2 text-sm text-slate-700 sm:grid-cols-2">
                  <div>
                    <div className="text-xs text-slate-500">Item</div>
                    <div className="font-medium text-slate-900">{equipment.title}</div>
                  </div>
                  <div>
                    <div className="text-xs text-slate-500">Quantity</div>
                    <div className="font-medium text-slate-900">{qty}</div>
                  </div>
                  <div>
                    <div className="text-xs text-slate-500">Rental period</div>
                    <div className="font-medium text-slate-900">
                      {start} → {end} ({days} day(s))
                    </div>
                  </div>
                  <div>
                    <div className="text-xs text-slate-500">Fulfillment</div>
                    <div className="font-medium text-slate-900">
                      {fulfillment === "deliver" ? "Deliver & collect" : "Self-collect"}
                    </div>
                  </div>
                </div>

                <div className="mt-4 border-t border-slate-200 pt-4 text-sm">
                  <div className="flex items-center justify-between">
                    <span className="text-slate-600">Total</span>
                    <span className="font-semibold text-slate-900">
                      {formatMoney(total)}
                    </span>
                  </div>
                  <p className="mt-2 text-xs text-slate-500">
                    Note: This is a frontend-only confirmation. Later we’ll send this to backend and enable payment.
                  </p>
                </div>
              </div>

              <div className="mt-5 flex flex-col gap-3 sm:flex-row">
                <Link
                  href="/rental"
                  className="inline-flex items-center justify-center rounded-xl bg-slate-900 px-5 py-3 text-sm font-semibold text-white hover:bg-slate-800"
                >
                  Browse more equipment
                  <ArrowRight className="ml-2 h-4 w-4" />
                </Link>

                <button
                  type="button"
                  onClick={() => router.push("/(public-pages)")}
                  className="inline-flex items-center justify-center rounded-xl border border-slate-200 bg-white px-5 py-3 text-sm font-semibold text-slate-900 hover:bg-slate-50"
                >
                  Back to home
                </button>
              </div>
            </div>
          </div>
        </div>
      </div>
    );
  }

  const heroImg = equipment.images?.[0] ?? "";

  return (
    <div className="mx-auto max-w-6xl p-4">
      <div className="flex items-start justify-between gap-4">
        <div>
          <p className="text-xs font-semibold uppercase tracking-wide text-slate-500">
            Equipment Rental
          </p>
          <h1 className="mt-1 text-2xl font-semibold text-slate-900">Checkout</h1>
          <p className="mt-1 text-sm text-slate-600">
            Review your rental details and confirm (payment placeholder for now).
          </p>
        </div>

        <Link
          href={`/rental/${encodeURIComponent(equipment.id)}`}
          className="rounded-lg border border-slate-200 bg-white px-3 py-2 text-sm font-medium text-slate-700 hover:bg-slate-50"
        >
          ← Back
        </Link>
      </div>

      <div className="mt-6 grid gap-6 lg:grid-cols-12">
        <div className="lg:col-span-7">
          <div className="overflow-hidden rounded-2xl border border-slate-200 bg-white shadow-sm">
            <div className="grid gap-4 p-5 sm:grid-cols-[140px_1fr]">
              <div className="relative aspect-[4/3] overflow-hidden rounded-xl bg-slate-100">
                {heroImg ? (
                  <img
                    src={heroImg}
                    alt={equipment.title}
                    className="h-full w-full object-cover"
                  />
                ) : (
                  <div className="flex h-full w-full items-center justify-center text-slate-400">
                    <Package className="h-8 w-8" />
                  </div>
                )}
              </div>

              <div>
                <h2 className="text-lg font-semibold text-slate-900">{equipment.title}</h2>
                <p className="mt-1 text-sm text-slate-600">
                  {equipment.brand ?? "—"}
                  {equipment.model ? ` • ${equipment.model}` : ""}
                </p>

                <div className="mt-4 grid gap-3 sm:grid-cols-2">
                  <div className="rounded-xl border border-slate-200 bg-slate-50 p-4">
                    <div className="flex items-center gap-2 text-sm font-semibold text-slate-900">
                      <CalendarDays className="h-4 w-4" />
                      Rental period
                    </div>
                    <div className="mt-1 text-sm text-slate-700">
                      {start} → {end}
                    </div>
                    <div className="mt-1 text-xs text-slate-500">
                      {days > 0 ? `${days} day(s)` : "Invalid date range"}
                    </div>
                    {days > 0 && days < minDays && (
                      <div className="mt-2 text-xs font-medium text-rose-600">
                        Min rental is {minDays} day(s)
                      </div>
                    )}
                  </div>

                  <div className="rounded-xl border border-slate-200 bg-slate-50 p-4">
                    <div className="flex items-center gap-2 text-sm font-semibold text-slate-900">
                      <ClipboardList className="h-4 w-4" />
                      Quantity & stock
                    </div>
                    <div className="mt-1 text-sm text-slate-700">Qty: {qty}</div>
                    <div className="mt-1 text-xs text-slate-500">
                      Available units: {availableUnits}
                      {availability && (
                        <span className="ml-2 text-slate-400">
                          (reserved: {availability.reserved}, hold: {availability.held})
                        </span>
                      )}
                    </div>
                    {qty > availableUnits && (
                      <div className="mt-2 text-xs font-medium text-rose-600">
                        Quantity exceeds available stock
                      </div>
                    )}
                  </div>

                  <div className="rounded-xl border border-slate-200 bg-slate-50 p-4 sm:col-span-2">
                    <div className="flex items-center gap-2 text-sm font-semibold text-slate-900">
                      <Truck className="h-4 w-4" />
                      Fulfillment
                    </div>
                    <div className="mt-1 text-sm text-slate-700">
                      {fulfillment === "deliver"
                        ? "We deliver to your site and collect when rental ends."
                        : "Self-collect from warehouse (delivery fees not applied)."}
                    </div>
                  </div>

                  {(equipment.pricing.deposit ?? 0) > 0 && (
                    <div className="rounded-xl border border-slate-200 bg-slate-50 p-4 sm:col-span-2">
                      <div className="flex items-center gap-2 text-sm font-semibold text-slate-900">
                        <Shield className="h-4 w-4" />
                        Deposit
                      </div>
                      <div className="mt-1 text-sm text-slate-700">
                        {formatMoney(equipment.pricing.deposit ?? 0)} (refundable)
                      </div>
                    </div>
                  )}
                </div>

                <div className="mt-4 text-xs text-slate-500">
                  Tip: Later we can convert this rental booking into a real “job” workflow (delivery + collection legs).
                </div>
              </div>
            </div>
          </div>
        </div>

        <div className="lg:col-span-5">
          <div className="sticky top-4 rounded-2xl border border-slate-200 bg-white p-5 shadow-sm">
            <h2 className="text-sm font-semibold text-slate-900">Price breakdown</h2>
            <p className="mt-1 text-xs text-slate-500">
              MVP estimate — backend pricing engine will replace this later.
            </p>

            <div className="mt-4 space-y-2 text-sm">
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
                <span className="text-slate-600">Deposit</span>
                <span className="text-slate-900">{formatMoney(deposit)}</span>
              </div>

              <div className="mt-3 border-t border-slate-200 pt-3">
                <div className="flex items-center justify-between">
                  <span className="font-semibold text-slate-700">Total</span>
                  <span className="text-lg font-semibold text-slate-900">
                    {formatMoney(total)}
                  </span>
                </div>
              </div>
            </div>

            {!valid && (
              <div className="mt-4 rounded-xl border border-rose-200 bg-rose-50 p-3 text-xs text-rose-700">
                Invalid checkout parameters or insufficient availability. Please go back and reselect your dates/quantity.
              </div>
            )}

            <button
              type="button"
              disabled={!valid || confirming}
              onClick={confirmBooking}
              className={[
                "mt-4 inline-flex w-full items-center justify-center rounded-xl px-4 py-3 text-sm font-semibold",
                valid && !confirming
                  ? "bg-sky-600 text-white hover:bg-sky-700"
                  : "cursor-not-allowed bg-slate-200 text-slate-500",
              ].join(" ")}
            >
              {confirming ? "Confirming…" : "Confirm booking (MVP)"}
              <ArrowRight className="ml-2 h-4 w-4" />
            </button>

            <div className="mt-3 text-xs text-slate-500">
              Payment not implemented yet — confirmation stored locally for prototype.
            </div>
          </div>
        </div>
      </div>
    </div>
  );
}
