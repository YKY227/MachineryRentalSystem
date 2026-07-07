"use client";

import { useEffect, useMemo, useState } from "react";
import type {
  Equipment,
  EquipmentSalePriceMode,
  EquipmentSaleStatus,
} from "@/lib/rental/types";

type TabKey = "inventory" | "orders" | "create";
type FulfillmentMode = "deliver" | "self_collect";

type LocalRentalOrder = {
  id: string;
  equipmentTitle: string;
  qty: number;
  start: string;
  end: string;
  fulfillment: FulfillmentMode;
  pricingSnapshot: { total: number };
  createdAt: string;
};

type EditorState = {
  id: string | null;
  title: string;
  slug: string;
  category: string;
  brand: string;
  model: string;
  description: string;
  totalUnits: number;
  maintenanceBufferDays: number;
  dayRate: number;
  weekRate: number | "";
  monthRate: number | "";
  minDays: number;
  depositAmount: number;
  image1: string;
  image2: string;
  image3: string;
  catalogueUrl: string;
  trainingVideoUrl: string;
  keyFeaturesText: string;
  applicationsText: string;
  specsText: string;
  displayOrder: number;
  isPublished: boolean;
  saleEnabled: boolean;
  saleStatus: EquipmentSaleStatus;
  salePriceMode: EquipmentSalePriceMode;
  salePriceCents: number | "";
  saleCondition: string;
  saleWarranty: string;
  saleNotes: string;
  saleFulfillmentDeliver: boolean;
  saleFulfillmentSelfCollect: boolean;
};

const ORDERS_LS_KEY = "cms_rental_orders_v1";

function emptyEditor(defaultMaintenanceBufferDays = 7): EditorState {
  return {
    id: null,
    title: "",
    slug: "",
    category: "earthmoving",
    brand: "",
    model: "",
    description: "",
    totalUnits: 1,
    maintenanceBufferDays: defaultMaintenanceBufferDays,
    dayRate: 80,
    weekRate: "",
    monthRate: "",
    minDays: 1,
    depositAmount: 0,
    image1: "",
    image2: "",
    image3: "",
    catalogueUrl: "",
    trainingVideoUrl: "",
    keyFeaturesText: "",
    applicationsText: "",
    specsText: "",
    displayOrder: 0,
    isPublished: false,
    saleEnabled: false,
    saleStatus: "not_available",
    salePriceMode: "request_quote",
    salePriceCents: "",
    saleCondition: "",
    saleWarranty: "",
    saleNotes: "",
    saleFulfillmentDeliver: false,
    saleFulfillmentSelfCollect: false,
  };
}

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

