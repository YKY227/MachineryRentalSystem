//rental-system-frontend/src/lib/rental/invoices/db-invoice-repo.ts
import type {
  Invoice,
  InvoiceBillToSnapshot,
  InvoiceEmailLogItem,
  InvoiceEmailSummary,
  InvoiceListSortBy,
  InvoiceListSortDir,
  InvoiceItem,
  InvoiceMetadata,
  InvoicePdfStorage,
  InvoiceStatus,
  InvoiceSupplierSnapshot,
} from "@/lib/rental/invoices/types";
import { calculateRentalCharges, RENTAL_GST_RATE } from "@/lib/rental/orders/pricing";
import { resolveInvoiceBillToContext } from "@/lib/rental/invoices/invoice-bill-to";
import type { RentalOrderCustomerSnapshot } from "@/lib/rental/orders/types";
import { supabaseAdmin } from "@/lib/supabase/server";

const INVOICE_TABLE = process.env.SUPABASE_INVOICES_TABLE ?? "rental_invoices";
const INVOICE_EMAILS_TABLE = process.env.SUPABASE_INVOICE_EMAILS_TABLE ?? "rental_invoice_emails";
const ALLOCATE_INVOICE_NO_RPC = "allocate_rental_invoice_no";
const ORDER_NOT_VOID_FILTER = "void";

export type DraftFromOrderInput = {
  orderId: string;
  customerId?: string;
  customerSnapshot?: RentalOrderCustomerSnapshot;
  equipmentTitle: string;
  qty: number;
  start: string;
  end: string;
  pricingSnapshot: {
    rentalSubtotal: number;
    deliveryFee: number;
    collectionFee: number;
    deposit: number;
    gstAmount?: number;
    payableTotal?: number;
    total: number;
  };
};

export type CreateCustomDraftInvoiceInput = {
  orderId: string;
  billTo: InvoiceBillToSnapshot;
  description: string;
  amountExclGstCents: number;
  depositCents?: number;
  metadata?: InvoiceMetadata;
};

export type InvoiceListFilters = {
  lifecycleStatus?: InvoiceStatus;
};

export type InvoiceListQuery = InvoiceListFilters & {
  page?: number;
  pageSize?: number;
  sortBy?: InvoiceListSortBy;
  sortDir?: InvoiceListSortDir;
};

type InvoiceRow = {
  id: string;
  status: InvoiceStatus;
  order_id: string;
  invoice_no: string | null;
  issue_date: string | null;
  due_date: string | null;
  pdf_storage: InvoicePdfStorage | null;
  currency: "SGD" | null;
  prices_include_gst: boolean | null;
  gst_rate: number | null;
  supplier: InvoiceSupplierSnapshot | null;
  bill_to: InvoiceBillToSnapshot | null;
  items: InvoiceItem[] | null;
  subtotal_excl_gst_cents: number | null;
  gst_amount_cents: number | null;
  total_incl_gst_cents: number | null;
  deposit_cents: number | null;
  metadata: InvoiceMetadata | null;
  email_log: InvoiceEmailLogItem[] | null;
  void_reason: string | null;
  voided_at: string | null;
  created_at: string;
  updated_at: string;
};

type InvoiceEmailRow = {
  id: string;
  invoice_id: string;
  type: InvoiceEmailLogItem["type"];
  to: string;
  cc: string | null;
  subject: string;
  provider: "mock" | "resend" | "ses" | "postmark";
  status: "sent" | "queued" | "failed";
  provider_message_id: string | null;
  pdf_sha256: string | null;
  sent_at: string;
};

// NOTE: `pdf_key` is deprecated and removed from current DB schema.
const BASE_COLUMNS = [
  "id",
  "status",
  "order_id",
  "invoice_no",
  "issue_date",
  "due_date",
  "pdf_storage",
  "currency",
  "prices_include_gst",
  "gst_rate",
  "supplier",
  "bill_to",
  "items",
  "subtotal_excl_gst_cents",
  "gst_amount_cents",
  "total_incl_gst_cents",
  "deposit_cents",
  "metadata",
  "email_log",
  "void_reason",
  "voided_at",
  "created_at",
  "updated_at",
].join(",");

function nowIso() {
  return new Date().toISOString();
}

