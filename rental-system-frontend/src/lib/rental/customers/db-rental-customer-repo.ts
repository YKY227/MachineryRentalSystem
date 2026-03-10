import "server-only";

import type {
  RentalCustomer,
  RentalCustomerAccountStatus,
  RentalCustomerPaymentTerms,
  RentalCustomerVettingStatus,
} from "@/lib/rental/orders/types";
import { supabaseAdmin } from "@/lib/supabase/server";

const CUSTOMERS_TABLE = process.env.SUPABASE_RENTAL_CUSTOMERS_TABLE ?? "rental_customers";

type RentalCustomerRow = {
  id: string;
  company_name: string;
  contact_name: string;
  email: string;
  phone: string | null;
  uen: string | null;
  address: string | null;
  vetting_status: RentalCustomer["vettingStatus"];
  payment_terms: RentalCustomer["paymentTerms"];
  account_status: RentalCustomer["accountStatus"];
  credit_limit: string | number | null;
  credit_control_enabled: boolean | null;
  credit_hold_reason: string | null;
  credit_last_reviewed_at: string | null;
  credit_last_reviewed_by: string | null;
  internal_notes: string | null;
  auth_user_id: string | null;
  created_at: string;
  updated_at: string;
};

export type RentalCustomerListFilters = {
  q?: string;
};

export type UpsertRentalCustomerInput = {
  id?: string;
  companyName: string;
  contactName: string;
  email: string;
  phone?: string;
  uen?: string;
  address?: string;
  vettingStatus?: RentalCustomerVettingStatus;
  paymentTerms?: RentalCustomerPaymentTerms;
  accountStatus?: RentalCustomerAccountStatus;
  internalNotes?: string;
  authUserId?: string;
};

export type UpdateRentalCustomerInput = {
  vettingStatus?: RentalCustomerVettingStatus;
  paymentTerms?: RentalCustomerPaymentTerms;
  accountStatus?: RentalCustomerAccountStatus;
  internalNotes?: string;
  creditLimit?: number | null;
  creditControlEnabled?: boolean;
  creditHoldReason?: string | null;
  creditLastReviewedAt?: string | null;
  creditLastReviewedBy?: string | null;
};

const CUSTOMER_COLUMNS = [
  "id",
  "company_name",
  "contact_name",
  "email",
  "phone",
  "uen",
  "address",
  "vetting_status",
  "payment_terms",
  "account_status",
  "credit_limit",
  "credit_control_enabled",
  "credit_hold_reason",
  "credit_last_reviewed_at",
  "credit_last_reviewed_by",
  "internal_notes",
  "auth_user_id",
  "created_at",
  "updated_at",
].join(",");

function normalizeEmail(value: string) {
  return value.trim().toLowerCase();
}

function toCustomer(row: RentalCustomerRow): RentalCustomer {
  return {
    id: row.id,
    companyName: row.company_name,
    contactName: row.contact_name,
    email: row.email,
    phone: row.phone ?? undefined,
    uen: row.uen ?? undefined,
    address: row.address ?? undefined,
    vettingStatus: row.vetting_status,
    paymentTerms: row.payment_terms,
    accountStatus: row.account_status,
    creditLimit:
      row.credit_limit === null || row.credit_limit === undefined ? undefined : Number(row.credit_limit),
    creditControlEnabled: row.credit_control_enabled ?? true,
    creditHoldReason: row.credit_hold_reason ?? undefined,
    creditLastReviewedAt: row.credit_last_reviewed_at ?? undefined,
    creditLastReviewedBy: row.credit_last_reviewed_by ?? undefined,
    internalNotes: row.internal_notes ?? undefined,
    authUserId: row.auth_user_id ?? undefined,
    createdAt: row.created_at,
    updatedAt: row.updated_at,
  };
}

function toUpsertPayload(input: UpsertRentalCustomerInput) {
  const vettingStatus = input.vettingStatus ?? "new";
  return {
    ...(input.id ? { id: input.id } : {}),
    company_name: input.companyName.trim(),
    contact_name: input.contactName.trim(),
    email: normalizeEmail(input.email),
    phone: input.phone?.trim() || null,
    uen: input.uen?.trim() || null,
    address: input.address?.trim() || null,
    vetting_status: vettingStatus,
    payment_terms: input.paymentTerms ?? "upfront",
    account_status: input.accountStatus ?? "active",
    internal_notes: input.internalNotes?.trim() || null,
    auth_user_id: input.authUserId?.trim() || null,
    updated_at: new Date().toISOString(),
  };
}

function toUpdatePayload(input: UpdateRentalCustomerInput) {
  const payload: Record<string, unknown> = {
    updated_at: new Date().toISOString(),
  };

  if (input.vettingStatus) {
    payload.vetting_status = input.vettingStatus;
  }
  if (input.paymentTerms) payload.payment_terms = input.paymentTerms;
  if (input.accountStatus) payload.account_status = input.accountStatus;
  if (typeof input.internalNotes === "string") payload.internal_notes = input.internalNotes.trim() || null;
  if (input.creditLimit !== undefined) payload.credit_limit = input.creditLimit;
  if (typeof input.creditControlEnabled === "boolean") {
    payload.credit_control_enabled = input.creditControlEnabled;
  }
  if (input.creditHoldReason !== undefined) {
    payload.credit_hold_reason = input.creditHoldReason?.trim() || null;
  }
  if (input.creditLastReviewedAt !== undefined) {
    payload.credit_last_reviewed_at = input.creditLastReviewedAt;
  }
  if (input.creditLastReviewedBy !== undefined) {
    payload.credit_last_reviewed_by = input.creditLastReviewedBy?.trim() || null;
  }

  return payload;
}

