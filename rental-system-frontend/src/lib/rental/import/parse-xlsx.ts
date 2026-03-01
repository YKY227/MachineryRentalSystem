import type { ImportedEquipment } from "./types";
import * as XLSX from "xlsx";

function normalizeHeader(s: unknown) {
  return String(s ?? "")
    .trim()
    .toLowerCase()
    .replace(/[\s\-_]+/g, "") // remove spaces/dashes/underscores
    .replace(/[^\w]/g, "");  // remove punctuation
}

function parseNumber(v: unknown): number | undefined {
  if (v == null || v === "") return undefined;
  if (typeof v === "number" && Number.isFinite(v)) return v;

  const s = String(v)
    .replace(/[,]/g, "")
    .replace(/[^\d.-]/g, "")
    .trim();

  if (!s) return undefined;
  const n = Number(s);
  return Number.isFinite(n) ? n : undefined;
}

function safeString(v: unknown): string {
  return String(v ?? "").trim();
}

function makeLocalId(itemcode: string, idx: number) {
  const base = itemcode ? itemcode.trim().toLowerCase() : `row-${idx + 1}`;
  return `imp-${base.replace(/[^\w]+/g, "-")}-${idx + 1}`;
}

export async function parseEquipmentXlsx(file: File): Promise<ImportedEquipment[]> {
  const buf = await file.arrayBuffer();
  const wb = XLSX.read(buf, { type: "array" });
  const sheetName = wb.SheetNames[0];
  if (!sheetName) return [];

  const ws = wb.Sheets[sheetName];
  const rawRows = XLSX.utils.sheet_to_json<Record<string, unknown>>(ws, {
    defval: "",
    raw: true,
  });

  // Build header map (normalized -> actual key)
  // We’ll map per-row by scanning keys.
  const toRow = (r: Record<string, unknown>, idx: number): ImportedEquipment => {
    const get = (wanted: string) => {
      const target = normalizeHeader(wanted);
      for (const k of Object.keys(r)) {
        if (normalizeHeader(k) === target) return r[k];
      }
      return undefined;
    };

    const itemcode = safeString(get("Itemcode"));
    const itemName = safeString(get("ItemName"));

    return {
      localId: makeLocalId(itemcode, idx),
      status: "draft",
      itemcode,
      itemName,
      uom: safeString(get("UOM")) || undefined,
      rentalQty: parseNumber(get("Rental Qty")),
      dayPrice: parseNumber(get("Day Price")),
      weekPrice: parseNumber(get("Week Price")),
      monthPrice: parseNumber(get("Month Price")),
      sellingPrice: parseNumber(get("Selling Price")),
      images: [],
      // enriched fields default empty
      category: undefined,
      shortDesc: undefined,
      specs: undefined,
      keyFeatures: [],
      applications: [],
    };
  };

  // Filter out completely empty rows
  const items = rawRows
    .map((r, idx) => toRow(r, idx))
    .filter((x) => x.itemcode || x.itemName);

  return items;
}