function monthKeyFromISO(iso: string) {
  const d = new Date(iso);
  const y = d.getUTCFullYear();
  const m = String(d.getUTCMonth() + 1).padStart(2, "0");
  return `${y}${m}`;
}

async function allocateInvoiceNumber(period: string) {
  const supabase = supabaseAdmin();
  const { data, error } = await supabase.rpc(ALLOCATE_INVOICE_NO_RPC, { p_period_key: period });

  if (error) throw new Error(`Invoice number allocation failed: ${error.message}`);
  if (typeof data !== "string" || !data.trim()) {
    throw new Error("Invoice number allocation failed: empty allocator response");
  }

  return data;
}

function toInvoice(row: InvoiceRow): Invoice {
  return {
    id: row.id,
    status: row.status,
    orderId: row.order_id,
    invoiceNo: row.invoice_no ?? undefined,
    issueDate: row.issue_date ?? undefined,
    dueDate: row.due_date ?? undefined,
    pdfStorage: row.pdf_storage ?? undefined,
    currency: row.currency ?? "SGD",
    pricesIncludeGst: false,
    gstRate: Number(row.gst_rate ?? 0),
    supplier: row.supplier ?? { name: "", addressLines: [] },
    billTo: row.bill_to ?? { name: "", addressLines: [] },
    items: Array.isArray(row.items) ? row.items : [],
    subtotalExclGstCents: Number(row.subtotal_excl_gst_cents ?? 0),
    gstAmountCents: Number(row.gst_amount_cents ?? 0),
    totalInclGstCents: Number(row.total_incl_gst_cents ?? 0),
    depositCents: typeof row.deposit_cents === "number" ? row.deposit_cents : undefined,
    metadata: row.metadata ?? undefined,
    emailLog: Array.isArray(row.email_log) ? row.email_log : [],
    voidReason: row.void_reason ?? undefined,
    voidedAt: row.voided_at ?? undefined,
    createdAt: row.created_at,
    updatedAt: row.updated_at,
  };
}

function toEmailLogItem(row: InvoiceEmailRow): InvoiceEmailLogItem {
  return {
    id: row.id,
    type: row.type,
    to: row.to,
    cc: row.cc ?? undefined,
    subject: row.subject,
    sentAt: row.sent_at,
    provider: row.provider,
    status: row.status,
    providerMessageId: row.provider_message_id ?? undefined,
    pdfSha256: row.pdf_sha256 ?? undefined,
  };
}

function buildEmailSummary(rows: InvoiceEmailRow[]): InvoiceEmailSummary {
  const latest = rows[0];
  return {
    emailCount: rows.length,
    lastEmailAt: latest?.sent_at ?? undefined,
    lastEmailType: latest?.type ?? undefined,
    lastEmailTo: latest?.to ?? undefined,
  };
}

function toDbPatch(patch: Partial<Invoice>) {
  const db: Record<string, unknown> = {};

  if (patch.status !== undefined) db.status = patch.status;
  if (patch.orderId !== undefined) db.order_id = patch.orderId;
  if (patch.invoiceNo !== undefined) db.invoice_no = patch.invoiceNo;
  if (patch.issueDate !== undefined) db.issue_date = patch.issueDate;
  if (patch.dueDate !== undefined) db.due_date = patch.dueDate;
  if (patch.pdfStorage !== undefined) db.pdf_storage = patch.pdfStorage;
  if (patch.currency !== undefined) db.currency = patch.currency;
  if (patch.pricesIncludeGst !== undefined) db.prices_include_gst = patch.pricesIncludeGst;
  if (patch.gstRate !== undefined) db.gst_rate = patch.gstRate;
  if (patch.supplier !== undefined) db.supplier = patch.supplier;
  if (patch.billTo !== undefined) db.bill_to = patch.billTo;
  if (patch.items !== undefined) db.items = patch.items;
  if (patch.subtotalExclGstCents !== undefined) db.subtotal_excl_gst_cents = patch.subtotalExclGstCents;
  if (patch.gstAmountCents !== undefined) db.gst_amount_cents = patch.gstAmountCents;
  if (patch.totalInclGstCents !== undefined) db.total_incl_gst_cents = patch.totalInclGstCents;
  if (patch.depositCents !== undefined) db.deposit_cents = patch.depositCents;
  if (patch.metadata !== undefined) db.metadata = patch.metadata;
  if (patch.emailLog !== undefined) db.email_log = patch.emailLog;
  if (patch.voidReason !== undefined) db.void_reason = patch.voidReason;
  if (patch.voidedAt !== undefined) db.voided_at = patch.voidedAt;

  db.updated_at = nowIso();
  return db;
}

