"use client";

import { useEffect, useMemo, useState } from "react";
import Link from "next/link";
import { useParams, useRouter } from "next/navigation";
import {
  ArrowRight,
  CalendarDays,
  CheckCircle2,
  LoaderCircle,
  Package,
  Shield,
  Truck,
  Sparkles,
  Factory,
  MapPin,
} from "lucide-react";

import type { Equipment } from "@/lib/rental/types";
import {
  calculateAuthoritativeRentalPricing,
  calculateRentalDaysInclusive,
} from "@/lib/rental/orders/pricing";
import type { RentalCustomer } from "@/lib/rental/orders/types";

type FulfillmentMode = "deliver" | "self_collect";
type AvailabilitySnapshot = {
  totalUnits: number;
  committedQty: number;
  heldQty: number;
  downtimeQty: number;
  availableQty: number;
};
type AuthStatusResponse = {
  adminAuthenticated?: boolean;
  customer?: RentalCustomer | null;
};

function formatMoney(n: number) {
  return new Intl.NumberFormat("en-SG", {
    style: "currency",
    currency: "SGD",
    maximumFractionDigits: 0,
  }).format(n);
}

function todayLocalIso() {
  const now = new Date();
  const year = now.getFullYear();
  const month = String(now.getMonth() + 1).padStart(2, "0");
  const day = String(now.getDate()).padStart(2, "0");
  return `${year}-${month}-${day}`;
}

