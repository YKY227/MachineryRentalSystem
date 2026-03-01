// src/components/admin/rental/import/EquipmentImportModal.tsx
"use client";

import React, { useEffect, useMemo, useRef, useState } from "react";
import type { ImportedEquipment, ImportedImage } from "@/lib/rental/import/types";

function formatMoney(n?: number) {
  const v = typeof n === "number" && Number.isFinite(n) ? n : 0;
  return new Intl.NumberFormat("en-SG", {
    style: "currency",
    currency: "SGD",
    maximumFractionDigits: 0,
  }).format(v);
}

function splitLines(s: string) {
  return s
    .split("\n")
    .map((x) => x.trim())
    .filter(Boolean);
}

function uid() {
  return Math.random().toString(16).slice(2) + "-" + Date.now().toString(16);
}

export function EquipmentImportModal({
  open,
  item,
  onClose,
  onChange,
  onDelete,
}: {
  open: boolean;
  item: ImportedEquipment | null;
  onClose: () => void;
  onChange: (next: ImportedEquipment) => void;
  onDelete: (localId: string) => void;
}) {
  const fileRef = useRef<HTMLInputElement | null>(null);

  // Local editable buffer
  const [draft, setDraft] = useState<ImportedEquipment | null>(item);

  useEffect(() => {
    setDraft(item);
  }, [item?.localId]);

  // Close on ESC
  useEffect(() => {
    if (!open) return;
    const onKeyDown = (e: KeyboardEvent) => {
      if (e.key === "Escape") onClose();
    };
    window.addEventListener("keydown", onKeyDown);
    return () => window.removeEventListener("keydown", onKeyDown);
  }, [open, onClose]);

  // Lock background scroll while modal is open
  useEffect(() => {
    if (!open) return;
    const prev = document.body.style.overflow;
    document.body.style.overflow = "hidden";
    return () => {
      document.body.style.overflow = prev;
    };
  }, [open]);

  // Cleanup object URLs on unmount (best-effort)
  useEffect(() => {
    return () => {
      // We revoke on remove. If you later add "Close without saving",
      // consider revoking any newly created URLs there too.
    };
  }, []);

  const previewImg = draft?.images?.[0]?.url ?? "";

  const readyIssues = useMemo(() => {
    if (!draft) return [];
    const issues: string[] = [];
    if (!draft.itemcode) issues.push("Itemcode is required");
    if (!draft.itemName) issues.push("Item name is required");
    if (!draft.category) issues.push("Category is required to publish");
    if (!draft.shortDesc) issues.push("Short description is required to publish");
    if (!draft.images?.length) issues.push("At least 1 image is required to publish");
    if (!draft.rentalQty || draft.rentalQty <= 0) issues.push("Rental Qty must be > 0");
    return issues;
  }, [draft]);

  if (!open || !draft) return null;

  const commit = (next: ImportedEquipment) => {
    setDraft(next);
    onChange(next);
  };

  const addImages = (files: FileList | null) => {
    if (!files || !files.length) return;

    const nextImages: ImportedImage[] = Array.from(files).map((f) => {
      const url = URL.createObjectURL(f);
      return { id: uid(), url, file: f };
    });

    commit({
      ...draft,
      images: [...(draft.images ?? []), ...nextImages],
    });
  };

  const removeImage = (imageId: string) => {
    const img = draft.images.find((x) => x.id === imageId);
    if (img?.url?.startsWith("blob:")) URL.revokeObjectURL(img.url);

    commit({
      ...draft,
      images: draft.images.filter((x) => x.id !== imageId),
    });
  };

  const canPublish = readyIssues.length === 0;

  const setStatus = (status: "draft" | "published") => {
    if (status === "published" && !canPublish) {
      commit({ ...draft, status: "draft" });
      return;
    }
    commit({ ...draft, status });
  };

  return (
    <div className="fixed inset-0 z-50">
      <div className="absolute inset-0 bg-black/30" onClick={onClose} />
      <div className="absolute inset-0 p-3 sm:p-6 flex items-center justify-center">
        <div
          role="dialog"
          aria-modal="true"
          className="w-full max-w-6xl h-[92vh] max-h-[92vh] rounded-2xl bg-white shadow-xl border border-slate-200 overflow-hidden flex flex-col"
        >
          {/* Header */}
          <div className="flex items-center justify-between gap-3 px-5 py-4 border-b border-slate-200 bg-white shrink-0">
            <div className="min-w-0">
              <div className="text-xs font-medium text-slate-500">{draft.itemcode || "—"}</div>
              <div className="truncate text-lg font-semibold text-slate-900">
                {draft.itemName || "Untitled item"}
              </div>
            </div>

            <div className="flex items-center gap-2">
              <span
                className={[
                  "rounded-full px-2 py-0.5 text-xs font-semibold",
                  draft.status === "published"
                    ? "bg-emerald-100 text-emerald-700"
                    : "bg-slate-100 text-slate-600",
                ].join(" ")}
                title={draft.status === "published" ? "Published" : "Draft"}
              >
                {draft.status === "published" ? "Published" : "Draft"}
              </span>

              <button
                type="button"
                onClick={() => onDelete(draft.localId)}
                className="rounded-xl border border-rose-200 bg-rose-50 px-3 py-2 text-sm font-semibold text-rose-700 hover:bg-rose-100"
              >
                Remove
              </button>

              <button
                type="button"
                onClick={onClose}
                className="rounded-xl border border-slate-200 bg-white px-3 py-2 text-sm font-semibold text-slate-700 hover:bg-slate-50"
              >
                Close
              </button>
            </div>
          </div>

          {/* Body */}
          <div className="grid grid-cols-1 lg:grid-cols-12 gap-0 flex-1 min-h-0 overflow-hidden">
            {/* Form */}
            <div className="lg:col-span-7 p-5 border-b lg:border-b-0 lg:border-r border-slate-200 overflow-y-auto min-h-0">
              <div className="flex items-center justify-between gap-3">
                <h3 className="text-sm font-semibold text-slate-900">Details</h3>

                <div className="flex items-center gap-2">
                  <button
                    type="button"
                    onClick={() => setStatus("draft")}
                    className={[
                      "rounded-xl px-3 py-2 text-sm font-semibold border",
                      draft.status === "draft"
                        ? "border-slate-300 bg-slate-100 text-slate-900"
                        : "border-slate-200 bg-white text-slate-700 hover:bg-slate-50",
                    ].join(" ")}
                  >
                    Draft
                  </button>
                  <button
                    type="button"
                    onClick={() => setStatus("published")}
                    className={[
                      "rounded-xl px-3 py-2 text-sm font-semibold border",
                      draft.status === "published"
                        ? "border-emerald-300 bg-emerald-100 text-emerald-800"
                        : "border-slate-200 bg-white text-slate-700 hover:bg-slate-50",
                      !canPublish ? "opacity-60" : "",
                    ].join(" ")}
                    title={!canPublish ? "Fix missing fields to publish" : "Publish"}
                  >
                    Publish
                  </button>
                </div>
              </div>

              {!canPublish && (
                <div className="mt-3 rounded-2xl border border-amber-200 bg-amber-50 p-4">
                  <div className="text-sm font-semibold text-amber-800">To publish, fix:</div>
                  <ul className="mt-2 list-disc pl-5 text-sm text-amber-800 space-y-1">
                    {readyIssues.map((x) => (
                      <li key={x}>{x}</li>
                    ))}
                  </ul>
                </div>
              )}

              <div className="mt-4 grid grid-cols-1 sm:grid-cols-2 gap-3">
                <Field label="Itemcode" value={draft.itemcode} readOnly />
                <Field
                  label="Item name"
                  value={draft.itemName}
                  onChange={(v) => commit({ ...draft, itemName: v })}
                />
                <Field
                  label="Category"
                  placeholder="e.g. scissor-lift"
                  value={draft.category ?? ""}
                  onChange={(v) => commit({ ...draft, category: v })}
                />
                <Field
                  label="UOM"
                  value={draft.uom ?? ""}
                  onChange={(v) => commit({ ...draft, uom: v })}
                />

                <NumberField
                  label="Rental Qty"
                  value={draft.rentalQty}
                  onChange={(n) => commit({ ...draft, rentalQty: n })}
                />
                <div className="rounded-2xl border border-slate-200 p-3">
                  <div className="text-xs font-semibold text-slate-700">Prices</div>
                  <div className="mt-2 grid grid-cols-3 gap-2">
                    <NumberField
                      label="Day"
                      value={draft.dayPrice}
                      onChange={(n) => commit({ ...draft, dayPrice: n })}
                      compact
                    />
                    <NumberField
                      label="Week"
                      value={draft.weekPrice}
                      onChange={(n) => commit({ ...draft, weekPrice: n })}
                      compact
                    />
                    <NumberField
                      label="Month"
                      value={draft.monthPrice}
                      onChange={(n) => commit({ ...draft, monthPrice: n })}
                      compact
                    />
                  </div>
                  <div className="mt-2 text-xs text-slate-500">
                    Selling price:{" "}
                    <span className="font-semibold text-slate-800">
                      {formatMoney(draft.sellingPrice)}
                    </span>
                  </div>
                </div>

                <TextArea
                  label="Short description"
                  value={draft.shortDesc ?? ""}
                  onChange={(v) => commit({ ...draft, shortDesc: v })}
                  rows={3}
                />

                <TextArea
                  label="Specs (optional)"
                  value={draft.specs ?? ""}
                  onChange={(v) => commit({ ...draft, specs: v })}
                  rows={4}
                />

                <TextArea
                  label="Key features (one per line)"
                  value={(draft.keyFeatures ?? []).join("\n")}
                  onChange={(v) => commit({ ...draft, keyFeatures: splitLines(v) })}
                  rows={4}
                />

                <TextArea
                  label="Applications (one per line)"
                  value={(draft.applications ?? []).join("\n")}
                  onChange={(v) => commit({ ...draft, applications: splitLines(v) })}
                  rows={4}
                />
              </div>

              {/* Images */}
              <div className="mt-5">
                <div className="flex items-center justify-between gap-3">
                  <h4 className="text-sm font-semibold text-slate-900">Images</h4>
                  <div className="flex items-center gap-2">
                    <input
                      ref={fileRef}
                      type="file"
                      accept="image/*"
                      multiple
                      className="hidden"
                      onChange={(e) => addImages(e.target.files)}
                    />
                    <button
                      type="button"
                      onClick={() => fileRef.current?.click()}
                      className="rounded-xl border border-slate-200 bg-white px-3 py-2 text-sm font-semibold text-slate-700 hover:bg-slate-50"
                    >
                      Upload images
                    </button>
                  </div>
                </div>

                <div className="mt-3 grid grid-cols-2 sm:grid-cols-4 gap-3">
                  {(draft.images ?? []).map((im) => (
                    <div
                      key={im.id}
                      className="overflow-hidden rounded-2xl border border-slate-200 bg-white"
                    >
                      <div className="aspect-[4/3] bg-slate-100">
                        <img src={im.url} alt="Upload" className="h-full w-full object-cover" />
                      </div>
                      <div className="p-2">
                        <button
                          type="button"
                          onClick={() => removeImage(im.id)}
                          className="w-full rounded-xl border border-slate-200 bg-white px-2 py-1.5 text-xs font-semibold text-slate-700 hover:bg-slate-50"
                        >
                          Remove
                        </button>
                      </div>
                    </div>
                  ))}

                  {(!draft.images || draft.images.length === 0) && (
                    <div className="col-span-2 sm:col-span-4 rounded-2xl border border-dashed border-slate-300 p-6 text-center text-sm text-slate-500">
                      No images yet. Upload at least 1 to publish.
                    </div>
                  )}
                </div>
              </div>
            </div>

            {/* Live preview */}
            <div className="lg:col-span-5 p-5 overflow-y-auto min-h-0">
              <div className="lg:sticky lg:top-4 rounded-2xl border border-slate-200 bg-white p-5 shadow-sm">
                <div className="flex items-start justify-between gap-3">
                  <h3 className="text-sm font-semibold text-slate-900">Live preview</h3>
                  <span
                    className={[
                      "rounded-full px-2 py-0.5 text-xs font-semibold",
                      draft.status === "published"
                        ? "bg-emerald-100 text-emerald-700"
                        : "bg-slate-100 text-slate-600",
                    ].join(" ")}
                  >
                    {draft.status === "published" ? "Published" : "Draft"}
                  </span>
                </div>

                <div className="mt-4 overflow-hidden rounded-xl border border-slate-200">
                  <div className="aspect-[4/3] bg-slate-100">
                    {previewImg ? (
                      <img
                        src={previewImg}
                        alt={draft.itemName || "Preview"}
                        className="h-full w-full object-cover"
                      />
                    ) : (
                      <div className="flex h-full w-full items-center justify-center text-sm text-slate-400">
                        No image
                      </div>
                    )}
                  </div>

                  <div className="p-4">
                    <div className="text-xs font-medium text-slate-500">
                      {draft.category ? draft.category : "Uncategorized"}
                    </div>
                    <div className="mt-1 text-lg font-semibold text-slate-900">
                      {draft.itemName || "Untitled item"}
                    </div>

                    <div className="mt-3 grid grid-cols-3 gap-2 text-sm">
                      <div>
                        <div className="text-xs text-slate-500">Day</div>
                        <div className="font-semibold text-slate-900">
                          {formatMoney(draft.dayPrice)}
                        </div>
                      </div>
                      <div>
                        <div className="text-xs text-slate-500">Week</div>
                        <div className="font-semibold text-slate-900">
                          {draft.weekPrice != null ? formatMoney(draft.weekPrice) : "—"}
                        </div>
                      </div>
                      <div>
                        <div className="text-xs text-slate-500">Month</div>
                        <div className="font-semibold text-slate-900">
                          {draft.monthPrice != null ? formatMoney(draft.monthPrice) : "—"}
                        </div>
                      </div>
                    </div>

                    {draft.shortDesc && (
                      <p className="mt-3 text-sm text-slate-700 whitespace-pre-wrap">
                        {draft.shortDesc}
                      </p>
                    )}

                    {(draft.keyFeatures?.length ?? 0) > 0 && (
                      <div className="mt-4">
                        <div className="text-xs font-semibold text-slate-700">Key features</div>
                        <ul className="mt-2 list-disc pl-5 text-sm text-slate-700 space-y-1">
                          {draft.keyFeatures!.slice(0, 6).map((x, i) => (
                            <li key={`${x}-${i}`}>{x}</li>
                          ))}
                        </ul>
                      </div>
                    )}

                    {(draft.applications?.length ?? 0) > 0 && (
                      <div className="mt-4">
                        <div className="text-xs font-semibold text-slate-700">Applications</div>
                        <ul className="mt-2 list-disc pl-5 text-sm text-slate-700 space-y-1">
                          {draft.applications!.slice(0, 6).map((x, i) => (
                            <li key={`${x}-${i}`}>{x}</li>
                          ))}
                        </ul>
                      </div>
                    )}

                    {draft.specs && (
                      <div className="mt-4">
                        <div className="text-xs font-semibold text-slate-700">Specs</div>
                        <div className="mt-2 text-sm text-slate-700 whitespace-pre-wrap">
                          {draft.specs}
                        </div>
                      </div>
                    )}
                  </div>
                </div>

                <div className="mt-4 text-xs text-slate-500">
                  Demo-only: images use local object URLs; later replace via upload service.
                </div>
              </div>
            </div>
          </div>
        </div>
      </div>
    </div>
  );
}

