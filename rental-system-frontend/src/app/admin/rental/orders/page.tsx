// src/app/admin/rental/orders/page.tsx
"use client";

import { Fragment, useEffect, useMemo, useState } from "react";
import { useRouter } from "next/navigation";

import type {
  RentalDepositTransaction,
  RentalOrderDepositSummary,
} from "@/lib/rental/deposits/types";
import type { Equipment } from "@/lib/rental/types";
import type { Invoice } from "@/lib/rental/invoices/types";
import type { CreateRentalOrderInput, RentalOrder } from "@/lib/rental/orders/types";

function formatMoney(n: number) {
  return new Intl.NumberFormat("en-SG", {
    style: "currency",
    currency: "SGD",
    maximumFractionDigits: 0,
  }).format(n);
}

function formatDateTime(iso: string) {
  const d = new Date(iso);
  if (Number.isNaN(d.getTime())) return iso;
  return d.toLocaleString("en-SG", { hour12: true });
}

function addDaysISO(dateISO: string, days: number) {
  const d = new Date(dateISO + "T12:00:00");
  if (Number.isNaN(d.getTime())) return dateISO;
  d.setDate(d.getDate() + days);
  return d.toISOString().slice(0, 10);
}

function clampInt(n: unknown, fallback: number) {
  const v = Number(n);
  if (!Number.isFinite(v)) return fallback;
  return Math.max(0, Math.floor(v));
}

function depositStatusLabel(status: RentalOrderDepositSummary["status"]) {
  switch (status) {
    case "held":
      return "Held";
    case "partially_held":
      return "Partially Held";
    case "pending":
      return "Pending";
    case "not_required":
      return "Not Required";
    case "released":
      return "Released";
    case "partially_released":
      return "Partially Released";
    case "retained":
      return "Retained";
    case "partially_retained":
      return "Partially Retained";
    default:
      return status;
  }
}

function depositTransactionLabel(type: RentalDepositTransaction["transactionType"]) {
  switch (type) {
    case "requirement_created":
      return "Requirement Created";
    case "payment_collected":
      return "Collected";
    case "released":
      return "Released";
    case "retained":
      return "Retained";
    case "adjustment":
    default:
      return type;
  }
}

function depositBadgeTone(status: RentalOrderDepositSummary["status"]) {
  switch (status) {
    case "held":
      return "bg-emerald-100 text-emerald-800";
    case "partially_held":
    case "pending":
      return "bg-amber-100 text-amber-800";
    case "released":
      return "bg-slate-100 text-slate-700";
    case "retained":
    case "partially_retained":
      return "bg-rose-100 text-rose-800";
    case "not_required":
    default:
      return "bg-slate-100 text-slate-700";
  }
}

function orderChargeTotal(order: RentalOrder) {
  if (typeof order.pricingSnapshot?.payableTotal === "number") {
    return order.pricingSnapshot.payableTotal;
  }
  return Math.max(
    0,
    Number(order.pricingSnapshot?.total ?? 0) - Number(order.pricingSnapshot?.deposit ?? 0)
  );
}