export function isCustomerCreditEligible(customer: Pick<RentalCustomer, "paymentTerms" | "vettingStatus" | "accountStatus">) {
  return (
    customer.paymentTerms === "credit" &&
    customer.vettingStatus === "pre_vetted" &&
    customer.accountStatus === "active"
  );
}

export const dbRentalCustomerRepo = {
  async list(filters: RentalCustomerListFilters = {}): Promise<RentalCustomer[]> {
    const supabase = supabaseAdmin();
    let query = supabase
      .from(CUSTOMERS_TABLE)
      .select(CUSTOMER_COLUMNS)
      .order("created_at", { ascending: false });

    const q = (filters.q ?? "").trim();
    if (q) {
      const pattern = `%${q.replace(/[%_]/g, "")}%`;
      query = query.or(
        [
          `company_name.ilike.${pattern}`,
          `contact_name.ilike.${pattern}`,
          `email.ilike.${pattern}`,
        ].join(",")
      );
    }

    const { data, error } = await query;
    if (error) throw new Error(`Rental customer list failed: ${error.message}`);
    return ((data ?? []) as unknown as RentalCustomerRow[]).map(toCustomer);
  },

  async getById(id: string): Promise<RentalCustomer | null> {
    const supabase = supabaseAdmin();
    const { data, error } = await supabase
      .from(CUSTOMERS_TABLE)
      .select(CUSTOMER_COLUMNS)
      .eq("id", id)
      .maybeSingle<RentalCustomerRow>();

    if (error) throw new Error(`Rental customer read failed: ${error.message}`);
    return data ? toCustomer(data) : null;
  },

  async findByAuthUserId(authUserId: string): Promise<RentalCustomer | null> {
    const key = authUserId.trim();
    if (!key) return null;

    const supabase = supabaseAdmin();
    const { data, error } = await supabase
      .from(CUSTOMERS_TABLE)
      .select(CUSTOMER_COLUMNS)
      .eq("auth_user_id", key)
      .maybeSingle<RentalCustomerRow>();

    if (error) throw new Error(`Rental customer auth lookup failed: ${error.message}`);
    return data ? toCustomer(data) : null;
  },

  async findByEmail(email: string): Promise<RentalCustomer | null> {
    const key = normalizeEmail(email);
    if (!key) return null;

    const supabase = supabaseAdmin();
    const { data, error } = await supabase
      .from(CUSTOMERS_TABLE)
      .select(CUSTOMER_COLUMNS)
      .eq("email", key)
      .maybeSingle<RentalCustomerRow>();

    if (error) throw new Error(`Rental customer email lookup failed: ${error.message}`);
    return data ? toCustomer(data) : null;
  },

  async upsert(input: UpsertRentalCustomerInput): Promise<RentalCustomer> {
    const supabase = supabaseAdmin();
    const payload = toUpsertPayload(input);
    const query = input.id
      ? supabase.from(CUSTOMERS_TABLE).upsert(payload, { onConflict: "id" })
      : supabase.from(CUSTOMERS_TABLE).insert(payload);
    const { data, error } = await query.select(CUSTOMER_COLUMNS).single<RentalCustomerRow>();

    if (error) throw new Error(`Rental customer upsert failed: ${error.message}`);
    return toCustomer(data);
  },

  async ensureForAuthUser(input: UpsertRentalCustomerInput): Promise<RentalCustomer> {
    if (!input.authUserId) {
      throw new Error("authUserId is required");
    }

    const existing = await this.findByAuthUserId(input.authUserId);
    if (existing) {
      const updated = await this.upsert({
        id: existing.id,
        companyName: input.companyName || existing.companyName,
        contactName: input.contactName || existing.contactName,
        email: input.email || existing.email,
        phone: input.phone ?? existing.phone,
        uen: input.uen ?? existing.uen,
        address: input.address ?? existing.address,
        vettingStatus: existing.vettingStatus,
        paymentTerms: existing.paymentTerms,
        accountStatus: existing.accountStatus,
        internalNotes: existing.internalNotes,
        authUserId: existing.authUserId,
      });
      return updated;
    }

    const byEmail = await this.findByEmail(input.email);
    if (byEmail) {
      return this.upsert({
        id: byEmail.id,
        companyName: byEmail.companyName || input.companyName,
        contactName: byEmail.contactName || input.contactName,
        email: byEmail.email || input.email,
        phone: byEmail.phone ?? input.phone,
        uen: byEmail.uen ?? input.uen,
        address: byEmail.address ?? input.address,
        vettingStatus: byEmail.vettingStatus,
        paymentTerms: byEmail.paymentTerms,
        accountStatus: byEmail.accountStatus,
        internalNotes: byEmail.internalNotes,
        authUserId: input.authUserId,
      });
    }

    return this.upsert(input);
  },

  async update(id: string, input: UpdateRentalCustomerInput): Promise<RentalCustomer> {
    const supabase = supabaseAdmin();
    const { data, error } = await supabase
      .from(CUSTOMERS_TABLE)
      .update(toUpdatePayload(input))
      .eq("id", id)
      .select(CUSTOMER_COLUMNS)
      .single<RentalCustomerRow>();

    if (error) throw new Error(`Rental customer update failed: ${error.message}`);
    return toCustomer(data);
  },
};
