import "server-only";

import { supabaseAdmin } from "@/lib/supabase/server";
import type {
  RentalCheckoutGroupPaymentProvider,
  RentalCheckoutGroupPaymentSession,
  RentalCheckoutGroupPaymentSessionStatus,
} from "./payment-session-types";

const GROUP_PAYMENT_SESSIONS_TABLE =
  process.env.SUPABASE_RENTAL_CHECKOUT_GROUP_PAYMENT_SESSIONS_TABLE ??
  "rental_checkout_group_payment_sessions";

type GroupPaymentSessionRow = {
  id: string;
  checkout_group_id: string;
  provider: RentalCheckoutGroupPaymentProvider;
  provider_payment_request_id: string | null;
  provider_reference_number: string | null;
  redirect_url: string | null;
  amount_cents: number;
  currency: string;
  status: RentalCheckoutGroupPaymentSessionStatus;
  paid_at: string | null;
  failed_at: string | null;
  expired_at: string | null;
  converted_at: string | null;
  manual_review_reason: string | null;
  provider_payload: Record<string, unknown> | null;
  webhook_payload: Record<string, unknown> | null;
  created_at: string;
  updated_at: string;
};

const SESSION_COLUMNS = [
  "id",
  "checkout_group_id",
  "provider",
  "provider_payment_request_id",
  "provider_reference_number",
  "redirect_url",
  "amount_cents",
  "currency",
  "status",
  "paid_at",
  "failed_at",
  "expired_at",
  "converted_at",
  "manual_review_reason",
  "provider_payload",
  "webhook_payload",
  "created_at",
  "updated_at",
].join(",");

function nowIso() {
  return new Date().toISOString();
}

function toSession(row: GroupPaymentSessionRow): RentalCheckoutGroupPaymentSession {
  return {
    id: row.id,
    checkoutGroupId: row.checkout_group_id,
    provider: row.provider,
    providerPaymentRequestId: row.provider_payment_request_id ?? undefined,
    providerReferenceNumber: row.provider_reference_number ?? undefined,
    redirectUrl: row.redirect_url ?? undefined,
    amountCents: Math.max(0, Number(row.amount_cents ?? 0)),
    currency: row.currency,
    status: row.status,
    paidAt: row.paid_at ?? undefined,
    failedAt: row.failed_at ?? undefined,
    expiredAt: row.expired_at ?? undefined,
    convertedAt: row.converted_at ?? undefined,
    manualReviewReason: row.manual_review_reason ?? undefined,
    providerPayload: row.provider_payload ?? {},
    webhookPayload: row.webhook_payload ?? {},
    createdAt: row.created_at,
    updatedAt: row.updated_at,
  };
}