function Field({
  label,
  value,
  onChange,
  placeholder,
  readOnly,
}: {
  label: string;
  value: string;
  onChange?: (v: string) => void;
  placeholder?: string;
  readOnly?: boolean;
}) {
  return (
    <label className="block">
      <div className="text-xs font-semibold text-slate-700">{label}</div>
      <input
        value={value}
        readOnly={readOnly}
        placeholder={placeholder}
        onChange={(e) => onChange?.(e.target.value)}
        className={[
          "mt-1 w-full rounded-xl border border-slate-200 px-3 py-2 text-sm",
          readOnly ? "bg-slate-50 text-slate-600" : "bg-white text-slate-900",
        ].join(" ")}
      />
    </label>
  );
}

function NumberField({
  label,
  value,
  onChange,
  compact,
}: {
  label: string;
  value?: number;
  onChange: (n: number | undefined) => void;
  compact?: boolean;
}) {
  return (
    <label className="block">
      <div className={["text-xs font-semibold text-slate-700", compact ? "" : ""].join(" ")}>
        {label}
      </div>
      <input
        inputMode="decimal"
        value={value ?? ""}
        onChange={(e) => {
          const s = e.target.value.trim();
          if (!s) return onChange(undefined);
          const n = Number(s);
          onChange(Number.isFinite(n) ? n : undefined);
        }}
        className="mt-1 w-full rounded-xl border border-slate-200 px-3 py-2 text-sm bg-white text-slate-900"
      />
    </label>
  );
}

function TextArea({
  label,
  value,
  onChange,
  rows,
}: {
  label: string;
  value: string;
  onChange: (v: string) => void;
  rows: number;
}) {
  return (
    <label className="block sm:col-span-2">
      <div className="text-xs font-semibold text-slate-700">{label}</div>
      <textarea
        value={value}
        rows={rows}
        onChange={(e) => onChange(e.target.value)}
        className="mt-1 w-full rounded-xl border border-slate-200 px-3 py-2 text-sm bg-white text-slate-900"
      />
    </label>
  );
}
