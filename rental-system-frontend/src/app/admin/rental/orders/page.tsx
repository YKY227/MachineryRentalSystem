// src/app/admin/rental/orders/page.tsx
"use client";

import { useEffect, useMemo, useState } from "react";
import { useRouter } from "next/navigation";

import type { Equipment } from "@/lib/rental/types";
import { localEquipmentRepo } from "@/lib/rental/equipment-repo";
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
    const totalRevenue = orders.reduce((sum, o) => sum + (o.pricingSnapshot?.total ?? 0), 0);
    return { totalOrders, totalRevenue };
  }, [orders]);

  async function refreshInventory() {
    const data = await localEquipmentRepo.listAdmin();
    setItems(data);
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
      setOrders(nextOrders);
      return nextOrders;
    } catch (e) {
      console.error("refreshOrders failed", e);
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
      <div className="mt-6 grid gap-4 sm:grid-cols-2">
        <div className="rounded-xl border border-slate-200 bg-white p-4">
          <div className="text-xs uppercase tracking-wide text-slate-500">Total orders</div>
          <div className="mt-1 text-2xl font-semibold text-slate-900">{ordersSummary.totalOrders}</div>
        </div>
        <div className="rounded-xl border border-slate-200 bg-white p-4">
          <div className="text-xs uppercase tracking-wide text-slate-500">Total value (MVP)</div>
          <div className="mt-1 text-2xl font-semibold text-slate-900">{formatMoney(ordersSummary.totalRevenue)}</div>
          <div className="mt-1 text-xs text-slate-500">Based on pricing snapshot; not a real payment record.</div>
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
                <th className="px-4 py-3">Total</th>
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

                return (
                  <tr key={o.id} className="border-t border-slate-100">
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
                      <div className="font-semibold text-slate-900">{formatMoney(o.pricingSnapshot?.total ?? 0)}</div>
                      <div className="text-xs text-slate-500">
                        Deposit: {formatMoney(o.pricingSnapshot?.deposit ?? 0)}
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
