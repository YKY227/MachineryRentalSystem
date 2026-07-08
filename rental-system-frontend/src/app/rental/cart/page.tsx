"use client";

import { FormEvent, useEffect, useMemo, useRef, useState } from "react";
import Link from "next/link";
import { useRouter } from "next/navigation";
import {
  ArrowLeft,
  ArrowRight,
  AlertCircle,
  CheckCircle2,
  Clock,
  Package,
  ShoppingCart,
  Trash2,
  Truck,
} from "lucide-react";

import {
  clearRentalCart,
  markSaleCartLinesSubmittedForEquipment,
  readRentalCart,
  removeRentalCartLine,
  subscribeToRentalCart,
  updateRentalCartLine,
} from "@/lib/rental/cart/local-cart";
import type {
  RentalCartLine,
  RentalCartRentalLine,
  RentalCartSaleLine,
} from "@/lib/rental/cart/types";
import type {
  RentalCheckoutGroup,
  RentalCheckoutGroupHoldResult,
} from "@/lib/rental/checkout-groups/types";
import type { EquipmentSaleStatus } from "@/lib/rental/types";

type SaleFormState = {
  customerName: string;
  customerEmail: string;
  customerPhone: string;
  companyName: string;
  message: string;
};

type SaleSubmitState = Record<string, { loading: boolean; error?: string; success?: string }>;

type GroupCheckoutState = {
  loading: boolean;
  error?: string;
  group?: RentalCheckoutGroup | null;
  holdResult?: RentalCheckoutGroupHoldResult;
  message?: string;
};

function formatMoney(value?: number) {
  return new Intl.NumberFormat("en-SG", {
    style: "currency",
    currency: "SGD",
    maximumFractionDigits: 0,
  }).format(Math.max(0, Number(value ?? 0)));
}

function formatCents(cents?: number) {
  if (cents === undefined) return "Request quote";
  return formatMoney(cents / 100);
}

