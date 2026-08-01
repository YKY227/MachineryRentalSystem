//src/lib/rental/orders/db-order-payment-session-repo.ts
import "server-only";

import { supabaseAdmin } from "@/lib/supabase/server";
import type {
  RentalOrderPaymentProvider,
  RentalOrderPaymentSession,
  RentalOrderPaymentSessionStatus,
} from "@/lib/rental/orders/types";

const PAYMENT_SESSIONS_TABLE =
  process.env.SUPABASE_RENTAL_ORDER_PAYMENT_SESSIONS_TABLE ?? "rental_order_payment_sessions";

type PaymentSessionRow = {
  id: string;
  order_id: string;
  provider: RentalOrderPaymentProvider;
  provider_payment_request_id: string | null;
  provider_reference_number: string | null;
  amount_cents: number;
  currency: string;
  status: RentalOrderPaymentSessionStatus;
  payment_purpose: string | null;
  redirect_url: string | null;
  webhook_payload: Record<string, unknown> | null;
  paid_at: string | null;
  invoice_id: string | null;
  invoice_payment_id: string | null;
  invoice_applied_at: string | null;
  invoice_email_sent_at: string | null;
  created_at: string;
  updated_at: string;
};

const SESSION_COLUMNS = [
  "id",
  "order_id",
  "provider",
  "provider_payment_request_id",
  "provider_reference_number",
  "amount_cents",
  "currency",
  "status",
  "payment_purpose",
  "redirect_url",
  "webhook_payload",
  "paid_at",
  "invoice_id",
  "invoice_payment_id",
  "invoice_applied_at",
  "invoice_email_sent_at",
  "created_at",
  "updated_at",
].join(",");

function nowIso() {
  return new Date().toISOString();
}

function toSession(row: PaymentSessionRow): RentalOrderPaymentSession {
  return {
    id: row.id,
    orderId: row.order_id,
    provider: row.provider,
    providerPaymentRequestId: row.provider_payment_request_id ?? undefined,
    providerReferenceNumber: row.provider_reference_number ?? undefined,
    amountCents: Number(row.amount_cents ?? 0),
    currency: row.currency,
    status: row.status,
    paymentPurpose: row.payment_purpose ?? undefined,
    redirectUrl: row.redirect_url ?? undefined,
    webhookPayload: row.webhook_payload ?? undefined,
    paidAt: row.paid_at ?? undefined,
    invoiceId: row.invoice_id ?? undefined,
    invoicePaymentId: row.invoice_payment_id ?? undefined,
    invoiceAppliedAt: row.invoice_applied_at ?? undefined,
    invoiceEmailSentAt: row.invoice_email_sent_at ?? undefined,
    createdAt: row.created_at,
    updatedAt: row.updated_at,
  };
}

function isCheckoutSession(row: PaymentSessionRow) {
  const paymentMode = String(row.webhook_payload?.paymentMode ?? "").trim();
  return !paymentMode || paymentMode === "checkout";
}

