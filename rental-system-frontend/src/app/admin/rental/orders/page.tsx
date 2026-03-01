// src/app/admin/rental/orders/page.tsx
"use client";

import { useEffect, useMemo, useState } from "react";
import { useRouter } from "next/navigation";

import type { Equipment } from "@/lib/rental/types";
import { localEquipmentRepo } from "@/lib/rental/equipment-repo";

import { localInvoiceRepo } from "@/lib/rental/invoices/local-invoice-repo";
import type { Invoice } from "@/lib/rental/invoices/types";

type FulfillmentMode = "deliver" | "self_collect";

type LocalRentalOrder = {
  id: string; // publicId
  equipmentId: string;
  equipmentTitle: string;
  qty: number;
  start: string; // YYYY-MM-DD
  end: string; // YYYY-MM-DD
  fulfillment: FulfillmentMode;
  pricingSnapshot: {
    days: number;
    rentalSubtotal: number;
    deliveryFee: number;
    collectionFee: number;
    deposit: number;
    total: number;
  };
  createdAt: string; // ISO
};

const ORDERS_LS_KEY = "cms_rental_orders_v1";
// If you used any older key before, list them here for auto-migration:
const LEGACY_ORDER_KEYS = ["cms_rental_orders", "cms_rental_orders_v0", "cms_rental_order_v1"];

function safeJsonParse(raw: string | null): { ok: boolean; value: unknown; error?: string } {
  if (!raw) return { ok: true, value: null };
  try {
    return { ok: true, value: JSON.parse(raw) };
  } catch (e) {
    return { ok: false, value: null, error: e instanceof Error ? e.message : String(e) };
  }
}

function readOrdersWithMigration(): {
  orders: LocalRentalOrder[];
  diagnostics: {
    key: string;
    found: boolean;
    rawBytes: number;
    parseOk: boolean;
    parseError?: string;
    parsedType: string;
    migratedFrom?: string;
  };
} {
  if (typeof window === "undefined") {
    return {
      orders: [],
      diagnostics: {
        key: ORDERS_LS_KEY,
        found: false,
        rawBytes: 0,
        parseOk: true,
        parsedType: "n/a",
      },
    };
  }

  const raw = localStorage.getItem(ORDERS_LS_KEY);
  const found = !!raw;
  const rawBytes = raw ? raw.length : 0;
  const parsed = safeJsonParse(raw);
  const parsedType = Array.isArray(parsed.value) ? "array" : typeof parsed.value;

  // ✅ Happy path: v1 exists and is an array
  if (parsed.ok && Array.isArray(parsed.value)) {
    return {
      orders: parsed.value as LocalRentalOrder[],
      diagnostics: { key: ORDERS_LS_KEY, found, rawBytes, parseOk: true, parsedType },
    };
  }

  // ✅ If v1 exists but not array or parse fails, try legacy keys (migration)
  for (const legacyKey of LEGACY_ORDER_KEYS) {
    const legacyRaw = localStorage.getItem(legacyKey);
    if (!legacyRaw) continue;

    const legacyParsed = safeJsonParse(legacyRaw);
    if (legacyParsed.ok && Array.isArray(legacyParsed.value)) {
      // migrate
      localStorage.setItem(ORDERS_LS_KEY, JSON.stringify(legacyParsed.value));
      return {
        orders: legacyParsed.value as LocalRentalOrder[],
        diagnostics: {
          key: ORDERS_LS_KEY,
          found: true,
          rawBytes: localStorage.getItem(ORDERS_LS_KEY)?.length ?? 0,
          parseOk: true,
          parsedType: "array",
          migratedFrom: legacyKey,
        },
      };
    }
  }

  // Nothing usable
  return {
    orders: [],
    diagnostics: {
      key: ORDERS_LS_KEY,
      found,
      rawBytes,
      parseOk: parsed.ok,
      parseError: parsed.ok ? undefined : parsed.error,
      parsedType,
    },
  };
}

function writeOrders(items: LocalRentalOrder[]) {
  if (typeof window === "undefined") return;
  localStorage.setItem(ORDERS_LS_KEY, JSON.stringify(items));
}

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
  const d = new Date(dateISO + "T12:00:00"); // midday to avoid TZ edge cases
  if (Number.isNaN(d.getTime())) return dateISO;
  d.setDate(d.getDate() + days);
  return d.toISOString().slice(0, 10);
}

function clampInt(n: unknown, fallback: number) {
  const v = Number(n);
  if (!Number.isFinite(v)) return fallback;
  return Math.max(0, Math.floor(v));
}

function seedDemoOrders(items: Equipment[]): LocalRentalOrder[] {
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

  const mk = (i: number, eq: Equipment, startOff: number, endOff: number): LocalRentalOrder => {
    const start = iso(plusDays(startOff));
    const end = iso(plusDays(endOff));
    const days = Math.max(1, endOff - startOff);
    const qty = 1;

    // simple pricing demo using dayRate
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
      createdAt: new Date().toISOString(),
    };
  };

  if (!items.length) return [];
  return [mk(1, a, 0, 3), mk(2, b ?? a, 5, 9)];
}

