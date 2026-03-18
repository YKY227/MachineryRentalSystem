import "server-only";

import { supabaseAdmin } from "@/lib/supabase/server";

const CUSTOMER_PASSWORD_RESETS_TABLE =
  process.env.SUPABASE_CUSTOMER_PASSWORD_RESETS_TABLE ?? "customer_password_resets";

type CustomerPasswordResetRow = {
  id: string;
  customer_id: string;
  token_hash: string;
  expires_at: string;
  used_at: string | null;
  created_at: string;
};

export type CustomerPasswordResetRecord = {
  id: string;
  customerId: string;
  tokenHash: string;
  expiresAt: string;
  usedAt?: string;
  createdAt: string;
};

function toRecord(row: CustomerPasswordResetRow): CustomerPasswordResetRecord {
  return {
    id: row.id,
    customerId: row.customer_id,
    tokenHash: row.token_hash,
    expiresAt: row.expires_at,
    usedAt: row.used_at ?? undefined,
    createdAt: row.created_at,
  };
}

export const customerPasswordResetRepo = {
  async create(input: {
    customerId: string;
    tokenHash: string;
    expiresAt: string;
  }): Promise<CustomerPasswordResetRecord> {
    const supabase = supabaseAdmin();
    const { data, error } = await supabase
      .from(CUSTOMER_PASSWORD_RESETS_TABLE)
      .insert({
        customer_id: input.customerId,
        token_hash: input.tokenHash,
        expires_at: input.expiresAt,
      })
      .select("id,customer_id,token_hash,expires_at,used_at,created_at")
      .single<CustomerPasswordResetRow>();

    if (error) throw new Error(`Customer password reset create failed: ${error.message}`);
    return toRecord(data);
  },

  async findByTokenHash(tokenHash: string): Promise<CustomerPasswordResetRecord | null> {
    const supabase = supabaseAdmin();
    const { data, error } = await supabase
      .from(CUSTOMER_PASSWORD_RESETS_TABLE)
      .select("id,customer_id,token_hash,expires_at,used_at,created_at")
      .eq("token_hash", tokenHash)
      .maybeSingle<CustomerPasswordResetRow>();

    if (error) throw new Error(`Customer password reset lookup failed: ${error.message}`);
    return data ? toRecord(data) : null;
  },

  async listRecentByCustomer(customerId: string, sinceIso: string): Promise<CustomerPasswordResetRecord[]> {
    const supabase = supabaseAdmin();
    const { data, error } = await supabase
      .from(CUSTOMER_PASSWORD_RESETS_TABLE)
      .select("id,customer_id,token_hash,expires_at,used_at,created_at")
      .eq("customer_id", customerId)
      .gte("created_at", sinceIso)
      .order("created_at", { ascending: false });

    if (error) throw new Error(`Customer password reset list failed: ${error.message}`);
    return ((data ?? []) as CustomerPasswordResetRow[]).map(toRecord);
  },

  async markUsed(id: string, usedAt: string): Promise<void> {
    const supabase = supabaseAdmin();
    const { error } = await supabase
      .from(CUSTOMER_PASSWORD_RESETS_TABLE)
      .update({ used_at: usedAt })
      .eq("id", id)
      .is("used_at", null);

    if (error) throw new Error(`Customer password reset mark used failed: ${error.message}`);
  },

  async invalidateOtherActiveTokens(customerId: string, usedAt: string, exceptId: string): Promise<void> {
    const supabase = supabaseAdmin();
    const { error } = await supabase
      .from(CUSTOMER_PASSWORD_RESETS_TABLE)
      .update({ used_at: usedAt })
      .eq("customer_id", customerId)
      .is("used_at", null)
      .neq("id", exceptId);

    if (error) throw new Error(`Customer password reset invalidate failed: ${error.message}`);
  },
};
