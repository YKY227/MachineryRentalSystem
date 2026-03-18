//rental-system-frontend/src/lib/rental/invoices/db-payment-repo.ts
import type {
  InvoicePayment,
  InvoicePaymentStatus,
  InvoicePaymentTotals,
  InvoiceStatus,
} from "@/lib/rental/invoices/types";
import {
  dbPaymentAllocationRepo,
  type RentalPaymentAllocation,
} from "@/lib/rental/payments/db-payment-allocation-repo";
import { supabaseAdmin } from "@/lib/supabase/server";

const INVOICE_TABLE = process.env.SUPABASE_INVOICES_TABLE ?? "rental_invoices";
const INVOICE_PAYMENTS_TABLE = process.env.SUPABASE_INVOICE_PAYMENTS_TABLE ?? "rental_invoice_payments";
const RECORD_PAYMENT_RPC = "record_rental_invoice_payment";

type PaymentRow = {
  id: string;
  invoice_id: string;
  amount_cents: number;
  paid_at: string;
  method: string | null;
  reference: string | null;
  notes: string | null;
  source_payment_session_id?: string | null;
  created_at: string;
};

type InvoicePaymentReadRow = {
  id: string;
  status: InvoiceStatus;
  due_date: string | null;
  total_incl_gst_cents: number | null;
};

type AtomicPaymentResultRow = {
  total_cents: number | null;
  paid_cents: number | null;
  balance_cents: number | null;
  payment_status: InvoicePaymentStatus;
};

function toPayment(row: PaymentRow): InvoicePayment {
  return {
    id: row.id,
    invoiceId: row.invoice_id,
    amountCents: Number(row.amount_cents ?? 0),
    paidAt: row.paid_at,
    method: row.method ?? undefined,
    reference: row.reference ?? undefined,
    notes: row.notes ?? undefined,
    createdAt: row.created_at,
  };
}

function derivePaymentStatus(input: {
  totalCents: number;
  paidCents: number;
  balanceCents: number;
  dueDate?: string | null;
  now?: Date;
}): InvoicePaymentStatus {
  if (input.balanceCents <= 0) return "paid";

  if (input.dueDate) {
    const dueAt = new Date(input.dueDate);
    if (!Number.isNaN(dueAt.getTime())) {
      const now = input.now ?? new Date();
      if (dueAt.getTime() < now.getTime()) return "overdue";
    }
  }

  if (input.paidCents > 0) return "partially_paid";
  return "unpaid";
}

function buildTotals(invoice: InvoicePaymentReadRow, payments: InvoicePayment[]): InvoicePaymentTotals {
  const totalCents = Math.max(0, Number(invoice.total_incl_gst_cents ?? 0));
  const paidCents = payments.reduce((sum, payment) => sum + Math.max(0, payment.amountCents), 0);
  const balanceCents = Math.max(totalCents - paidCents, 0);

  return {
    totalCents,
    paidCents,
    balanceCents,
    status: derivePaymentStatus({
      totalCents,
      paidCents,
      balanceCents,
      dueDate: invoice.due_date,
    }),
  };
}

function toTotalsFromRpc(row: AtomicPaymentResultRow): InvoicePaymentTotals {
  return {
    totalCents: Math.max(0, Number(row.total_cents ?? 0)),
    paidCents: Math.max(0, Number(row.paid_cents ?? 0)),
    balanceCents: Math.max(0, Number(row.balance_cents ?? 0)),
    status: row.payment_status,
  };
}

async function readInvoiceForPayments(invoiceId: string): Promise<InvoicePaymentReadRow> {
  const supabase = supabaseAdmin();
  const { data, error } = await supabase
    .from(INVOICE_TABLE)
    .select("id,status,due_date,total_incl_gst_cents")
    .eq("id", invoiceId)
    .maybeSingle<InvoicePaymentReadRow>();

  if (error) throw new Error(`Invoice read failed: ${error.message}`);
  if (!data) throw new Error("Invoice not found");
  return data;
}

