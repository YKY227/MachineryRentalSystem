// src/lib/rental/invoices/local-invoice-repo.ts
"use client";

import type { Invoice } from "./types";

export const INVOICES_LS_KEY = "cms_rental_invoices_v1";

/** ---------- small utils ---------- */
function nowISO() {
  return new Date().toISOString();
}

function uid(prefix = "inv") {
  // simple unique id for demo; replace with uuid later if you like
  return `${prefix}_${Math.random().toString(16).slice(2)}_${Date.now().toString(16)}`;
}

function roundToInt(n: number) {
  return Math.round(n);
}

function clampCents(n: number) {
  if (!Number.isFinite(n)) return 0;
  return Math.max(0, Math.round(n));
}

function pad5(n: number) {
  return String(n).padStart(5, "0");
}

function monthKeyFromISO(iso: string) {
  const d = new Date(iso);
  const y = d.getFullYear();
  const m = String(d.getMonth() + 1).padStart(2, "0");
  return `${y}${m}`;
}

function counterKey(periodYYYYMM: string) {
  return `cms_rental_invoice_counter_${periodYYYYMM}`;
}

function readCounter(periodYYYYMM: string) {
  if (typeof window === "undefined") return 0;
  const raw = localStorage.getItem(counterKey(periodYYYYMM));
  const v = raw ? Number(raw) : 0;
  return Number.isFinite(v) ? v : 0;
}

function writeCounter(periodYYYYMM: string, value: number) {
  if (typeof window === "undefined") return;
  localStorage.setItem(counterKey(periodYYYYMM), String(value));
}

/** ---------- storage ---------- */
function readAll(): Invoice[] {
  if (typeof window === "undefined") return [];
  try {
    const raw = localStorage.getItem(INVOICES_LS_KEY);
    if (!raw) return [];
    const parsed = JSON.parse(raw);
    return Array.isArray(parsed) ? (parsed as Invoice[]) : [];
  } catch {
    return [];
  }
}

function writeAll(items: Invoice[]) {
  if (typeof window === "undefined") return;
  localStorage.setItem(INVOICES_LS_KEY, JSON.stringify(items));
}

/** ---------- public types ---------- */
export type DraftFromOrderInput = {
  orderId: string;
  equipmentTitle: string;
  qty: number;
  start: string; // YYYY-MM-DD
  end: string; // YYYY-MM-DD
  pricingSnapshot: {
    rentalSubtotal: number;
    deliveryFee: number;
    collectionFee: number;
    deposit: number;
    total: number;
  };
};

