import "server-only";

import type {
  RentalDepositTransaction,
  RentalDepositTransactionType,
  RentalOrderDeposit,
  RentalOrderDepositStatus,
  RentalOrderDepositSummary,
} from "@/lib/rental/deposits/types";
import { dbPaymentAllocationRepo } from "@/lib/rental/payments/db-payment-allocation-repo";
import { supabaseAdmin } from "@/lib/supabase/server";

const ORDER_DEPOSITS_TABLE =
  process.env.SUPABASE_RENTAL_ORDER_DEPOSITS_TABLE ?? "rental_order_deposits";
const DEPOSIT_TRANSACTIONS_TABLE =
  process.env.SUPABASE_RENTAL_DEPOSIT_TRANSACTIONS_TABLE ?? "rental_deposit_transactions";

type OrderDepositRow = {
  id: string;
  order_id: string;
  customer_id: string | null;
  required_amount_cents: number;
  held_amount_cents: number;
  released_amount_cents: number;
  retained_amount_cents: number;
  status: RentalOrderDepositStatus;
  source_invoice_id: string | null;
  last_payment_session_id: string | null;
  last_invoice_payment_id: string | null;
  last_collected_at: string | null;
  resolved_at: string | null;
  last_resolution_type: "release" | "retain" | "split" | null;
  last_resolution_note: string | null;
  last_resolution_recorded_by: string | null;
  last_resolution_reference: string | null;
  released_at: string | null;
  retained_at: string | null;
  notes: string | null;
  metadata: Record<string, unknown> | null;
  created_at: string;
  updated_at: string;
};

type DepositTransactionRow = {
  id: string;
  deposit_id: string;
  order_id: string;
  customer_id: string | null;
  transaction_type: RentalDepositTransactionType;
  amount_cents: number;
  payment_session_id: string | null;
  invoice_id: string | null;
  invoice_payment_id: string | null;
  payment_allocation_id: string | null;
  recorded_by: string | null;
  external_reference: string | null;
  notes: string | null;
  metadata: Record<string, unknown> | null;
  created_at: string;
};

const ORDER_DEPOSIT_COLUMNS = [
  "id",
  "order_id",
  "customer_id",
  "required_amount_cents",
  "held_amount_cents",
  "released_amount_cents",
  "retained_amount_cents",
  "status",
  "source_invoice_id",
  "last_payment_session_id",
  "last_invoice_payment_id",
  "last_collected_at",
  "resolved_at",
  "last_resolution_type",
  "last_resolution_note",
  "last_resolution_recorded_by",
  "last_resolution_reference",
  "released_at",
  "retained_at",
  "notes",
  "metadata",
  "created_at",
  "updated_at",
].join(",");

const DEPOSIT_TRANSACTION_COLUMNS = [
  "id",
  "deposit_id",
  "order_id",
  "customer_id",
  "transaction_type",
  "amount_cents",
  "payment_session_id",
  "invoice_id",
  "invoice_payment_id",
  "payment_allocation_id",
  "recorded_by",
  "external_reference",
  "notes",
  "metadata",
  "created_at",
].join(",");

function nowIso() {
  return new Date().toISOString();
}

function clampNonNegativeInt(value: number | undefined | null) {
  const parsed = Math.round(Number(value ?? 0));
  if (!Number.isFinite(parsed)) return 0;
  return Math.max(0, parsed);
}

function computeUnresolvedHeldAmountCents(input: {
  heldAmountCents: number;
  releasedAmountCents: number;
  retainedAmountCents: number;
}) {
  return Math.max(
    clampNonNegativeInt(input.heldAmountCents) -
      clampNonNegativeInt(input.releasedAmountCents) -
      clampNonNegativeInt(input.retainedAmountCents),
    0
  );
}