export const dbCheckoutGroupPaymentSessionRepo = {
  async createPending(input: {
    checkoutGroupId: string;
    provider?: RentalCheckoutGroupPaymentProvider;
    amountCents: number;
    currency?: string;
  }): Promise<RentalCheckoutGroupPaymentSession> {
    const supabase = supabaseAdmin();
    const { data, error } = await supabase
      .from(GROUP_PAYMENT_SESSIONS_TABLE)
      .insert({
        checkout_group_id: input.checkoutGroupId,
        provider: input.provider ?? "hitpay",
        amount_cents: Math.max(1, Math.round(Number(input.amountCents) || 0)),
        currency: input.currency ?? "SGD",
        status: "pending",
        updated_at: nowIso(),
      })
      .select(SESSION_COLUMNS)
      .single<GroupPaymentSessionRow>();

    if (error) throw new Error(`Checkout group payment session create failed: ${error.message}`);
    return toSession(data);
  },

  async findPendingForGroup(input: {
    checkoutGroupId: string;
    provider?: RentalCheckoutGroupPaymentProvider;
    currency?: string;
  }): Promise<RentalCheckoutGroupPaymentSession | null> {
    const supabase = supabaseAdmin();
    let query = supabase
      .from(GROUP_PAYMENT_SESSIONS_TABLE)
      .select(SESSION_COLUMNS)
      .eq("checkout_group_id", input.checkoutGroupId)
      .eq("provider", input.provider ?? "hitpay")
      .eq("status", "pending")
      .order("created_at", { ascending: false })
      .limit(1);

    if (input.currency) query = query.eq("currency", input.currency);

    const { data, error } = await query.maybeSingle<GroupPaymentSessionRow>();
    if (error) throw new Error(`Checkout group pending payment lookup failed: ${error.message}`);
    return data ? toSession(data) : null;
  },

  async getLatestForGroup(checkoutGroupId: string): Promise<RentalCheckoutGroupPaymentSession | null> {
    const supabase = supabaseAdmin();
    const { data, error } = await supabase
      .from(GROUP_PAYMENT_SESSIONS_TABLE)
      .select(SESSION_COLUMNS)
      .eq("checkout_group_id", checkoutGroupId)
      .order("created_at", { ascending: false })
      .limit(1)
      .maybeSingle<GroupPaymentSessionRow>();

    if (error) throw new Error(`Checkout group payment session read failed: ${error.message}`);
    return data ? toSession(data) : null;
  },

  async get(id: string): Promise<RentalCheckoutGroupPaymentSession | null> {
    const supabase = supabaseAdmin();
    const { data, error } = await supabase
      .from(GROUP_PAYMENT_SESSIONS_TABLE)
      .select(SESSION_COLUMNS)
      .eq("id", id)
      .maybeSingle<GroupPaymentSessionRow>();

    if (error) throw new Error(`Checkout group payment session read failed: ${error.message}`);
    return data ? toSession(data) : null;
  },

  async findByProviderPaymentRequestId(
    providerPaymentRequestId: string
  ): Promise<RentalCheckoutGroupPaymentSession | null> {
    const supabase = supabaseAdmin();
    const { data, error } = await supabase
      .from(GROUP_PAYMENT_SESSIONS_TABLE)
      .select(SESSION_COLUMNS)
      .eq("provider", "hitpay")
      .eq("provider_payment_request_id", providerPaymentRequestId)
      .order("created_at", { ascending: false })
      .limit(1)
      .maybeSingle<GroupPaymentSessionRow>();

    if (error) throw new Error(`Checkout group provider payment lookup failed: ${error.message}`);
    return data ? toSession(data) : null;
  },

  async update(
    id: string,
    patch: {
      providerPaymentRequestId?: string;
      providerReferenceNumber?: string;
      redirectUrl?: string;
      status?: RentalCheckoutGroupPaymentSessionStatus;
      paidAt?: string;
      failedAt?: string;
      expiredAt?: string;
      convertedAt?: string;
      manualReviewReason?: string | null;
      providerPayload?: Record<string, unknown>;
      webhookPayload?: Record<string, unknown>;
    }
  ): Promise<RentalCheckoutGroupPaymentSession> {
    const supabase = supabaseAdmin();
    const { data, error } = await supabase
      .from(GROUP_PAYMENT_SESSIONS_TABLE)
      .update({
        provider_payment_request_id: patch.providerPaymentRequestId ?? undefined,
        provider_reference_number: patch.providerReferenceNumber ?? undefined,
        redirect_url: patch.redirectUrl ?? undefined,
        status: patch.status ?? undefined,
        paid_at: patch.paidAt ?? undefined,
        failed_at: patch.failedAt ?? undefined,
        expired_at: patch.expiredAt ?? undefined,
        converted_at: patch.convertedAt ?? undefined,
        manual_review_reason: patch.manualReviewReason ?? undefined,
        provider_payload: patch.providerPayload ?? undefined,
        webhook_payload: patch.webhookPayload ?? undefined,
        updated_at: nowIso(),
      })
      .eq("id", id)
      .select(SESSION_COLUMNS)
      .single<GroupPaymentSessionRow>();

    if (error) throw new Error(`Checkout group payment session update failed: ${error.message}`);
    return toSession(data);
  },

  async markManualReview(id: string, reason: string, payload?: Record<string, unknown>) {
    return dbCheckoutGroupPaymentSessionRepo.update(id, {
      status: "manual_review",
      manualReviewReason: reason,
      webhookPayload: payload,
    });
  },
};