export default function AdminRentalOrdersPage() {
  const router = useRouter();

  const [items, setItems] = useState<Equipment[]>([]);
  const [loadingInv, setLoadingInv] = useState(true);

  const [orders, setOrders] = useState<LocalRentalOrder[]>([]);
  const [diagnostics, setDiagnostics] = useState<{
    key: string;
    found: boolean;
    rawBytes: number;
    parseOk: boolean;
    parseError?: string;
    parsedType: string;
    migratedFrom?: string;
  } | null>(null);

  const [invoices, setInvoices] = useState<Invoice[]>([]);

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

  function refreshOrders() {
    const { orders: next, diagnostics: diag } = readOrdersWithMigration();
    setOrders(next);
    setDiagnostics(diag);
  }

  function refreshInvoices() {
    setInvoices(localInvoiceRepo.list());
    setLoadingInv(false);
  }

  useEffect(() => {
    refreshInventory().then(() => {
      // once equipment is available, refresh orders
      refreshOrders();
    });
    refreshInvoices();
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, []);

  function onClearOrders() {
    writeOrders([]);
    refreshOrders();
  }

  function onSeedOrders() {
    const seed = seedDemoOrders(items);
    if (!seed.length) return;
    writeOrders(seed);
    refreshOrders();
  }

  function findInvoiceForOrder(orderId: string) {
    return invoices.find((x) => x.orderId === orderId && x.status !== "void");
  }

  function onCreateOrViewInvoice(o: LocalRentalOrder) {
    const existing = findInvoiceForOrder(o.id);
    const inv =
      existing ??
      localInvoiceRepo.createDraftFromOrder({
        orderId: o.id,
        equipmentTitle: o.equipmentTitle,
        qty: o.qty,
        start: o.start,
        end: o.end,
        pricingSnapshot: o.pricingSnapshot,
      });

    refreshInvoices();
    router.push(`/admin/rental/invoices/${encodeURIComponent(inv.id)}`);
  }

  return (
    <div className="mx-auto max-w-6xl p-4">
      <div className="flex items-start justify-between gap-4">
        <div>
          <h1 className="text-2xl font-semibold text-slate-900">Rental Orders (Mock)</h1>
          <p className="mt-1 text-sm text-slate-600">
            Frontend-only (localStorage). Orders key: <span className="font-mono">{ORDERS_LS_KEY}</span>
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
            onClick={refreshOrders}
            className="rounded-lg border border-slate-200 bg-white px-3 py-2 text-sm font-medium text-slate-700 hover:bg-slate-50"
          >
            Refresh
          </button>

          <button
            onClick={onSeedOrders}
            className="rounded-lg bg-slate-900 px-3 py-2 text-sm font-semibold text-white hover:bg-slate-800 disabled:bg-slate-300"
            disabled={!items.length}
            title={!items.length ? "Load inventory first" : "Create demo orders in localStorage"}
          >
            Seed demo orders
          </button>

          <button
            onClick={onClearOrders}
            className="rounded-lg border border-slate-200 bg-white px-3 py-2 text-sm font-medium text-slate-700 hover:bg-slate-50"
          >
            Clear orders
          </button>
        </div>
      </div>

      {/* Diagnostics */}
      {diagnostics && (
        <div className="mt-4 rounded-2xl border border-slate-200 bg-white p-4 text-xs text-slate-700">
          <div className="flex flex-wrap gap-x-6 gap-y-2">
            <div>
              <span className="font-semibold">Storage:</span>{" "}
              {diagnostics.found ? "FOUND" : "MISSING"} • {diagnostics.rawBytes} chars
            </div>
            <div>
              <span className="font-semibold">Parse:</span>{" "}
              {diagnostics.parseOk ? "OK" : `ERROR: ${diagnostics.parseError ?? "unknown"}`}
            </div>
            <div>
              <span className="font-semibold">Type:</span> {diagnostics.parsedType}
            </div>
            {diagnostics.migratedFrom && (
              <div className="text-emerald-700">
                <span className="font-semibold">Migrated from:</span> {diagnostics.migratedFrom}
              </div>
            )}
          </div>
          <div className="mt-2 text-[11px] text-slate-500">
            If this shows MISSING, your orders were never saved under this key on the current domain/origin.
            If Type is not “array”, your stored data shape changed.
          </div>
        </div>
      )}

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
      {orders.length === 0 ? (
        <div className="mt-6 rounded-xl border border-slate-200 bg-white p-6 text-sm text-slate-600">
          No rental orders found in localStorage. Most common reasons:
          <ul className="mt-2 list-disc pl-5 text-sm text-slate-600">
            <li>Checkout is writing to a different localStorage key.</li>
            <li>You changed domain/port (localStorage is per origin).</li>
            <li>The stored JSON is not an array anymore (shape changed).</li>
          </ul>
          <div className="mt-3 text-sm">
            For demo, click <span className="font-semibold">Seed demo orders</span>.
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
                        {o.start} → {o.end}
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
                              {loadingInv ? "…" : inv.status.toUpperCase()}
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
            Orders key: <span className="font-mono">{ORDERS_LS_KEY}</span> • Invoices key:{" "}
            <span className="font-mono">cms_rental_invoices_v1</span>.
          </div>
        </div>
      )}
    </div>
  );
}