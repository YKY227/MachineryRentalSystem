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

import type { Equipment, EquipmentSaleSettings, EquipmentSaleStatus } from "@/lib/rental/types";
import {
  calculateAuthoritativeRentalPricing,
  calculateRentalDaysInclusive,
} from "@/lib/rental/orders/pricing";
import type { RentalCustomer } from "@/lib/rental/orders/types";

type FulfillmentMode = "deliver" | "self_collect";
type DetailTab = "rent" | "buy";
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

function formatCents(cents?: number) {
  return formatMoney(Math.max(0, Number(cents ?? 0)) / 100);
}

const defaultSaleSettings: EquipmentSaleSettings = {
  enabled: false,
  status: "not_available",
  priceMode: "request_quote",
};

function saleStatusLabel(status?: EquipmentSaleStatus) {
  switch (status) {
    case "available_for_sale":
      return "Available for sale";
    case "sold":
      return "Sold";
    case "on_request":
      return "On request";
    case "not_available":
    default:
      return "Not available";
  }
}

export default function RentalDetailPage() {
  const params = useParams();
  const router = useRouter();

  const equipmentId = (params?.id as string) ?? "";

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
  const [activeTab, setActiveTab] = useState<DetailTab>("rent");
  const [purchaseFulfillment, setPurchaseFulfillment] = useState<FulfillmentMode>("deliver");
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
    const modes = equipment?.sale?.fulfillmentModes ?? [];
    if (modes.length > 0 && !modes.includes(purchaseFulfillment)) {
      setPurchaseFulfillment(modes[0]);
    }
  }, [equipment, purchaseFulfillment]);

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
  const sale = equipment.sale ?? defaultSaleSettings;
  const saleFulfillmentModes = sale.fulfillmentModes ?? [];
  const saleStatus = sale.enabled ? sale.status : "not_available";
  const saleAvailable = saleStatus === "available_for_sale";
  const saleOnRequest = saleStatus === "on_request";
  const saleSold = saleStatus === "sold";
  const saleEnquiryAllowed = saleAvailable || saleOnRequest;
  const salePriceLabel =
    saleSold
      ? "Sold"
      : sale.priceMode === "fixed" && sale.priceCents !== undefined
      ? formatCents(sale.priceCents)
      : "Request quote";
  const salePriceDisplay = saleEnquiryAllowed || saleSold ? salePriceLabel : "Not available";
  const saleCtaLabel =
    saleAvailable
      ? "Request purchase confirmation"
      : saleOnRequest
        ? "Submit purchase enquiry"
        : saleSold
          ? "Sold"
          : "Purchase unavailable";
  const saleAccentClass = saleAvailable
    ? "text-amber-700"
    : saleOnRequest
      ? "text-orange-700"
      : saleSold
        ? "text-rose-700"
        : "text-slate-500";
  const salePanelClass = saleAvailable
    ? "border-amber-200 bg-amber-50"
    : saleOnRequest
      ? "border-orange-200 bg-orange-50"
      : saleSold
        ? "border-rose-200 bg-rose-50"
        : "border-slate-200 bg-slate-50";
  const saleCtaClass = saleEnquiryAllowed
    ? "bg-amber-200 text-amber-900"
    : saleSold
      ? "bg-rose-100 text-rose-700"
      : "bg-slate-200 text-slate-500";

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
            {equipment.model ? ` • ${equipment.model}` : ""}
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
                  <CheckCircle2 className="h-4 w-4 text-emerald-600" />
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
                {Object.keys(equipment.specs ?? {}).length === 0 && (
                  <div className="rounded-lg bg-slate-50 px-3 py-2 text-xs text-slate-500">
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
                  <Sparkles className="h-4 w-4 text-amber-600" />
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
                      <span className="mt-1 inline-block h-1.5 w-1.5 rounded-full bg-slate-400" />
                      <span>{item}</span>
                    </li>
                  ))}
                </ul>
              </div>

              <div className="md:border-l md:border-slate-200 md:pl-6">
                <div className="flex items-center gap-2 text-sm font-semibold text-slate-900">
                  <Factory className="h-4 w-4 text-slate-700" />
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
                      <span className="mt-1 inline-block h-1.5 w-1.5 rounded-full bg-slate-400" />
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
            <div className="grid grid-cols-2 rounded-xl border border-slate-200 bg-slate-50 p-1">
              {(["rent", "buy"] as DetailTab[]).map((tab) => (
                <button
                  key={tab}
                  type="button"
                  onClick={() => setActiveTab(tab)}
                  className={[
                    "rounded-lg px-3 py-2 text-sm font-semibold transition-all duration-200",
                    activeTab === tab
                      ? "bg-white text-slate-900 shadow-sm"
                      : "text-slate-500 hover:text-slate-800",
                  ].join(" ")}
                >
                  {tab === "rent" ? "Rent" : "Buy"}
                </button>
              ))}
            </div>

            <div className="relative mt-4">
              <div
                className={[
                  "transition-all duration-200 ease-out",
                  activeTab === "rent"
                    ? "relative opacity-100 translate-y-0 pointer-events-auto"
                    : "absolute inset-x-0 top-0 opacity-0 -translate-y-1 pointer-events-none",
                ].join(" ")}
              >
                <h2 className="text-sm font-semibold text-slate-900">
                  Create rental booking
                </h2>
                <p className="mt-1 text-xs text-slate-500">
                  Final availability is checked and locked server-side when checkout begins.
                </p>

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
                  <div className="text-[10px] uppercase tracking-wide text-slate-500">Day</div>
                  <div className="text-sm font-semibold text-slate-900">
                    {formatMoney(equipment.pricing.dayRate)}
                  </div>
                </div>
                <div className="rounded-lg bg-white p-2">
                  <div className="text-[10px] uppercase tracking-wide text-slate-500">Week</div>
                  <div className="text-sm font-semibold text-slate-900">
                    {equipment.pricing.weekRate ? formatMoney(equipment.pricing.weekRate) : "-"}
                  </div>
                </div>
                <div className="rounded-lg bg-white p-2">
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
                    className="mt-1 w-full rounded-xl border border-slate-200 bg-white px-3 py-2 text-sm outline-none focus:border-slate-400"
                  />
                </div>
                <div>
                  <label className="text-xs font-medium text-slate-700">End date</label>
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
                <label className="text-xs font-medium text-slate-700">Quantity</label>
                <input
                  type="number"
                  min={1}
                  max={Math.max(1, availableUnitsForRange)}
                  value={qty}
                  onChange={(e) => setQty(Math.max(1, Number(e.target.value || 1)))}
                  className="mt-1 w-full rounded-xl border border-slate-200 bg-white px-3 py-2 text-sm outline-none focus:border-slate-400"
                />
                <div className="mt-1 text-xs text-slate-500">
                  {dateValid ? "Available for selected dates:" : "Current catalog units:"}{" "}
                  <span className="font-semibold text-slate-700">{availableUnitsForRange}</span>
                </div>
                {availabilityLoading && (
                  <div className="mt-1 text-xs text-slate-500">Checking server availability...</div>
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
                  ? "bg-sky-600 text-white hover:bg-sky-700"
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

            <div
              className={[
                "transition-all duration-200 ease-out",
                activeTab === "buy"
                  ? "relative opacity-100 translate-y-0 pointer-events-auto"
                  : "absolute inset-x-0 top-0 opacity-0 translate-y-1 pointer-events-none",
              ].join(" ")}
            >
              <h2 className="text-sm font-semibold text-[#2A2A2A]">
                Purchase enquiry
              </h2>
              <p className="mt-1 text-xs text-slate-500">
                Sale stock is manually confirmed by our team before any purchase can proceed.
              </p>

              <div className={["mt-4 rounded-xl border p-4", salePanelClass].join(" ")}>
                <div className="flex items-start justify-between gap-3">
                  <div>
                    <div className={["text-xs font-semibold uppercase tracking-wide", saleAccentClass].join(" ")}>
                      Sale status
                    </div>
                    <div className="mt-1 text-lg font-semibold text-slate-900">
                      {saleStatusLabel(saleStatus)}
                    </div>
                  </div>
                  <div className="text-right">
                    <div className={["text-xs", saleAccentClass].join(" ")}>Price</div>
                    <div className="mt-1 text-lg font-semibold text-slate-900">
                      {salePriceDisplay}
                    </div>
                  </div>
                </div>
              </div>

              <div className="mt-4 space-y-3 text-sm">
                <div className="rounded-xl border border-slate-200 bg-slate-50 p-3">
                  <div className="text-xs font-semibold uppercase tracking-wide text-slate-500">
                    Condition
                  </div>
                  <div className="mt-1 text-slate-800">{sale.condition ?? "To be confirmed"}</div>
                </div>

                <div className="rounded-xl border border-slate-200 bg-slate-50 p-3">
                  <div className="text-xs font-semibold uppercase tracking-wide text-slate-500">
                    Warranty
                  </div>
                  <div className="mt-1 text-slate-800">{sale.warranty ?? "To be confirmed"}</div>
                </div>

                {sale.notes && (
                  <div className="rounded-xl border border-slate-200 bg-white p-3">
                    <div className="text-xs font-semibold uppercase tracking-wide text-slate-500">
                      Sales notes
                    </div>
                    <div className="mt-1 text-slate-700">{sale.notes}</div>
                  </div>
                )}

                {saleEnquiryAllowed && saleFulfillmentModes.length > 0 && (
                  <div>
                    <label className="text-xs font-medium text-slate-700">Fulfillment</label>
                    <div className="mt-2 grid grid-cols-2 gap-2">
                      {saleFulfillmentModes.includes("deliver") && (
                        <button
                          type="button"
                          onClick={() => setPurchaseFulfillment("deliver")}
                          className={[
                            "inline-flex items-center justify-center gap-2 rounded-xl border px-3 py-2 text-sm font-semibold",
                            purchaseFulfillment === "deliver"
                              ? "border-amber-500 bg-amber-500 text-white"
                              : "border-slate-200 bg-white text-slate-700 hover:bg-amber-50",
                          ].join(" ")}
                        >
                          <Truck className="h-4 w-4" />
                          Delivery
                        </button>
                      )}
                      {saleFulfillmentModes.includes("self_collect") && (
                        <button
                          type="button"
                          onClick={() => setPurchaseFulfillment("self_collect")}
                          className={[
                            "inline-flex items-center justify-center gap-2 rounded-xl border px-3 py-2 text-sm font-semibold",
                            purchaseFulfillment === "self_collect"
                              ? "border-amber-500 bg-amber-500 text-white"
                              : "border-slate-200 bg-white text-slate-700 hover:bg-amber-50",
                          ].join(" ")}
                        >
                          <Package className="h-4 w-4" />
                          Self-collect
                        </button>
                      )}
                    </div>
                  </div>
                )}
              </div>

              <button
                type="button"
                disabled
                className={[
                  "mt-4 inline-flex w-full cursor-not-allowed items-center justify-center rounded-xl px-4 py-3 text-sm font-semibold",
                  saleCtaClass,
                ].join(" ")}
              >
                {saleCtaLabel}
              </button>

              <p className="mt-3 text-xs text-slate-500">
                Purchase enquiry submission is not connected to checkout yet.
              </p>
            </div>
            </div>
          </div>
        </div>
      </div>
    </div>
  );
}
