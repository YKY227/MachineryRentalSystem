"use client";

import React, { useMemo, useRef, useState } from "react";
import { parseEquipmentXlsx } from "@/lib/rental/import/parse-xlsx";
import type { ImportedEquipment } from "@/lib/rental/import/types";
import { AdminEquipmentImportCard } from "@/components/admin/rental/import/AdminEquipmentImportCard";
import { EquipmentImportModal } from "@/components/admin/rental/import/EquipmentImportModal";

export default function AdminEquipmentImportPage() {
  const inputRef = useRef<HTMLInputElement | null>(null);

  const [items, setItems] = useState<ImportedEquipment[]>([]);
  const [selectedId, setSelectedId] = useState<string | null>(null);
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState<string | null>(null);

  const selected = useMemo(
    () => items.find((x) => x.localId === selectedId) ?? null,
    [items, selectedId]
  );

  const publishedCount = useMemo(
    () => items.filter((x) => x.status === "published").length,
    [items]
  );

  const handleUpload = async (file: File | null) => {
    if (!file) return;
    setBusy(true);
    setError(null);

    try {
      const parsed = await parseEquipmentXlsx(file);

      // IMPORTANT: revoke any existing blob URLs before replacing list
      for (const it of items) {
        for (const im of it.images ?? []) {
          if (im.url?.startsWith("blob:")) URL.revokeObjectURL(im.url);
        }
      }

      setItems(parsed);
      setSelectedId(null);
    } catch (e) {
      setError(e instanceof Error ? e.message : "Failed to parse XLSX.");
    } finally {
      setBusy(false);
      if (inputRef.current) inputRef.current.value = "";
    }
  };

  const updateItem = (next: ImportedEquipment) => {
    setItems((prev) => prev.map((x) => (x.localId === next.localId ? next : x)));
  };

  const deleteItem = (localId: string) => {
    setItems((prev) => {
      const found = prev.find((x) => x.localId === localId);
      if (found) {
        for (const im of found.images ?? []) {
          if (im.url?.startsWith("blob:")) URL.revokeObjectURL(im.url);
        }
      }
      return prev.filter((x) => x.localId !== localId);
    });
    if (selectedId === localId) setSelectedId(null);
  };

  const clearAll = () => {
    for (const it of items) {
      for (const im of it.images ?? []) {
        if (im.url?.startsWith("blob:")) URL.revokeObjectURL(im.url);
      }
    }
    setItems([]);
    setSelectedId(null);
  };

  return (
    <div className="mx-auto w-full max-w-6xl px-4 py-8">
      <div className="flex flex-col sm:flex-row sm:items-end sm:justify-between gap-3">
        <div>
          <h1 className="text-2xl font-semibold text-slate-900">Import equipment (XLSX)</h1>
          <p className="mt-1 text-sm text-slate-600">
            Demo-only: parses an Excel sheet and lets you preview/edit items before future backend wiring.
          </p>
        </div>

        <div className="flex items-center gap-2">
          <div className="rounded-2xl border border-slate-200 bg-white px-4 py-2 shadow-sm">
            <div className="text-xs text-slate-500">Items</div>
            <div className="text-sm font-semibold text-slate-900">
              {items.length} total · {publishedCount} published
            </div>
          </div>

          <button
            type="button"
            onClick={clearAll}
            disabled={!items.length}
            className={[
              "rounded-xl border px-3 py-2 text-sm font-semibold",
              items.length
                ? "border-slate-200 bg-white text-slate-700 hover:bg-slate-50"
                : "border-slate-200 bg-white text-slate-400 opacity-60",
            ].join(" ")}
          >
            Clear
          </button>
        </div>
      </div>

      {/* Upload */}
      <div className="mt-6 rounded-2xl border border-slate-200 bg-white p-5 shadow-sm">
        <div className="flex flex-col md:flex-row md:items-center md:justify-between gap-4">
          <div className="min-w-0">
            <div className="text-sm font-semibold text-slate-900">Upload XLSX</div>
            <div className="mt-1 text-sm text-slate-600">
              Expected columns: Itemcode, ItemName, UOM, Rental Qty, Day Price, Week Price, Month Price, Selling Price
            </div>
          </div>

          <div className="flex items-center gap-2">
            <input
              ref={inputRef}
              type="file"
              accept=".xlsx"
              className="hidden"
              onChange={(e) => handleUpload(e.target.files?.[0] ?? null)}
            />
            <button
              type="button"
              onClick={() => inputRef.current?.click()}
              disabled={busy}
              className="rounded-xl bg-slate-900 px-4 py-2 text-sm font-semibold text-white hover:bg-slate-800 disabled:opacity-60"
            >
              {busy ? "Parsing…" : "Choose XLSX"}
            </button>
          </div>
        </div>

        {error && (
          <div className="mt-4 rounded-2xl border border-rose-200 bg-rose-50 p-4 text-sm text-rose-800">
            {error}
          </div>
        )}
      </div>

      {/* List */}
      <div className="mt-6 grid grid-cols-1 md:grid-cols-2 gap-4">
        {items.map((it) => (
          <AdminEquipmentImportCard
            key={it.localId}
            item={it}
            onClick={() => setSelectedId(it.localId)}
          />
        ))}

        {!items.length && (
          <div className="md:col-span-2 rounded-2xl border border-dashed border-slate-300 bg-white p-10 text-center text-sm text-slate-500">
            Upload an XLSX file to see imported equipment cards here.
          </div>
        )}
      </div>

      <EquipmentImportModal
        open={!!selected}
        item={selected}
        onClose={() => setSelectedId(null)}
        onChange={updateItem}
        onDelete={deleteItem}
      />
    </div>
  );
}
