"use client";

import { Suspense, useEffect, useMemo, useState } from "react";
import Link from "next/link";
import { useSearchParams } from "next/navigation";
import {
  ArrowRight,
  CalendarDays,
  Package,
  Shield,
  Truck,
  ClipboardList,
} from "lucide-react";

import type { Equipment } from "@/lib/rental/types";
import {
  calculateAuthoritativeRentalPricing,
  calculateRentalDaysInclusive,
} from "@/lib/rental/orders/pricing";
import type { CreateRentalOrderInput, RentalCustomer } from "@/lib/rental/orders/types";

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

export default function RentalCheckoutPage() {
  return (
    <Suspense
      fallback={
        <div className="mx-auto max-w-6xl p-4">
          <div className="rounded-xl border border-slate-200 bg-white p-6 text-sm text-slate-600">
            Loading checkout...
          </div>
        </div>
      }
    >
      <CheckoutInner />
    </Suspense>
  );
}

function CheckoutInner() {
  const searchParams = useSearchParams();

  const getParam = (key: string): string | null => searchParams?.get(key) ?? null;

  const equipmentId = getParam("equipmentId") ?? "";
  const qty = toInt(getParam("qty"), 1);
  const start = getParam("start") ?? "";
  const end = getParam("end") ?? "";
  const fulfillment = safeMode(getParam("fulfillment"));

  const [loading, setLoading] = useState(true);
  const [equipment, setEquipment] = useState<Equipment | null>(null);
  const [confirming, setConfirming] = useState(false);
  const [checkoutError, setCheckoutError] = useState<string | null>(null);
  const [checkoutNotice, setCheckoutNotice] = useState<string | null>(null);
  const [checkoutOrderId] = useState(() => newPublicId());
  const [companyName, setCompanyName] = useState("");
  const [contactName, setContactName] = useState("");
  const [contactEmail, setContactEmail] = useState("");
  const [contactPhone, setContactPhone] = useState("");
  const [authCustomer, setAuthCustomer] = useState<RentalCustomer | null>(null);
  const [adminAuthenticated, setAdminAuthenticated] = useState(false);
  const [availabilitySnapshot, setAvailabilitySnapshot] = useState<AvailabilitySnapshot | null>(null);

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
      } finally {
        if (mounted) setLoading(false);
      }
    })();

    return () => {
      mounted = false;
    };
  }, [equipmentId]);

  useEffect(() => {
    let mounted = true;

    (async () => {
      try {
        const res = await fetch("/api/public/rental/auth/me", {
          cache: "no-store",
          credentials: "include",
        });
        const data = (await res.json().catch(() => ({}))) as AuthStatusResponse;
        if (!mounted || !res.ok) return;
        const customer = data.customer ?? null;
        setAdminAuthenticated(Boolean(data.adminAuthenticated));
        setAuthCustomer(customer);
        if (!customer) return;
        setCompanyName(customer.companyName ?? "");
        setContactName(customer.contactName ?? "");
        setContactEmail(customer.email ?? "");
        setContactPhone(customer.phone ?? "");
      } catch {
        if (mounted) {
          setAuthCustomer(null);
          setAdminAuthenticated(false);
        }
      }
    })();

    return () => {
      mounted = false;
    };
  }, []);

  const days = useMemo(() => {
    if (!start || !end) return 0;
    return calculateRentalDaysInclusive(start, end);
  }, [end, start]);
  const dateValid = days > 0 && !!start && !!end;

  useEffect(() => {
    if (!equipment?.id || !dateValid) {
      setAvailabilitySnapshot(null);
      return;
    }

    let active = true;
    fetch(
      `/api/public/rental/equipment/${encodeURIComponent(equipment.id)}/availability?start=${encodeURIComponent(
        start
      )}&end=${encodeURIComponent(end)}`,
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
      });

    return () => {
      active = false;
    };
  }, [dateValid, end, equipment?.id, start]);

  const repricedPreview = useMemo(() => {
    if (!equipment || !start || !end) return null;
    try {
      return calculateAuthoritativeRentalPricing({
        equipment,
        qty,
        start,
        end,
        fulfillment,
      });
    } catch {
      return null;
    }
  }, [end, equipment, fulfillment, qty, start]);

  const equipmentPricing = equipment?.pricing ?? {
    minDays: 1,
    dayRate: 0,
    weekRate: undefined,
    monthRate: undefined,
    deposit: 0,
  };

  const minDays = equipmentPricing.minDays ?? 1;
  const deposit = repricedPreview?.pricingSnapshot.deposit ?? equipmentPricing.deposit ?? 0;
  const rentalSubtotal = repricedPreview?.pricingSnapshot.rentalSubtotal ?? 0;
  const pricing = {
    gstAmount: repricedPreview?.pricingSnapshot.gstAmount ?? 0,
    payableTotal: repricedPreview?.pricingSnapshot.payableTotal ?? 0,
    displayTotal: repricedPreview?.pricingSnapshot.total ?? 0,
  };

  const availableUnits = dateValid && availabilitySnapshot ? availabilitySnapshot.availableQty : equipment?.totalUnits ?? 0;
  const valid =
    !!equipment &&
    !adminAuthenticated &&
    !!authCustomer &&
    authCustomer.accountStatus === "active" &&
    qty >= 1 &&
    qty <= availableUnits &&
    days > 0 &&
    days >= minDays &&
    !!companyName.trim() &&
    !!contactName.trim() &&
    !!contactEmail.trim();

  async function confirmBooking() {
    if (!equipment || !valid) return;

    setConfirming(true);
    setCheckoutError(null);
    setCheckoutNotice(null);

    const order: CreateRentalOrderInput = {
      id: checkoutOrderId,
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
        gstAmount: pricing.gstAmount,
        payableTotal: pricing.payableTotal,
        total: pricing.displayTotal,
      },
      customerSnapshot: {
        companyName: companyName.trim(),
        contactName: contactName.trim(),
        email: contactEmail.trim(),
        phone: contactPhone.trim() || undefined,
        customerId: authCustomer?.id,
        paymentTerms: authCustomer?.paymentTerms,
        vettingStatus: authCustomer?.vettingStatus,
        accountStatus: authCustomer?.accountStatus,
      },
      customerId: authCustomer?.id,
    };

    try {
      const res = await fetch("/api/public/rental/checkout/start-payment", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ order }),
      });
      const data = await res.json().catch(() => ({}));
      if (!res.ok) {
        if (data?.availabilityBlocked) {
          const availabilityMessage = String(
            data?.message ?? data?.error ?? "Selected equipment is no longer available for those dates."
          ).trim();
          setCheckoutError(
            availabilityMessage || "Selected equipment is no longer available for those dates."
          );
          setConfirming(false);
          return;
        }
        if (data?.creditCheckoutBlocked) {
          const blockedMessage = String(
            data?.creditCheckoutMessage ?? data?.error ?? "Credit checkout is unavailable."
          ).trim();
          setCheckoutError(blockedMessage || "Credit checkout is unavailable.");
          setConfirming(false);
          return;
        }
        if (res.status === 403 && String(data?.error ?? "").trim()) {
          setCheckoutError(String(data.error).trim());
          setConfirming(false);
          return;
        }
        throw new Error(data?.error ?? "Failed to start payment");
      }

      const notices = [
        String(data?.creditCheckoutMessage ?? "").trim(),
        String(data?.pricingNotice ?? "").trim(),
      ].filter(Boolean);
      const combinedNotice = notices.join(" ");
      if (combinedNotice) {
        setCheckoutNotice(combinedNotice);
        if (typeof window !== "undefined") {
          window.sessionStorage.setItem("rental_checkout_notice", combinedNotice);
        }
      }

      const redirectUrl = String(data?.redirectUrl ?? "");
      if (!redirectUrl) throw new Error("Missing hosted payment URL");
      if (combinedNotice) {
        await new Promise((resolve) => window.setTimeout(resolve, 900));
      }
      window.location.href = redirectUrl;
    } catch (e) {
      setCheckoutError(e instanceof Error ? e.message : "Failed to start payment");
      setConfirming(false);
    }
  }

  if (loading) {
    return (
      <div className="mx-auto max-w-6xl p-4">
        <div className="rounded-xl border border-slate-200 bg-white p-6 text-sm text-slate-600">
          Loading checkout...
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
            Back to catalog
          </Link>
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
            Review your rental details before continuing to payment or invoice-later processing.
          </p>
        </div>

        <Link
          href={`/rental/${encodeURIComponent(equipment.id)}`}
          className="rounded-lg border border-slate-200 bg-white px-3 py-2 text-sm font-medium text-slate-700 hover:bg-slate-50"
        >
          Back
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
                  {equipment.brand ?? "-"}
                  {equipment.model ? ` • ${equipment.model}` : ""}
                </p>

                <div className="mt-4 grid gap-3 sm:grid-cols-2">
                  <div className="rounded-xl border border-slate-200 bg-slate-50 p-4">
                    <div className="flex items-center gap-2 text-sm font-semibold text-slate-900">
                      <CalendarDays className="h-4 w-4" />
                      Rental period
                    </div>
                    <div className="mt-1 text-sm text-slate-700">
                      {start} to {end}
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
                      {dateValid ? "Available for selected dates:" : "Current catalog units:"} {availableUnits}
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

                  {deposit > 0 && (
                    <div className="rounded-xl border border-slate-200 bg-slate-50 p-4 sm:col-span-2">
                      <div className="flex items-center gap-2 text-sm font-semibold text-slate-900">
                        <Shield className="h-4 w-4" />
                        Deposit
                      </div>
                      <div className="mt-1 text-sm text-slate-700">
                        {formatMoney(deposit)} (refundable)
                      </div>
                    </div>
                  )}
                </div>

                <div className="mt-4 text-xs text-slate-500">
                  Equipment pricing and inventory come from the published rental catalog. Final availability is rechecked on the server.
                </div>
              </div>
            </div>
          </div>
        </div>

        <div className="lg:col-span-5">
          <div className="sticky top-4 rounded-2xl border border-slate-200 bg-white p-5 shadow-sm">
            <h2 className="text-sm font-semibold text-slate-900">Customer details</h2>
            <p className="mt-1 text-xs text-slate-500">
              {authCustomer
                ? "This booking will be linked to your signed-in customer account."
                : "Customer login is required before booking. Vetting and payment terms are read from your account."}
            </p>

            <div className="mt-3 rounded-xl border border-slate-200 bg-slate-50 p-3 text-xs text-slate-600">
              {authCustomer ? (
                <div className="flex flex-wrap items-center justify-between gap-2">
                  <div>
                    Signed in as <span className="font-semibold text-slate-800">{authCustomer.email}</span>
                    <div className="mt-1">
                      Terms: <span className="font-medium text-slate-700">{authCustomer.paymentTerms.toUpperCase()}</span>
                      {" · "}
                      Vetting: <span className="font-medium text-slate-700">{authCustomer.vettingStatus.replace("_", " ").toUpperCase()}</span>
                    </div>
                  </div>
                  <Link
                    href="/rental/account/login?next=%2Frental%2Fcheckout"
                    className="font-medium text-sky-700 hover:text-sky-800"
                  >
                    Switch account
                  </Link>
                </div>
              ) : adminAuthenticated ? (
                <div className="flex flex-wrap items-center justify-between gap-3">
                  <div>
                    Checkout is only available for customer accounts.
                    <div className="mt-1 text-[11px] text-slate-500">
                      You can keep browsing equipment, or return to the admin area.
                    </div>
                  </div>
                  <Link href="/admin" className="font-medium text-sky-700 hover:text-sky-800">
                    Go to admin
                  </Link>
                </div>
              ) : (
                <div className="flex flex-wrap items-center gap-3">
                  <span>Sign in or register to continue with booking.</span>
                  <Link
                    href="/rental/account/login?next=%2Frental%2Fcheckout"
                    className="font-medium text-sky-700 hover:text-sky-800"
                  >
                    Sign in
                  </Link>
                  <Link
                    href="/rental/account/register?next=%2Frental%2Fcheckout"
                    className="font-medium text-sky-700 hover:text-sky-800"
                  >
                    Register
                  </Link>
                </div>
              )}
            </div>

            <div className="mt-4 grid gap-3">
              <label className="grid gap-1 text-sm">
                <span className="text-slate-700">Company name</span>
                <input
                  type="text"
                  value={companyName}
                  onChange={(e) => setCompanyName(e.target.value)}
                  disabled={!!authCustomer}
                  className="rounded-xl border border-slate-200 px-3 py-2 text-sm text-slate-900 outline-none placeholder:text-slate-400 focus:border-sky-400"
                  placeholder="e.g. ACME Cleanroom Services"
                />
              </label>

              <label className="grid gap-1 text-sm">
                <span className="text-slate-700">Contact name</span>
                <input
                  type="text"
                  value={contactName}
                  onChange={(e) => setContactName(e.target.value)}
                  disabled={!!authCustomer}
                  className="rounded-xl border border-slate-200 px-3 py-2 text-sm text-slate-900 outline-none placeholder:text-slate-400 focus:border-sky-400"
                  placeholder="e.g. Lim Wei Ming"
                />
              </label>

              <label className="grid gap-1 text-sm">
                <span className="text-slate-700">Contact email</span>
                <input
                  type="email"
                  value={contactEmail}
                  onChange={(e) => setContactEmail(e.target.value)}
                  disabled={!!authCustomer}
                  className="rounded-xl border border-slate-200 px-3 py-2 text-sm text-slate-900 outline-none placeholder:text-slate-400 focus:border-sky-400"
                  placeholder="e.g. billing@company.com"
                  autoComplete="email"
                />
              </label>

              <label className="grid gap-1 text-sm">
                <span className="text-slate-700">Contact phone</span>
                <input
                  type="tel"
                  value={contactPhone}
                  onChange={(e) => setContactPhone(e.target.value)}
                  disabled={!!authCustomer}
                  className="rounded-xl border border-slate-200 px-3 py-2 text-sm text-slate-900 outline-none placeholder:text-slate-400 focus:border-sky-400"
                  placeholder="Optional"
                />
              </label>
            </div>

            <div className="mt-6 border-t border-slate-200 pt-5">
              <h2 className="text-sm font-semibold text-slate-900">Price breakdown</h2>
              <p className="mt-1 text-xs text-slate-500">
                GST is included in rental charges below. Any refundable deposit is shown separately and charged distinctly at checkout.
              </p>

              <div className="mt-4 space-y-2 text-sm">
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
                  <span className="text-slate-600">GST</span>
                  <span className="text-slate-900">{formatMoney(pricing.gstAmount)}</span>
                </div>
                <div className="flex items-center justify-between">
                  <span className="text-slate-600">Refundable deposit</span>
                  <span className="text-slate-900">{formatMoney(deposit)}</span>
                </div>

                <div className="mt-3 border-t border-slate-200 pt-3">
                  <div className="flex items-center justify-between">
                    <span className="font-semibold text-slate-700">Rental charges due now</span>
                    <span className="text-slate-900">{formatMoney(pricing.payableTotal)}</span>
                  </div>
                  <div className="mt-2 flex items-center justify-between">
                    <span className="font-semibold text-slate-700">Total charged now</span>
                    <span className="text-lg font-semibold text-slate-900">
                      {formatMoney(pricing.displayTotal)}
                    </span>
                  </div>
                  <div className="flex items-center justify-between">
                    <span className="mt-1 text-xs text-slate-500">
                      Deposit remains tracked separately from rental revenue in our accounting records.
                    </span>
                  </div>
                  <div className="mt-1 text-xs text-slate-500">
                    Temporary availability hold and final inventory validation are handled on the server when checkout starts.
                  </div>
                </div>
              </div>

              {!valid && (
                <div className="mt-4 rounded-xl border border-rose-200 bg-rose-50 p-3 text-xs text-rose-700">
                  {!authCustomer
                    ? adminAuthenticated
                      ? "Checkout is only available for customer accounts."
                      : "Sign in or register to continue with booking."
                    : authCustomer.accountStatus !== "active"
                      ? "This customer account is suspended."
                      : "Invalid checkout parameters. Please go back and reselect your dates or quantity."}
                </div>
              )}

              {checkoutError && (
                <div className="mt-4 rounded-xl border border-rose-200 bg-rose-50 p-3 text-xs text-rose-700">
                  {checkoutError}
                </div>
              )}

              {checkoutNotice && (
                <div className="mt-4 rounded-xl border border-amber-200 bg-amber-50 p-3 text-xs text-amber-800">
                  {checkoutNotice}
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
                {confirming
                  ? "Processing..."
                  : adminAuthenticated
                    ? "Customer checkout only"
                    : "Continue checkout"}
                <ArrowRight className="ml-2 h-4 w-4" />
              </button>

              <div className="mt-3 text-xs text-slate-500">
                Orders are created server-side. Upfront customers are redirected to hosted payment, while eligible credit customers continue through the existing invoice-later flow.
              </div>
            </div>
          </div>
        </div>
      </div>
    </div>
  );
}