export default function RentalDetailPage() {
  const params = useParams();
  const router = useRouter();

  const equipmentId = (params?.id as string) ?? "";
  const todayIso = useMemo(() => todayLocalIso(), []);

  const [loading, setLoading] = useState(true);
  const [equipment, setEquipment] = useState<Equipment | null>(null);
  const [selectedImg, setSelectedImg] = useState(0);
  const [qty, setQty] = useState(1);
  const [startDate, setStartDate] = useState(() => new Date().toISOString().slice(0, 10));
  const [endDate, setEndDate] = useState(() => {
    const d = new Date();
    d.setDate(d.getDate() + 2);
    return d.toISOString().slice(0, 10);
  });
  const [fulfillment, setFulfillment] = useState<FulfillmentMode>("deliver");
  const [deliveryAddress, setDeliveryAddress] = useState("");
  const [availabilitySnapshot, setAvailabilitySnapshot] = useState<AvailabilitySnapshot | null>(null);
  const [availabilityLoading, setAvailabilityLoading] = useState(false);
  const [adminAuthenticated, setAdminAuthenticated] = useState(false);

  const deliveryFee = fulfillment === "deliver" ? 60 : 0;
  const collectionFee = fulfillment === "deliver" ? 60 : 0;

  useEffect(() => {
    let mounted = true;

    (async () => {
      setLoading(true);
      try {
        const res = await fetch(`/api/public/rental/equipment/${encodeURIComponent(equipmentId)}`, {
          cache: "no-store",
        });
        const data = await res.json().catch(() => ({}));
        if (!mounted) return;
        setEquipment(res.ok ? ((data?.equipment ?? null) as Equipment | null) : null);
        setSelectedImg(0);
      } finally {
        if (mounted) setLoading(false);
      }
    })();

    return () => {
      mounted = false;
    };
  }, [equipmentId]);

  useEffect(() => {
    let active = true;

    fetch("/api/public/rental/auth/me", {
      cache: "no-store",
      credentials: "include",
    })
      .then(async (res) => {
        const data = (await res.json().catch(() => ({}))) as AuthStatusResponse;
        if (!active || !res.ok) return;
        setAdminAuthenticated(Boolean(data.adminAuthenticated));
      })
      .catch(() => {
        if (active) setAdminAuthenticated(false);
      });

    return () => {
      active = false;
    };
  }, []);

  useEffect(() => {
    if (fulfillment === "self_collect" && deliveryAddress) {
      setDeliveryAddress("");
    }
  }, [deliveryAddress, fulfillment]);

  useEffect(() => {
    if (startDate < todayIso) {
      setStartDate(todayIso);
    }
  }, [startDate, todayIso]);

  useEffect(() => {
    if (endDate < startDate) {
      setEndDate(startDate);
    }
  }, [endDate, startDate]);

  const days = useMemo(() => calculateRentalDaysInclusive(startDate, endDate), [startDate, endDate]);
  const minDays = equipment?.pricing?.minDays ?? 1;
  const dateValid = days > 0 && days >= minDays;
  const availableUnitsForRange =
    dateValid && availabilitySnapshot ? availabilitySnapshot.availableQty : equipment?.totalUnits ?? 0;

  useEffect(() => {
    setQty((prev) => Math.max(1, Math.min(prev, Math.max(1, availableUnitsForRange))));
  }, [availableUnitsForRange]);

  useEffect(() => {
    if (!equipment?.id || !dateValid) {
      setAvailabilitySnapshot(null);
      return;
    }

    let active = true;
    setAvailabilityLoading(true);
    fetch(
      `/api/public/rental/equipment/${encodeURIComponent(equipment.id)}/availability?start=${encodeURIComponent(
        startDate
      )}&end=${encodeURIComponent(endDate)}`,
      { cache: "no-store" }
    )
      .then(async (res) => {
        const data = await res.json().catch(() => ({}));
        if (!active) return;
        if (!res.ok) throw new Error(data?.error ?? "Failed to load availability");
        setAvailabilitySnapshot((data?.snapshot ?? null) as AvailabilitySnapshot | null);
      })
      .catch(() => {
        if (active) setAvailabilitySnapshot(null);
      })
      .finally(() => {
        if (active) setAvailabilityLoading(false);
      });

    return () => {
      active = false;
    };
  }, [dateValid, endDate, equipment?.id, startDate]);

  const repricedPreview = useMemo(() => {
    if (!equipment) return null;
    try {
      return calculateAuthoritativeRentalPricing({
        equipment,
        qty,
        start: startDate,
        end: endDate,
        fulfillment,
      });
    } catch {
      return null;
    }
  }, [endDate, equipment, fulfillment, qty, startDate]);
  const deposit = repricedPreview?.pricingSnapshot.deposit ?? equipment?.pricing?.deposit ?? 0;
  const rentalSubtotal = repricedPreview?.pricingSnapshot.rentalSubtotal ?? 0;

  const total = useMemo(() => {
    return rentalSubtotal + deliveryFee + collectionFee + deposit;
  }, [collectionFee, deliveryFee, deposit, rentalSubtotal]);

  const inStock = availableUnitsForRange > 0;
  const qtyValid = qty >= 1 && qty <= availableUnitsForRange;
  const addressRequired = fulfillment === "deliver";
  const addressValid = !addressRequired || deliveryAddress.trim().length >= 8;

  const canProceed = !!equipment && !adminAuthenticated && inStock && dateValid && qtyValid && addressValid;

  function handleProceed() {
    if (!equipment || !canProceed) return;

    const qp = new URLSearchParams();
    qp.set("equipmentId", equipment.id);
    qp.set("qty", String(qty));
    qp.set("start", startDate);
    qp.set("end", endDate);
    qp.set("fulfillment", fulfillment);
    if (fulfillment === "deliver") qp.set("address", deliveryAddress.trim());
    router.push(`/rental/checkout?${qp.toString()}`);
  }

  if (loading) {
    return (
      <div className="mx-auto max-w-6xl p-4">
        <div className="rounded-xl border border-slate-200 bg-white p-6 text-sm text-slate-600">
          Loading equipment...
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
              This equipment does not exist or is no longer published.
            </p>
          </div>
          <Link
            href="/rental"
            className="rounded-lg border border-slate-200 bg-white px-3 py-2 text-sm font-medium text-slate-700 hover:bg-slate-50"
          >
            Back to catalog
          </Link>
        </div>
      </div>
    );
  }

  const heroImg = equipment.images?.[selectedImg] ?? equipment.images?.[0] ?? "";
  const catalogueUrl = equipment.catalogueUrl?.trim() ?? "";
  const trainingVideoUrl = equipment.trainingVideoUrl?.trim() ?? "";
  const safeCatalogueUrl = /^https?:\/\//i.test(catalogueUrl) ? catalogueUrl : "";
  const safeTrainingUrl = /^https?:\/\//i.test(trainingVideoUrl) ? trainingVideoUrl : "";

  return (
    <div className="mx-auto max-w-6xl p-4">
      <div className="flex items-start justify-between gap-4">
        <div>
          <p className="text-xs font-semibold uppercase tracking-wide text-slate-500">
            Equipment Rental
          </p>
          <h1 className="mt-1 text-2xl font-semibold text-slate-900">
            {equipment.title}
          </h1>
          <p className="mt-1 text-sm text-slate-600">
            {equipment.brand ?? "-"}
            {equipment.model ? ` | ${equipment.model}` : ""}
          </p>
        </div>

        <Link
          href="/rental"
          className="rounded-lg border border-slate-200 bg-white px-3 py-2 text-sm font-medium text-slate-700 hover:bg-slate-50"
        >
          Back
        </Link>
      </div>

      <div className="mt-6 grid gap-6 lg:grid-cols-12">
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

            {equipment.images?.length > 1 && (
              <div className="flex gap-2 overflow-x-auto border-t border-slate-200 p-3">
                {equipment.images.map((url, idx) => {
                  const active = idx === selectedImg;
                  return (
                    <button
                      key={`${url}-${idx}`}
                      type="button"
                      onClick={() => setSelectedImg(idx)}
                      className={[
                        "h-16 w-24 flex-shrink-0 overflow-hidden rounded-lg border",
                        active ? "border-slate-900" : "border-slate-200 hover:border-slate-300",
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

          <div className="mt-6 grid gap-6 md:grid-cols-2">
            <div className="rounded-2xl border border-slate-200 bg-white p-5 shadow-sm">
              <h2 className="text-sm font-semibold text-slate-900">Overview</h2>
              <p className="mt-2 text-sm text-slate-600">
                {equipment.description || equipment.shortDesc}
              </p>

              <div className="mt-4 space-y-2 text-xs text-slate-600">
                <div className="flex items-center gap-2">
                  <CheckCircle2 className="h-4 w-4 text-[#D24338]" />
                  {inStock
                    ? dateValid
                      ? `${availableUnitsForRange} unit(s) available for ${startDate} to ${endDate}`
                      : `${availableUnitsForRange} unit(s) in catalog inventory`
                    : "Out of stock"}
                </div>
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

            <div className="rounded-2xl border border-slate-200 bg-white p-5 shadow-sm">
              <h2 className="text-sm font-semibold text-[#2A2A2A]">Specifications</h2>
              <div className="mt-3 space-y-2">
                {Object.entries(equipment.specs ?? {}).map(([k, v]) => (
                  <div
                    key={k}
                    className="flex items-start justify-between gap-3 rounded-lg border border-[#F2C7C2] bg-[#FFF6F4] px-3 py-2"
                  >
                    <div className="text-xs font-medium text-[#8A453F]">{k}</div>
                    <div className="text-xs text-slate-900">{v}</div>
                  </div>
                ))}
                {Object.keys(equipment.specs ?? {}).length === 0 && (
                  <div className="rounded-lg border border-dashed border-slate-200 bg-slate-50 px-3 py-2 text-xs text-slate-500">
                    No specs provided yet.
                  </div>
                )}
              </div>
            </div>
          </div>

          <div className="mt-6 rounded-2xl border border-slate-200 bg-white p-5 shadow-sm">
            <div>
              <h2 className="text-sm font-semibold text-slate-900">Resources</h2>
              <p className="mt-1 text-xs text-slate-500">
                Optional supporting references for operators and planners.
              </p>
            </div>

            <div className="mt-4 grid gap-3 sm:grid-cols-2">
              {safeCatalogueUrl ? (
                <a
                  href={safeCatalogueUrl}
                  target="_blank"
                  rel="noreferrer"
                  className="inline-flex items-center justify-center gap-2 rounded-xl border border-slate-200 bg-white px-4 py-3 text-sm font-semibold text-slate-900 hover:bg-slate-50"
                >
                  <Package className="h-4 w-4 text-slate-700" />
                  Open catalogue
                </a>
              ) : (
                <button
                  type="button"
                  disabled
                  className="inline-flex cursor-not-allowed items-center justify-center gap-2 rounded-xl border border-slate-200 bg-slate-50 px-4 py-3 text-sm font-semibold text-slate-400"
                >
                  <Package className="h-4 w-4 text-slate-300" />
                  Catalogue unavailable
                </button>
              )}

              {safeTrainingUrl ? (
                <a
                  href={safeTrainingUrl}
                  target="_blank"
                  rel="noreferrer"
                  className="inline-flex items-center justify-center gap-2 rounded-xl border border-slate-200 bg-white px-4 py-3 text-sm font-semibold text-slate-900 hover:bg-slate-50"
                >
                  <Sparkles className="h-4 w-4 text-slate-700" />
                  Watch training video
                </a>
              ) : (
                <button
                  type="button"
                  disabled
                  className="inline-flex cursor-not-allowed items-center justify-center gap-2 rounded-xl border border-slate-200 bg-slate-50 px-4 py-3 text-sm font-semibold text-slate-400"
                >
                  <Sparkles className="h-4 w-4 text-slate-300" />
                  Training video unavailable
                </button>
              )}
            </div>
          </div>

          <div className="mt-6 rounded-2xl border border-slate-200 bg-white p-5 shadow-sm">
            <div className="grid gap-6 md:grid-cols-2">
              <div>
                <div className="flex items-center gap-2 text-sm font-semibold text-slate-900">
                  <Sparkles className="h-4 w-4 text-[#D24338]" />
                  Key features
                </div>
                <ul className="mt-3 space-y-2 text-sm text-slate-600">
                  {(equipment.keyFeatures?.length
                    ? equipment.keyFeatures
                    : [
                        "Transparent tiered pricing (day / week / month)",
                        "Delivery and collection or self-collect",
                        "Refundable deposit where applicable",
                      ]
                  ).map((item) => (
                    <li key={item} className="flex items-start gap-2">
                      <span className="mt-1 inline-block h-1.5 w-1.5 rounded-full bg-[#D24338]" />
                      <span>{item}</span>
                    </li>
                  ))}
                </ul>
              </div>

              <div className="md:border-l md:border-slate-200 md:pl-6">
                <div className="flex items-center gap-2 text-sm font-semibold text-slate-900">
                  <Factory className="h-4 w-4 text-[#D24338]" />
                  Applications
                </div>
                <ul className="mt-3 space-y-2 text-sm text-slate-600">
                  {(equipment.applications?.length
                    ? equipment.applications
                    : [
                        "Construction and renovation works",
                        "Events and temporary site setup",
                        "Maintenance and facility operations",
                      ]
                  ).map((item) => (
                    <li key={item} className="flex items-start gap-2">
                      <span className="mt-1 inline-block h-1.5 w-1.5 rounded-full bg-[#D24338]" />
                      <span>{item}</span>
                    </li>
                  ))}
                </ul>
              </div>
            </div>
          </div>
        </div>

        <div className="lg:col-span-5">
          <div className="sticky top-4 rounded-2xl border border-slate-200 bg-white p-5 shadow-sm">
            <h2 className="text-sm font-semibold text-[#2A2A2A]">
              Create rental booking
            </h2>
            <p className="mt-1 text-xs text-slate-500">
              Final availability is checked and locked server-side when checkout begins.
            </p>

            <div className="mt-4 rounded-xl border border-[#F2C7C2] bg-[#FFF6F4] p-4">
              <div className="flex items-baseline justify-between">
                <div className="text-xs text-slate-500">From</div>
                <div className="text-lg font-semibold text-slate-900">
                  {formatMoney(equipment.pricing.dayRate)}
                  <span className="text-xs font-medium text-slate-500">/day</span>
                </div>
              </div>
              <div className="mt-2 grid grid-cols-3 gap-2 text-center">
                <div className="rounded-lg border border-white/80 bg-white p-2">
                  <div className="text-[10px] uppercase tracking-wide text-slate-500">Day</div>
                  <div className="text-sm font-semibold text-slate-900">
                    {formatMoney(equipment.pricing.dayRate)}
                  </div>
                </div>
                <div className="rounded-lg border border-white/80 bg-white p-2">
                  <div className="text-[10px] uppercase tracking-wide text-slate-500">Week</div>
                  <div className="text-sm font-semibold text-slate-900">
                    {equipment.pricing.weekRate ? formatMoney(equipment.pricing.weekRate) : "-"}
                  </div>
                </div>
                <div className="rounded-lg border border-white/80 bg-white p-2">
                  <div className="text-[10px] uppercase tracking-wide text-slate-500">Month</div>
                  <div className="text-sm font-semibold text-slate-900">
                    {equipment.pricing.monthRate ? formatMoney(equipment.pricing.monthRate) : "-"}
                  </div>
                </div>
              </div>
            </div>

            <div className="mt-4 space-y-3">
              <div className="grid gap-3 sm:grid-cols-2">
                <div>
                  <label className="text-xs font-medium text-slate-700">Start date</label>
                  <input
                    type="date"
                    value={startDate}
                    onChange={(e) => setStartDate(e.target.value)}
                    min={todayIso}
                    className="mt-1 w-full rounded-xl border border-slate-200 bg-white px-3 py-2 text-sm outline-none focus:border-[#D24338]"
                  />
                </div>
                <div>
                  <label className="text-xs font-medium text-slate-700">End date</label>
                  <input
                    type="date"
                    value={endDate}
                    onChange={(e) => setEndDate(e.target.value)}
                    min={startDate || todayIso}
                    className="mt-1 w-full rounded-xl border border-slate-200 bg-white px-3 py-2 text-sm outline-none focus:border-[#D24338]"
                  />
                </div>
              </div>

              {!dateValid && (
                <p className="text-xs text-rose-600">
                  Please select a valid date range (min {minDays} day(s)).
                </p>
              )}

              <div>
                <label className="text-xs font-medium text-slate-700">Quantity</label>
                <input
                  type="number"
                  min={1}
                  max={Math.max(1, availableUnitsForRange)}
                  value={qty}
                  onChange={(e) => setQty(Math.max(1, Number(e.target.value || 1)))}
                  className="mt-1 w-full rounded-xl border border-slate-200 bg-white px-3 py-2 text-sm outline-none focus:border-[#D24338]"
                />
                <div className="mt-1 text-xs text-slate-500">
                  {dateValid ? "Available for selected dates:" : "Current catalog units:"}{" "}
                  <span className="font-semibold text-slate-700">{availableUnitsForRange}</span>
                </div>
                {availabilityLoading && (
                  <div className="mt-1 inline-flex items-center gap-2 text-xs text-slate-500">
                    <LoaderCircle className="h-3.5 w-3.5 animate-spin text-[#D24338]" />
                    Checking server availability...
                  </div>
                )}
                {!qtyValid && (
                  <p className="mt-1 text-xs text-rose-600">
                    Quantity exceeds available inventory.
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
                        ? "border-[#D24338] bg-[#D24338] text-white"
                        : "border-slate-200 bg-white text-slate-700 hover:border-[#F2C7C2] hover:bg-[#FFF6F4]",
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
                        ? "border-[#D24338] bg-[#D24338] text-white"
                        : "border-slate-200 bg-white text-slate-700 hover:border-[#F2C7C2] hover:bg-[#FFF6F4]",
                    ].join(" ")}
                  >
                    <Package className="h-4 w-4" />
                    Self-collect
                  </button>
                </div>

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
                          "w-full rounded-xl border bg-white py-2 pl-9 pr-3 text-sm outline-none",
                          addressValid
                            ? "border-slate-200 focus:border-[#D24338]"
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

            <div className="mt-5 rounded-xl border border-slate-200 bg-white p-4">
              <div className="flex items-center justify-between">
                <div className="text-xs font-semibold uppercase tracking-wide text-slate-500">
                  Price estimate
                </div>
                <div className="text-xs text-slate-500">
                  {days > 0 ? `${days} day(s)` : "-"}
                </div>
              </div>

              <div className="mt-3 space-y-2 text-sm">
                <div className="flex items-center justify-between">
                  <span className="text-slate-600">Rental subtotal</span>
                  <span className="font-semibold text-slate-900">{formatMoney(rentalSubtotal)}</span>
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
                    <span className="font-semibold text-slate-700">Total</span>
                    <span className="font-semibold text-slate-900">{formatMoney(total)}</span>
                  </div>
                </div>

                <p className="mt-2 text-xs text-slate-500">
                  Final inventory and temporary checkout hold are enforced on the server.
                </p>
              </div>
            </div>

            <button
              type="button"
              onClick={handleProceed}
              disabled={!canProceed}
              className={[
                "mt-4 inline-flex w-full items-center justify-center rounded-xl px-4 py-3 text-sm font-semibold",
                canProceed
                  ? "bg-[#D24338] text-white hover:bg-[#B9382E]"
                  : "cursor-not-allowed bg-slate-200 text-slate-500",
              ].join(" ")}
            >
              {adminAuthenticated ? "Customer checkout only" : "Proceed to checkout"}
              <ArrowRight className="ml-2 h-4 w-4" />
            </button>

            {adminAuthenticated && (
              <div className="mt-3 rounded-xl border border-amber-200 bg-amber-50 p-3 text-xs text-amber-800">
                Checkout is only available for customer accounts. Admin sessions may browse public equipment but cannot continue through customer checkout.
              </div>
            )}

            {!inStock && (
              <p className="mt-2 text-xs text-rose-600">
                This equipment is currently out of stock.
              </p>
            )}
          </div>
        </div>
      </div>
    </div>
  );
}