function seedDemoOrders(items: Equipment[]): CreateRentalOrderInput[] {
  const pick = (id: string) => items.find((x) => x.id === id) ?? items[0];

  const a = pick("eq-scissor-lift-8m") ?? items[0];
  const b = pick("eq-forklift-3t") ?? items[Math.min(1, items.length - 1)];

  const today = new Date();
  const iso = (d: Date) => d.toISOString().slice(0, 10);
  const plusDays = (n: number) => {
    const d = new Date(today);
    d.setDate(d.getDate() + n);
    return d;
  };

  const mk = (i: number, eq: Equipment, startOff: number, endOff: number): CreateRentalOrderInput => {
    const start = iso(plusDays(startOff));
    const end = iso(plusDays(endOff));
    const days = Math.max(1, endOff - startOff);
    const qty = 1;

    const dayRate = eq?.pricing?.dayRate ?? 80;
    const rentalSubtotal = dayRate * days * qty;
    const deliveryFee = 60;
    const collectionFee = 40;
    const deposit = eq?.pricing?.deposit ?? 0;
    const total = rentalSubtotal + deliveryFee + collectionFee + deposit;

    return {
      id: `ORD-DEMO-${String(i).padStart(4, "0")}`,
      equipmentId: eq.id,
      equipmentTitle: eq.title,
      qty,
      start,
      end,
      fulfillment: "deliver",
      pricingSnapshot: {
        days,
        rentalSubtotal,
        deliveryFee,
        collectionFee,
        deposit,
        total,
      },
      customerSnapshot: {
        companyName: `Demo Customer ${i}`,
        contactName: `Demo Contact ${i}`,
        email: `demo${i}@example.com`,
      },
    };
  };

  if (!items.length) return [];
  return [mk(1, a, 0, 3), mk(2, b ?? a, 5, 9)];
}

