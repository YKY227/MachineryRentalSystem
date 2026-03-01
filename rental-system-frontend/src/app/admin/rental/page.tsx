// src/app/admin/rental/page.tsx
"use client";

import { useEffect, useMemo, useState } from "react";
import type { Equipment } from "@/lib/rental/types";
import { localEquipmentRepo } from "@/lib/rental/equipment-repo";

type TabKey = "inventory" | "orders" | "create";

type FulfillmentMode = "deliver" | "self_collect";

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

function AdminCreateEquipmentDemo() {
  type FormState = {
    title: string;
    category: string;
    brand: string;
    model: string;
    totalUnits: number;
    dayRate: number;
    weekRate: number | "";
    monthRate: number | "";
    minDays: number;
    deposit: number;
    image1: string;
    image2: string;
    image3: string;
    specs: string;
    isPublished: boolean;

    keyFeatures: string[];
    applications: string[];
    keyFeatureDraft: string;
    applicationDraft: string;
    

    catalogueUrl: string;         // paste link
  catalogueFile: File | null;   // upload file
  trainingVideoUrl: string;     // paste link
  };

  const [form, setForm] = useState<FormState>({
    title: "",
    category: "general",
    brand: "",
    model: "",
    totalUnits: 1,
    dayRate: 80,
    weekRate: "",
    monthRate: "",
    minDays: 1,
    deposit: 0,
    image1: "",
    image2: "",
    image3: "",
    specs: "",
    isPublished: false,

    keyFeatures: [],
    applications: [],
    keyFeatureDraft: "",
    applicationDraft: "",

    catalogueUrl: "",
  catalogueFile: null,
  trainingVideoUrl: "",
  });

  const [banner, setBanner] = useState<string | null>(null);

  function set<K extends keyof FormState>(key: K, value: FormState[K]) {
    setForm((prev) => ({ ...prev, [key]: value }));
  }

  function reset() {
    setForm({
      title: "",
      category: "general",
      brand: "",
      model: "",
      totalUnits: 1,
      dayRate: 80,
      weekRate: "",
      monthRate: "",
      minDays: 1,
      deposit: 0,
      image1: "",
      image2: "",
      image3: "",
      specs: "",
      isPublished: false,

      keyFeatures: [],
      applications: [],
      keyFeatureDraft: "",
      applicationDraft: "",

       catalogueUrl: "",
    catalogueFile: null,
    trainingVideoUrl: "",
    });
    setBanner(null);
  }

  function addChip(kind: "keyFeatures" | "applications") {
    const draftKey =
      kind === "keyFeatures" ? "keyFeatureDraft" : "applicationDraft";
    const value = (form[draftKey] ?? "").trim();
    if (!value) return;

    setForm((prev) => {
      const existing = prev[kind] ?? [];
      const exists = existing.some(
        (x) => x.toLowerCase() === value.toLowerCase()
      );
      if (exists) return { ...prev, [draftKey]: "" };

      return {
        ...prev,
        [kind]: [...existing, value],
        [draftKey]: "",
      };
    });
  }

  function removeChip(kind: "keyFeatures" | "applications", value: string) {
    setForm((prev) => ({
      ...prev,
      [kind]: (prev[kind] ?? []).filter((x) => x !== value),
    }));
  }

  function fakeSave(kind: "draft" | "publish") {
    if (kind === "publish") setForm((p) => ({ ...p, isPublished: true }));
    setBanner(
      kind === "draft"
        ? "Saved draft (demo only — not persisted yet)."
        : "Published (demo only — later this will write to repo/backend)."
    );
    window.setTimeout(() => setBanner(null), 2500);
  }

  const previewImages = [form.image1, form.image2, form.image3].filter(Boolean);

  return (
    <div className="mt-6 grid gap-6 lg:grid-cols-12">
      {/* Form */}
      <div className="lg:col-span-7">
        <div className="rounded-2xl border border-slate-200 bg-white p-5 shadow-sm">
          <div className="flex items-start justify-between gap-4">
            <div>
              <h2 className="text-lg font-semibold text-slate-900">
                Add equipment (Demo UX)
              </h2>
              <p className="mt-1 text-sm text-slate-600">
                This form is UI-only for now. Next step: wire submit to{" "}
                <span className="font-mono">localEquipmentRepo.create()</span>{" "}
                or backend API.
              </p>
            </div>

            <label className="inline-flex items-center gap-2 text-sm">
              <input
                type="checkbox"
                checked={form.isPublished}
                onChange={(e) => set("isPublished", e.target.checked)}
              />
              <span className="text-slate-700">Published</span>
            </label>
          </div>

          {banner && (
            <div className="mt-4 rounded-xl border border-sky-200 bg-sky-50 px-4 py-3 text-sm text-sky-800">
              {banner}
            </div>
          )}

          <div className="mt-5 grid gap-4 sm:grid-cols-2">
            <div>
              <label className="text-xs font-semibold text-slate-600">
                Title
              </label>
              <input
                value={form.title}
                onChange={(e) => set("title", e.target.value)}
                placeholder="e.g., Genie Scissor Lift 6m"
                className="mt-1 w-full rounded-xl border border-slate-200 bg-white px-3 py-2 text-sm outline-none focus:border-sky-400"
              />
            </div>

            <div>
              <label className="text-xs font-semibold text-slate-600">
                Category
              </label>
              <select
                value={form.category}
                onChange={(e) => set("category", e.target.value)}
                className="mt-1 w-full rounded-xl border border-slate-200 bg-white px-3 py-2 text-sm outline-none focus:border-sky-400"
              >
                <option value="general">General</option>
                <option value="construction">Construction</option>
                <option value="lifting">Lifting</option>
                <option value="power">Power Tools</option>
                <option value="cleaning">Cleaning</option>
              </select>
            </div>

            <div>
              <label className="text-xs font-semibold text-slate-600">
                Brand
              </label>
              <input
                value={form.brand}
                onChange={(e) => set("brand", e.target.value)}
                placeholder="e.g., Genie"
                className="mt-1 w-full rounded-xl border border-slate-200 bg-white px-3 py-2 text-sm outline-none focus:border-sky-400"
              />
            </div>

            <div>
              <label className="text-xs font-semibold text-slate-600">
                Model
              </label>
              <input
                value={form.model}
                onChange={(e) => set("model", e.target.value)}
                placeholder="e.g., GS-1930"
                className="mt-1 w-full rounded-xl border border-slate-200 bg-white px-3 py-2 text-sm outline-none focus:border-sky-400"
              />
            </div>

            <div>
              <label className="text-xs font-semibold text-slate-600">
                Total units
              </label>
              <input
                type="number"
                min={0}
                value={form.totalUnits}
                onChange={(e) =>
                  set("totalUnits", Math.max(0, Number(e.target.value)))
                }
                className="mt-1 w-full rounded-xl border border-slate-200 bg-white px-3 py-2 text-sm outline-none focus:border-sky-400"
              />
            </div>

            <div>
              <label className="text-xs font-semibold text-slate-600">
                Minimum days
              </label>
              <input
                type="number"
                min={1}
                value={form.minDays}
                onChange={(e) =>
                  set("minDays", Math.max(1, Number(e.target.value)))
                }
                className="mt-1 w-full rounded-xl border border-slate-200 bg-white px-3 py-2 text-sm outline-none focus:border-sky-400"
              />
            </div>

            <div>
              <label className="text-xs font-semibold text-slate-600">
                Day rate (SGD)
              </label>
              <input
                type="number"
                min={0}
                value={form.dayRate}
                onChange={(e) =>
                  set("dayRate", Math.max(0, Number(e.target.value)))
                }
                className="mt-1 w-full rounded-xl border border-slate-200 bg-white px-3 py-2 text-sm outline-none focus:border-sky-400"
              />
            </div>

            <div>
              <label className="text-xs font-semibold text-slate-600">
                Deposit (SGD)
              </label>
              <input
                type="number"
                min={0}
                value={form.deposit}
                onChange={(e) =>
                  set("deposit", Math.max(0, Number(e.target.value)))
                }
                className="mt-1 w-full rounded-xl border border-slate-200 bg-white px-3 py-2 text-sm outline-none focus:border-sky-400"
              />
            </div>

            <div>
              <label className="text-xs font-semibold text-slate-600">
                Week rate (optional)
              </label>
              <input
                type="number"
                min={0}
                value={form.weekRate}
                onChange={(e) =>
                  set(
                    "weekRate",
                    e.target.value === ""
                      ? ""
                      : Math.max(0, Number(e.target.value))
                  )
                }
                placeholder="Leave blank"
                className="mt-1 w-full rounded-xl border border-slate-200 bg-white px-3 py-2 text-sm outline-none focus:border-sky-400"
              />
            </div>

            <div>
              <label className="text-xs font-semibold text-slate-600">
                Month rate (optional)
              </label>
              <input
                type="number"
                min={0}
                value={form.monthRate}
                onChange={(e) =>
                  set(
                    "monthRate",
                    e.target.value === ""
                      ? ""
                      : Math.max(0, Number(e.target.value))
                  )
                }
                placeholder="Leave blank"
                className="mt-1 w-full rounded-xl border border-slate-200 bg-white px-3 py-2 text-sm outline-none focus:border-sky-400"
              />
            </div>

            <div className="sm:col-span-2">
              <label className="text-xs font-semibold text-slate-600">
                Image URL #1
              </label>
              <input
                value={form.image1}
                onChange={(e) => set("image1", e.target.value)}
                placeholder="https://..."
                className="mt-1 w-full rounded-xl border border-slate-200 bg-white px-3 py-2 text-sm outline-none focus:border-sky-400"
              />
            </div>
            <div className="sm:col-span-2">
              <label className="text-xs font-semibold text-slate-600">
                Image URL #2
              </label>
              <input
                value={form.image2}
                onChange={(e) => set("image2", e.target.value)}
                placeholder="https://..."
                className="mt-1 w-full rounded-xl border border-slate-200 bg-white px-3 py-2 text-sm outline-none focus:border-sky-400"
              />
            </div>
            <div className="sm:col-span-2">
              <label className="text-xs font-semibold text-slate-600">
                Image URL #3
              </label>
              <input
                value={form.image3}
                onChange={(e) => set("image3", e.target.value)}
                placeholder="https://..."
                className="mt-1 w-full rounded-xl border border-slate-200 bg-white px-3 py-2 text-sm outline-none focus:border-sky-400"
              />
            </div>

            {/* ✅ Catalogue + Training (optional) */}
<div className="sm:col-span-2 grid gap-4 md:grid-cols-2">
  {/* Catalogue */}
  <div className="rounded-2xl border border-slate-200 bg-slate-50 p-4">
    <label className="text-xs font-semibold text-slate-600">
      Catalogue (optional)
    </label>
    <p className="mt-1 text-xs text-slate-500">
      Upload a PDF (or image) <span className="font-semibold">or</span> paste a link.
    </p>

    <div className="mt-3 grid gap-3">
      {/* Upload */}
      <div>
        <div className="text-[11px] font-semibold uppercase tracking-wide text-slate-500">
          Upload
        </div>

        <input
          type="file"
          accept=".pdf,image/*"
          onChange={(e) => {
            const f = e.target.files?.[0] ?? null;
            set("catalogueFile", f);
          }}
          className="mt-1 w-full rounded-xl border border-slate-200 bg-white px-3 py-2 text-sm outline-none focus:border-sky-400"
        />

        {form.catalogueFile ? (
          <div className="mt-2 flex items-center justify-between gap-2 rounded-xl border border-slate-200 bg-white px-3 py-2">
            <div className="min-w-0">
              <div className="truncate text-xs font-semibold text-slate-700">
                {form.catalogueFile.name}
              </div>
              <div className="text-[11px] text-slate-500">
                {(form.catalogueFile.size / 1024).toFixed(0)} KB
              </div>
            </div>
            <button
              type="button"
              onClick={() => set("catalogueFile", null)}
              className="shrink-0 rounded-lg border border-slate-200 bg-white px-2 py-1 text-xs font-semibold text-slate-700 hover:bg-slate-50"
            >
              Remove
            </button>
          </div>
        ) : (
          <div className="mt-2 text-xs text-slate-500">No file selected.</div>
        )}
      </div>

      {/* OR Link */}
      <div>
        <div className="text-[11px] font-semibold uppercase tracking-wide text-slate-500">
          Link
        </div>
        <input
          value={form.catalogueUrl}
          onChange={(e) => set("catalogueUrl", e.target.value)}
          placeholder="https://... (PDF link / product brochure)"
          className="mt-1 w-full rounded-xl border border-slate-200 bg-white px-3 py-2 text-sm outline-none focus:border-sky-400"
        />
        <div className="mt-2 text-[11px] text-slate-500">
          Tip: if you upload a file <span className="font-semibold">and</span> paste a link, you can decide later which one to publish.
        </div>
      </div>
    </div>
  </div>

  {/* Training video link */}
  <div className="rounded-2xl border border-slate-200 bg-slate-50 p-4">
    <label className="text-xs font-semibold text-slate-600">
      Training video link (optional)
    </label>
    <p className="mt-1 text-xs text-slate-500">
      Paste a YouTube/Vimeo/Drive link for operator training.
    </p>

    <div className="mt-3">
      <input
        value={form.trainingVideoUrl}
        onChange={(e) => set("trainingVideoUrl", e.target.value)}
        placeholder="https://youtube.com/watch?v=..."
        className="w-full rounded-xl border border-slate-200 bg-white px-3 py-2 text-sm outline-none focus:border-sky-400"
      />
      {form.trainingVideoUrl.trim() ? (
        <div className="mt-2 text-xs text-slate-600">
          Will appear on the equipment detail page.
        </div>
      ) : (
        <div className="mt-2 text-xs text-slate-500">No link added.</div>
      )}
    </div>
  </div>
</div>

            <div className="sm:col-span-2">
              <label className="text-xs font-semibold text-slate-600">
                Specs / Notes
              </label>
              <textarea
                value={form.specs}
                onChange={(e) => set("specs", e.target.value)}
                placeholder="Key specs, safety notes, power requirements, etc."
                rows={4}
                className="mt-1 w-full rounded-xl border border-slate-200 bg-white px-3 py-2 text-sm outline-none focus:border-sky-400"
              />
            </div>

            {/* ✅ Key features + Applications */}
            <div className="sm:col-span-2 grid gap-4 md:grid-cols-2">
              {/* Key features */}
              <div className="rounded-2xl border border-slate-200 bg-slate-50 p-4">
                <label className="text-xs font-semibold text-slate-600">
                  Key features
                </label>
                <p className="mt-1 text-xs text-slate-500">
                  Add bullet points shown on the equipment detail page.
                </p>

                <div className="mt-3 flex gap-2">
                  <input
                    value={form.keyFeatureDraft}
                    onChange={(e) => set("keyFeatureDraft", e.target.value)}
                    onKeyDown={(e) => {
                      if (e.key === "Enter") {
                        e.preventDefault();
                        addChip("keyFeatures");
                      }
                    }}
                    placeholder="e.g., Electric drive (low-noise)"
                    className="w-full rounded-xl border border-slate-200 bg-white px-3 py-2 text-sm outline-none focus:border-sky-400"
                  />
                  <button
                    type="button"
                    onClick={() => addChip("keyFeatures")}
                    className="rounded-xl bg-slate-900 px-3 py-2 text-sm font-semibold text-white hover:bg-slate-800"
                  >
                    Add
                  </button>
                </div>

                {form.keyFeatures.length > 0 ? (
                  <div className="mt-3 flex flex-wrap gap-2">
                    {form.keyFeatures.map((x) => (
                      <span
                        key={x}
                        className="inline-flex items-center gap-2 rounded-full border border-slate-200 bg-white px-3 py-1 text-xs text-slate-700"
                      >
                        {x}
                        <button
                          type="button"
                          onClick={() => removeChip("keyFeatures", x)}
                          className="rounded-full px-1 text-slate-400 hover:text-slate-700"
                          aria-label={`Remove feature: ${x}`}
                        >
                          ×
                        </button>
                      </span>
                    ))}
                  </div>
                ) : (
                  <div className="mt-3 text-xs text-slate-500">
                    No features added yet.
                  </div>
                )}
              </div>

              {/* Applications */}
              <div className="rounded-2xl border border-slate-200 bg-slate-50 p-4">
                <label className="text-xs font-semibold text-slate-600">
                  Applications
                </label>
                <p className="mt-1 text-xs text-slate-500">
                  Common use cases to help customers choose.
                </p>

                <div className="mt-3 flex gap-2">
                  <input
                    value={form.applicationDraft}
                    onChange={(e) => set("applicationDraft", e.target.value)}
                    onKeyDown={(e) => {
                      if (e.key === "Enter") {
                        e.preventDefault();
                        addChip("applications");
                      }
                    }}
                    placeholder="e.g., Warehouse maintenance"
                    className="w-full rounded-xl border border-slate-200 bg-white px-3 py-2 text-sm outline-none focus:border-sky-400"
                  />
                  <button
                    type="button"
                    onClick={() => addChip("applications")}
                    className="rounded-xl bg-slate-900 px-3 py-2 text-sm font-semibold text-white hover:bg-slate-800"
                  >
                    Add
                  </button>
                </div>

                {form.applications.length > 0 ? (
                  <div className="mt-3 flex flex-wrap gap-2">
                    {form.applications.map((x) => (
                      <span
                        key={x}
                        className="inline-flex items-center gap-2 rounded-full border border-slate-200 bg-white px-3 py-1 text-xs text-slate-700"
                      >
                        {x}
                        <button
                          type="button"
                          onClick={() => removeChip("applications", x)}
                          className="rounded-full px-1 text-slate-400 hover:text-slate-700"
                          aria-label={`Remove application: ${x}`}
                        >
                          ×
                        </button>
                      </span>
                    ))}
                  </div>
                ) : (
                  <div className="mt-3 text-xs text-slate-500">
                    No applications added yet.
                  </div>
                )}
              </div>
            </div>
          </div>

          <div className="mt-5 flex flex-col gap-2 sm:flex-row">
            <button
              type="button"
              onClick={() => fakeSave("draft")}
              className="inline-flex items-center justify-center rounded-xl border border-slate-200 bg-white px-4 py-2.5 text-sm font-semibold text-slate-900 hover:bg-slate-50"
            >
              Save draft (demo)
            </button>
            <button
              type="button"
              onClick={() => fakeSave("publish")}
              className="inline-flex items-center justify-center rounded-xl bg-sky-600 px-4 py-2.5 text-sm font-semibold text-white hover:bg-sky-700"
            >
              Publish (demo)
            </button>
            <button
              type="button"
              onClick={reset}
              className="inline-flex items-center justify-center rounded-xl border border-slate-200 bg-white px-4 py-2.5 text-sm font-semibold text-slate-600 hover:bg-slate-50"
            >
              Reset
            </button>
          </div>
        </div>
      </div>

      {/* Preview */}
      <div className="lg:col-span-5">
        <div className="sticky top-4 rounded-2xl border border-slate-200 bg-white p-5 shadow-sm">
          <div className="flex items-start justify-between gap-3">
            <h3 className="text-sm font-semibold text-slate-900">Live preview</h3>
            <span
              className={[
                "rounded-full px-2 py-0.5 text-xs font-semibold",
                form.isPublished
                  ? "bg-emerald-100 text-emerald-700"
                  : "bg-slate-100 text-slate-600",
              ].join(" ")}
            >
              {form.isPublished ? "Published" : "Draft"}
            </span>
          </div>

          <div className="mt-4 overflow-hidden rounded-xl border border-slate-200">
            <div className="aspect-[4/3] bg-slate-100">
              {previewImages[0] ? (
                <img
                  src={previewImages[0]}
                  alt={form.title || "Preview"}
                  className="h-full w-full object-cover"
                />
              ) : (
                <div className="flex h-full w-full items-center justify-center text-sm text-slate-400">
                  No image
                </div>
              )}
            </div>

            <div className="p-4">
              <div className="text-lg font-semibold text-slate-900">
                {form.title || "Equipment title"}
              </div>
              <div className="mt-1 text-sm text-slate-600">
                {(form.brand || "Brand") +
                  (form.model ? ` • ${form.model}` : "")}
              </div>

              <div className="mt-3 grid gap-2 text-sm">
                <div className="flex items-center justify-between">
                  <span className="text-slate-600">Category</span>
                  <span className="capitalize text-slate-900">{form.category}</span>
                </div>
                <div className="flex items-center justify-between">
                  <span className="text-slate-600">Units</span>
                  <span className="text-slate-900">{form.totalUnits}</span>
                </div>
                <div className="flex items-center justify-between">
                  <span className="text-slate-600">Day rate</span>
                  <span className="font-semibold text-slate-900">
                    ${form.dayRate}
                  </span>
                </div>
                <div className="flex items-center justify-between">
                  <span className="text-slate-600">Week / Month</span>
                  <span className="text-slate-900">
                    {form.weekRate === "" ? "—" : `$${form.weekRate}`} /{" "}
                    {form.monthRate === "" ? "—" : `$${form.monthRate}`}
                  </span>
                </div>
                <div className="flex items-center justify-between">
                  <span className="text-slate-600">Min days</span>
                  <span className="text-slate-900">{form.minDays}</span>
                </div>
                <div className="flex items-center justify-between">
                  <span className="text-slate-600">Deposit</span>
                  <span className="text-slate-900">${form.deposit}</span>
                </div>
              </div>

              {form.specs.trim() && (
                <div className="mt-4 text-xs text-slate-500">
                  {form.specs.trim()}
                </div>
              )}

              {(form.keyFeatures.length > 0 || form.applications.length > 0) && (
                <div className="mt-4 grid gap-3 md:grid-cols-2">
                  <div className="rounded-xl border border-slate-200 bg-slate-50 p-3">
                    <div className="text-[11px] font-semibold uppercase tracking-wide text-slate-500">
                      Key features
                    </div>
                    <ul className="mt-2 space-y-1 text-xs text-slate-700">
                      {(form.keyFeatures.length ? form.keyFeatures : ["—"])
                        .slice(0, 4)
                        .map((x) => (
                          <li key={x} className="flex items-start gap-2">
                            <span className="mt-1 inline-block h-1.5 w-1.5 rounded-full bg-slate-400" />
                            <span>{x}</span>
                          </li>
                        ))}
                    </ul>
                  </div>

                  <div className="rounded-xl border border-slate-200 bg-slate-50 p-3">
                    <div className="text-[11px] font-semibold uppercase tracking-wide text-slate-500">
                      Applications
                    </div>
                    <ul className="mt-2 space-y-1 text-xs text-slate-700">
                      {(form.applications.length ? form.applications : ["—"])
                        .slice(0, 4)
                        .map((x) => (
                          <li key={x} className="flex items-start gap-2">
                            <span className="mt-1 inline-block h-1.5 w-1.5 rounded-full bg-slate-400" />
                            <span>{x}</span>
                          </li>
                        ))}
                    </ul>
                  </div>
                </div>
              )}
            </div>
          </div>

          <div className="mt-4 text-xs text-slate-500">
            Next step: on submit, build an{" "}
            <span className="font-mono">Equipment</span> object and call{" "}
            <span className="font-mono">localEquipmentRepo.create()</span>.
          </div>
        </div>
      </div>
    </div>
  );
}