function deriveDepositStatus(input: {
  requiredAmountCents: number;
  heldAmountCents: number;
  releasedAmountCents: number;
  retainedAmountCents: number;
}): RentalOrderDepositStatus {
  const requiredAmountCents = clampNonNegativeInt(input.requiredAmountCents);
  const heldAmountCents = clampNonNegativeInt(input.heldAmountCents);
  const releasedAmountCents = clampNonNegativeInt(input.releasedAmountCents);
  const retainedAmountCents = clampNonNegativeInt(input.retainedAmountCents);
  const unresolvedHeldAmountCents = computeUnresolvedHeldAmountCents({
    heldAmountCents,
    releasedAmountCents,
    retainedAmountCents,
  });

  if (requiredAmountCents <= 0) return "not_required";
  if (retainedAmountCents >= heldAmountCents && heldAmountCents > 0 && unresolvedHeldAmountCents <= 0) {
    return "retained";
  }
  if (
    releasedAmountCents >= heldAmountCents &&
    heldAmountCents > 0 &&
    retainedAmountCents <= 0 &&
    unresolvedHeldAmountCents <= 0
  ) {
    return "released";
  }
  if (retainedAmountCents > 0 && unresolvedHeldAmountCents <= 0) return "partially_retained";
  if (releasedAmountCents > 0 && unresolvedHeldAmountCents <= 0) return "partially_released";
  if (retainedAmountCents > 0) return "partially_retained";
  if (releasedAmountCents > 0) return "partially_released";
  if (heldAmountCents >= requiredAmountCents) return "held";
  if (heldAmountCents > 0) return "partially_held";
  return "pending";
}

function toDeposit(row: OrderDepositRow): RentalOrderDeposit {
  return {
    id: row.id,
    orderId: row.order_id,
    customerId: row.customer_id ?? undefined,
    requiredAmountCents: clampNonNegativeInt(row.required_amount_cents),
    heldAmountCents: clampNonNegativeInt(row.held_amount_cents),
    releasedAmountCents: clampNonNegativeInt(row.released_amount_cents),
    retainedAmountCents: clampNonNegativeInt(row.retained_amount_cents),
    status: row.status,
    sourceInvoiceId: row.source_invoice_id ?? undefined,
    lastPaymentSessionId: row.last_payment_session_id ?? undefined,
    lastInvoicePaymentId: row.last_invoice_payment_id ?? undefined,
    lastCollectedAt: row.last_collected_at ?? undefined,
    resolvedAt: row.resolved_at ?? undefined,
    lastResolutionType: row.last_resolution_type ?? undefined,
    lastResolutionNote: row.last_resolution_note ?? undefined,
    lastResolutionRecordedBy: row.last_resolution_recorded_by ?? undefined,
    lastResolutionReference: row.last_resolution_reference ?? undefined,
    releasedAt: row.released_at ?? undefined,
    retainedAt: row.retained_at ?? undefined,
    notes: row.notes ?? undefined,
    metadata: row.metadata ?? undefined,
    createdAt: row.created_at,
    updatedAt: row.updated_at,
  };
}

function toTransaction(row: DepositTransactionRow): RentalDepositTransaction {
  return {
    id: row.id,
    depositId: row.deposit_id,
    orderId: row.order_id,
    customerId: row.customer_id ?? undefined,
    transactionType: row.transaction_type,
    amountCents: clampNonNegativeInt(row.amount_cents),
    paymentSessionId: row.payment_session_id ?? undefined,
    invoiceId: row.invoice_id ?? undefined,
    invoicePaymentId: row.invoice_payment_id ?? undefined,
    paymentAllocationId: row.payment_allocation_id ?? undefined,
    recordedBy: row.recorded_by ?? undefined,
    externalReference: row.external_reference ?? undefined,
    notes: row.notes ?? undefined,
    metadata: row.metadata ?? undefined,
    createdAt: row.created_at,
  };
}