export const dbPaymentRepo = {
  async getById(id: string): Promise<InvoicePayment | null> {
    const supabase = supabaseAdmin();
    const { data, error } = await supabase
      .from(INVOICE_PAYMENTS_TABLE)
      .select("id,invoice_id,amount_cents,paid_at,method,reference,notes,source_payment_session_id,created_at")
      .eq("id", id)
      .maybeSingle<PaymentRow>();

    if (error) throw new Error(`Invoice payment read failed: ${error.message}`);
    return data ? toPayment(data) : null;
  },

  async listByInvoiceId(invoiceId: string): Promise<InvoicePayment[]> {
    const supabase = supabaseAdmin();
    const { data, error } = await supabase
      .from(INVOICE_PAYMENTS_TABLE)
      .select("id,invoice_id,amount_cents,paid_at,method,reference,notes,created_at")
      .eq("invoice_id", invoiceId)
      .order("paid_at", { ascending: false })
      .order("created_at", { ascending: false });

    if (error) throw new Error(`Invoice payments read failed: ${error.message}`);
    return ((data ?? []) as PaymentRow[]).map(toPayment);
  },

  async findBySourcePaymentSessionId(sourcePaymentSessionId: string): Promise<InvoicePayment | null> {
    const supabase = supabaseAdmin();
    const { data, error } = await supabase
      .from(INVOICE_PAYMENTS_TABLE)
      .select("id,invoice_id,amount_cents,paid_at,method,reference,notes,source_payment_session_id,created_at")
      .eq("source_payment_session_id", sourcePaymentSessionId)
      .limit(1)
      .maybeSingle<PaymentRow>();

    if (error) throw new Error(`Invoice payment lookup failed: ${error.message}`);
    return data ? toPayment(data) : null;
  },

  async getTotals(invoiceId: string): Promise<InvoicePaymentTotals> {
    const [invoice, payments] = await Promise.all([
      readInvoiceForPayments(invoiceId),
      dbPaymentRepo.listByInvoiceId(invoiceId),
    ]);

    return buildTotals(invoice, payments);
  },

  async listWithTotals(invoiceId: string): Promise<{
    payments: InvoicePayment[];
    totals: InvoicePaymentTotals;
  }> {
    const invoice = await readInvoiceForPayments(invoiceId);
    const payments = await dbPaymentRepo.listByInvoiceId(invoiceId);
    return {
      payments,
      totals: buildTotals(invoice, payments),
    };
  },

  async listTotalsByInvoiceIds(
    invoices: Array<{
      id: string;
      dueDate?: string;
      totalInclGstCents: number;
    }>
  ): Promise<Record<string, InvoicePaymentTotals>> {
    if (!invoices.length) return {};

    const invoiceIds = invoices.map((invoice) => invoice.id);
    const supabase = supabaseAdmin();
    const { data, error } = await supabase
      .from(INVOICE_PAYMENTS_TABLE)
      .select("invoice_id,amount_cents")
      .in("invoice_id", invoiceIds);

    if (error) throw new Error(`Invoice payments aggregate read failed: ${error.message}`);

    const paidByInvoiceId = new Map<string, number>();
    for (const row of (data ?? []) as Array<{ invoice_id: string; amount_cents: number | null }>) {
      const current = paidByInvoiceId.get(row.invoice_id) ?? 0;
      paidByInvoiceId.set(row.invoice_id, current + Math.max(0, Number(row.amount_cents ?? 0)));
    }

    return Object.fromEntries(
      invoices.map((invoice) => {
        const paidCents = paidByInvoiceId.get(invoice.id) ?? 0;
        const totalCents = Math.max(0, Number(invoice.totalInclGstCents ?? 0));
        const balanceCents = Math.max(totalCents - paidCents, 0);

        return [
          invoice.id,
          {
            totalCents,
            paidCents,
            balanceCents,
            status: derivePaymentStatus({
              totalCents,
              paidCents,
              balanceCents,
              dueDate: invoice.dueDate,
            }),
          } satisfies InvoicePaymentTotals,
        ];
      })
    );
  },

  async buildInvoiceListItems<T extends { id: string; dueDate?: string; totalInclGstCents: number }>(
    invoices: T[]
  ): Promise<Array<{ invoice: T; paymentTotals: InvoicePaymentTotals }>> {
    const totalsByInvoiceId = await dbPaymentRepo.listTotalsByInvoiceIds(invoices);
    return invoices.map((invoice) => ({
      invoice,
      paymentTotals:
        totalsByInvoiceId[invoice.id] ??
        ({
          totalCents: Math.max(0, Number(invoice.totalInclGstCents ?? 0)),
          paidCents: 0,
          balanceCents: Math.max(0, Number(invoice.totalInclGstCents ?? 0)),
          status: invoice.dueDate && new Date(invoice.dueDate).getTime() < Date.now() ? "overdue" : "unpaid",
        } satisfies InvoicePaymentTotals),
    }));
  },

  async recordPayment(input: {
    invoiceId: string;
    amountCents: number;
    paidAt?: string;
    method?: string;
    reference?: string;
    notes?: string;
  }): Promise<{
    payments: InvoicePayment[];
    totals: InvoicePaymentTotals;
  }> {
    const amountCents = Math.round(Number(input.amountCents));
    if (!Number.isFinite(amountCents) || amountCents <= 0) {
      throw new Error("amountCents must be greater than 0");
    }

    const supabase = supabaseAdmin();
    const { data, error } = await supabase
      .rpc(RECORD_PAYMENT_RPC, {
        p_invoice_id: input.invoiceId,
        p_amount_cents: amountCents,
        p_paid_at: input.paidAt ?? null,
        p_method: input.method ?? null,
        p_reference: input.reference ?? null,
        p_notes: input.notes ?? null,
      });

    if (error) throw new Error(`Invoice payment insert failed: ${error.message}`);

    const rpcRow = (Array.isArray(data) ? data[0] : data) as AtomicPaymentResultRow | null;
    if (!rpcRow) throw new Error("Invoice payment insert failed: missing totals");

    const payments = await dbPaymentRepo.listByInvoiceId(input.invoiceId);

    return {
      payments,
      totals: toTotalsFromRpc(rpcRow),
    };
  },

  async recordPaymentForCheckoutSession(input: {
    invoiceId: string;
    sourcePaymentSessionId: string;
    amountCents: number;
    paidAt?: string;
    method?: string;
    reference?: string;
    notes?: string;
  }): Promise<{
    payment: InvoicePayment;
    payments: InvoicePayment[];
    totals: InvoicePaymentTotals;
    allocation: RentalPaymentAllocation;
  }> {
    const existing = await dbPaymentRepo.findBySourcePaymentSessionId(input.sourcePaymentSessionId);
    if (existing) {
      const result = await dbPaymentRepo.listWithTotals(input.invoiceId);
      const allocation = await dbPaymentAllocationRepo.ensureCheckoutSessionInvoiceAllocation({
        sourceId: input.sourcePaymentSessionId,
        targetId: input.invoiceId,
        amountCents: existing.amountCents,
      });
      return {
        payment: existing,
        payments: result.payments,
        totals: result.totals,
        allocation,
      };
    }

    const invoice = await readInvoiceForPayments(input.invoiceId);
    if (invoice.status !== "issued") {
      throw new Error("Invoice must be issued before recording checkout payment");
    }

    const result = await dbPaymentRepo.listWithTotals(input.invoiceId);
    const amountCents = Math.round(Number(input.amountCents));
    if (!Number.isFinite(amountCents) || amountCents <= 0) {
      throw new Error("amountCents must be greater than 0");
    }
    if (amountCents > result.totals.balanceCents) {
      throw new Error("Checkout payment exceeds invoice outstanding balance");
    }

    const supabase = supabaseAdmin();
    const { data, error } = await supabase
      .from(INVOICE_PAYMENTS_TABLE)
      .insert({
        invoice_id: input.invoiceId,
        amount_cents: amountCents,
        paid_at: input.paidAt ?? new Date().toISOString(),
        method: input.method ?? null,
        reference: input.reference ?? null,
        notes: input.notes ?? null,
        source_payment_session_id: input.sourcePaymentSessionId,
      })
      .select("id,invoice_id,amount_cents,paid_at,method,reference,notes,source_payment_session_id,created_at")
      .single<PaymentRow>();

    if (error) {
      if ((error as { code?: string }).code === "23505") {
        const duplicate = await dbPaymentRepo.findBySourcePaymentSessionId(input.sourcePaymentSessionId);
        if (duplicate) {
          const allocation = await dbPaymentAllocationRepo.ensureCheckoutSessionInvoiceAllocation({
            sourceId: input.sourcePaymentSessionId,
            targetId: input.invoiceId,
            amountCents: duplicate.amountCents,
          });
          const next = await dbPaymentRepo.listWithTotals(input.invoiceId);
          return { payment: duplicate, payments: next.payments, totals: next.totals, allocation };
        }
      }
      throw new Error(`Checkout invoice payment insert failed: ${error.message}`);
    }

    const payment = toPayment(data);
    const allocation = await dbPaymentAllocationRepo.ensureCheckoutSessionInvoiceAllocation({
      sourceId: input.sourcePaymentSessionId,
      targetId: input.invoiceId,
      amountCents: payment.amountCents,
    });
    const next = await dbPaymentRepo.listWithTotals(input.invoiceId);
    return {
      payment,
      payments: next.payments,
      totals: next.totals,
      allocation,
    };
  },
};