export default function AdminRentalInventoryPage() {
  const [tab, setTab] = useState<TabKey>("inventory");

  // Inventory
  const [items, setItems] = useState<Equipment[]>([]);
  const [loading, setLoading] = useState(true);

  // Orders
  const [orders, setOrders] = useState<LocalRentalOrder[]>([]);
  const [ordersLoaded, setOrdersLoaded] = useState(false);

  const equipmentById = useMemo(() => {
    const map = new Map<string, Equipment>();
    items.forEach((e) => map.set(e.id, e));
    return map;
  }, [items]);

  async function refreshInventory() {
    setLoading(true);
    const data = await localEquipmentRepo.listAdmin();
    setItems(data);
    setLoading(false);
  }

  function refreshOrders() {
    setOrders(readOrders());
    setOrdersLoaded(true);
  }

  useEffect(() => {
    refreshInventory();
    refreshOrders();
  }, []);

  async function onTogglePublish(id: string, next: boolean) {
    // optimistic UI
    setItems((prev) => prev.map((x) => (x.id === id ? { ...x, isPublished: next } : x)));
    await localEquipmentRepo.togglePublish(id, next);
    await refreshInventory();
  }

  async function onResetInventory() {
    await localEquipmentRepo.resetToSeed();
    await refreshInventory();
  }

  function onClearOrders() {
    writeOrders([]);
    refreshOrders();
  }

  const ordersSummary = useMemo(() => {
    const totalOrders = orders.length;
    const totalRevenue = orders.reduce((sum, o) => sum + (o.pricingSnapshot?.total ?? 0), 0);
    return { totalOrders, totalRevenue };
  }, [orders]);

  return (
    <div className="mx-auto max-w-6xl p-4">
      <div className="flex items-start justify-between gap-4">
        <div>
          <h1 className="text-2xl font-semibold text-slate-900">Rental (Mock)</h1>
          <p className="mt-1 text-sm text-slate-600">
            Frontend-only (localStorage). Inventory controls public catalog. Orders are created from checkout confirmations.
          </p>
        </div>

        <div className="flex items-center gap-2">
          {tab === "inventory" ? (
            <button
              onClick={onResetInventory}
              className="rounded-lg border border-slate-200 bg-white px-3 py-2 text-sm font-medium text-slate-700 hover:bg-slate-50"
            >
              Reset to seed
            </button>
          ) : (
            <button
              onClick={onClearOrders}
              className="rounded-lg border border-slate-200 bg-white px-3 py-2 text-sm font-medium text-slate-700 hover:bg-slate-50"
            >
              Clear orders
            </button>
          )}
        </div>
      </div>

      {/* Tabs */}
      <div className="mt-5 inline-flex rounded-xl border border-slate-200 bg-white p-1">
        <button
          type="button"
          onClick={() => setTab("inventory")}
          className={[
            "rounded-lg px-3 py-2 text-sm font-semibold",
            tab === "inventory" ? "bg-slate-900 text-white" : "text-slate-700 hover:bg-slate-50",
          ].join(" ")}
        >
          Inventory
        </button>

        <button
          type="button"
          onClick={() => setTab("orders")}
          className={[
            "rounded-lg px-3 py-2 text-sm font-semibold",
            tab === "orders" ? "bg-slate-900 text-white" : "text-slate-700 hover:bg-slate-50",
          ].join(" ")}
        >
          Orders
          <span className="ml-2 rounded-full bg-slate-100 px-2 py-0.5 text-xs font-semibold text-slate-700">
            {ordersLoaded ? orders.length : "…"}
          </span>
        </button>

        <button
          type="button"
          onClick={() => setTab("create")}
          className={[
            "rounded-lg px-3 py-2 text-sm font-semibold",
            tab === "create" ? "bg-slate-900 text-white" : "text-slate-700 hover:bg-slate-50",
          ].join(" ")}
        >
          Add Equipment
        </button>
      </div>

      {/* INVENTORY TAB */}
      {tab === "inventory" && (
        <>
          {loading ? (
            <div className="mt-6 rounded-xl border border-slate-200 bg-white p-6 text-sm text-slate-600">
              Loading inventory…
            </div>
          ) : (
            <div className="mt-6 overflow-hidden rounded-xl border border-slate-200 bg-white">
              <table className="w-full text-left text-sm">
                <thead className="bg-slate-50 text-xs uppercase tracking-wide text-slate-500">
                  <tr>
                    <th className="px-4 py-3">Title</th>
                    <th className="px-4 py-3">Category</th>
                    <th className="px-4 py-3">Units</th>
                    <th className="px-4 py-3">Pricing (day / week / month)</th>
                    <th className="px-4 py-3">Published</th>
                  </tr>
                </thead>
                <tbody>
                  {items.map((e) => (
                    <tr key={e.id} className="border-t border-slate-100">
                      <td className="px-4 py-3">
                        <div className="font-medium text-slate-900">{e.title}</div>
                        <div className="text-xs text-slate-500">
                          {e.brand ?? "—"} {e.model ? `• ${e.model}` : ""}
                        </div>
                      </td>
                      <td className="px-4 py-3 capitalize text-slate-700">{e.category}</td>
                      <td className="px-4 py-3 text-slate-700">{e.totalUnits}</td>
                      <td className="px-4 py-3 text-slate-700">
                        ${e.pricing.dayRate} {" / "}
                        {e.pricing.weekRate ? `$${e.pricing.weekRate}` : "—"} {" / "}
                        {e.pricing.monthRate ? `$${e.pricing.monthRate}` : "—"}
                      </td>
                      <td className="px-4 py-3">
                        <label className="inline-flex items-center gap-2">
                          <input
                            type="checkbox"
                            checked={e.isPublished}
                            onChange={(ev) => onTogglePublish(e.id, ev.target.checked)}
                          />
                          <span className="text-slate-700">{e.isPublished ? "Yes" : "No"}</span>
                        </label>
                      </td>
                    </tr>
                  ))}
                </tbody>
              </table>

              <div className="border-t border-slate-100 bg-slate-50 p-3 text-xs text-slate-500">
                Public catalog reads: <span className="font-mono">listPublic()</span> (published only). Admin reads:{" "}
                <span className="font-mono">listAdmin()</span> (all).
              </div>
            </div>
          )}
        </>
      )}

      

      {tab === "create" && <AdminCreateEquipmentDemo />}
    </div>
  );
}