function toSummary(deposit: RentalOrderDeposit | null, orderId: string): RentalOrderDepositSummary {
  if (!deposit) {
    return {
      orderId,
      requiredAmountCents: 0,
      heldAmountCents: 0,
      releasedAmountCents: 0,
      retainedAmountCents: 0,
      unresolvedAmountCents: 0,
      status: "not_required",
    };
  }

  return {
    depositId: deposit.id,
    orderId: deposit.orderId,
    requiredAmountCents: deposit.requiredAmountCents,
    heldAmountCents: deposit.heldAmountCents,
    releasedAmountCents: deposit.releasedAmountCents,
    retainedAmountCents: deposit.retainedAmountCents,
    unresolvedAmountCents: computeUnresolvedHeldAmountCents({
      heldAmountCents: deposit.heldAmountCents,
      releasedAmountCents: deposit.releasedAmountCents,
      retainedAmountCents: deposit.retainedAmountCents,
    }),
    status: deposit.status,
    sourceInvoiceId: deposit.sourceInvoiceId,
    lastPaymentSessionId: deposit.lastPaymentSessionId,
    lastInvoicePaymentId: deposit.lastInvoicePaymentId,
    lastCollectedAt: deposit.lastCollectedAt,
    resolvedAt: deposit.resolvedAt,
    lastResolutionType: deposit.lastResolutionType,
    lastResolutionNote: deposit.lastResolutionNote,
    lastResolutionRecordedBy: deposit.lastResolutionRecordedBy,
    lastResolutionReference: deposit.lastResolutionReference,
  };
}

async function insertTransaction(input: {
  depositId: string;
  orderId: string;
  customerId?: string;
  transactionType: RentalDepositTransactionType;
  amountCents: number;
  paymentSessionId?: string;
  invoiceId?: string;
  invoicePaymentId?: string;
  paymentAllocationId?: string;
  recordedBy?: string;
  externalReference?: string;
  notes?: string;
  metadata?: Record<string, unknown>;
}) {
  const supabase = supabaseAdmin();
  const { data, error } = await supabase
    .from(DEPOSIT_TRANSACTIONS_TABLE)
    .insert({
      deposit_id: input.depositId,
      order_id: input.orderId,
      customer_id: input.customerId ?? null,
      transaction_type: input.transactionType,
      amount_cents: clampNonNegativeInt(input.amountCents),
      payment_session_id: input.paymentSessionId ?? null,
      invoice_id: input.invoiceId ?? null,
      invoice_payment_id: input.invoicePaymentId ?? null,
      payment_allocation_id: input.paymentAllocationId ?? null,
      recorded_by: input.recordedBy ?? null,
      external_reference: input.externalReference ?? null,
      notes: input.notes ?? null,
      metadata: input.metadata ?? {},
    })
    .select(DEPOSIT_TRANSACTION_COLUMNS)
    .single<DepositTransactionRow>();

  if (error) throw new Error(`Deposit transaction insert failed: ${error.message}`);
  return toTransaction(data);
}