export const dbOrderPaymentSessionRepo = {
  async listForAdminVisibility(input?: {
    filter?: "needs_attention" | "manual_review" | "paid_unapplied" | "paid_incomplete_checkout" | "all_recent";
    limit?: number;
  }): Promise<RentalOrderPaymentSession[]> {
    const supabase = supabaseAdmin();
    const filter = input?.filter ?? "needs_attention";
    const limit = Math.min(200, Math.max(1, Math.floor(Number(input?.limit ?? 100) || 100)));

    async function runQuery(kind: "manual_review" | "paid_unapplied" | "all_recent") {
      let query = supabase
        .from(PAYMENT_SESSIONS_TABLE)
        .select(SESSION_COLUMNS)
        .order("created_at", { ascending: false })
        .limit(limit);

      if (kind === "manual_review") {
        query = query.eq("webhook_payload->automation->>status", "manual_review");
      } else if (kind === "paid_unapplied") {
        query = query.eq("status", "paid").is("invoice_applied_at", null);
      }

      const { data, error } = await query;
      if (error) throw new Error(`Payment session admin list failed: ${error.message}`);
      return ((data ?? []) as unknown as PaymentSessionRow[]).map(toSession);
    }

    if (filter === "manual_review") return runQuery("manual_review");
    if (filter === "paid_unapplied" || filter === "paid_incomplete_checkout") {
      return runQuery("paid_unapplied");
    }
    if (filter === "all_recent") return runQuery("all_recent");

    const [manualReview, paidUnapplied] = await Promise.all([
      runQuery("manual_review"),
      runQuery("paid_unapplied"),
    ]);
    const byId = new Map<string, RentalOrderPaymentSession>();
    for (const session of [...manualReview, ...paidUnapplied]) {
      byId.set(session.id, session);
    }
    return [...byId.values()]
      .sort((left, right) => new Date(right.createdAt).getTime() - new Date(left.createdAt).getTime())
      .slice(0, limit);
  },

  async create(input: {
    orderId: string;
    provider: RentalOrderPaymentProvider;
    providerPaymentRequestId?: string;
    providerReferenceNumber?: string;
    amountCents: number;
    currency: string;
    status: RentalOrderPaymentSessionStatus;
    paymentPurpose?: string;
    redirectUrl?: string;
    webhookPayload?: Record<string, unknown>;
    paidAt?: string;
    invoiceId?: string;
  }): Promise<RentalOrderPaymentSession> {
    const supabase = supabaseAdmin();
    const now = nowIso();
    const { data, error } = await supabase
      .from(PAYMENT_SESSIONS_TABLE)
      .insert({
        order_id: input.orderId,
        provider: input.provider,
        provider_payment_request_id: input.providerPaymentRequestId ?? null,
        provider_reference_number: input.providerReferenceNumber ?? null,
        amount_cents: input.amountCents,
        currency: input.currency,
        status: input.status,
        payment_purpose: input.paymentPurpose ?? null,
        redirect_url: input.redirectUrl ?? null,
        webhook_payload: input.webhookPayload ?? null,
        paid_at: input.paidAt ?? null,
        invoice_id: input.invoiceId ?? null,
        created_at: now,
        updated_at: now,
      })
      .select(SESSION_COLUMNS)
      .single<PaymentSessionRow>();

    if (error) throw new Error(`Payment session create failed: ${error.message}`);
    return toSession(data);
  },

  async findPendingCustomerInvoiceSession(input: {
    invoiceId: string;
    amountCents: number;
    currency: string;
  }): Promise<RentalOrderPaymentSession | null> {
    const supabase = supabaseAdmin();
    const { data, error } = await supabase
      .from(PAYMENT_SESSIONS_TABLE)
      .select(SESSION_COLUMNS)
      .eq("provider", "hitpay")
      .eq("invoice_id", input.invoiceId)
      .eq("amount_cents", input.amountCents)
      .eq("currency", input.currency)
      .eq("status", "pending")
      .eq("webhook_payload->>paymentMode", "customer_invoice")
      .order("created_at", { ascending: false })
      .limit(1)
      .maybeSingle<PaymentSessionRow>();

    if (error) throw new Error(`Payment session lookup failed: ${error.message}`);
    return data ? toSession(data) : null;
  },

  async findPendingCustomerInvoiceSessionForInvoice(input: {
    invoiceId: string;
    currency?: string;
  }): Promise<RentalOrderPaymentSession | null> {
    const supabase = supabaseAdmin();
    let query = supabase
      .from(PAYMENT_SESSIONS_TABLE)
      .select(SESSION_COLUMNS)
      .eq("provider", "hitpay")
      .eq("invoice_id", input.invoiceId)
      .eq("status", "pending")
      .eq("webhook_payload->>paymentMode", "customer_invoice")
      .order("created_at", { ascending: false })
      .limit(1);

    if (input.currency) {
      query = query.eq("currency", input.currency);
    }

    const { data, error } = await query.maybeSingle<PaymentSessionRow>();

    if (error) throw new Error(`Payment session lookup failed: ${error.message}`);
    return data ? toSession(data) : null;
  },

  async findPendingCheckoutSession(input: {
    orderId: string;
    amountCents: number;
    currency: string;
  }): Promise<RentalOrderPaymentSession | null> {
    const supabase = supabaseAdmin();
    const { data, error } = await supabase
      .from(PAYMENT_SESSIONS_TABLE)
      .select(SESSION_COLUMNS)
      .eq("provider", "hitpay")
      .eq("order_id", input.orderId)
      .eq("amount_cents", input.amountCents)
      .eq("currency", input.currency)
      .eq("status", "pending")
      .order("created_at", { ascending: false })
      .limit(20);

    if (error) throw new Error(`Pending checkout payment session lookup failed: ${error.message}`);
    const row = ((data ?? []) as unknown as PaymentSessionRow[]).find(isCheckoutSession);
    return row ? toSession(row) : null;
  },

  async findPendingCheckoutSessionForOrder(orderId: string): Promise<RentalOrderPaymentSession | null> {
    const supabase = supabaseAdmin();
    const { data, error } = await supabase
      .from(PAYMENT_SESSIONS_TABLE)
      .select(SESSION_COLUMNS)
      .eq("provider", "hitpay")
      .eq("order_id", orderId)
      .eq("status", "pending")
      .order("created_at", { ascending: false })
      .limit(20);

    if (error) throw new Error(`Pending checkout payment session lookup failed: ${error.message}`);
    const row = ((data ?? []) as unknown as PaymentSessionRow[]).find(isCheckoutSession);
    return row ? toSession(row) : null;
  },

  async findPendingOrderExtensionSession(input: {
    extensionId: string;
    amountCents: number;
    currency: string;
  }): Promise<RentalOrderPaymentSession | null> {
    const supabase = supabaseAdmin();
    const { data, error } = await supabase
      .from(PAYMENT_SESSIONS_TABLE)
      .select(SESSION_COLUMNS)
      .eq("provider", "hitpay")
      .eq("amount_cents", input.amountCents)
      .eq("currency", input.currency)
      .eq("status", "pending")
      .eq("webhook_payload->>paymentMode", "order_extension")
      .eq("webhook_payload->>extensionId", input.extensionId)
      .order("created_at", { ascending: false })
      .limit(1)
      .maybeSingle<PaymentSessionRow>();

    if (error) throw new Error(`Pending extension payment session lookup failed: ${error.message}`);
    return data ? toSession(data) : null;
  },

  async findPendingOrderExtensionSessionForExtension(extensionId: string): Promise<RentalOrderPaymentSession | null> {
    const supabase = supabaseAdmin();
    const { data, error } = await supabase
      .from(PAYMENT_SESSIONS_TABLE)
      .select(SESSION_COLUMNS)
      .eq("provider", "hitpay")
      .eq("status", "pending")
      .eq("webhook_payload->>paymentMode", "order_extension")
      .eq("webhook_payload->>extensionId", extensionId)
      .order("created_at", { ascending: false })
      .limit(1)
      .maybeSingle<PaymentSessionRow>();

    if (error) throw new Error(`Pending extension payment session lookup failed: ${error.message}`);
    return data ? toSession(data) : null;
  },

  async listPaidIncompleteCheckoutOrderIds(orderIds: string[]): Promise<string[]> {
    const normalizedOrderIds = [...new Set(orderIds.map((orderId) => orderId.trim()).filter(Boolean))];
    if (!normalizedOrderIds.length) return [];

    const supabase = supabaseAdmin();
    const { data, error } = await supabase
      .from(PAYMENT_SESSIONS_TABLE)
      .select("order_id,webhook_payload,invoice_applied_at")
      .in("order_id", normalizedOrderIds)
      .eq("status", "paid")
      .is("invoice_applied_at", null);

    if (error) throw new Error(`Paid checkout payment session lookup failed: ${error.message}`);

    return [
      ...new Set(
        ((data ?? []) as Array<{ order_id: string | null; webhook_payload: Record<string, unknown> | null }>)
          .filter((row) => {
            const paymentMode = String(row.webhook_payload?.paymentMode ?? "").trim();
            return !paymentMode || paymentMode === "checkout";
          })
          .map((row) => String(row.order_id ?? "").trim())
          .filter(Boolean)
      ),
    ];
  },

  async get(id: string): Promise<RentalOrderPaymentSession | null> {
    const supabase = supabaseAdmin();
    const { data, error } = await supabase
      .from(PAYMENT_SESSIONS_TABLE)
      .select(SESSION_COLUMNS)
      .eq("id", id)
      .maybeSingle<PaymentSessionRow>();

    if (error) throw new Error(`Payment session read failed: ${error.message}`);
    return data ? toSession(data) : null;
  },

  async findByProviderPaymentRequestId(providerPaymentRequestId: string): Promise<RentalOrderPaymentSession | null> {
    const supabase = supabaseAdmin();
    const { data, error } = await supabase
      .from(PAYMENT_SESSIONS_TABLE)
      .select(SESSION_COLUMNS)
      .eq("provider_payment_request_id", providerPaymentRequestId)
      .order("created_at", { ascending: false })
      .limit(1)
      .maybeSingle<PaymentSessionRow>();

    if (error) throw new Error(`Payment session lookup failed: ${error.message}`);
    return data ? toSession(data) : null;
  },

  async update(id: string, patch: {
    providerPaymentRequestId?: string;
    providerReferenceNumber?: string;
    status?: RentalOrderPaymentSessionStatus;
    redirectUrl?: string;
    webhookPayload?: Record<string, unknown>;
    paidAt?: string;
    invoiceId?: string;
    invoicePaymentId?: string;
    invoiceAppliedAt?: string;
    invoiceEmailSentAt?: string;
  }): Promise<RentalOrderPaymentSession> {
    const supabase = supabaseAdmin();
    const { data, error } = await supabase
      .from(PAYMENT_SESSIONS_TABLE)
      .update({
        provider_payment_request_id: patch.providerPaymentRequestId ?? undefined,
        provider_reference_number: patch.providerReferenceNumber ?? undefined,
        status: patch.status ?? undefined,
        redirect_url: patch.redirectUrl ?? undefined,
        webhook_payload: patch.webhookPayload ?? undefined,
        paid_at: patch.paidAt ?? undefined,
        invoice_id: patch.invoiceId ?? undefined,
        invoice_payment_id: patch.invoicePaymentId ?? undefined,
        invoice_applied_at: patch.invoiceAppliedAt ?? undefined,
        invoice_email_sent_at: patch.invoiceEmailSentAt ?? undefined,
        updated_at: nowIso(),
      })
      .eq("id", id)
      .select(SESSION_COLUMNS)
      .single<PaymentSessionRow>();

    if (error) throw new Error(`Payment session update failed: ${error.message}`);
    return toSession(data);
  },
};
