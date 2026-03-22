"use client";

import { useEffect, useMemo, useState } from "react";
import type { Equipment } from "@/lib/rental/types";

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

type EquipmentInventoryProtection = {
  currentTotalUnits: number;
  protectedMinimum: number;
  currentCommittedQty: number;
  currentHeldQty: number;
  currentDowntimeQty: number;
  currentUnavailableQty: number;
  peakCommittedQty: number;
  peakHeldQty: number;
  peakDowntimeQty: number;
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
  if (!item) return emptyEditor(defaultMaintenanceBufferDays);
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
  };
}

function buildPayload(editor: EditorState) {
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
  };
}

function SectionHeader(props: { title: string; description: string }) {
  return (
    <div className="mb-4 border-b border-slate-200 pb-3">
      <div className="text-sm font-semibold text-slate-900">{props.title}</div>
      <div className="mt-1 text-xs text-slate-500">{props.description}</div>
    </div>
  );
}

function FieldBlock(props: {
  label: string;
  hint?: string;
  className?: string;
  children: React.ReactNode;
}) {
  return (
    <label className={["grid gap-1.5", props.className ?? ""].join(" ").trim()}>
      <span className="text-sm font-medium text-slate-700">{props.label}</span>
      {props.hint ? <span className="text-xs text-slate-500">{props.hint}</span> : null}
      {props.children}
    </label>
  );
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
  const [inventoryProtection, setInventoryProtection] = useState<EquipmentInventoryProtection | null>(null);
  const [inventoryProtectionLoading, setInventoryProtectionLoading] = useState(false);

  const orderRevenue = useMemo(
    () => orders.reduce((sum, order) => sum + (order.pricingSnapshot?.total ?? 0), 0),
    [orders]
  );
  const totalUnitsBelowFloor = Boolean(
    editor.id && inventoryProtection && editor.totalUnits < inventoryProtection.protectedMinimum
  );
  const availableUnits = inventoryProtection
    ? Math.max(0, inventoryProtection.currentTotalUnits - inventoryProtection.currentUnavailableQty)
    : null;

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

  async function loadInventoryProtection(equipmentId: string) {
    setInventoryProtectionLoading(true);
    try {
      const res = await fetch(`/api/admin/rental/equipment/${encodeURIComponent(equipmentId)}`, {
        cache: "no-store",
        credentials: "include",
      });
      const data = await res.json().catch(() => ({}));
      if (!res.ok) throw new Error(data?.error ?? "Failed to load equipment inventory context");
      setInventoryProtection((data?.inventoryProtection ?? null) as EquipmentInventoryProtection | null);
    } catch (nextError) {
      console.error("loadInventoryProtection failed", nextError);
      setInventoryProtection(null);
    } finally {
      setInventoryProtectionLoading(false);
    }
  }

  useEffect(() => {
    refreshSettings().catch((nextError) => {
      console.error("refreshSettings failed", nextError);
    });
    refreshInventory();
    setOrders(readOrders());
  }, []);

  useEffect(() => {
    if (!editor.id) {
      setInventoryProtection(null);
      setInventoryProtectionLoading(false);
      return;
    }

    loadInventoryProtection(editor.id).catch((nextError) => {
      console.error("loadInventoryProtection effect failed", nextError);
    });
  }, [editor.id]);

  async function saveEquipment() {
    setSaving(true);
    setNotice(null);
    setError(null);
    try {
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
      if (!res.ok) {
        if (data?.details) {
          setInventoryProtection(data.details as EquipmentInventoryProtection);
        }
        throw new Error(data?.error ?? "Failed to save equipment");
      }
      const saved = (data?.equipment ?? null) as Equipment | null;
      setInventoryProtection((data?.inventoryProtection ?? null) as EquipmentInventoryProtection | null);
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
          <h1 className="text-2xl font-semibold text-slate-900">Rental Inventory</h1>
          <p className="mt-1 text-sm text-slate-600">
            Manage DB-backed rental equipment and publish customer-facing catalog items.
          </p>
        </div>

        <div className="flex items-center gap-2">
          <button type="button" onClick={refreshInventory} className="rounded-lg border border-slate-200 bg-white px-3 py-2 text-sm font-medium text-slate-700 hover:bg-slate-50">Refresh</button>
          <button
            type="button"
            onClick={() => {
              setEditor(emptyEditor(defaultMaintenanceBufferDays));
              setInventoryProtection(null);
              setTab("create");
            }}
            className="rounded-lg bg-sky-600 px-3 py-2 text-sm font-medium text-white hover:bg-sky-700"
          >
            Add equipment
          </button>
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
                    <td className="px-4 py-3"><label className="inline-flex items-center gap-2"><input type="checkbox" checked={item.isPublished} onChange={(event) => togglePublish(item, event.target.checked)} /><span className="text-slate-700">{item.isPublished ? "Yes" : "No"}</span></label></td>
                    <td className="px-4 py-3 text-right"><button type="button" onClick={() => { setEditor(toEditor(item, defaultMaintenanceBufferDays)); setTab("create"); }} className="rounded-lg border border-slate-200 bg-white px-3 py-2 text-sm font-medium text-slate-700 hover:bg-slate-50">Edit</button></td>
                  </tr>
                ))}
                {items.length === 0 && <tr><td colSpan={6} className="px-4 py-6 text-sm text-slate-500">No equipment records found.</td></tr>}
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
              <div className="rounded-xl border border-slate-200 bg-slate-50 p-3">
                <label className="inline-flex items-start gap-2 text-sm">
                  <input type="checkbox" checked={editor.isPublished} onChange={(e) => setEditor((prev) => ({ ...prev, isPublished: e.target.checked }))} />
                  <span>
                    <span className="block font-medium text-slate-700">Published</span>
                    <span className="block text-xs text-slate-500">
                      Published items appear in the customer-facing catalog. Leave unchecked to keep this equipment in draft.
                    </span>
                  </span>
                </label>
              </div>
            </div>

            <div className="mt-6 space-y-8">
              <section>
                <SectionHeader
                  title="Basic Information"
                  description="Core identifying details used across admin, customer browsing, and links."
                />
                <div className="grid gap-4 sm:grid-cols-2">
                  <FieldBlock label="Title" hint="Customer-facing equipment title used in listings and orders.">
                    <input value={editor.title} onChange={(e) => setEditor((prev) => ({ ...prev, title: e.target.value }))} placeholder="e.g. 19ft Electric Scissor Lift" className="rounded-xl border border-slate-200 px-3 py-2 text-sm" />
                  </FieldBlock>
                  <FieldBlock label="Slug" hint="Optional URL slug. Leave blank to derive it from the title.">
                    <input value={editor.slug} onChange={(e) => setEditor((prev) => ({ ...prev, slug: e.target.value }))} placeholder="e.g. 19ft-electric-scissor-lift" className="rounded-xl border border-slate-200 px-3 py-2 text-sm" />
                  </FieldBlock>
                  <FieldBlock label="Category" hint="Used for grouping and filtering in the rental catalog.">
                    <select value={editor.category} onChange={(e) => setEditor((prev) => ({ ...prev, category: e.target.value }))} className="rounded-xl border border-slate-200 px-3 py-2 text-sm"><option value="earthmoving">Earthmoving</option><option value="lifting">Lifting</option><option value="power">Power</option><option value="concreting">Concreting</option><option value="compaction">Compaction</option><option value="cleaning">Cleaning</option></select>
                  </FieldBlock>
                  <FieldBlock label="Display order" hint="Lower numbers appear earlier in admin and public equipment lists.">
                    <input type="number" min={0} value={editor.displayOrder} onChange={(e) => setEditor((prev) => ({ ...prev, displayOrder: Math.max(0, Number(e.target.value || 0)) }))} placeholder="0" className="rounded-xl border border-slate-200 px-3 py-2 text-sm" />
                  </FieldBlock>
                  <FieldBlock label="Brand">
                    <input value={editor.brand} onChange={(e) => setEditor((prev) => ({ ...prev, brand: e.target.value }))} placeholder="e.g. Genie" className="rounded-xl border border-slate-200 px-3 py-2 text-sm" />
                  </FieldBlock>
                  <FieldBlock label="Model">
                    <input value={editor.model} onChange={(e) => setEditor((prev) => ({ ...prev, model: e.target.value }))} placeholder="e.g. GS-1930" className="rounded-xl border border-slate-200 px-3 py-2 text-sm" />
                  </FieldBlock>
                  <FieldBlock label="Description" hint="Short, readable description shown with the equipment record." className="sm:col-span-2">
                    <textarea value={editor.description} onChange={(e) => setEditor((prev) => ({ ...prev, description: e.target.value }))} rows={4} placeholder="Brief overview, typical use cases, and any customer-facing notes." className="rounded-xl border border-slate-200 px-3 py-2 text-sm" />
                  </FieldBlock>
                </div>
              </section>

              <section>
                <SectionHeader
                  title="Inventory and Operations"
                  description="Operational controls that affect availability and safe equipment allocation."
                />
                <div className="grid gap-4 sm:grid-cols-2">
                  <div className="rounded-xl border border-slate-200 p-3 sm:col-span-2">
                    <div className="grid gap-3 sm:grid-cols-[minmax(0,1fr)_minmax(0,1fr)] sm:items-start">
                      <FieldBlock label="Total units" hint="Total rentable units. Reductions below the operational floor are blocked server-side.">
                        <input
                          type="number"
                          min={0}
                          value={editor.totalUnits}
                          onChange={(e) => setEditor((prev) => ({ ...prev, totalUnits: Math.max(0, Number(e.target.value || 0)) }))}
                          placeholder="e.g. 4"
                          className={["rounded-xl border px-3 py-2 text-sm", totalUnitsBelowFloor ? "border-rose-300 bg-rose-50" : "border-slate-200"].join(" ")}
                        />
                        {totalUnitsBelowFloor && (
                          <div className="text-xs text-rose-700">
                            This value is below the current protected minimum of {inventoryProtection?.protectedMinimum ?? 0} unit(s). The backend will reject this reduction.
                          </div>
                        )}
                      </FieldBlock>
                      <div className="rounded-xl bg-slate-50 p-3 text-xs text-slate-600">
                        <div className="font-semibold text-slate-900">Operational floor</div>
                        <div className="mt-1 text-slate-500">Based on current operational commitments</div>
                        {editor.id ? (
                          inventoryProtectionLoading ? (
                            <div className="mt-2">Loading current allocation summary...</div>
                          ) : inventoryProtection ? (
                            <div className="mt-3 space-y-3">
                              <div className="grid gap-2 sm:grid-cols-3">
                                <div className="rounded-lg border border-slate-200 bg-white p-3">
                                  <div className="text-2xl font-semibold text-slate-900">
                                    {inventoryProtection.currentTotalUnits}
                                  </div>
                                  <div className="mt-1 text-[11px] font-medium uppercase tracking-wide text-slate-500">
                                    Total Units
                                  </div>
                                </div>
                                <div className="rounded-lg border border-emerald-200 bg-emerald-50 p-3">
                                  <div className="text-2xl font-semibold text-emerald-900">
                                    {availableUnits ?? 0}
                                  </div>
                                  <div className="mt-1 text-[11px] font-medium uppercase tracking-wide text-emerald-700">
                                    Available Units
                                  </div>
                                </div>
                                <div className="rounded-lg border border-slate-200 bg-white p-3">
                                  <div className="text-2xl font-semibold text-slate-900">
                                    {inventoryProtection.currentUnavailableQty}
                                  </div>
                                  <div className="mt-1 text-[11px] font-medium uppercase tracking-wide text-slate-500">
                                    Unavailable Units
                                  </div>
                                </div>
                              </div>

                              <div className="rounded-lg border border-amber-200 bg-amber-50 p-3">
                                <div className="text-[11px] font-medium uppercase tracking-wide text-amber-700">
                                  Protected Minimum
                                </div>
                                <div className="mt-1 text-2xl font-semibold text-amber-900">
                                  {inventoryProtection.protectedMinimum}
                                </div>
                                <div className="mt-1 text-xs text-amber-800">
                                  Total units cannot be reduced below this value.
                                </div>
                              </div>

                              <div className="grid gap-2 sm:grid-cols-3">
                                <div className="rounded-lg bg-slate-100 p-2.5">
                                  <div className="text-lg font-semibold text-slate-900">
                                    {inventoryProtection.currentHeldQty}
                                  </div>
                                  <div className="mt-0.5 text-[11px] font-medium uppercase tracking-wide text-slate-500">
                                    Holds
                                  </div>
                                </div>
                                <div className="rounded-lg bg-slate-100 p-2.5">
                                  <div className="text-lg font-semibold text-slate-900">
                                    {inventoryProtection.currentDowntimeQty}
                                  </div>
                                  <div className="mt-0.5 text-[11px] font-medium uppercase tracking-wide text-slate-500">
                                    Downtime
                                  </div>
                                </div>
                                <div className="rounded-lg bg-slate-100 p-2.5">
                                  <div className="text-lg font-semibold text-slate-900">
                                    {inventoryProtection.currentCommittedQty}
                                  </div>
                                  <div className="mt-0.5 text-[11px] font-medium uppercase tracking-wide text-slate-500">
                                    Committed
                                  </div>
                                </div>
                              </div>
                            </div>
                          ) : (
                            <div className="mt-2">Inventory protection details are unavailable right now.</div>
                          )
                        ) : (
                          <div className="mt-2">New equipment starts with no operational floor until it has committed allocations.</div>
                        )}
                      </div>
                    </div>
                  </div>
                  <FieldBlock label="Maintenance buffer days" hint="Days kept unavailable after rental return before units are reusable.">
                    <input type="number" min={0} value={editor.maintenanceBufferDays} onChange={(e) => setEditor((prev) => ({ ...prev, maintenanceBufferDays: Math.max(0, Number(e.target.value || 0)) }))} placeholder="e.g. 7" className="rounded-xl border border-slate-200 px-3 py-2 text-sm" />
                  </FieldBlock>
                </div>
              </section>

              <section>
                <SectionHeader
                  title="Pricing"
                  description="Commercial values used for rental pricing, minimum term rules, and deposit guidance."
                />
                <div className="grid gap-4 sm:grid-cols-2">
                  <FieldBlock label="Day rate">
                    <input type="number" min={0} value={editor.dayRate} onChange={(e) => setEditor((prev) => ({ ...prev, dayRate: Math.max(0, Number(e.target.value || 0)) }))} placeholder="e.g. 80" className="rounded-xl border border-slate-200 px-3 py-2 text-sm" />
                  </FieldBlock>
                  <FieldBlock label="Deposit amount" hint="Operational deposit amount shown in pricing and checkout flows.">
                    <input type="number" min={0} value={editor.depositAmount} onChange={(e) => setEditor((prev) => ({ ...prev, depositAmount: Math.max(0, Number(e.target.value || 0)) }))} placeholder="e.g. 500" className="rounded-xl border border-slate-200 px-3 py-2 text-sm" />
                  </FieldBlock>
                  <FieldBlock label="Week rate">
                    <input type="number" min={0} value={editor.weekRate} onChange={(e) => setEditor((prev) => ({ ...prev, weekRate: e.target.value === "" ? "" : Math.max(0, Number(e.target.value)) }))} placeholder="Optional" className="rounded-xl border border-slate-200 px-3 py-2 text-sm" />
                  </FieldBlock>
                  <FieldBlock label="Month rate">
                    <input type="number" min={0} value={editor.monthRate} onChange={(e) => setEditor((prev) => ({ ...prev, monthRate: e.target.value === "" ? "" : Math.max(0, Number(e.target.value)) }))} placeholder="Optional" className="rounded-xl border border-slate-200 px-3 py-2 text-sm" />
                  </FieldBlock>
                  <FieldBlock label="Minimum rental days">
                    <input type="number" min={1} value={editor.minDays} onChange={(e) => setEditor((prev) => ({ ...prev, minDays: Math.max(1, Number(e.target.value || 1)) }))} placeholder="e.g. 1" className="rounded-xl border border-slate-200 px-3 py-2 text-sm" />
                  </FieldBlock>
                </div>
              </section>

              <section>
                <SectionHeader
                  title="Media and Documents"
                  description="Optional assets and reference links used in customer browsing and internal review."
                />
                <div className="grid gap-4 sm:grid-cols-2">
                  <FieldBlock label="Primary image URL" className="sm:col-span-2">
                    <input value={editor.image1} onChange={(e) => setEditor((prev) => ({ ...prev, image1: e.target.value }))} placeholder="https://..." className="rounded-xl border border-slate-200 px-3 py-2 text-sm" />
                  </FieldBlock>
                  <FieldBlock label="Secondary image URL" className="sm:col-span-2">
                    <input value={editor.image2} onChange={(e) => setEditor((prev) => ({ ...prev, image2: e.target.value }))} placeholder="https://..." className="rounded-xl border border-slate-200 px-3 py-2 text-sm" />
                  </FieldBlock>
                  <FieldBlock label="Additional image URL" className="sm:col-span-2">
                    <input value={editor.image3} onChange={(e) => setEditor((prev) => ({ ...prev, image3: e.target.value }))} placeholder="https://..." className="rounded-xl border border-slate-200 px-3 py-2 text-sm" />
                  </FieldBlock>
                  <FieldBlock label="Catalogue URL">
                    <input value={editor.catalogueUrl} onChange={(e) => setEditor((prev) => ({ ...prev, catalogueUrl: e.target.value }))} placeholder="https://..." className="rounded-xl border border-slate-200 px-3 py-2 text-sm" />
                  </FieldBlock>
                  <FieldBlock label="Training video URL">
                    <input value={editor.trainingVideoUrl} onChange={(e) => setEditor((prev) => ({ ...prev, trainingVideoUrl: e.target.value }))} placeholder="https://..." className="rounded-xl border border-slate-200 px-3 py-2 text-sm" />
                  </FieldBlock>
                </div>
              </section>

              <section>
                <SectionHeader
                  title="Content and Merchandising"
                  description="Structured customer-facing supporting content for sales and browsing pages."
                />
                <div className="grid gap-4 sm:grid-cols-2">
                  <FieldBlock label="Key features" hint="One feature per line.">
                    <textarea value={editor.keyFeaturesText} onChange={(e) => setEditor((prev) => ({ ...prev, keyFeaturesText: e.target.value }))} rows={5} placeholder="Low-emission electric drive" className="rounded-xl border border-slate-200 px-3 py-2 text-sm" />
                  </FieldBlock>
                  <FieldBlock label="Applications" hint="One application or use case per line.">
                    <textarea value={editor.applicationsText} onChange={(e) => setEditor((prev) => ({ ...prev, applicationsText: e.target.value }))} rows={5} placeholder="Indoor maintenance" className="rounded-xl border border-slate-200 px-3 py-2 text-sm" />
                  </FieldBlock>
                  <FieldBlock label="Specifications" hint="Use one line per value in the format Key: Value." className="sm:col-span-2">
                    <textarea value={editor.specsText} onChange={(e) => setEditor((prev) => ({ ...prev, specsText: e.target.value }))} rows={6} placeholder={"Working height: 7.8m\nPlatform capacity: 227kg"} className="rounded-xl border border-slate-200 px-3 py-2 text-sm" />
                  </FieldBlock>
                </div>
              </section>
            </div>

            <div className="mt-5 flex flex-col gap-2 sm:flex-row">
              <button type="button" onClick={saveEquipment} disabled={saving} className="inline-flex items-center justify-center rounded-xl bg-sky-600 px-4 py-2.5 text-sm font-semibold text-white hover:bg-sky-700 disabled:cursor-not-allowed disabled:bg-slate-300">{saving ? "Saving..." : editor.id ? "Save changes" : "Create equipment"}</button>
              <button type="button" onClick={() => { setEditor(emptyEditor(defaultMaintenanceBufferDays)); setInventoryProtection(null); }} className="inline-flex items-center justify-center rounded-xl border border-slate-200 bg-white px-4 py-2.5 text-sm font-semibold text-slate-900 hover:bg-slate-50">New entry</button>
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