export default function AdminRentalOrdersPage() {
  const router = useRouter();
  const isDev = process.env.NODE_ENV === "development";

  const [items, setItems] = useState<Equipment[]>([]);
  const [orders, setOrders] = useState<RentalOrder[]>([]);
  const [invoices, setInvoices] = useState<Invoice[]>([]);
  const [depositSummariesByOrderId, setDepositSummariesByOrderId] = useState<
    Record<string, RentalOrderDepositSummary>
  >({});
  const [activeDepositOrderId, setActiveDepositOrderId] = useState<string | null>(null);
  const [depositPanelLoading, setDepositPanelLoading] = useState(false);
  const [depositPanelError, setDepositPanelError] = useState<string | null>(null);
  const [depositPanelBanner, setDepositPanelBanner] = useState<string | null>(null);
  const [depositTransactions, setDepositTransactions] = useState<RentalDepositTransaction[]>([]);
  const [depositActionType, setDepositActionType] = useState<"release" | "retain" | "split">("release");
  const [releaseAmountInput, setReleaseAmountInput] = useState("");
  const [retainAmountInput, setRetainAmountInput] = useState("");
  const [resolutionNote, setResolutionNote] = useState("");
  const [resolutionReference, setResolutionReference] = useState("");
  const [depositSaving, setDepositSaving] = useState(false);
  const [loadingOrders, setLoadingOrders] = useState(true);
  const [loadingInv, setLoadingInv] = useState(true);
  const [working, setWorking] = useState(false);

  const equipmentById = useMemo(() => {
    const map = new Map<string, Equipment>();
    items.forEach((e) => map.set(e.id, e));
    return map;
  }, [items]);

  const ordersSummary = useMemo(() => {
    const totalOrders = orders.length;
    const totalRentalCharges = orders.reduce((sum, order) => sum + orderChargeTotal(order), 0);
    const totalDepositRequired = Object.values(depositSummariesByOrderId).reduce(
      (sum, deposit) => sum + deposit.requiredAmountCents / 100,
      0
    );
    const totalDepositHeld = Object.values(depositSummariesByOrderId).reduce(
      (sum, deposit) => sum + deposit.heldAmountCents / 100,
      0
    );
    return { totalOrders, totalRentalCharges, totalDepositRequired, totalDepositHeld };
  }, [depositSummariesByOrderId, orders]);

  async function refreshInventory() {
    const res = await fetch("/api/admin/rental/equipment", {
      cache: "no-store",
      credentials: "include",
    });
    const data = await res.json().catch(() => ({}));
    if (!res.ok) throw new Error(data?.error ?? "Failed to load equipment");
    setItems(Array.isArray(data?.equipment) ? (data.equipment as Equipment[]) : []);
  }

  async function refreshOrders() {
    try {
      setLoadingOrders(true);
      const res = await fetch("/api/admin/rental/orders", {
        method: "GET",
        cache: "no-store",
        credentials: "include",
      });
      const data = await res.json().catch(() => ({}));
      if (!res.ok) throw new Error(data?.error ?? "Failed to load orders");
      const nextOrders = (data?.orders ?? []) as RentalOrder[];
      setDepositSummariesByOrderId(
        (data?.depositSummariesByOrderId ?? {}) as Record<string, RentalOrderDepositSummary>
      );
      setOrders(nextOrders);
      return nextOrders;
    } catch (e) {
      console.error("refreshOrders failed", e);
      setDepositSummariesByOrderId({});
      setOrders([]);
      return [];
    } finally {
      setLoadingOrders(false);
    }
  }

  async function refreshInvoices(orderItems: RentalOrder[]) {
    try {
      setLoadingInv(true);
      const orderIds = orderItems.map((o) => o.id).filter(Boolean);

      if (!orderIds.length) {
        setInvoices([]);
        return;
      }

      const res = await fetch(
        `/api/admin/rental/invoices?orderIds=${encodeURIComponent(orderIds.join(","))}`,
        { cache: "no-store", credentials: "include" }
      );
      const data = await res.json().catch(() => ({}));
      if (!res.ok) throw new Error(data?.error ?? "Failed to load invoice statuses");

      setInvoices(((data?.invoices ?? []) as Invoice[]).filter((x) => x.status !== "void"));
    } catch (e) {
      console.error("refreshInvoices failed", e);
      setInvoices([]);
    } finally {
      setLoadingInv(false);
    }
  }

  useEffect(() => {
    refreshInventory().then(async () => {
      const nextOrders = await refreshOrders();
      await refreshInvoices(nextOrders);
    });
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, []);

  function findInvoiceForOrder(orderId: string) {
    return invoices.find((x) => x.orderId === orderId && x.status !== "void");
  }

  async function openDepositPanel(orderId: string) {
    setActiveDepositOrderId(orderId);
    setDepositPanelLoading(true);
    setDepositPanelError(null);
    setDepositPanelBanner(null);
    setDepositTransactions([]);
    setDepositActionType("release");
    setReleaseAmountInput("");
    setRetainAmountInput("");
    setResolutionNote("");
    setResolutionReference("");

    try {
      const res = await fetch(`/api/admin/rental/orders/${encodeURIComponent(orderId)}/deposit`, {
        cache: "no-store",
        credentials: "include",
      });
      const data = await res.json().catch(() => ({}));
      if (!res.ok) throw new Error(data?.error ?? "Failed to load deposit detail");
      setDepositTransactions((data?.transactions ?? []) as RentalDepositTransaction[]);
      const summary = (data?.summary ?? null) as RentalOrderDepositSummary | null;
      if (summary) {
        setDepositSummariesByOrderId((prev) => ({
          ...prev,
          [orderId]: summary,
        }));
      }
    } catch (error) {
      setDepositPanelError(error instanceof Error ? error.message : "Failed to load deposit detail");
    } finally {
      setDepositPanelLoading(false);
    }
  }

  async function submitDepositResolution(orderId: string) {
    try {
      setDepositSaving(true);
      setDepositPanelError(null);
      setDepositPanelBanner(null);

      const payload = {
        actionType: depositActionType,
        releaseAmountCents: Math.round(Number(releaseAmountInput || 0) * 100),
        retainAmountCents: Math.round(Number(retainAmountInput || 0) * 100),
        note: resolutionNote,
        externalReference: resolutionReference,
      };

      const res = await fetch(`/api/admin/rental/orders/${encodeURIComponent(orderId)}/deposit`, {
        method: "POST",
        credentials: "include",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify(payload),
      });
      const data = await res.json().catch(() => ({}));
      if (!res.ok) throw new Error(data?.error ?? "Failed to resolve deposit");

      const summary = (data?.summary ?? null) as RentalOrderDepositSummary | null;
      if (summary) {
        setDepositSummariesByOrderId((prev) => ({
          ...prev,
          [orderId]: summary,
        }));
      }
      const newTransactions = (data?.transactions ?? []) as RentalDepositTransaction[];
      setDepositTransactions((prev) => [...newTransactions, ...prev]);
      setDepositPanelBanner(String(data?.message ?? "Deposit resolution recorded."));
      setReleaseAmountInput("");
      setRetainAmountInput("");
      setResolutionNote("");
      setResolutionReference("");
    } catch (error) {
      setDepositPanelError(error instanceof Error ? error.message : "Failed to resolve deposit");
    } finally {
      setDepositSaving(false);
    }
  }

  async function onCreateOrViewInvoice(o: RentalOrder) {
    try {
      const res = await fetch("/api/admin/rental/invoices", {
        method: "POST",
        credentials: "include",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ orderId: o.id }),
      });
      const data = await res.json().catch(() => ({}));
      if (!res.ok) throw new Error(data?.error ?? "Failed to create or load invoice");

      const inv = data?.invoice as Invoice | undefined;
      if (!inv?.id) throw new Error("Invoice create response missing id");

      await refreshInvoices(orders);
      router.push(`/admin/rental/invoices/${encodeURIComponent(inv.id)}`);
    } catch (e) {
      const message = e instanceof Error ? e.message : "Failed to create invoice";
      alert(message);
    }
  }

  async function onRefreshAll() {
    const nextOrders = await refreshOrders();
    await refreshInvoices(nextOrders);
  }

  async function onSeedOrders() {
    if (!isDev) return;
    const seed = seedDemoOrders(items);
    if (!seed.length) return;

    try {
      setWorking(true);
      const res = await fetch("/api/admin/rental/orders/import-local", {
        method: "POST",
        credentials: "include",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ orders: seed }),
      });
      const data = await res.json().catch(() => ({}));
      if (!res.ok) throw new Error(data?.error ?? "Failed to import demo orders");

      await onRefreshAll();
    } catch (e) {
      const message = e instanceof Error ? e.message : "Failed to seed demo orders";
      alert(message);
    } finally {
      setWorking(false);
    }
  }

  async function onDevReset() {
    if (!isDev) return;
    const ok = window.confirm("Delete all DB rental orders in development mode?");
    if (!ok) return;

    try {
      setWorking(true);
      const res = await fetch("/api/admin/rental/orders", {
        method: "DELETE",
        credentials: "include",
      });
      const data = await res.json().catch(() => ({}));
      if (!res.ok) throw new Error(data?.error ?? "Failed to reset orders");

      await onRefreshAll();
    } catch (e) {
      const message = e instanceof Error ? e.message : "Failed to reset orders";
      alert(message);
    } finally {
      setWorking(false);
    }
  }

  return (
    <div className="mx-auto max-w-6xl p-4">
      <div className="flex items-start justify-between gap-4">
        <div>
          <h1 className="text-2xl font-semibold text-slate-900">Rental Orders</h1>
          <p className="mt-1 text-sm text-slate-600">
            DB-first mode (Supabase). Orders persist across refresh and sessions.
          </p>
        </div>

        <div className="flex flex-wrap items-center gap-2">
          <button
            onClick={() => router.push("/admin/rental")}
            className="rounded-lg border border-slate-200 bg-white px-3 py-2 text-sm font-medium text-slate-700 hover:bg-slate-50"
          >
            Back to Rental
          </button>

          <button
            onClick={onRefreshAll}
            className="rounded-lg border border-slate-200 bg-white px-3 py-2 text-sm font-medium text-slate-700 hover:bg-slate-50"
            disabled={working}
          >
            Refresh
          </button>

          {isDev && (
            <>
              <button
                onClick={onSeedOrders}
                className="rounded-lg bg-slate-900 px-3 py-2 text-sm font-semibold text-white hover:bg-slate-800 disabled:bg-slate-300"
                disabled={!items.length || working}
                title={!items.length ? "Load inventory first" : "Create demo DB orders"}
              >
                Seed demo orders
              </button>

              <button
                onClick={onDevReset}
                className="rounded-lg border border-slate-200 bg-white px-3 py-2 text-sm font-medium text-slate-700 hover:bg-slate-50 disabled:opacity-60"
                disabled={working}
                title="Development only"
              >
                Dev reset
              </button>
            </>
          )}
        </div>
      </div>

      {/* Summary cards */}
      <div className="mt-6 grid gap-4 sm:grid-cols-2 lg:grid-cols-4">
        <div className="rounded-xl border border-slate-200 bg-white p-4">
          <div className="text-xs uppercase tracking-wide text-slate-500">Total orders</div>
          <div className="mt-1 text-2xl font-semibold text-slate-900">{ordersSummary.totalOrders}</div>
        </div>
        <div className="rounded-xl border border-slate-200 bg-white p-4">
          <div className="text-xs uppercase tracking-wide text-slate-500">Rental charges</div>
          <div className="mt-1 text-2xl font-semibold text-slate-900">
            {formatMoney(ordersSummary.totalRentalCharges)}
          </div>
          <div className="mt-1 text-xs text-slate-500">Charge totals exclude refundable deposits.</div>
        </div>
        <div className="rounded-xl border border-slate-200 bg-white p-4">
          <div className="text-xs uppercase tracking-wide text-slate-500">Deposit required</div>
          <div className="mt-1 text-2xl font-semibold text-slate-900">
            {formatMoney(ordersSummary.totalDepositRequired)}
          </div>
        </div>
        <div className="rounded-xl border border-slate-200 bg-white p-4">
          <div className="text-xs uppercase tracking-wide text-slate-500">Deposit held</div>
          <div className="mt-1 text-2xl font-semibold text-slate-900">
            {formatMoney(ordersSummary.totalDepositHeld)}
          </div>
        </div>
      </div>

      {/* Orders table */}
      {loadingOrders ? (
        <div className="mt-6 rounded-xl border border-slate-200 bg-white p-6 text-sm text-slate-600">
          Loading DB orders...
        </div>
      ) : orders.length === 0 ? (
        <div className="mt-6 rounded-xl border border-slate-200 bg-white p-6 text-sm text-slate-600">
          No rental orders found in DB.
          <div className="mt-2 text-xs text-slate-500">
            Public checkout now writes to DB via <span className="font-mono">/api/public/rental/orders</span>.
          </div>
        </div>
      ) : (
        <div className="mt-6 overflow-hidden rounded-xl border border-slate-200 bg-white">
          <table className="w-full text-left text-sm">
            <thead className="bg-slate-50 text-xs uppercase tracking-wide text-slate-500">
              <tr>
                <th className="px-4 py-3">Ref</th>
                <th className="px-4 py-3">Item</th>
                <th className="px-4 py-3">Qty</th>
                <th className="px-4 py-3">Period</th>
                <th className="px-4 py-3">Fulfillment</th>
                <th className="px-4 py-3">Maintenance</th>
                <th className="px-4 py-3">Charges</th>
                <th className="px-4 py-3">Deposit</th>
                <th className="px-4 py-3">Created</th>
                <th className="px-4 py-3">Actions</th>
              </tr>
            </thead>

            <tbody>
              {orders.map((o) => {
                const eq = equipmentById.get(o.equipmentId);
                const buffer = clampInt((eq as any)?.maintenanceBufferDays, 7);
                const reservedUntil = buffer > 0 ? addDaysISO(o.end, buffer) : o.end;

                const inv = findInvoiceForOrder(o.id);
                const deposit = depositSummariesByOrderId[o.id] ?? {
                  orderId: o.id,
                  requiredAmountCents: Math.round(Number(o.pricingSnapshot?.deposit ?? 0) * 100),
                  heldAmountCents: 0,
                  releasedAmountCents: 0,
                  retainedAmountCents: 0,
                  unresolvedAmountCents: Math.round(Number(o.pricingSnapshot?.deposit ?? 0) * 100),
                  status: Number(o.pricingSnapshot?.deposit ?? 0) > 0 ? "pending" : "not_required",
                };

                return (
                  <Fragment key={o.id}>
                  <tr className="border-t border-slate-100">
                    <td className="px-4 py-3">
                      <div className="font-medium text-slate-900">{o.id}</div>
                      <div className="text-xs text-slate-500">{o.pricingSnapshot?.days ?? 0} day(s)</div>
                    </td>

                    <td className="px-4 py-3">
                      <div className="font-medium text-slate-900">{o.equipmentTitle}</div>
                      <div className="text-xs text-slate-500">{o.equipmentId}</div>
                    </td>

                    <td className="px-4 py-3 text-slate-700">{o.qty}</td>

                    <td className="px-4 py-3 text-slate-700">
                      <div>
                        {o.start} ? {o.end}
                      </div>
                      <div className="mt-1 text-xs text-slate-500">
                        Reserved until <span className="font-medium text-slate-700">{reservedUntil}</span>
                      </div>
                    </td>

                    <td className="px-4 py-3 text-slate-700">
                      {o.fulfillment === "deliver" ? "Deliver & collect" : "Self-collect"}
                    </td>

                    <td className="px-4 py-3">
                      {buffer <= 0 ? (
                        <span className="rounded-full bg-slate-100 px-2 py-1 text-xs font-semibold text-slate-600">
                          None
                        </span>
                      ) : (
                        <div className="inline-flex flex-col gap-1">
                          <span className="inline-flex items-center rounded-full bg-amber-100 px-2 py-1 text-xs font-semibold text-amber-800">
                            Maintenance scheduled
                          </span>
                          <span className="text-xs text-slate-500">
                            Buffer: <span className="font-medium text-slate-700">{buffer}d</span>
                          </span>
                        </div>
                      )}
                    </td>

                    <td className="px-4 py-3">
                      <div className="font-semibold text-slate-900">{formatMoney(orderChargeTotal(o))}</div>
                      <div className="text-xs text-slate-500">
                        Invoice-linked charge snapshot
                      </div>
                    </td>

                    <td className="px-4 py-3">
                      <div className="font-semibold text-slate-900">
                        {formatMoney(deposit.requiredAmountCents / 100)}
                      </div>
                      <div className="mt-1 text-xs text-slate-500">
                        Held: {formatMoney(deposit.heldAmountCents / 100)}
                      </div>
                      <div className="mt-2">
                        <span
                          className={[
                            "rounded-full px-2 py-1 text-[11px] font-semibold uppercase",
                            depositBadgeTone(deposit.status),
                          ].join(" ")}
                        >
                          {depositStatusLabel(deposit.status)}
                        </span>
                      </div>
                    </td>

                    <td className="px-4 py-3 text-slate-700">{formatDateTime(o.createdAt)}</td>

                    <td className="px-4 py-3">
                      <div className="flex flex-col gap-2">
                        <button
                          type="button"
                          onClick={() => onCreateOrViewInvoice(o)}
                          className={[
                            "rounded-lg px-3 py-2 text-xs font-semibold",
                            inv
                              ? "bg-slate-900 text-white hover:bg-slate-800"
                              : "bg-sky-600 text-white hover:bg-sky-700",
                          ].join(" ")}
                        >
                          {inv ? "View Invoice" : "Create Invoice"}
                        </button>

                        <button
                          type="button"
                          disabled
                          className="rounded-lg border border-slate-200 bg-white px-3 py-2 text-xs font-semibold text-slate-400"
                          title="Coming soon: release buffer early by marking maintenance completed"
                        >
                          Release early
                        </button>

                        {deposit.heldAmountCents > 0 && deposit.unresolvedAmountCents > 0 && (
                          <button
                            type="button"
                            onClick={() =>
                              activeDepositOrderId === o.id
                                ? setActiveDepositOrderId(null)
                                : openDepositPanel(o.id)
                            }
                            className="rounded-lg border border-slate-200 bg-white px-3 py-2 text-xs font-semibold text-slate-700 hover:bg-slate-50"
                          >
                            {activeDepositOrderId === o.id ? "Hide Deposit" : "Resolve Deposit"}
                          </button>
                        )}

                        {inv && (
                          <div className="text-[11px] text-slate-500">
                            Invoice status:{" "}
                            <span className="font-semibold text-slate-700">
                              {loadingInv ? "..." : inv.status.toUpperCase()}
                            </span>
                          </div>
                        )}
                      </div>
                    </td>
                  </tr>
                  {activeDepositOrderId === o.id && (
                    <tr className="border-t border-slate-100 bg-slate-50">
                      <td colSpan={10} className="px-4 py-4">
                        <div className="rounded-xl border border-slate-200 bg-white p-4">
                          <div className="flex items-center justify-between gap-3">
                            <div>
                              <div className="text-sm font-semibold text-slate-900">Deposit Resolution</div>
                              <div className="text-xs text-slate-500">
                                Held: {formatMoney(deposit.heldAmountCents / 100)} · Released:{" "}
                                {formatMoney(deposit.releasedAmountCents / 100)} · Retained:{" "}
                                {formatMoney(deposit.retainedAmountCents / 100)} · Unresolved:{" "}
                                {formatMoney(deposit.unresolvedAmountCents / 100)}
                              </div>
                            </div>
                            <span
                              className={[
                                "rounded-full px-2 py-1 text-[11px] font-semibold uppercase",
                                depositBadgeTone(deposit.status),
                              ].join(" ")}
                            >
                              {depositStatusLabel(deposit.status)}
                            </span>
                          </div>

                          {deposit.lastResolutionNote && (
                            <div className="mt-3 rounded-lg border border-slate-200 bg-slate-50 p-3 text-xs text-slate-600">
                              Latest resolution: {deposit.lastResolutionType ?? "-"} · {deposit.lastResolutionNote}
                              {deposit.resolvedAt ? ` · ${formatDateTime(deposit.resolvedAt)}` : ""}
                            </div>
                          )}

                          {depositPanelBanner && (
                            <div className="mt-3 rounded-lg border border-emerald-200 bg-emerald-50 p-3 text-sm text-emerald-700">
                              {depositPanelBanner}
                            </div>
                          )}

                          {depositPanelError && (
                            <div className="mt-3 rounded-lg border border-rose-200 bg-rose-50 p-3 text-sm text-rose-700">
                              {depositPanelError}
                            </div>
                          )}

                          <div className="mt-4 grid gap-4 lg:grid-cols-[1.2fr_0.8fr]">
                            <div className="space-y-4">
                              <div className="grid gap-3 sm:grid-cols-3">
                                <label className="grid gap-1 text-sm">
                                  <span className="text-slate-700">Action</span>
                                  <select
                                    value={depositActionType}
                                    onChange={(e) =>
                                      setDepositActionType(
                                        e.target.value as "release" | "retain" | "split"
                                      )
                                    }
                                    className="rounded-lg border border-slate-200 px-3 py-2 text-sm"
                                  >
                                    <option value="release">Release / refund record</option>
                                    <option value="retain">Retain</option>
                                    <option value="split">Split release + retain</option>
                                  </select>
                                </label>

                                {(depositActionType === "release" || depositActionType === "split") && (
                                  <label className="grid gap-1 text-sm">
                                    <span className="text-slate-700">Release Amount (SGD)</span>
                                    <input
                                      type="number"
                                      min="0"
                                      step="0.01"
                                      value={releaseAmountInput}
                                      onChange={(e) => setReleaseAmountInput(e.target.value)}
                                      className="rounded-lg border border-slate-200 px-3 py-2 text-sm"
                                    />
                                  </label>
                                )}

                                {(depositActionType === "retain" || depositActionType === "split") && (
                                  <label className="grid gap-1 text-sm">
                                    <span className="text-slate-700">Retain Amount (SGD)</span>
                                    <input
                                      type="number"
                                      min="0"
                                      step="0.01"
                                      value={retainAmountInput}
                                      onChange={(e) => setRetainAmountInput(e.target.value)}
                                      className="rounded-lg border border-slate-200 px-3 py-2 text-sm"
                                    />
                                  </label>
                                )}
                              </div>

                              <label className="grid gap-1 text-sm">
                                <span className="text-slate-700">Reason / Note</span>
                                <textarea
                                  value={resolutionNote}
                                  onChange={(e) => setResolutionNote(e.target.value)}
                                  className="min-h-24 rounded-lg border border-slate-200 px-3 py-2 text-sm"
                                  placeholder="Inspection outcome, refund note, damage retention reason..."
                                />
                              </label>

                              <label className="grid gap-1 text-sm">
                                <span className="text-slate-700">Refund / Reference (optional)</span>
                                <input
                                  type="text"
                                  value={resolutionReference}
                                  onChange={(e) => setResolutionReference(e.target.value)}
                                  className="rounded-lg border border-slate-200 px-3 py-2 text-sm"
                                  placeholder="Manual refund ref, bank transfer ref, internal note..."
                                />
                              </label>

                              <button
                                type="button"
                                onClick={() => submitDepositResolution(o.id)}
                                disabled={depositSaving || depositPanelLoading}
                                className="rounded-lg bg-slate-900 px-4 py-2 text-sm font-semibold text-white hover:bg-slate-800 disabled:bg-slate-300"
                              >
                                {depositSaving ? "Recording..." : "Record Deposit Resolution"}
                              </button>
                            </div>

                            <div>
                              <div className="text-sm font-semibold text-slate-900">Recent Deposit Activity</div>
                              {depositPanelLoading ? (
                                <div className="mt-3 text-sm text-slate-500">Loading deposit history...</div>
                              ) : depositTransactions.length === 0 ? (
                                <div className="mt-3 text-sm text-slate-500">No deposit transactions recorded.</div>
                              ) : (
                                <div className="mt-3 space-y-2">
                                  {depositTransactions.slice(0, 6).map((transaction) => (
                                    <div
                                      key={transaction.id}
                                      className="rounded-lg border border-slate-200 bg-slate-50 p-3 text-xs text-slate-600"
                                    >
                                      <div className="flex items-center justify-between gap-3">
                                        <span className="font-semibold text-slate-900">
                                          {depositTransactionLabel(transaction.transactionType)}
                                        </span>
                                        <span>{formatMoney(transaction.amountCents / 100)}</span>
                                      </div>
                                      <div className="mt-1">{formatDateTime(transaction.createdAt)}</div>
                                      {transaction.notes && <div className="mt-1">{transaction.notes}</div>}
                                      {transaction.externalReference && (
                                        <div className="mt-1">Ref: {transaction.externalReference}</div>
                                      )}
                                    </div>
                                  ))}
                                </div>
                              )}
                            </div>
                          </div>
                        </div>
                      </td>
                    </tr>
                  )}
                  </Fragment>
                );
              })}
            </tbody>
          </table>

          <div className="border-t border-slate-100 bg-slate-50 p-3 text-xs text-slate-500">
            Orders source: <span className="font-mono">Supabase Postgres</span> • Invoices source:{" "}
            <span className="font-mono">Supabase Postgres</span>.
          </div>
        </div>
      )}
    </div>
  );
}
