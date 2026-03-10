import "server-only";

import { supabaseAdmin } from "@/lib/supabase/server";

const PAYMENT_ALLOCATIONS_TABLE =
  process.env.SUPABASE_RENTAL_PAYMENT_ALLOCATIONS_TABLE ?? "rental_payment_allocations";

export type RentalPaymentAllocationSourceType = "checkout_session";
export type RentalPaymentAllocationType = "invoice" | "deposit";

export type RentalPaymentAllocation = {
  id: string;
  sourceType: RentalPaymentAllocationSourceType;
  sourceId: string;
  allocationType: RentalPaymentAllocationType;
  targetId: string;
  amountCents: number;
  createdAt: string;
};

type PaymentAllocationRow = {
  id: string;
  source_type: RentalPaymentAllocationSourceType;
  source_id: string;
  allocation_type: RentalPaymentAllocationType;
  target_id: string;
  amount_cents: number;
  created_at: string;
};

function toAllocation(row: PaymentAllocationRow): RentalPaymentAllocation {
  return {
    id: row.id,
    sourceType: row.source_type,
    sourceId: row.source_id,
    allocationType: row.allocation_type,
    targetId: row.target_id,
    amountCents: Number(row.amount_cents ?? 0),
    createdAt: row.created_at,
  };
}

export const dbPaymentAllocationRepo = {
  async listBySource(
    sourceType: RentalPaymentAllocationSourceType,
    sourceId: string
  ): Promise<RentalPaymentAllocation[]> {
    const supabase = supabaseAdmin();
    const { data, error } = await supabase
      .from(PAYMENT_ALLOCATIONS_TABLE)
      .select("id,source_type,source_id,allocation_type,target_id,amount_cents,created_at")
      .eq("source_type", sourceType)
      .eq("source_id", sourceId)
      .order("created_at", { ascending: false });

    if (error) throw new Error(`Payment allocation list by source failed: ${error.message}`);
    return ((data ?? []) as PaymentAllocationRow[]).map(toAllocation);
  },

  async listByTarget(
    allocationType: RentalPaymentAllocationType,
    targetId: string
  ): Promise<RentalPaymentAllocation[]> {
    const supabase = supabaseAdmin();
    const { data, error } = await supabase
      .from(PAYMENT_ALLOCATIONS_TABLE)
      .select("id,source_type,source_id,allocation_type,target_id,amount_cents,created_at")
      .eq("allocation_type", allocationType)
      .eq("target_id", targetId)
      .order("created_at", { ascending: false });

    if (error) throw new Error(`Payment allocation list by target failed: ${error.message}`);
    return ((data ?? []) as PaymentAllocationRow[]).map(toAllocation);
  },

  async findBySourceAndTarget(input: {
    sourceType: RentalPaymentAllocationSourceType;
    sourceId: string;
    allocationType: RentalPaymentAllocationType;
    targetId: string;
  }): Promise<RentalPaymentAllocation | null> {
    const supabase = supabaseAdmin();
    const { data, error } = await supabase
      .from(PAYMENT_ALLOCATIONS_TABLE)
      .select("id,source_type,source_id,allocation_type,target_id,amount_cents,created_at")
      .eq("source_type", input.sourceType)
      .eq("source_id", input.sourceId)
      .eq("allocation_type", input.allocationType)
      .eq("target_id", input.targetId)
      .limit(1)
      .maybeSingle<PaymentAllocationRow>();

    if (error) throw new Error(`Payment allocation lookup failed: ${error.message}`);
    return data ? toAllocation(data) : null;
  },

  async ensureCheckoutSessionInvoiceAllocation(input: {
    sourceId: string;
    targetId: string;
    amountCents: number;
  }): Promise<RentalPaymentAllocation> {
    const amountCents = Math.round(Number(input.amountCents));
    if (!Number.isFinite(amountCents) || amountCents <= 0) {
      throw new Error("Allocation amount must be greater than 0");
    }

    const existing = await dbPaymentAllocationRepo.findBySourceAndTarget({
      sourceType: "checkout_session",
      sourceId: input.sourceId,
      allocationType: "invoice",
      targetId: input.targetId,
    });
    if (existing) return existing;

    const supabase = supabaseAdmin();
    const { data, error } = await supabase
      .from(PAYMENT_ALLOCATIONS_TABLE)
      .insert({
        source_type: "checkout_session",
        source_id: input.sourceId,
        allocation_type: "invoice",
        target_id: input.targetId,
        amount_cents: amountCents,
      })
      .select("id,source_type,source_id,allocation_type,target_id,amount_cents,created_at")
      .single<PaymentAllocationRow>();

    if (error) {
      if ((error as { code?: string }).code === "23505") {
        const duplicate = await dbPaymentAllocationRepo.findBySourceAndTarget({
          sourceType: "checkout_session",
          sourceId: input.sourceId,
          allocationType: "invoice",
          targetId: input.targetId,
        });
        if (duplicate) return duplicate;
      }
      throw new Error(`Payment allocation insert failed: ${error.message}`);
    }

    return toAllocation(data);
  },

  async ensureCheckoutSessionDepositAllocation(input: {
    sourceId: string;
    targetId: string;
    amountCents: number;
  }): Promise<RentalPaymentAllocation> {
    const amountCents = Math.round(Number(input.amountCents));
    if (!Number.isFinite(amountCents) || amountCents <= 0) {
      throw new Error("Allocation amount must be greater than 0");
    }

    const existing = await dbPaymentAllocationRepo.findBySourceAndTarget({
      sourceType: "checkout_session",
      sourceId: input.sourceId,
      allocationType: "deposit",
      targetId: input.targetId,
    });
    if (existing) return existing;

    const supabase = supabaseAdmin();
    const { data, error } = await supabase
      .from(PAYMENT_ALLOCATIONS_TABLE)
      .insert({
        source_type: "checkout_session",
        source_id: input.sourceId,
        allocation_type: "deposit",
        target_id: input.targetId,
        amount_cents: amountCents,
      })
      .select("id,source_type,source_id,allocation_type,target_id,amount_cents,created_at")
      .single<PaymentAllocationRow>();

    if (error) {
      if ((error as { code?: string }).code === "23505") {
        const duplicate = await dbPaymentAllocationRepo.findBySourceAndTarget({
          sourceType: "checkout_session",
          sourceId: input.sourceId,
          allocationType: "deposit",
          targetId: input.targetId,
        });
        if (duplicate) return duplicate;
      }
      throw new Error(`Payment allocation insert failed: ${error.message}`);
    }

    return toAllocation(data);
  },
};