export const dbRentalDepositRepo = {
  async getByOrderId(orderId: string): Promise<RentalOrderDeposit | null> {
    const supabase = supabaseAdmin();
    const { data, error } = await supabase
      .from(ORDER_DEPOSITS_TABLE)
      .select(ORDER_DEPOSIT_COLUMNS)
      .eq("order_id", orderId)
      .maybeSingle<OrderDepositRow>();

    if (error) throw new Error(`Deposit read failed: ${error.message}`);
    return data ? toDeposit(data) : null;
  },

  async getSummaryByOrderId(orderId: string): Promise<RentalOrderDepositSummary> {
    return toSummary(await dbRentalDepositRepo.getByOrderId(orderId), orderId);
  },

  async listByOrderIds(orderIds: string[]): Promise<Record<string, RentalOrderDepositSummary>> {
    if (!orderIds.length) return {};

    const supabase = supabaseAdmin();
    const { data, error } = await supabase
      .from(ORDER_DEPOSITS_TABLE)
      .select(ORDER_DEPOSIT_COLUMNS)
      .in("order_id", orderIds);

    if (error) throw new Error(`Deposit list by orders failed: ${error.message}`);

    const deposits = new Map(
      ((data ?? []) as unknown as OrderDepositRow[]).map((row) => {
        const deposit = toDeposit(row);
        return [deposit.orderId, deposit] as const;
      })
    );

    return Object.fromEntries(
      orderIds.map((orderId) => [orderId, toSummary(deposits.get(orderId) ?? null, orderId)])
    );
  },

  async listByCustomerId(customerId: string): Promise<RentalOrderDeposit[]> {
    const supabase = supabaseAdmin();
    const { data, error } = await supabase
      .from(ORDER_DEPOSITS_TABLE)
      .select(ORDER_DEPOSIT_COLUMNS)
      .eq("customer_id", customerId)
      .order("created_at", { ascending: false });

    if (error) throw new Error(`Deposit list by customer failed: ${error.message}`);
    return ((data ?? []) as unknown as OrderDepositRow[]).map(toDeposit);
  },

  async listTransactionsByDepositId(depositId: string): Promise<RentalDepositTransaction[]> {
    const supabase = supabaseAdmin();
    const { data, error } = await supabase
      .from(DEPOSIT_TRANSACTIONS_TABLE)
      .select(DEPOSIT_TRANSACTION_COLUMNS)
      .eq("deposit_id", depositId)
      .order("created_at", { ascending: false });

    if (error) throw new Error(`Deposit transaction list failed: ${error.message}`);
    return ((data ?? []) as unknown as DepositTransactionRow[]).map(toTransaction);
  },

  async findCollectedTransactionByPaymentSessionId(
    depositId: string,
    paymentSessionId: string
  ): Promise<RentalDepositTransaction | null> {
    const supabase = supabaseAdmin();
    const { data, error } = await supabase
      .from(DEPOSIT_TRANSACTIONS_TABLE)
      .select(DEPOSIT_TRANSACTION_COLUMNS)
      .eq("deposit_id", depositId)
      .eq("transaction_type", "payment_collected")
      .eq("payment_session_id", paymentSessionId)
      .limit(1)
      .maybeSingle<DepositTransactionRow>();

    if (error) throw new Error(`Deposit transaction lookup failed: ${error.message}`);
    return data ? toTransaction(data) : null;
  },

  async ensureOrderDeposit(input: {
    orderId: string;
    customerId?: string;
    requiredAmountCents: number;
    sourceInvoiceId?: string;
    notes?: string;
    metadata?: Record<string, unknown>;
  }): Promise<RentalOrderDeposit> {
    const existing = await dbRentalDepositRepo.getByOrderId(input.orderId);
    const requiredAmountCents = clampNonNegativeInt(input.requiredAmountCents);

    if (existing) {
      const nextStatus = deriveDepositStatus({
        requiredAmountCents,
        heldAmountCents: existing.heldAmountCents,
        releasedAmountCents: existing.releasedAmountCents,
        retainedAmountCents: existing.retainedAmountCents,
      });
      const supabase = supabaseAdmin();
      const { data, error } = await supabase
        .from(ORDER_DEPOSITS_TABLE)
        .update({
          customer_id: input.customerId ?? existing.customerId ?? null,
          required_amount_cents: requiredAmountCents,
          source_invoice_id: input.sourceInvoiceId ?? existing.sourceInvoiceId ?? null,
          notes: input.notes ?? existing.notes ?? null,
          metadata: input.metadata ?? existing.metadata ?? {},
          status: nextStatus,
          updated_at: nowIso(),
        })
        .eq("id", existing.id)
        .select(ORDER_DEPOSIT_COLUMNS)
        .single<OrderDepositRow>();

      if (error) throw new Error(`Deposit update failed: ${error.message}`);
      return toDeposit(data);
    }

    const status = deriveDepositStatus({
      requiredAmountCents,
      heldAmountCents: 0,
      releasedAmountCents: 0,
      retainedAmountCents: 0,
    });
    const supabase = supabaseAdmin();
    const { data, error } = await supabase
      .from(ORDER_DEPOSITS_TABLE)
      .insert({
        order_id: input.orderId,
        customer_id: input.customerId ?? null,
        required_amount_cents: requiredAmountCents,
        held_amount_cents: 0,
        released_amount_cents: 0,
        retained_amount_cents: 0,
        status,
        source_invoice_id: input.sourceInvoiceId ?? null,
        notes: input.notes ?? null,
        metadata: input.metadata ?? {},
        created_at: nowIso(),
        updated_at: nowIso(),
      })
      .select(ORDER_DEPOSIT_COLUMNS)
      .single<OrderDepositRow>();

    if (error) throw new Error(`Deposit create failed: ${error.message}`);
    const deposit = toDeposit(data);
    await insertTransaction({
      depositId: deposit.id,
      orderId: deposit.orderId,
      customerId: deposit.customerId,
      transactionType: "requirement_created",
      amountCents: deposit.requiredAmountCents,
      invoiceId: deposit.sourceInvoiceId,
      notes: deposit.requiredAmountCents > 0 ? "Deposit requirement created" : "No deposit required",
      metadata: input.metadata,
    });
    return deposit;
  },

  async recordCollectedCheckoutSessionDeposit(input: {
    orderId: string;
    customerId?: string;
    requiredAmountCents: number;
    paymentSessionId: string;
    amountCents: number;
    invoiceId?: string;
    invoicePaymentId?: string;
  }): Promise<{
    deposit: RentalOrderDeposit;
    transaction: RentalDepositTransaction | null;
  }> {
    const amountCents = clampNonNegativeInt(input.amountCents);
    const deposit = await dbRentalDepositRepo.ensureOrderDeposit({
      orderId: input.orderId,
      customerId: input.customerId,
      requiredAmountCents: input.requiredAmountCents,
      sourceInvoiceId: input.invoiceId,
    });

    if (amountCents <= 0) {
      return { deposit, transaction: null };
    }

    const existing = await dbRentalDepositRepo.findCollectedTransactionByPaymentSessionId(
      deposit.id,
      input.paymentSessionId
    );
    if (existing) {
      const refreshed = await dbRentalDepositRepo.getByOrderId(input.orderId);
      return { deposit: refreshed ?? deposit, transaction: existing };
    }

    const allocation = await dbPaymentAllocationRepo.ensureCheckoutSessionDepositAllocation({
      sourceId: input.paymentSessionId,
      targetId: deposit.id,
      amountCents,
    });

    const transaction = await insertTransaction({
      depositId: deposit.id,
      orderId: deposit.orderId,
      customerId: input.customerId ?? deposit.customerId,
      transactionType: "payment_collected",
      amountCents,
      paymentSessionId: input.paymentSessionId,
      invoiceId: input.invoiceId ?? deposit.sourceInvoiceId,
      invoicePaymentId: input.invoicePaymentId,
      paymentAllocationId: allocation.id,
      notes: "Deposit collected via checkout payment session",
      metadata: {
        source: "checkout_payment_session",
      },
    });

    const nextHeldAmountCents = deposit.heldAmountCents + amountCents;
    const nextStatus = deriveDepositStatus({
      requiredAmountCents: deposit.requiredAmountCents,
      heldAmountCents: nextHeldAmountCents,
      releasedAmountCents: deposit.releasedAmountCents,
      retainedAmountCents: deposit.retainedAmountCents,
    });
    const supabase = supabaseAdmin();
    const { data, error } = await supabase
      .from(ORDER_DEPOSITS_TABLE)
      .update({
        held_amount_cents: nextHeldAmountCents,
        status: nextStatus,
        source_invoice_id: input.invoiceId ?? deposit.sourceInvoiceId ?? null,
        last_payment_session_id: input.paymentSessionId,
        last_invoice_payment_id: input.invoicePaymentId ?? null,
        last_collected_at: nowIso(),
        updated_at: nowIso(),
      })
      .eq("id", deposit.id)
      .select(ORDER_DEPOSIT_COLUMNS)
      .single<OrderDepositRow>();

    if (error) throw new Error(`Deposit collection update failed: ${error.message}`);
    return {
      deposit: toDeposit(data),
      transaction,
    };
  },

  async resolveHeldDeposit(input: {
    orderId: string;
    releaseAmountCents?: number;
    retainAmountCents?: number;
    note?: string;
    recordedBy?: string;
    externalReference?: string;
  }): Promise<{
    deposit: RentalOrderDeposit;
    transactions: RentalDepositTransaction[];
  }> {
    const deposit = await dbRentalDepositRepo.getByOrderId(input.orderId);
    if (!deposit) throw new Error("Deposit record not found");

    const releaseAmountCents = clampNonNegativeInt(input.releaseAmountCents);
    const retainAmountCents = clampNonNegativeInt(input.retainAmountCents);
    const totalResolutionAmountCents = releaseAmountCents + retainAmountCents;
    if (totalResolutionAmountCents <= 0) {
      throw new Error("Resolution amount must be greater than 0");
    }

    const unresolvedAmountCents = computeUnresolvedHeldAmountCents({
      heldAmountCents: deposit.heldAmountCents,
      releasedAmountCents: deposit.releasedAmountCents,
      retainedAmountCents: deposit.retainedAmountCents,
    });
    if (unresolvedAmountCents <= 0) {
      throw new Error("Deposit is already fully resolved");
    }
    if (totalResolutionAmountCents > unresolvedAmountCents) {
      throw new Error("Resolution exceeds unresolved held deposit balance");
    }

    const transactions: RentalDepositTransaction[] = [];
    const resolutionType =
      releaseAmountCents > 0 && retainAmountCents > 0
        ? "split"
        : releaseAmountCents > 0
          ? "release"
          : "retain";
    const resolutionAt = nowIso();

    if (releaseAmountCents > 0) {
      transactions.push(
        await insertTransaction({
          depositId: deposit.id,
          orderId: deposit.orderId,
          customerId: deposit.customerId,
          transactionType: "released",
          amountCents: releaseAmountCents,
          recordedBy: input.recordedBy,
          externalReference: input.externalReference,
          notes: input.note?.trim() || "Deposit released/refund recorded",
          metadata: {
            resolutionType,
            accountingOnly: true,
          },
        })
      );
    }

    if (retainAmountCents > 0) {
      transactions.push(
        await insertTransaction({
          depositId: deposit.id,
          orderId: deposit.orderId,
          customerId: deposit.customerId,
          transactionType: "retained",
          amountCents: retainAmountCents,
          recordedBy: input.recordedBy,
          externalReference: input.externalReference,
          notes: input.note?.trim() || "Deposit retained",
          metadata: {
            resolutionType,
          },
        })
      );
    }

    const nextReleasedAmountCents = deposit.releasedAmountCents + releaseAmountCents;
    const nextRetainedAmountCents = deposit.retainedAmountCents + retainAmountCents;
    const nextStatus = deriveDepositStatus({
      requiredAmountCents: deposit.requiredAmountCents,
      heldAmountCents: deposit.heldAmountCents,
      releasedAmountCents: nextReleasedAmountCents,
      retainedAmountCents: nextRetainedAmountCents,
    });
    const nextUnresolvedAmountCents = computeUnresolvedHeldAmountCents({
      heldAmountCents: deposit.heldAmountCents,
      releasedAmountCents: nextReleasedAmountCents,
      retainedAmountCents: nextRetainedAmountCents,
    });

    const supabase = supabaseAdmin();
    const { data, error } = await supabase
      .from(ORDER_DEPOSITS_TABLE)
      .update({
        released_amount_cents: nextReleasedAmountCents,
        retained_amount_cents: nextRetainedAmountCents,
        status: nextStatus,
        resolved_at: nextUnresolvedAmountCents <= 0 ? resolutionAt : null,
        last_resolution_type: resolutionType,
        last_resolution_note: input.note?.trim() || null,
        last_resolution_recorded_by: input.recordedBy ?? null,
        last_resolution_reference: input.externalReference ?? null,
        released_at: releaseAmountCents > 0 ? resolutionAt : deposit.releasedAt ?? null,
        retained_at: retainAmountCents > 0 ? resolutionAt : deposit.retainedAt ?? null,
        updated_at: resolutionAt,
      })
      .eq("id", deposit.id)
      .select(ORDER_DEPOSIT_COLUMNS)
      .single<OrderDepositRow>();

    if (error) throw new Error(`Deposit resolution update failed: ${error.message}`);
    return {
      deposit: toDeposit(data),
      transactions,
    };
  },
};