function saleStatusLabel(status: EquipmentSaleStatus) {
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

function listToText(items?: string[]) {
  return (items ?? []).join("\n");
}

function specsToText(specs?: Record<string, string>) {
  return Object.entries(specs ?? {})
    .map(([key, value]) => `${key}: ${value}`)
    .join("\n");
}

function textToList(value: string) {
  return value.split(/\r?\n/).map((item) => item.trim()).filter(Boolean);
}

function textToSpecs(value: string) {
  return value.split(/\r?\n/).reduce<Record<string, string>>((acc, line) => {
    const index = line.indexOf(":");
    if (index <= 0) return acc;
    const key = line.slice(0, index).trim();
    const item = line.slice(index + 1).trim();
    if (!key || !item) return acc;
    acc[key] = item;
    return acc;
  }, {});
}

function toEditor(item?: Equipment | null, defaultMaintenanceBufferDays = 7): EditorState {
  if (!item) return emptyEditor();
  return {
    id: item.id,
    title: item.title,
    slug: item.slug ?? "",
    category: item.category,
    brand: item.brand ?? "",
    model: item.model ?? "",
    description: item.description ?? item.shortDesc ?? "",
    totalUnits: item.totalUnits,
    maintenanceBufferDays: item.maintenanceBufferDays ?? defaultMaintenanceBufferDays,
    dayRate: item.pricing.dayRate ?? 0,
    weekRate: item.pricing.weekRate ?? "",
    monthRate: item.pricing.monthRate ?? "",
    minDays: item.pricing.minDays ?? 1,
    depositAmount: item.pricing.deposit ?? 0,
    image1: item.images?.[0] ?? "",
    image2: item.images?.[1] ?? "",
    image3: item.images?.[2] ?? "",
    catalogueUrl: item.catalogueUrl ?? "",
    trainingVideoUrl: item.trainingVideoUrl ?? "",
    keyFeaturesText: listToText(item.keyFeatures),
    applicationsText: listToText(item.applications),
    specsText: specsToText(item.specs),
    displayOrder: item.displayOrder ?? 0,
    isPublished: item.isPublished,
    saleEnabled: item.sale?.enabled ?? false,
    saleStatus: item.sale?.status ?? "not_available",
    salePriceMode: item.sale?.priceMode ?? "request_quote",
    salePriceCents: item.sale?.priceCents ?? "",
    saleCondition: item.sale?.condition ?? "",
    saleWarranty: item.sale?.warranty ?? "",
    saleNotes: item.sale?.notes ?? "",
    saleFulfillmentDeliver: item.sale?.fulfillmentModes?.includes("deliver") ?? false,
    saleFulfillmentSelfCollect: item.sale?.fulfillmentModes?.includes("self_collect") ?? false,
  };
}

function buildPayload(editor: EditorState) {
  const saleFulfillmentModes = [
    editor.saleFulfillmentDeliver ? "deliver" : "",
    editor.saleFulfillmentSelfCollect ? "self_collect" : "",
  ].filter(Boolean);

  return {
    title: editor.title.trim(),
    slug: editor.slug.trim() || undefined,
    category: editor.category.trim(),
    brand: editor.brand,
    model: editor.model,
    description: editor.description,
    shortDesc: editor.description,
    totalUnits: editor.totalUnits,
    maintenanceBufferDays: editor.maintenanceBufferDays,
    dayRate: editor.dayRate,
    weekRate: editor.weekRate === "" ? null : editor.weekRate,
    monthRate: editor.monthRate === "" ? null : editor.monthRate,
    minDays: editor.minDays,
    depositAmount: editor.depositAmount,
    imageUrls: [editor.image1, editor.image2, editor.image3].map((item) => item.trim()).filter(Boolean),
    catalogueUrl: editor.catalogueUrl.trim() || null,
    trainingVideoUrl: editor.trainingVideoUrl.trim() || null,
    keyFeatures: textToList(editor.keyFeaturesText),
    applications: textToList(editor.applicationsText),
    specs: textToSpecs(editor.specsText),
    displayOrder: editor.displayOrder,
    isPublished: editor.isPublished,
    saleEnabled: editor.saleEnabled,
    saleStatus: editor.saleEnabled ? editor.saleStatus : "not_available",
    salePriceMode: editor.salePriceMode,
    salePriceCents:
      editor.salePriceMode === "fixed" && editor.salePriceCents !== ""
        ? Math.max(0, Math.floor(Number(editor.salePriceCents)))
        : null,
    saleCondition: editor.saleCondition.trim() || null,
    saleWarranty: editor.saleWarranty.trim() || null,
    saleNotes: editor.saleNotes.trim() || null,
    saleFulfillmentModes,
  };
}

export default function AdminRentalInventoryPage() {
  const [tab, setTab] = useState<TabKey>("inventory");
  const [items, setItems] = useState<Equipment[]>([]);
  const [orders, setOrders] = useState<LocalRentalOrder[]>([]);
  const [defaultMaintenanceBufferDays, setDefaultMaintenanceBufferDays] = useState(7);
  const [editor, setEditor] = useState<EditorState>(emptyEditor());
  const [loading, setLoading] = useState(true);
  const [saving, setSaving] = useState(false);
  const [notice, setNotice] = useState<string | null>(null);
  const [error, setError] = useState<string | null>(null);

  const orderRevenue = useMemo(
    () => orders.reduce((sum, order) => sum + (order.pricingSnapshot?.total ?? 0), 0),
    [orders]
  );

  async function refreshInventory() {
    setLoading(true);
    setError(null);
    try {
      const res = await fetch("/api/admin/rental/equipment", {
        cache: "no-store",
        credentials: "include",
      });
      const data = await res.json().catch(() => ({}));
      if (!res.ok) throw new Error(data?.error ?? "Failed to load equipment");
      setItems(Array.isArray(data?.equipment) ? (data.equipment as Equipment[]) : []);
    } catch (nextError) {
      setError(nextError instanceof Error ? nextError.message : "Failed to load equipment");
      setItems([]);
    } finally {
      setLoading(false);
    }
  }

  async function refreshSettings() {
    const res = await fetch("/api/admin/settings", {
      cache: "no-store",
      credentials: "include",
    });
    const data = await res.json().catch(() => ({}));
    if (!res.ok) throw new Error(data?.error ?? "Failed to load settings");
    const nextDefault = Math.max(0, Number(data?.operationsPolicy?.defaultMaintenanceBufferDays ?? 7));
    setDefaultMaintenanceBufferDays(nextDefault);
    setEditor((current) =>
      current.id ? current : { ...current, maintenanceBufferDays: nextDefault }
    );
  }

  useEffect(() => {
    refreshSettings().catch((nextError) => {
      console.error("refreshSettings failed", nextError);
    });
    refreshInventory();
    setOrders(readOrders());
  }, []);

  async function saveEquipment() {
    setSaving(true);
    setNotice(null);
    setError(null);
    try {
      if (
        editor.saleEnabled &&
        editor.salePriceMode === "fixed" &&
        (editor.salePriceCents === "" || Number(editor.salePriceCents) <= 0)
      ) {
        throw new Error("Sale price is required when fixed price is selected.");
      }

      const method = editor.id ? "PATCH" : "POST";
      const url = editor.id
        ? `/api/admin/rental/equipment/${encodeURIComponent(editor.id)}`
        : "/api/admin/rental/equipment";
      const res = await fetch(url, {
        method,
        headers: { "Content-Type": "application/json" },
        credentials: "include",
        body: JSON.stringify(buildPayload(editor)),
      });
      const data = await res.json().catch(() => ({}));
      if (!res.ok) throw new Error(data?.error ?? "Failed to save equipment");
      const saved = (data?.equipment ?? null) as Equipment | null;
      await refreshInventory();
      setEditor(toEditor(saved, defaultMaintenanceBufferDays));
      setNotice(editor.id ? "Equipment updated." : "Equipment created.");
      setTab("inventory");
    } catch (nextError) {
      setError(nextError instanceof Error ? nextError.message : "Failed to save equipment");
    } finally {
      setSaving(false);
    }
  }

  async function togglePublish(item: Equipment, isPublished: boolean) {
    setNotice(null);
    setError(null);
    try {
      const res = await fetch(`/api/admin/rental/equipment/${encodeURIComponent(item.id)}`, {
        method: "PATCH",
        headers: { "Content-Type": "application/json" },
        credentials: "include",
        body: JSON.stringify({ isPublished }),
      });
      const data = await res.json().catch(() => ({}));
      if (!res.ok) throw new Error(data?.error ?? "Failed to update publish state");
      await refreshInventory();
      setNotice(isPublished ? "Equipment published." : "Equipment unpublished.");
    } catch (nextError) {
      setError(nextError instanceof Error ? nextError.message : "Failed to update publish state");
    }
  }

  return (
    <div className="mx-auto max-w-6xl p-4">
      <div className="flex items-start justify-between gap-4">
        <div>
          <h1 className="text-2xl font-semibold text-slate-900">Equipment Inventory</h1>
          <p className="mt-1 text-sm text-slate-600">
            Manage DB-backed equipment for rental catalog listings and sale information.
          </p>
        </div>

        <div className="flex items-center gap-2">
          <button type="button" onClick={refreshInventory} className="rounded-lg border border-slate-200 bg-white px-3 py-2 text-sm font-medium text-slate-700 hover:bg-slate-50">Refresh</button>
          <button type="button" onClick={() => { setEditor(emptyEditor(defaultMaintenanceBufferDays)); setTab("create"); }} className="rounded-lg bg-sky-600 px-3 py-2 text-sm font-medium text-white hover:bg-sky-700">Add equipment</button>
        </div>
      </div>

      {(notice || error) && (
        <div className={["mt-4 rounded-xl border px-4 py-3 text-sm", error ? "border-rose-200 bg-rose-50 text-rose-700" : "border-emerald-200 bg-emerald-50 text-emerald-700"].join(" ")}>
          {error ?? notice}
        </div>
      )}

      <div className="mt-5 inline-flex rounded-xl border border-slate-200 bg-white p-1">
        {(["inventory", "orders", "create"] as TabKey[]).map((key) => (
          <button key={key} type="button" onClick={() => setTab(key)} className={["rounded-lg px-3 py-2 text-sm font-semibold", tab === key ? "bg-slate-900 text-white" : "text-slate-700 hover:bg-slate-50"].join(" ")}>
            {key === "create" ? (editor.id ? "Edit equipment" : "Add equipment") : key === "orders" ? `Orders (${orders.length})` : "Inventory"}
          </button>
        ))}
      </div>

      {tab === "inventory" && (
        loading ? (
          <div className="mt-6 rounded-xl border border-slate-200 bg-white p-6 text-sm text-slate-600">Loading inventory...</div>
        ) : (
          <div className="mt-6 overflow-hidden rounded-xl border border-slate-200 bg-white">
            <table className="w-full text-left text-sm">
              <thead className="bg-slate-50 text-xs uppercase tracking-wide text-slate-500">
                <tr>
                  <th className="px-4 py-3">Title</th>
                  <th className="px-4 py-3">Category</th>
                  <th className="px-4 py-3">Units</th>
                  <th className="px-4 py-3">Pricing</th>
                  <th className="px-4 py-3">Sale</th>
                  <th className="px-4 py-3">Published</th>
                  <th className="px-4 py-3 text-right">Actions</th>
                </tr>
              </thead>
              <tbody>
                {items.map((item) => (
                  <tr key={item.id} className="border-t border-slate-100">
                    <td className="px-4 py-3"><div className="font-medium text-slate-900">{item.title}</div><div className="text-xs text-slate-500">{item.brand ?? "-"} {item.model ? `• ${item.model}` : ""}</div></td>
                    <td className="px-4 py-3 capitalize text-slate-700">{item.category}</td>
                    <td className="px-4 py-3 text-slate-700">{item.totalUnits}</td>
                    <td className="px-4 py-3 text-slate-700">{formatMoney(item.pricing.dayRate)} / {item.pricing.weekRate ? formatMoney(item.pricing.weekRate) : "-"} / {item.pricing.monthRate ? formatMoney(item.pricing.monthRate) : "-"}</td>
                    <td className="px-4 py-3 text-slate-700">
                      {item.sale?.enabled ? (
                        <div>
                          <div className="font-medium text-slate-900">{saleStatusLabel(item.sale.status)}</div>
                          <div className="text-xs text-slate-500">
                            {item.sale.priceMode === "fixed" && item.sale.priceCents !== undefined
                              ? formatCents(item.sale.priceCents)
                              : "Request quote"}
                          </div>
                        </div>
                      ) : (
                        <span className="text-slate-400">Not for sale</span>
                      )}
                    </td>
                    <td className="px-4 py-3"><label className="inline-flex items-center gap-2"><input type="checkbox" checked={item.isPublished} onChange={(event) => togglePublish(item, event.target.checked)} /><span className="text-slate-700">{item.isPublished ? "Yes" : "No"}</span></label></td>
                    <td className="px-4 py-3 text-right"><button type="button" onClick={() => { setEditor(toEditor(item, defaultMaintenanceBufferDays)); setTab("create"); }} className="rounded-lg border border-slate-200 bg-white px-3 py-2 text-sm font-medium text-slate-700 hover:bg-slate-50">Edit</button></td>
                  </tr>
                ))}
                {items.length === 0 && <tr><td colSpan={7} className="px-4 py-6 text-sm text-slate-500">No equipment records found.</td></tr>}
              </tbody>
            </table>
          </div>
        )
      )}

      {tab === "orders" && (
        <div className="mt-6 rounded-2xl border border-slate-200 bg-white p-5 shadow-sm">
          <div className="grid gap-4 sm:grid-cols-2">
            <div className="rounded-xl border border-slate-200 bg-slate-50 p-4"><div className="text-xs uppercase tracking-wide text-slate-500">Orders captured locally</div><div className="mt-2 text-2xl font-semibold text-slate-900">{orders.length}</div></div>
            <div className="rounded-xl border border-slate-200 bg-slate-50 p-4"><div className="text-xs uppercase tracking-wide text-slate-500">Recorded total</div><div className="mt-2 text-2xl font-semibold text-slate-900">{formatMoney(orderRevenue)}</div></div>
          </div>
          <div className="mt-4 rounded-xl border border-slate-200 bg-slate-50 p-4 text-sm text-slate-600">This tab is left unchanged for now. Production equipment truth has moved to the database.</div>
          {orders.length > 0 && <div className="mt-4 text-xs text-slate-500">Latest order captured: {orders[0]?.equipmentTitle} ({orders[0]?.start} to {orders[0]?.end})</div>}
        </div>
      )}

      {tab === "create" && (
        <div className="mt-6 grid gap-6 lg:grid-cols-12">
          <div className="rounded-2xl border border-slate-200 bg-white p-5 shadow-sm lg:col-span-7">
            <div className="flex items-start justify-between gap-4">
              <div>
                <h2 className="text-lg font-semibold text-slate-900">{editor.id ? "Edit equipment" : "Add equipment"}</h2>
                <p className="mt-1 text-sm text-slate-600">This form writes directly to the DB-backed rental catalog.</p>
              </div>
              <label className="inline-flex items-center gap-2 text-sm"><input type="checkbox" checked={editor.isPublished} onChange={(e) => setEditor((prev) => ({ ...prev, isPublished: e.target.checked }))} /><span className="text-slate-700">Published</span></label>
            </div>

            <div className="mt-5 grid gap-4 sm:grid-cols-2">
              <input value={editor.title} onChange={(e) => setEditor((prev) => ({ ...prev, title: e.target.value }))} placeholder="Title" className="rounded-xl border border-slate-200 px-3 py-2 text-sm" />
              <input value={editor.slug} onChange={(e) => setEditor((prev) => ({ ...prev, slug: e.target.value }))} placeholder="Slug (optional)" className="rounded-xl border border-slate-200 px-3 py-2 text-sm" />
              <select value={editor.category} onChange={(e) => setEditor((prev) => ({ ...prev, category: e.target.value }))} className="rounded-xl border border-slate-200 px-3 py-2 text-sm"><option value="earthmoving">Earthmoving</option><option value="lifting">Lifting</option><option value="power">Power</option><option value="concreting">Concreting</option><option value="compaction">Compaction</option><option value="cleaning">Cleaning</option></select>
              <input type="number" min={0} value={editor.displayOrder} onChange={(e) => setEditor((prev) => ({ ...prev, displayOrder: Math.max(0, Number(e.target.value || 0)) }))} placeholder="Display order" className="rounded-xl border border-slate-200 px-3 py-2 text-sm" />
              <input value={editor.brand} onChange={(e) => setEditor((prev) => ({ ...prev, brand: e.target.value }))} placeholder="Brand" className="rounded-xl border border-slate-200 px-3 py-2 text-sm" />
              <input value={editor.model} onChange={(e) => setEditor((prev) => ({ ...prev, model: e.target.value }))} placeholder="Model" className="rounded-xl border border-slate-200 px-3 py-2 text-sm" />
              <textarea value={editor.description} onChange={(e) => setEditor((prev) => ({ ...prev, description: e.target.value }))} rows={3} placeholder="Description" className="sm:col-span-2 rounded-xl border border-slate-200 px-3 py-2 text-sm" />
              <input type="number" min={0} value={editor.totalUnits} onChange={(e) => setEditor((prev) => ({ ...prev, totalUnits: Math.max(0, Number(e.target.value || 0)) }))} placeholder="Total units" className="rounded-xl border border-slate-200 px-3 py-2 text-sm" />
              <input type="number" min={0} value={editor.maintenanceBufferDays} onChange={(e) => setEditor((prev) => ({ ...prev, maintenanceBufferDays: Math.max(0, Number(e.target.value || 0)) }))} placeholder="Maintenance buffer days" className="rounded-xl border border-slate-200 px-3 py-2 text-sm" />
              <input type="number" min={0} value={editor.dayRate} onChange={(e) => setEditor((prev) => ({ ...prev, dayRate: Math.max(0, Number(e.target.value || 0)) }))} placeholder="Day rate" className="rounded-xl border border-slate-200 px-3 py-2 text-sm" />
              <input type="number" min={0} value={editor.depositAmount} onChange={(e) => setEditor((prev) => ({ ...prev, depositAmount: Math.max(0, Number(e.target.value || 0)) }))} placeholder="Deposit amount" className="rounded-xl border border-slate-200 px-3 py-2 text-sm" />
              <input type="number" min={0} value={editor.weekRate} onChange={(e) => setEditor((prev) => ({ ...prev, weekRate: e.target.value === "" ? "" : Math.max(0, Number(e.target.value)) }))} placeholder="Week rate" className="rounded-xl border border-slate-200 px-3 py-2 text-sm" />
              <input type="number" min={0} value={editor.monthRate} onChange={(e) => setEditor((prev) => ({ ...prev, monthRate: e.target.value === "" ? "" : Math.max(0, Number(e.target.value)) }))} placeholder="Month rate" className="rounded-xl border border-slate-200 px-3 py-2 text-sm" />
              <input type="number" min={1} value={editor.minDays} onChange={(e) => setEditor((prev) => ({ ...prev, minDays: Math.max(1, Number(e.target.value || 1)) }))} placeholder="Min days" className="rounded-xl border border-slate-200 px-3 py-2 text-sm" />
              <div className="sm:col-span-2 rounded-xl border border-slate-200 bg-slate-50 p-4">
                <div className="flex flex-col gap-3 sm:flex-row sm:items-start sm:justify-between">
                  <div>
                    <div className="text-sm font-semibold text-slate-900">Sales settings</div>
                    <div className="mt-1 text-xs text-slate-500">
                      Manual sale metadata only. Sale stock is separate from rental units and no sale quantity is tracked.
                    </div>
                  </div>
                  <label className="inline-flex items-center gap-2 text-sm text-slate-700">
                    <input
                      type="checkbox"
                      checked={editor.saleEnabled}
                      onChange={(e) => setEditor((prev) => ({
                        ...prev,
                        saleEnabled: e.target.checked,
                        saleStatus: e.target.checked && prev.saleStatus === "not_available"
                          ? "on_request"
                          : prev.saleStatus,
                      }))}
                    />
                    Available for sale
                  </label>
                </div>

                <div className="mt-4 grid gap-3 sm:grid-cols-2">
                  <select
                    value={editor.saleStatus}
                    onChange={(e) => setEditor((prev) => ({ ...prev, saleStatus: e.target.value as EquipmentSaleStatus }))}
                    className="rounded-xl border border-slate-200 bg-white px-3 py-2 text-sm"
                  >
                    <option value="available_for_sale">Available for sale</option>
                    <option value="on_request">On request</option>
                    <option value="sold">Sold</option>
                    <option value="not_available">Not available</option>
                  </select>
                  <select
                    value={editor.salePriceMode}
                    onChange={(e) => setEditor((prev) => ({ ...prev, salePriceMode: e.target.value as EquipmentSalePriceMode }))}
                    className="rounded-xl border border-slate-200 bg-white px-3 py-2 text-sm"
                  >
                    <option value="request_quote">Request quote</option>
                    <option value="fixed">Fixed price</option>
                  </select>
                  {editor.salePriceMode === "fixed" && (
                    <input
                      type="number"
                      min={0.01}
                      step={0.01}
                      value={editor.salePriceCents === "" ? "" : Number(editor.salePriceCents) / 100}
                      onChange={(e) => setEditor((prev) => ({
                        ...prev,
                        salePriceCents:
                          e.target.value === ""
                            ? ""
                            : Math.max(0, Math.round(Number(e.target.value || 0) * 100)),
                      }))}
                      placeholder="Sale price"
                      className="rounded-xl border border-slate-200 bg-white px-3 py-2 text-sm"
                    />
                  )}
                  <input value={editor.saleCondition} onChange={(e) => setEditor((prev) => ({ ...prev, saleCondition: e.target.value }))} placeholder="Condition" className="rounded-xl border border-slate-200 bg-white px-3 py-2 text-sm" />
                  <input value={editor.saleWarranty} onChange={(e) => setEditor((prev) => ({ ...prev, saleWarranty: e.target.value }))} placeholder="Warranty" className="rounded-xl border border-slate-200 bg-white px-3 py-2 text-sm" />
                  <textarea value={editor.saleNotes} onChange={(e) => setEditor((prev) => ({ ...prev, saleNotes: e.target.value }))} rows={3} placeholder="Sales notes" className="sm:col-span-2 rounded-xl border border-slate-200 bg-white px-3 py-2 text-sm" />
                  <div className="sm:col-span-2 flex flex-wrap gap-3">
                    <label className="inline-flex items-center gap-2 rounded-xl border border-slate-200 bg-white px-3 py-2 text-sm text-slate-700">
                      <input
                        type="checkbox"
                        checked={editor.saleFulfillmentDeliver}
                        onChange={(e) => setEditor((prev) => ({ ...prev, saleFulfillmentDeliver: e.target.checked }))}
                      />
                      Delivery
                    </label>
                    <label className="inline-flex items-center gap-2 rounded-xl border border-slate-200 bg-white px-3 py-2 text-sm text-slate-700">
                      <input
                        type="checkbox"
                        checked={editor.saleFulfillmentSelfCollect}
                        onChange={(e) => setEditor((prev) => ({ ...prev, saleFulfillmentSelfCollect: e.target.checked }))}
                      />
                      Self-collect
                    </label>
                  </div>
                </div>
              </div>
              <input value={editor.image1} onChange={(e) => setEditor((prev) => ({ ...prev, image1: e.target.value }))} placeholder="Image URL #1" className="sm:col-span-2 rounded-xl border border-slate-200 px-3 py-2 text-sm" />
              <input value={editor.image2} onChange={(e) => setEditor((prev) => ({ ...prev, image2: e.target.value }))} placeholder="Image URL #2" className="sm:col-span-2 rounded-xl border border-slate-200 px-3 py-2 text-sm" />
              <input value={editor.image3} onChange={(e) => setEditor((prev) => ({ ...prev, image3: e.target.value }))} placeholder="Image URL #3" className="sm:col-span-2 rounded-xl border border-slate-200 px-3 py-2 text-sm" />
              <input value={editor.catalogueUrl} onChange={(e) => setEditor((prev) => ({ ...prev, catalogueUrl: e.target.value }))} placeholder="Catalogue URL" className="rounded-xl border border-slate-200 px-3 py-2 text-sm" />
              <input value={editor.trainingVideoUrl} onChange={(e) => setEditor((prev) => ({ ...prev, trainingVideoUrl: e.target.value }))} placeholder="Training video URL" className="rounded-xl border border-slate-200 px-3 py-2 text-sm" />
              <textarea value={editor.keyFeaturesText} onChange={(e) => setEditor((prev) => ({ ...prev, keyFeaturesText: e.target.value }))} rows={5} placeholder="Key features (one per line)" className="rounded-xl border border-slate-200 px-3 py-2 text-sm" />
              <textarea value={editor.applicationsText} onChange={(e) => setEditor((prev) => ({ ...prev, applicationsText: e.target.value }))} rows={5} placeholder="Applications (one per line)" className="rounded-xl border border-slate-200 px-3 py-2 text-sm" />
              <textarea value={editor.specsText} onChange={(e) => setEditor((prev) => ({ ...prev, specsText: e.target.value }))} rows={6} placeholder={"Specifications\nFormat: Key: Value"} className="sm:col-span-2 rounded-xl border border-slate-200 px-3 py-2 text-sm" />
            </div>

            <div className="mt-5 flex flex-col gap-2 sm:flex-row">
              <button type="button" onClick={saveEquipment} disabled={saving} className="inline-flex items-center justify-center rounded-xl bg-sky-600 px-4 py-2.5 text-sm font-semibold text-white hover:bg-sky-700 disabled:cursor-not-allowed disabled:bg-slate-300">{saving ? "Saving..." : editor.id ? "Save changes" : "Create equipment"}</button>
              <button type="button" onClick={() => setEditor(emptyEditor(defaultMaintenanceBufferDays))} className="inline-flex items-center justify-center rounded-xl border border-slate-200 bg-white px-4 py-2.5 text-sm font-semibold text-slate-900 hover:bg-slate-50">New entry</button>
            </div>
          </div>

          <div className="lg:col-span-5">
            <div className="sticky top-4 rounded-2xl border border-slate-200 bg-white p-5 shadow-sm">
              <div className="flex items-start justify-between gap-3">
                <h3 className="text-sm font-semibold text-slate-900">Live preview</h3>
                <span className={["rounded-full px-2 py-0.5 text-xs font-semibold", editor.isPublished ? "bg-emerald-100 text-emerald-700" : "bg-slate-100 text-slate-600"].join(" ")}>{editor.isPublished ? "Published" : "Draft"}</span>
              </div>
              <div className="mt-4 overflow-hidden rounded-xl border border-slate-200">
                <div className="aspect-[4/3] bg-slate-100">{editor.image1 ? <img src={editor.image1} alt={editor.title || "Preview"} className="h-full w-full object-cover" /> : <div className="flex h-full w-full items-center justify-center text-sm text-slate-400">No image</div>}</div>
                <div className="p-4">
                  <div className="text-lg font-semibold text-slate-900">{editor.title || "Equipment title"}</div>
                  <div className="mt-1 text-sm text-slate-600">{(editor.brand || "Brand") + (editor.model ? ` • ${editor.model}` : "")}</div>
                  <div className="mt-3 text-sm text-slate-600">Units: {editor.totalUnits} • Day rate: {formatMoney(editor.dayRate)}</div>
                  <div className="mt-2 text-xs text-slate-500">
                    Sale:{" "}
                    {editor.saleEnabled
                      ? editor.salePriceMode === "fixed" && editor.salePriceCents !== ""
                        ? `${saleStatusLabel(editor.saleStatus)} • ${formatCents(Number(editor.salePriceCents))}`
                        : `${saleStatusLabel(editor.saleStatus)} • Request quote`
                      : "Not for sale"}
                  </div>
                  {editor.description.trim() && <div className="mt-3 text-xs text-slate-500">{editor.description.trim()}</div>}
                </div>
              </div>
            </div>
          </div>
        </div>
      )}
    </div>
  );
}