/** ---------- repo ---------- */
export const localInvoiceRepo = {
  list(): Invoice[] {
    return readAll().sort((a, b) => (b.updatedAt || "").localeCompare(a.updatedAt || ""));
  },

  get(id: string): Invoice | undefined {
    return readAll().find((x) => x.id === id);
  },

  findByOrderId(orderId: string): Invoice | undefined {
    // “one invoice per order” — ignore voided invoices
    return readAll().find((x) => x.orderId === orderId && x.status !== "void");
  },

  createDraftFromOrder(order: DraftFromOrderInput): Invoice {
    const existing = this.findByOrderId(order.orderId);
    if (existing) return existing;

    // For demo: invoice covers rental charges + delivery/collection fees,
    // excludes refundable deposit from GST totals
    const charges =
      (order.pricingSnapshot?.rentalSubtotal ?? 0) +
      (order.pricingSnapshot?.deliveryFee ?? 0) +
      (order.pricingSnapshot?.collectionFee ?? 0);

    const chargesCents = clampCents(charges * 100);
    const depositCents = clampCents((order.pricingSnapshot?.deposit ?? 0) * 100);

    const gstRate = 0.09; // snapshot
    const gstAmountCents = roundToInt(chargesCents * gstRate);
    const totalInclGstCents = chargesCents + gstAmountCents;

    const createdAt = nowISO();

    const draft: Invoice = {
      id: uid("inv"),
      status: "draft",

      orderId: order.orderId,

      currency: "SGD",
      pricesIncludeGst: false,
      gstRate,

      supplier: {
        name: "Your Company Name (Demo)",
        uen: "",
        gstRegNo: "",
        addressLines: ["Address line 1", "Singapore"],
        email: "billing@yourcompany.com",
      },

      billTo: {
        name: "Customer (Demo)",
        addressLines: ["—"],
        email: "",
      },

      items: [
        {
          description: `${order.equipmentTitle} (Rental ${order.start} → ${order.end})`,
          qty: Math.max(1, order.qty || 1),
          unitPriceExclGstCents:
            order.qty > 0 ? Math.floor(chargesCents / Math.max(1, order.qty)) : chargesCents,
          amountExclGstCents: chargesCents,
        },
      ],

      subtotalExclGstCents: chargesCents,
      gstAmountCents,
      totalInclGstCents,

      depositCents: depositCents > 0 ? depositCents : undefined,

      emailLog: [],

      createdAt,
      updatedAt: createdAt,
    };

    const all = readAll();
    all.unshift(draft);
    writeAll(all);
    return draft;
  },

  updateDraft(
    id: string,
    patch: Partial<Pick<Invoice, "billTo" | "supplier" | "items">> & Partial<Invoice>
  ) {
    const all = readAll();
    const idx = all.findIndex((x) => x.id === id);
    if (idx === -1) return;

    const cur = all[idx];
    if (cur.status !== "draft") return;

    const next: Invoice = {
      ...cur,
      ...patch,
      // merge nested snapshots safely
      billTo: patch.billTo ? { ...cur.billTo, ...patch.billTo } : cur.billTo,
      supplier: patch.supplier ? { ...cur.supplier, ...patch.supplier } : cur.supplier,
      items: patch.items ?? cur.items,
      updatedAt: nowISO(),
    };

    all[idx] = next;
    writeAll(all);
  },

  issue(id: string): Invoice {
    const all = readAll();
    const idx = all.findIndex((x) => x.id === id);
    if (idx === -1) throw new Error("Invoice not found");

    const cur = all[idx];
    if (cur.status !== "draft") return cur;

    const issueDate = nowISO();
    const period = monthKeyFromISO(issueDate);

    // local-only counter (demo). In production this becomes atomic backend logic.
    const last = readCounter(period);
    const nextSeq = last + 1;
    writeCounter(period, nextSeq);

    const invoiceNo = `INV-${period}-${pad5(nextSeq)}`;

    const issued: Invoice = {
      ...cur,
      status: "issued",
      invoiceNo,
      issueDate,
      updatedAt: issueDate,
    };

    all[idx] = issued;
    writeAll(all);
    return issued;
  },

  void(id: string, reason: string): Invoice {
    const all = readAll();
    const idx = all.findIndex((x) => x.id === id);
    if (idx === -1) throw new Error("Invoice not found");

    const cur = all[idx];
    if (cur.status !== "issued") return cur;

    const t = nowISO();
    const updated: Invoice = {
      ...cur,
      status: "void",
      voidReason: reason,
      voidedAt: t,
      updatedAt: t,
    };

    all[idx] = updated;
    writeAll(all);
    return updated;
  },

  appendEmailLog(
  id: string,
  entry: Omit<Invoice["emailLog"][number], "id" | "sentAt">
) {
  const all = readAll();
  const idx = all.findIndex((x) => x.id === id);
  if (idx === -1) return;

  const cur = all[idx];

  const nextEntry = {
    id: `email_${Math.random().toString(16).slice(2)}_${Date.now()}`,
    sentAt: nowISO(),
    ...entry,
  };

  const updated: Invoice = {
    ...cur,
    emailLog: [...(cur.emailLog ?? []), nextEntry],
    updatedAt: nowISO(),
  };

  all[idx] = updated;
  writeAll(all);
},

savePdfStorage(id: string, meta: {
  path: string;
  generatedAt: string;
  sha256: string;
}) {
  const all = readAll();
  const idx = all.findIndex((x) => x.id === id);
  if (idx === -1) return;

  all[idx] = {
    ...all[idx],
    pdfStorage: meta,
    updatedAt: new Date().toISOString(),
  };

  writeAll(all);
}


};