function formatMoneyFromCents(cents?: number) {
  return formatMoney(Number(cents ?? 0) / 100);
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

function saleStatusLabel(status: EquipmentSaleStatus) {
  switch (status) {
    case "available_for_sale":
      return "Available for sale";
    case "on_request":
      return "On request";
    case "sold":
      return "Sold";
    case "not_available":
    default:
      return "Not available";
  }
}

function saleCanSubmit(line: RentalCartSaleLine) {
  return (
    !line.enquiryId &&
    !line.enquirySubmittedAt &&
    (line.saleStatusSnapshot === "available_for_sale" || line.saleStatusSnapshot === "on_request")
  );
}

function checkoutHref(line: RentalCartRentalLine) {
  const qp = new URLSearchParams();
  qp.set("equipmentId", line.equipmentId);
  qp.set("qty", String(line.qty));
  qp.set("start", line.startDate);
  qp.set("end", line.endDate);
  qp.set("fulfillment", line.fulfillment);
  if (line.fulfillment === "deliver" && line.deliveryAddress) {
    qp.set("address", line.deliveryAddress);
  }
  return `/rental/checkout?${qp.toString()}`;
}

function defaultSaleForm(line: RentalCartSaleLine): SaleFormState {
  return {
    customerName: "",
    customerEmail: "",
    customerPhone: "",
    companyName: "",
    message: line.message ?? "",
  };
}

export default function RentalCartPage() {
  const router = useRouter();
  const [lines, setLines] = useState<RentalCartLine[]>([]);
  const [loaded, setLoaded] = useState(false);
  const [saleForms, setSaleForms] = useState<Record<string, SaleFormState>>({});
  const [saleSubmitState, setSaleSubmitState] = useState<SaleSubmitState>({});
  const [selectedRentalLineIds, setSelectedRentalLineIds] = useState<string[]>([]);
  const [groupCheckout, setGroupCheckout] = useState<GroupCheckoutState>({ loading: false });
  const selectionInitializedRef = useRef(false);
  const knownRentalLineIdsRef = useRef<Set<string>>(new Set());

  function refreshCart() {
    const cart = readRentalCart();
    setLines(cart.lines);
    setSaleForms((current) => {
      const next = { ...current };
      for (const line of cart.lines) {
        if (line.type === "sale" && !next[line.id]) {
          next[line.id] = defaultSaleForm(line);
        }
      }
      for (const id of Object.keys(next)) {
        if (!cart.lines.some((line) => line.id === id && line.type === "sale")) {
          delete next[id];
        }
      }
      return next;
    });
  }

  useEffect(() => {
    refreshCart();
    setLoaded(true);
    return subscribeToRentalCart(refreshCart);
  }, []);

  const rentalLines = useMemo(
    () => lines.filter((line): line is RentalCartRentalLine => line.type === "rental"),
    [lines]
  );
  const saleLines = useMemo(
    () => lines.filter((line): line is RentalCartSaleLine => line.type === "sale"),
    [lines]
  );
  const rentalEstimateTotal = useMemo(
    () =>
      rentalLines.reduce((sum, line) => {
        return sum + Number(line.pricingPreview?.total ?? 0);
      }, 0),
    [rentalLines]
  );
  const selectedRentalLines = useMemo(
    () => rentalLines.filter((line) => selectedRentalLineIds.includes(line.id)),
    [rentalLines, selectedRentalLineIds]
  );
  const selectedRentalEstimateTotal = useMemo(
    () =>
      selectedRentalLines.reduce((sum, line) => {
        return sum + Number(line.pricingPreview?.total ?? 0);
      }, 0),
    [selectedRentalLines]
  );
  const selectedRentalIdSet = useMemo(
    () => new Set(selectedRentalLineIds),
    [selectedRentalLineIds]
  );

  useEffect(() => {
    setSelectedRentalLineIds((current) => {
      const validIds = rentalLines.map((line) => line.id);
      const validSet = new Set(validIds);
      const previousKnownIds = knownRentalLineIdsRef.current;
      const kept = selectionInitializedRef.current
        ? current.filter((id) => validSet.has(id))
        : validIds;
      const additions = selectionInitializedRef.current
        ? validIds.filter((id) => !previousKnownIds.has(id))
        : [];
      const next = [...kept, ...additions];
      selectionInitializedRef.current = true;
      knownRentalLineIdsRef.current = validSet;
      if (next.length === current.length && next.every((id, index) => id === current[index])) {
        return current;
      }
      return next;
    });
  }, [rentalLines]);

  function handleRemove(lineId: string) {
    setLines(removeRentalCartLine(lineId).lines);
    setSelectedRentalLineIds((current) => current.filter((id) => id !== lineId));
  }

  function handleClearCart() {
    setLines(clearRentalCart().lines);
    setSaleForms({});
    setSaleSubmitState({});
    setSelectedRentalLineIds([]);
    knownRentalLineIdsRef.current = new Set();
    setGroupCheckout({ loading: false });
  }

  function toggleRentalLine(lineId: string) {
    setSelectedRentalLineIds((current) =>
      current.includes(lineId) ? current.filter((id) => id !== lineId) : [...current, lineId]
    );
  }

  function toggleAllRentalLines(checked: boolean) {
    setSelectedRentalLineIds(checked ? rentalLines.map((line) => line.id) : []);
  }

  function updateSaleForm(lineId: string, patch: Partial<SaleFormState>) {
    setSaleForms((current) => ({
      ...current,
      [lineId]: {
        ...(current[lineId] ?? {
          customerName: "",
          customerEmail: "",
          customerPhone: "",
          companyName: "",
          message: "",
        }),
        ...patch,
      },
    }));
  }

  async function handleSubmitSaleEnquiry(event: FormEvent<HTMLFormElement>, line: RentalCartSaleLine) {
    event.preventDefault();
    if (!saleCanSubmit(line)) return;

    const form = saleForms[line.id] ?? defaultSaleForm(line);
    const customerName = form.customerName.trim();
    const customerEmail = form.customerEmail.trim();
    if (!customerName || !customerEmail) {
      setSaleSubmitState((current) => ({
        ...current,
        [line.id]: { loading: false, error: "Name and email are required." },
      }));
      return;
    }

    try {
      setSaleSubmitState((current) => ({
        ...current,
        [line.id]: { loading: true },
      }));
      const res = await fetch(
        `/api/public/rental/equipment/${encodeURIComponent(line.equipmentId)}/sale-enquiry`,
        {
          method: "POST",
          headers: { "Content-Type": "application/json" },
          body: JSON.stringify({
            customerName,
            customerEmail,
            customerPhone: form.customerPhone.trim() || null,
            companyName: form.companyName.trim() || null,
            fulfillmentPreference: line.fulfillmentPreference ?? null,
            message: form.message.trim() || null,
          }),
        }
      );
      const data = await res.json().catch(() => ({}));
      if (!res.ok) throw new Error(data?.error ?? "Unable to submit sale enquiry");

      const enquiryId = typeof data?.enquiry?.id === "string" ? data.enquiry.id : undefined;
      const submittedAt = new Date().toISOString();
      const markResult = markSaleCartLinesSubmittedForEquipment({
        equipmentId: line.equipmentId,
        enquiryId,
        enquirySubmittedAt: submittedAt,
      });
      const nextCart =
        form.message.trim().length > 0
          ? updateRentalCartLine(line.id, {
              message: form.message.trim(),
            }).cart
          : markResult.cart;
      setLines(nextCart.lines);
      setSaleSubmitState((current) => ({
        ...current,
        [line.id]: { loading: false, success: "Sale enquiry submitted." },
      }));
    } catch (error) {
      setSaleSubmitState((current) => ({
        ...current,
        [line.id]: {
          loading: false,
          error: error instanceof Error ? error.message : "Unable to submit sale enquiry",
        },
      }));
    }
  }

  async function handleGroupedCheckout() {
    if (selectedRentalLines.length === 0 || groupCheckout.loading) return;

    try {
      setGroupCheckout({ loading: true });
      const res = await fetch("/api/public/rental/checkout-groups", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          lines: selectedRentalLines.map((line) => ({
            cartLineId: line.id,
            equipmentId: line.equipmentId,
            qty: line.qty,
            startDate: line.startDate,
            endDate: line.endDate,
            fulfillment: line.fulfillment,
            deliveryAddress: line.deliveryAddress ?? null,
          })),
        }),
      });
      const data = await res.json().catch(() => ({}));
      if (!res.ok) {
        setGroupCheckout({
          loading: false,
          error: data?.error ?? data?.message ?? "Grouped checkout could not acquire holds.",
          group: data?.group,
          holdResult: data?.holdResult,
          message: data?.message,
        });
        return;
      }

      setGroupCheckout({
        loading: false,
        group: data?.group,
        holdResult: data?.holdResult,
        message:
          data?.message ??
          "Rental holds acquired. Continue to the checkout group page to pay while holds are active.",
      });
      if (data?.group?.id) {
        router.push(`/rental/checkout-groups/${data.group.id}`);
      }
    } catch (error) {
      setGroupCheckout({
        loading: false,
        error: error instanceof Error ? error.message : "Grouped checkout could not acquire holds.",
      });
    }
  }

  if (!loaded) {
    return (
      <div className="mx-auto max-w-6xl p-4">
        <div className="rounded-xl border border-slate-200 bg-white p-6 text-sm text-slate-600">
          Loading cart...
        </div>
      </div>
    );
  }

  return (
    <div className="mx-auto max-w-6xl p-4">
      <div className="flex flex-col gap-4 sm:flex-row sm:items-start sm:justify-between">
        <div>
          <Link
            href="/rental"
            className="inline-flex items-center gap-2 text-sm font-medium text-slate-600 hover:text-slate-900"
          >
            <ArrowLeft className="h-4 w-4" />
            Continue browsing
          </Link>
          <h1 className="mt-3 text-2xl font-semibold text-slate-900">Rental cart</h1>
          <p className="mt-1 max-w-2xl text-sm text-slate-600">
            Cart items are saved on this device. Rental checkout remains one item at a time for now,
            and sale items require admin confirmation before any payment.
          </p>
        </div>

        <button
          type="button"
          onClick={handleClearCart}
          disabled={lines.length === 0}
          className="inline-flex items-center justify-center gap-2 rounded-xl border border-slate-200 bg-white px-4 py-2 text-sm font-semibold text-slate-700 hover:bg-slate-50 disabled:cursor-not-allowed disabled:bg-slate-100 disabled:text-slate-400"
        >
          <Trash2 className="h-4 w-4" />
          Clear cart
        </button>
      </div>

      {lines.length === 0 ? (
        <div className="mt-6 rounded-2xl border border-dashed border-slate-300 bg-white p-8 text-center">
          <ShoppingCart className="mx-auto h-10 w-10 text-slate-300" />
          <h2 className="mt-3 text-base font-semibold text-slate-900">Your cart is empty</h2>
          <p className="mt-1 text-sm text-slate-500">
            Add rental equipment or sale enquiries from an equipment detail page.
          </p>
          <Link
            href="/rental"
            className="mt-4 inline-flex items-center justify-center rounded-xl bg-sky-600 px-4 py-2 text-sm font-semibold text-white hover:bg-sky-700"
          >
            Browse equipment
          </Link>
        </div>
      ) : (
        <div className="mt-6 grid gap-6 lg:grid-cols-[minmax(0,1fr)_320px]">
          <div className="space-y-6">
            <section className="rounded-2xl border border-slate-200 bg-white p-5 shadow-sm">
              <div className="flex items-start justify-between gap-4">
                <div>
                  <h2 className="text-base font-semibold text-slate-900">Rental items</h2>
                  <p className="mt-1 text-sm text-slate-500">
                    Estimates only. Checkout will revalidate pricing and availability.
                  </p>
                </div>
                <span className="rounded-full bg-slate-100 px-3 py-1 text-xs font-semibold text-slate-600">
                  {rentalLines.length}
                </span>
              </div>

              {rentalLines.length === 0 ? (
                <div className="mt-4 rounded-xl border border-dashed border-slate-200 p-4 text-sm text-slate-500">
                  No rental items added.
                </div>
              ) : (
                <div className="mt-4 space-y-4">
                  <div className="rounded-xl border border-sky-100 bg-sky-50 p-4">
                    <div className="flex flex-col gap-3 sm:flex-row sm:items-center sm:justify-between">
                      <label className="inline-flex items-center gap-2 text-sm font-semibold text-slate-800">
                        <input
                          type="checkbox"
                          checked={
                            rentalLines.length > 0 &&
                            selectedRentalLineIds.length === rentalLines.length
                          }
                          onChange={(event) => toggleAllRentalLines(event.target.checked)}
                          className="h-4 w-4 rounded border-slate-300 text-sky-600 focus:ring-sky-500"
                        />
                        Select all rental items
                      </label>
                      <div className="text-sm text-slate-600">
                        {selectedRentalLines.length} selected - Estimate{" "}
                        <span className="font-semibold text-slate-900">
                          {formatMoney(selectedRentalEstimateTotal)}
                        </span>
                      </div>
                    </div>

                    <div className="mt-3 flex flex-col gap-2 sm:flex-row sm:items-center">
                      <button
                        type="button"
                        onClick={handleGroupedCheckout}
                        disabled={selectedRentalLines.length === 0 || groupCheckout.loading}
                        className="inline-flex items-center justify-center gap-2 rounded-xl bg-sky-700 px-4 py-2 text-sm font-semibold text-white hover:bg-sky-800 disabled:cursor-not-allowed disabled:bg-slate-300"
                      >
                        {groupCheckout.loading ? "Checking availability..." : "Checkout selected rental items"}
                        <ArrowRight className="h-4 w-4" />
                      </button>
                      <span className="text-xs text-slate-600">
                        Creates temporary holds, then opens the checkout group payment page.
                      </span>
                    </div>

                    {groupCheckout.error && (
                      <div className="mt-3 rounded-xl border border-rose-200 bg-rose-50 p-3 text-sm text-rose-700">
                        <div className="flex items-start gap-2">
                          <AlertCircle className="mt-0.5 h-4 w-4 flex-shrink-0" />
                          <div>
                            <div className="font-semibold">Grouped checkout could not continue</div>
                            <p>{groupCheckout.error}</p>
                          </div>
                        </div>
                      </div>
                    )}

                    {groupCheckout.holdResult?.lineResults?.some((line) => !line.ok) && (
                      <div className="mt-3 rounded-xl border border-rose-200 bg-white p-3 text-sm text-rose-700">
                        <div className="font-semibold">Line-level availability issues</div>
                        <ul className="mt-2 space-y-1">
                          {groupCheckout.holdResult.lineResults
                            .filter((line) => !line.ok)
                            .map((line) => (
                              <li key={`${line.lineId ?? line.lineIndex}-${line.reasonCode ?? "error"}`}>
                                Line {line.lineIndex + 1}: {line.message ?? "Unavailable"}
                              </li>
                            ))}
                        </ul>
                      </div>
                    )}

                    {groupCheckout.group?.status === "holds_acquired" && (
                      <div className="mt-3 rounded-xl border border-emerald-200 bg-emerald-50 p-3 text-sm text-emerald-800">
                        <div className="flex items-start gap-2">
                          <CheckCircle2 className="mt-0.5 h-4 w-4 flex-shrink-0" />
                          <div>
                            <div className="font-semibold">Grouped rental holds acquired</div>
                            <p className="mt-1">
                              Continue to the checkout group page to pay while the temporary holds are active.
                            </p>
                            {groupCheckout.group.holdExpiresAt && (
                              <p className="mt-1 inline-flex items-center gap-1">
                                <Clock className="h-4 w-4" />
                                Hold expires {formatDateTime(groupCheckout.group.holdExpiresAt)}
                              </p>
                            )}
                            <Link
                              href={`/rental/checkout-groups/${groupCheckout.group.id}`}
                              className="mt-2 inline-flex text-sm font-semibold text-emerald-900 underline"
                            >
                              View checkout group
                            </Link>
                          </div>
                        </div>
                      </div>
                    )}
                  </div>

                  {rentalLines.map((line) => (
                    <article key={line.id} className="rounded-xl border border-slate-200 p-4">
                      <div className="flex gap-4">
                        <label className="mt-1 flex-shrink-0">
                          <span className="sr-only">Select {line.titleSnapshot}</span>
                          <input
                            type="checkbox"
                            checked={selectedRentalIdSet.has(line.id)}
                            onChange={() => toggleRentalLine(line.id)}
                            className="h-4 w-4 rounded border-slate-300 text-sky-600 focus:ring-sky-500"
                          />
                        </label>
                        <div className="h-20 w-24 flex-shrink-0 overflow-hidden rounded-lg bg-slate-100">
                          {line.imageUrlSnapshot ? (
                            <img
                              src={line.imageUrlSnapshot}
                              alt={line.titleSnapshot}
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
                              <h3 className="font-semibold text-slate-900">{line.titleSnapshot}</h3>
                              <p className="mt-1 text-sm text-slate-500">
                                {formatDate(line.startDate)} to {formatDate(line.endDate)} - Qty {line.qty}
                              </p>
                              <p className="mt-1 text-sm text-slate-500">
                                {line.fulfillment === "deliver" ? "Delivery and collection" : "Self-collect"}
                              </p>
                            </div>
                            <div className="text-left sm:text-right">
                              <div className="text-xs font-semibold uppercase tracking-wide text-slate-500">
                                Estimate
                              </div>
                              <div className="text-lg font-semibold text-slate-900">
                                {formatMoney(line.pricingPreview?.total)}
                              </div>
                            </div>
                          </div>

                          {line.fulfillment === "deliver" && line.deliveryAddress && (
                            <div className="mt-3 rounded-lg bg-slate-50 px-3 py-2 text-sm text-slate-600">
                              {line.deliveryAddress}
                            </div>
                          )}

                          <div className="mt-4 flex flex-wrap gap-2">
                            <button
                              type="button"
                              onClick={() => router.push(checkoutHref(line))}
                              className="inline-flex items-center justify-center gap-2 rounded-xl bg-sky-600 px-4 py-2 text-sm font-semibold text-white hover:bg-sky-700"
                            >
                              Proceed with this rental
                              <ArrowRight className="h-4 w-4" />
                            </button>
                            <button
                              type="button"
                              onClick={() => handleRemove(line.id)}
                              className="inline-flex items-center justify-center gap-2 rounded-xl border border-slate-200 bg-white px-4 py-2 text-sm font-semibold text-slate-700 hover:bg-slate-50"
                            >
                              <Trash2 className="h-4 w-4" />
                              Remove
                            </button>
                          </div>
                        </div>
                      </div>
                    </article>
                  ))}
                </div>
              )}
            </section>

            <section className="rounded-2xl border border-slate-200 bg-white p-5 shadow-sm">
              <div className="flex items-start justify-between gap-4">
                <div>
                  <h2 className="text-base font-semibold text-slate-900">Sale enquiry items</h2>
                  <p className="mt-1 text-sm text-slate-500">
                    Requires admin confirmation. These items do not enter checkout or payment.
                  </p>
                </div>
                <span className="rounded-full bg-amber-100 px-3 py-1 text-xs font-semibold text-amber-800">
                  {saleLines.length}
                </span>
              </div>

              {saleLines.length === 0 ? (
                <div className="mt-4 rounded-xl border border-dashed border-slate-200 p-4 text-sm text-slate-500">
                  No sale enquiry items added.
                </div>
              ) : (
                <div className="mt-4 space-y-4">
                  {saleLines.map((line) => {
                    const form = saleForms[line.id] ?? defaultSaleForm(line);
                    const submitState = saleSubmitState[line.id];
                    const canSubmit = saleCanSubmit(line);
                    return (
                      <article key={line.id} className="rounded-xl border border-slate-200 p-4">
                        <div className="flex gap-4">
                          <div className="h-20 w-24 flex-shrink-0 overflow-hidden rounded-lg bg-slate-100">
                            {line.imageUrlSnapshot ? (
                              <img
                                src={line.imageUrlSnapshot}
                                alt={line.titleSnapshot}
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
                                <h3 className="font-semibold text-slate-900">{line.titleSnapshot}</h3>
                                <p className="mt-1 text-sm text-slate-500">
                                  {saleStatusLabel(line.saleStatusSnapshot)} -{" "}
                                  {line.salePriceModeSnapshot === "fixed"
                                    ? formatCents(line.salePriceCentsSnapshot)
                                    : "Request quote"}
                                </p>
                                {line.fulfillmentPreference && (
                                  <p className="mt-1 inline-flex items-center gap-2 text-sm text-slate-500">
                                    <Truck className="h-4 w-4" />
                                    {line.fulfillmentPreference === "deliver" ? "Delivery" : "Self-collect"}
                                  </p>
                                )}
                              </div>
                              <span className="rounded-full border border-amber-200 bg-amber-50 px-3 py-1 text-xs font-semibold text-amber-800">
                                Requires admin confirmation
                              </span>
                            </div>

                            {(line.saleConditionSnapshot || line.saleWarrantySnapshot || line.message) && (
                              <div className="mt-3 grid gap-2 text-sm text-slate-600 sm:grid-cols-2">
                                {line.saleConditionSnapshot && (
                                  <div className="rounded-lg bg-slate-50 px-3 py-2">
                                    Condition: {line.saleConditionSnapshot}
                                  </div>
                                )}
                                {line.saleWarrantySnapshot && (
                                  <div className="rounded-lg bg-slate-50 px-3 py-2">
                                    Warranty: {line.saleWarrantySnapshot}
                                  </div>
                                )}
                                {line.message && (
                                  <div className="rounded-lg bg-slate-50 px-3 py-2 sm:col-span-2">
                                    Message: {line.message}
                                  </div>
                                )}
                              </div>
                            )}

                            {line.enquirySubmittedAt ? (
                              <div className="mt-4 rounded-xl border border-emerald-200 bg-emerald-50 p-3 text-sm text-emerald-800">
                                <div className="flex items-center gap-2 font-semibold">
                                  <CheckCircle2 className="h-4 w-4" />
                                  Sale enquiry submitted
                                </div>
                                <p className="mt-1">
                                  {formatDateTime(line.enquirySubmittedAt)}
                                  {line.enquiryId ? ` - Ref ${line.enquiryId}` : ""}
                                </p>
                              </div>
                            ) : canSubmit ? (
                              <form
                                className="mt-4 space-y-3"
                                onSubmit={(event) => handleSubmitSaleEnquiry(event, line)}
                              >
                                <div className="grid gap-3 sm:grid-cols-2">
                                  <label className="grid gap-1 text-xs font-medium text-slate-700">
                                    Name
                                    <input
                                      type="text"
                                      value={form.customerName}
                                      onChange={(event) =>
                                        updateSaleForm(line.id, { customerName: event.target.value })
                                      }
                                      className="rounded-xl border border-slate-200 bg-white px-3 py-2 text-sm font-normal text-slate-900 outline-none focus:border-amber-400"
                                      required
                                    />
                                  </label>
                                  <label className="grid gap-1 text-xs font-medium text-slate-700">
                                    Email
                                    <input
                                      type="email"
                                      value={form.customerEmail}
                                      onChange={(event) =>
                                        updateSaleForm(line.id, { customerEmail: event.target.value })
                                      }
                                      className="rounded-xl border border-slate-200 bg-white px-3 py-2 text-sm font-normal text-slate-900 outline-none focus:border-amber-400"
                                      required
                                    />
                                  </label>
                                  <label className="grid gap-1 text-xs font-medium text-slate-700">
                                    Phone
                                    <input
                                      type="tel"
                                      value={form.customerPhone}
                                      onChange={(event) =>
                                        updateSaleForm(line.id, { customerPhone: event.target.value })
                                      }
                                      className="rounded-xl border border-slate-200 bg-white px-3 py-2 text-sm font-normal text-slate-900 outline-none focus:border-amber-400"
                                    />
                                  </label>
                                  <label className="grid gap-1 text-xs font-medium text-slate-700">
                                    Company
                                    <input
                                      type="text"
                                      value={form.companyName}
                                      onChange={(event) =>
                                        updateSaleForm(line.id, { companyName: event.target.value })
                                      }
                                      className="rounded-xl border border-slate-200 bg-white px-3 py-2 text-sm font-normal text-slate-900 outline-none focus:border-amber-400"
                                    />
                                  </label>
                                </div>
                                <label className="grid gap-1 text-xs font-medium text-slate-700">
                                  Message
                                  <textarea
                                    value={form.message}
                                    onChange={(event) =>
                                      updateSaleForm(line.id, { message: event.target.value })
                                    }
                                    rows={3}
                                    className="rounded-xl border border-slate-200 bg-white px-3 py-2 text-sm font-normal text-slate-900 outline-none focus:border-amber-400"
                                  />
                                </label>

                                {submitState?.error && (
                                  <div className="rounded-xl border border-rose-200 bg-rose-50 p-3 text-xs text-rose-700">
                                    {submitState.error}
                                  </div>
                                )}
                                {submitState?.success && (
                                  <div className="rounded-xl border border-emerald-200 bg-emerald-50 p-3 text-xs text-emerald-700">
                                    {submitState.success}
                                  </div>
                                )}

                                <div className="flex flex-wrap gap-2">
                                  <button
                                    type="submit"
                                    disabled={submitState?.loading}
                                    className="inline-flex items-center justify-center rounded-xl bg-amber-500 px-4 py-2 text-sm font-semibold text-white hover:bg-amber-600 disabled:cursor-not-allowed disabled:bg-slate-300"
                                  >
                                    {submitState?.loading ? "Submitting..." : "Submit sale enquiry"}
                                  </button>
                                  <button
                                    type="button"
                                    onClick={() => handleRemove(line.id)}
                                    className="inline-flex items-center justify-center gap-2 rounded-xl border border-slate-200 bg-white px-4 py-2 text-sm font-semibold text-slate-700 hover:bg-slate-50"
                                  >
                                    <Trash2 className="h-4 w-4" />
                                    Remove
                                  </button>
                                </div>
                              </form>
                            ) : (
                              <div className="mt-4 rounded-xl border border-slate-200 bg-slate-50 p-3 text-sm text-slate-600">
                                This saved sale line is no longer actionable from the cart.
                              </div>
                            )}

                            {!canSubmit && !line.enquirySubmittedAt && (
                              <button
                                type="button"
                                onClick={() => handleRemove(line.id)}
                                className="mt-3 inline-flex items-center justify-center gap-2 rounded-xl border border-slate-200 bg-white px-4 py-2 text-sm font-semibold text-slate-700 hover:bg-slate-50"
                              >
                                <Trash2 className="h-4 w-4" />
                                Remove
                              </button>
                            )}
                          </div>
                        </div>
                      </article>
                    );
                  })}
                </div>
              )}
            </section>
          </div>

          <aside className="h-fit rounded-2xl border border-slate-200 bg-white p-5 shadow-sm">
            <h2 className="text-sm font-semibold text-slate-900">Cart summary</h2>
            <div className="mt-4 space-y-3 text-sm">
              <div className="flex items-center justify-between">
                <span className="text-slate-600">Rental items</span>
                <span className="font-semibold text-slate-900">{rentalLines.length}</span>
              </div>
              <div className="flex items-center justify-between">
                <span className="text-slate-600">Sale enquiry items</span>
                <span className="font-semibold text-slate-900">{saleLines.length}</span>
              </div>
              <div className="border-t border-slate-200 pt-3">
                <div className="flex items-center justify-between">
                  <span className="font-semibold text-slate-700">Rental estimate total</span>
                  <span className="font-semibold text-slate-900">
                    {formatMoney(rentalEstimateTotal)}
                  </span>
                </div>
                <p className="mt-2 text-xs text-slate-500">
                  Estimates only. Existing checkout remains authoritative and processes one rental
                  item at a time.
                </p>
              </div>
            </div>

            <button
              type="button"
              disabled
              className="mt-5 inline-flex w-full cursor-not-allowed items-center justify-center rounded-xl bg-slate-200 px-4 py-3 text-sm font-semibold text-slate-500"
            >
              Mixed checkout planned
            </button>
            <p className="mt-2 text-xs text-slate-500">
              Combined rental and sale checkout will be introduced in a later phase.
            </p>
          </aside>
        </div>
      )}
    </div>
  );
}