function roundToInt(n: number) {
  return Math.round(n);
}

function clampCents(n: number) {
  if (!Number.isFinite(n)) return 0;
  return Math.max(0, Math.round(n));
}

function toDbSortColumn(sortBy?: InvoiceListSortBy) {
  switch (sortBy) {
    case "due_date":
      return "due_date";
    case "total":
      return "total_incl_gst_cents";
    case "invoice_number":
      return "invoice_no";
    case "created_at":
    default:
      return "created_at";
  }
}

function applyListFilters(query: any, filters?: InvoiceListFilters) {
  let next = query;
  if (filters?.lifecycleStatus) {
    next = next.eq("status", filters.lifecycleStatus);
  }
  return next;
}

async function readByIdOrThrow(id: string): Promise<InvoiceRow> {
  const supabase = supabaseAdmin();
  const { data, error } = await supabase
    .from(INVOICE_TABLE)
    .select(BASE_COLUMNS)
    .eq("id", id)
    .maybeSingle<InvoiceRow>();

  if (error) throw new Error(`Invoice read failed: ${error.message}`);
  if (!data) throw new Error("Invoice not found");
  return data;
}

export const dbInvoiceRepo = {
  async listEmails(invoiceId: string): Promise<InvoiceEmailLogItem[]> {
    const supabase = supabaseAdmin();
    const { data, error } = await supabase
      .from(INVOICE_EMAILS_TABLE)
      .select("id,invoice_id,type,to,cc,subject,provider,status,provider_message_id,pdf_sha256,sent_at")
      .eq("invoice_id", invoiceId)
      .order("sent_at", { ascending: false });

    if (error) throw new Error(`Invoice email history read failed: ${error.message}`);
    return ((data ?? []) as unknown as InvoiceEmailRow[]).map(toEmailLogItem);
  },

  async listEmailSummariesByInvoiceIds(invoiceIds: string[]): Promise<Record<string, InvoiceEmailSummary>> {
    if (!invoiceIds.length) return {};

    const supabase = supabaseAdmin();
    const { data, error } = await supabase
      .from(INVOICE_EMAILS_TABLE)
      .select("id,invoice_id,type,to,cc,subject,provider,status,provider_message_id,pdf_sha256,sent_at")
      .in("invoice_id", invoiceIds)
      .order("sent_at", { ascending: false });

    if (error) throw new Error(`Invoice email summary read failed: ${error.message}`);

    const grouped = new Map<string, InvoiceEmailRow[]>();
    for (const row of (data ?? []) as unknown as InvoiceEmailRow[]) {
      const rows = grouped.get(row.invoice_id) ?? [];
      rows.push(row);
      grouped.set(row.invoice_id, rows);
    }

    return Object.fromEntries(
      invoiceIds.map((invoiceId) => [invoiceId, buildEmailSummary(grouped.get(invoiceId) ?? [])])
    );
  },

  async findActiveByOrderId(orderId: string): Promise<Invoice | null> {
    const supabase = supabaseAdmin();
    const { data, error } = await supabase
      .from(INVOICE_TABLE)
      .select(BASE_COLUMNS)
      .eq("order_id", orderId)
      .neq("status", ORDER_NOT_VOID_FILTER)
      .order("updated_at", { ascending: false })
      .limit(1)
      .maybeSingle<InvoiceRow>();

    if (error) throw new Error(`Invoice lookup by order failed: ${error.message}`);
    return data ? toInvoice(data) : null;
  },

  async listByOrderIds(orderIds: string[]): Promise<Invoice[]> {
    if (!orderIds.length) return [];

    const supabase = supabaseAdmin();
    const { data, error } = await supabase
      .from(INVOICE_TABLE)
      .select(BASE_COLUMNS)
      .in("order_id", orderIds)
      .neq("status", ORDER_NOT_VOID_FILTER)
      .order("updated_at", { ascending: false });

    if (error) throw new Error(`Invoice list by orders failed: ${error.message}`);
    return ((data ?? []) as unknown as InvoiceRow[]).map((row) => toInvoice(row));
  },

  async listByIds(invoiceIds: string[]): Promise<Invoice[]> {
    if (!invoiceIds.length) return [];

    const supabase = supabaseAdmin();
    const { data, error } = await supabase
      .from(INVOICE_TABLE)
      .select(BASE_COLUMNS)
      .in("id", invoiceIds);

    if (error) throw new Error(`Invoice list by ids failed: ${error.message}`);
    return ((data ?? []) as unknown as InvoiceRow[]).map((row) => toInvoice(row));
  },

  async listAll(filters?: InvoiceListQuery): Promise<Invoice[]> {
    const supabase = supabaseAdmin();
    const sortColumn = toDbSortColumn(filters?.sortBy);
    const ascending = (filters?.sortDir ?? "desc") === "asc";
    let query = applyListFilters(supabase.from(INVOICE_TABLE).select(BASE_COLUMNS), filters);

    const { data, error } = await query.order(sortColumn, { ascending, nullsFirst: !ascending });

    if (error) throw new Error(`Invoice list failed: ${error.message}`);
    return ((data ?? []) as unknown as InvoiceRow[]).map((row) => toInvoice(row));
  },

  async listPage(filters?: InvoiceListQuery): Promise<{ invoices: Invoice[]; totalItems: number }> {
    const supabase = supabaseAdmin();
    const page = Math.max(1, Number(filters?.page ?? 1));
    const pageSize = Math.max(1, Number(filters?.pageSize ?? 20));
    const sortColumn = toDbSortColumn(filters?.sortBy);
    const ascending = (filters?.sortDir ?? "desc") === "asc";
    const from = (page - 1) * pageSize;
    const to = from + pageSize - 1;

    let query = applyListFilters(
      supabase.from(INVOICE_TABLE).select(BASE_COLUMNS, { count: "exact" }),
      filters
    );
    query = query.order(sortColumn, { ascending, nullsFirst: !ascending }).range(from, to);

    const { data, error, count } = await query;

    if (error) throw new Error(`Invoice paged list failed: ${error.message}`);
    return {
      invoices: ((data ?? []) as unknown as InvoiceRow[]).map((row) => toInvoice(row)),
      totalItems: Number(count ?? 0),
    };
  },

  async get(id: string): Promise<Invoice | null> {
    const supabase = supabaseAdmin();
    const { data, error } = await supabase
      .from(INVOICE_TABLE)
      .select(BASE_COLUMNS)
      .eq("id", id)
      .maybeSingle<InvoiceRow>();

    if (error) throw new Error(`Invoice read failed: ${error.message}`);
    if (!data) return null;

    return toInvoice(data);
  },

  async updateDraft(id: string, patch: Partial<Invoice>): Promise<Invoice> {
    const current = await readByIdOrThrow(id);
    if (current.status !== "draft") throw new Error("Only draft invoices can be updated");

    const next = {
      ...toDbPatch(patch),
      bill_to: patch.billTo ? { ...(current.bill_to ?? {}), ...patch.billTo } : undefined,
      supplier: patch.supplier ? { ...(current.supplier ?? {}), ...patch.supplier } : undefined,
    };

    const supabase = supabaseAdmin();
    const { data, error } = await supabase
      .from(INVOICE_TABLE)
      .update(next)
      .eq("id", id)
      .select(BASE_COLUMNS)
      .single<InvoiceRow>();

    if (error) throw new Error(`Invoice draft update failed: ${error.message}`);
    return toInvoice(data);
  },

  async issue(id: string): Promise<Invoice> {
    const current = await readByIdOrThrow(id);
    if (current.status !== "draft") return toInvoice(current);

    const issueDate = nowIso();
    const period = monthKeyFromISO(issueDate);
    const invoiceNo = current.invoice_no ?? (await allocateInvoiceNumber(period));

    const supabase = supabaseAdmin();
    const { data, error } = await supabase
      .from(INVOICE_TABLE)
      .update({
        status: "issued",
        invoice_no: invoiceNo,
        issue_date: issueDate,
        updated_at: issueDate,
      })
      .eq("id", id)
      .eq("status", "draft")
      .select(BASE_COLUMNS)
      .maybeSingle<InvoiceRow>();

    if (error) throw new Error(`Invoice issue failed: ${error.message}`);
    if (!data) return toInvoice(await readByIdOrThrow(id));
    return toInvoice(data);
  },

  async void(id: string, reason: string): Promise<Invoice> {
    const current = await readByIdOrThrow(id);
    if (current.status !== "issued") return toInvoice(current);

    const now = nowIso();
    const supabase = supabaseAdmin();
    const { data, error } = await supabase
      .from(INVOICE_TABLE)
      .update({
        status: "void",
        void_reason: reason,
        voided_at: now,
        updated_at: now,
      })
      .eq("id", id)
      .select(BASE_COLUMNS)
      .single<InvoiceRow>();

    if (error) throw new Error(`Invoice void failed: ${error.message}`);
    return toInvoice(data);
  },

  async setPdfStorage(id: string, pdfStorage: InvoicePdfStorage): Promise<Invoice> {
    const supabase = supabaseAdmin();
    const { data, error } = await supabase
      .from(INVOICE_TABLE)
      .update({ pdf_storage: pdfStorage, updated_at: nowIso() })
      .eq("id", id)
      .select(BASE_COLUMNS)
      .single<InvoiceRow>();

    if (error) throw new Error(`Invoice PDF storage update failed: ${error.message}`);
    return toInvoice(data);
  },

  async appendEmailLog(id: string, log: Omit<InvoiceEmailLogItem, "id" | "sentAt">): Promise<Invoice> {
    const current = await readByIdOrThrow(id);
    const nextLog: InvoiceEmailLogItem = {
      id: `email_${Math.random().toString(16).slice(2)}_${Date.now()}`,
      sentAt: nowIso(),
      ...log,
    };

    const merged = [...(current.email_log ?? []), nextLog];

    const supabase = supabaseAdmin();
    const { data, error } = await supabase
      .from(INVOICE_TABLE)
      .update({ email_log: merged, updated_at: nowIso() })
      .eq("id", id)
      .select(BASE_COLUMNS)
      .single<InvoiceRow>();

    if (error) throw new Error(`Invoice email log update failed: ${error.message}`);
    return toInvoice(data);
  },

  async createEmailEvent(input: {
    invoiceId: string;
    type: InvoiceEmailLogItem["type"];
    to: string;
    cc?: string;
    subject: string;
    provider: "mock" | "resend" | "ses" | "postmark";
    status: "sent" | "queued" | "failed";
    providerMessageId?: string;
    pdfSha256?: string;
    sentAt?: string;
  }): Promise<InvoiceEmailLogItem> {
    const sentAt = input.sentAt ?? nowIso();
    const supabase = supabaseAdmin();
    const { data, error } = await supabase
      .from(INVOICE_EMAILS_TABLE)
      .insert({
        invoice_id: input.invoiceId,
        type: input.type,
        to: input.to,
        cc: input.cc ?? null,
        subject: input.subject,
        provider: input.provider,
        status: input.status,
        provider_message_id: input.providerMessageId ?? null,
        pdf_sha256: input.pdfSha256 ?? null,
        sent_at: sentAt,
      })
      .select("id,invoice_id,type,to,cc,subject,provider,status,provider_message_id,pdf_sha256,sent_at")
      .single<InvoiceEmailRow>();

    if (error) throw new Error(`Invoice email insert failed: ${error.message}`);
    return toEmailLogItem(data);
  },

  async createDraftFromOrder(order: DraftFromOrderInput): Promise<Invoice> {
    const existing = await dbInvoiceRepo.findActiveByOrderId(order.orderId);
    if (existing) return existing;

    const pricing = calculateRentalCharges(order.pricingSnapshot);
    const chargesCents = clampCents(pricing.chargesExclGst * 100);
    const depositCents = clampCents(pricing.deposit * 100);
    const gstRate = RENTAL_GST_RATE;
    const gstAmountCents = clampCents(pricing.gstAmount * 100);
    const totalInclGstCents = clampCents(pricing.payableTotal * 100);
    const createdAt = nowIso();

    const qty = Math.max(1, Number(order.qty) || 1);
    const billToContext = await resolveInvoiceBillToContext({
      customerId: order.customerId,
      customerSnapshot: order.customerSnapshot,
    });

    const insertPayload = {
      status: "draft" as InvoiceStatus,
      order_id: order.orderId,
      invoice_no: null,
      issue_date: null,
      due_date: null,
      pdf_storage: null,
      currency: "SGD" as const,
      prices_include_gst: false,
      gst_rate: gstRate,
      supplier: {
        name: "Your Company Name (Demo)",
        uen: "",
        gstRegNo: "",
        addressLines: ["Address line 1", "Singapore"],
        email: "billing@yourcompany.com",
      } satisfies InvoiceSupplierSnapshot,
      bill_to: billToContext.billTo,
      items: [
        {
          description: `${order.equipmentTitle} (Rental ${order.start} -> ${order.end})`,
          qty,
          unitPriceExclGstCents: qty > 0 ? Math.floor(chargesCents / qty) : chargesCents,
          amountExclGstCents: chargesCents,
        },
      ] satisfies InvoiceItem[],
      subtotal_excl_gst_cents: chargesCents,
      gst_amount_cents: gstAmountCents,
      total_incl_gst_cents: totalInclGstCents,
      deposit_cents: depositCents > 0 ? depositCents : null,
      metadata: {},
      email_log: [] as InvoiceEmailLogItem[],
      void_reason: null,
      voided_at: null,
      created_at: createdAt,
      updated_at: createdAt,
    };

    const supabase = supabaseAdmin();
    const { data, error } = await supabase
      .from(INVOICE_TABLE)
      .insert(insertPayload)
      .select(BASE_COLUMNS)
      .single<InvoiceRow>();

    if (!error && data) return toInvoice(data);

    // Race-safe fallback: if unique/duplicate conflict happened, return the existing active invoice.
    const fallback = await dbInvoiceRepo.findActiveByOrderId(order.orderId);
    if (fallback) return fallback;

    throw new Error(`Invoice create draft failed: ${error?.message ?? "unknown error"}`);
  },

  async createDraftCustom(input: CreateCustomDraftInvoiceInput): Promise<Invoice> {
    const createdAt = nowIso();
    const amountExclGstCents = clampCents(input.amountExclGstCents);
    const gstRate = RENTAL_GST_RATE;
    const gstAmountCents = clampCents(amountExclGstCents * gstRate);
    const totalInclGstCents = clampCents(amountExclGstCents + gstAmountCents);
    const depositCents = clampCents(input.depositCents ?? 0);

    const insertPayload = {
      status: "draft" as InvoiceStatus,
      order_id: input.orderId,
      invoice_no: null,
      issue_date: null,
      due_date: null,
      pdf_storage: null,
      currency: "SGD" as const,
      prices_include_gst: false,
      gst_rate: gstRate,
      supplier: {
        name: "Your Company Name (Demo)",
        uen: "",
        gstRegNo: "",
        addressLines: ["Address line 1", "Singapore"],
        email: "billing@yourcompany.com",
      } satisfies InvoiceSupplierSnapshot,
      bill_to: input.billTo,
      items: [
        {
          description: input.description,
          qty: 1,
          unitPriceExclGstCents: amountExclGstCents,
          amountExclGstCents,
        },
      ] satisfies InvoiceItem[],
      subtotal_excl_gst_cents: amountExclGstCents,
      gst_amount_cents: gstAmountCents,
      total_incl_gst_cents: totalInclGstCents,
      deposit_cents: depositCents > 0 ? depositCents : null,
      metadata: input.metadata ?? {},
      email_log: [] as InvoiceEmailLogItem[],
      void_reason: null,
      voided_at: null,
      created_at: createdAt,
      updated_at: createdAt,
    };

    const supabase = supabaseAdmin();
    const { data, error } = await supabase
      .from(INVOICE_TABLE)
      .insert(insertPayload)
      .select(BASE_COLUMNS)
      .single<InvoiceRow>();

    if (error) throw new Error(`Invoice custom draft create failed: ${error.message}`);
    return toInvoice(data);
  },
};
