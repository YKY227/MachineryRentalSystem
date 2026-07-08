import "server-only";

import { dbRentalCheckoutGroupRepo } from "@/lib/rental/checkout-groups/db-checkout-group-repo";
import { dbCheckoutGroupPaymentSessionRepo } from "@/lib/rental/checkout-groups/db-checkout-group-payment-session-repo";
import type { RentalCheckoutGroup, RentalCheckoutGroupLine } from "@/lib/rental/checkout-groups/types";
import type { RentalCheckoutGroupPaymentSession } from "@/lib/rental/checkout-groups/payment-session-types";
import { dbRentalDepositRepo } from "@/lib/rental/deposits/db-rental-deposit-repo";
import { dbInvoiceRepo } from "@/lib/rental/invoices/db-invoice-repo";
import { dbOrderRepo } from "@/lib/rental/orders/db-order-repo";
import {
  createHitPayPaymentRequest,
  fetchHitPayPaymentRequest,
  getCheckoutGroupStatusPageUrl,
} from "@/lib/rental/orders/hitpay";
import type { CreateRentalOrderInput } from "@/lib/rental/orders/types";
import { supabaseAdmin } from "@/lib/supabase/server";

const HOLDS_TABLE = process.env.SUPABASE_RENTAL_AVAILABILITY_HOLDS_TABLE ?? "rental_availability_holds";
const INVOICE_PAYMENTS_TABLE = process.env.SUPABASE_INVOICE_PAYMENTS_TABLE ?? "rental_invoice_payments";
const INVOICE_TABLE = process.env.SUPABASE_INVOICES_TABLE ?? "rental_invoices";
const ORDER_DEPOSITS_TABLE =
  process.env.SUPABASE_RENTAL_ORDER_DEPOSITS_TABLE ?? "rental_order_deposits";
const DEPOSIT_TRANSACTIONS_TABLE =
  process.env.SUPABASE_RENTAL_DEPOSIT_TRANSACTIONS_TABLE ?? "rental_deposit_transactions";
const ALLOCATIONS_TABLE =
  process.env.SUPABASE_RENTAL_CHECKOUT_GROUP_PAYMENT_ALLOCATIONS_TABLE ??
  "rental_checkout_group_payment_allocations";

export class CheckoutGroupPaymentConflictError extends Error {
  status = 409;
}

type ProviderStatus = "pending" | "paid" | "failed" | "expired" | "cancelled";

type GroupInvoicePayment = {
  id: string;
  amountCents: number;
};

function isGroupConversionComplete(group: RentalCheckoutGroup | null) {
  return Boolean(
    group &&
      group.status === "paid" &&
      group.convertedAt &&
      group.lines.length > 0 &&
      group.lines.every((line) => line.status === "paid" && line.rentalOrderId && line.invoiceId)
  );
}

function nowIso() {
  return new Date().toISOString();
}

function cents(value: unknown) {
  const parsed = Math.round(Number(value ?? 0));
  if (!Number.isFinite(parsed)) return 0;
  return Math.max(0, parsed);
}

function isInactiveProviderStatus(status: ProviderStatus) {
  return status === "failed" || status === "expired" || status === "cancelled";
}

function groupPaymentAmountCents(group: RentalCheckoutGroup) {
  return cents(group.displayTotalCents);
}

function assertCustomerOwnsGroup(group: RentalCheckoutGroup | null, customerId: string) {
  if (!group || group.customerId !== customerId) {
    throw new Error("Checkout group not found");
  }
  return group;
}

function holdExpired(group: RentalCheckoutGroup) {
  if (!group.holdExpiresAt) return true;
  const expiresAt = new Date(group.holdExpiresAt).getTime();
  return Number.isNaN(expiresAt) || expiresAt <= Date.now();
}

async function listActiveGroupHolds(group: RentalCheckoutGroup) {
  const supabase = supabaseAdmin();
  const { data, error } = await supabase
    .from(HOLDS_TABLE)
    .select("id,checkout_group_line_id,expires_at,status")
    .eq("checkout_group_id", group.id)
    .eq("status", "active")
    .gt("expires_at", nowIso());

  if (error) throw new Error(`Checkout group hold read failed: ${error.message}`);
  return (data ?? []) as Array<{
    id: string;
    checkout_group_line_id: string | null;
    expires_at: string;
    status: string;
  }>;
}

async function assertGroupHoldsActive(group: RentalCheckoutGroup) {
  if (holdExpired(group)) {
    throw new CheckoutGroupPaymentConflictError("Checkout group holds have expired");
  }
  const activeHolds = await listActiveGroupHolds(group);
  const activeLineIds = new Set(
    activeHolds.map((hold) => hold.checkout_group_line_id).filter(Boolean)
  );
  const missingLine = group.lines.find((line) => !activeLineIds.has(line.id));
  if (missingLine) {
    throw new CheckoutGroupPaymentConflictError("One or more checkout group holds are no longer active");
  }
}

async function markManualReview(input: {
  groupId: string;
  sessionId?: string;
  reason: string;
  payload?: Record<string, unknown>;
}) {
  await dbRentalCheckoutGroupRepo.markManualReview(input.groupId, input.reason, input.sessionId);
  const group = await dbRentalCheckoutGroupRepo.getGroupWithLines(input.groupId);
  if (isGroupConversionComplete(group)) return;
  if (input.sessionId) {
    await dbCheckoutGroupPaymentSessionRepo.markManualReview(input.sessionId, input.reason, input.payload);
  }
}

async function expireOrFailPendingSession(
  session: RentalCheckoutGroupPaymentSession,
  status: Exclude<ProviderStatus, "pending" | "paid">,
  payload: Record<string, unknown>
) {
  await dbCheckoutGroupPaymentSessionRepo.update(session.id, {
    status,
    expiredAt: status === "expired" ? nowIso() : undefined,
    failedAt: status === "failed" ? nowIso() : undefined,
    providerPayload: payload,
  });
}

export async function createCheckoutGroupPaymentLink(input: {
  checkoutGroupId: string;
  customerId: string;
}) {
  const group = assertCustomerOwnsGroup(
    await dbRentalCheckoutGroupRepo.getGroupWithLines(input.checkoutGroupId),
    input.customerId
  );
  if (group.status !== "holds_acquired" && group.status !== "payment_pending") {
    throw new Error("Checkout group is not ready for payment");
  }
  await assertGroupHoldsActive(group);

  if (group.payableTotalCents <= 0) {
    throw new Error("Checkout group has no payable rental amount");
  }

  const amountCents = groupPaymentAmountCents(group);
  if (amountCents <= 0) {
    throw new Error("Checkout group payment amount is invalid");
  }

  const latest = await dbCheckoutGroupPaymentSessionRepo.getLatestForGroup(group.id);
  if (latest?.status === "paid") {
    throw new CheckoutGroupPaymentConflictError("Payment has already been received for this checkout group");
  }
  if (latest?.status === "manual_review") {
    throw new CheckoutGroupPaymentConflictError("This checkout group is under manual review");
  }

  const existing = await dbCheckoutGroupPaymentSessionRepo.findPendingForGroup({
    checkoutGroupId: group.id,
    currency: group.currency,
  });
  if (existing) {
    if (existing.amountCents === amountCents && existing.redirectUrl) {
      return { group, session: existing, reused: true };
    }

    if (existing.providerPaymentRequestId) {
      let providerState;
      try {
        providerState = await fetchHitPayPaymentRequest(existing.providerPaymentRequestId);
      } catch {
        throw new CheckoutGroupPaymentConflictError(
          "An existing payment link may still be active. Please retry later or contact support."
        );
      }
      if (providerState.status === "pending" || providerState.status === "paid") {
        throw new CheckoutGroupPaymentConflictError(
          "An existing payment link is still active. Please use the existing link or contact support."
        );
      }
      if (isInactiveProviderStatus(providerState.status)) {
        await expireOrFailPendingSession(existing, providerState.status, providerState.raw);
      }
    } else {
      throw new CheckoutGroupPaymentConflictError(
        "A payment link is still being prepared. Please retry shortly."
      );
    }
  }

  let session: RentalCheckoutGroupPaymentSession;
  try {
    session = await dbCheckoutGroupPaymentSessionRepo.createPending({
      checkoutGroupId: group.id,
      amountCents,
      currency: group.currency,
    });
  } catch (error) {
    const pending = await dbCheckoutGroupPaymentSessionRepo.findPendingForGroup({
      checkoutGroupId: group.id,
      currency: group.currency,
    });
    if (pending?.amountCents === amountCents && pending.redirectUrl) {
      return { group, session: pending, reused: true };
    }
    throw error;
  }

  try {
    const paymentRequest = await createHitPayPaymentRequest({
      amountCents,
      currency: group.currency,
      purpose: `Grouped rental checkout ${group.id}`,
      referenceNumber: group.id,
      redirectUrl: getCheckoutGroupStatusPageUrl(group.id),
    });
    const updatedSession = await dbCheckoutGroupPaymentSessionRepo.update(session.id, {
      providerPaymentRequestId: paymentRequest.id,
      providerReferenceNumber: paymentRequest.referenceNumber,
      redirectUrl: paymentRequest.url,
      status: paymentRequest.status,
      providerPayload: paymentRequest.raw,
    });
    await dbRentalCheckoutGroupRepo.linkPaymentSession(group.id, updatedSession.id);
    const refreshedGroup = (await dbRentalCheckoutGroupRepo.getGroupWithLines(group.id)) ?? group;
    return { group: refreshedGroup, session: updatedSession, reused: false };
  } catch (error) {
    await dbCheckoutGroupPaymentSessionRepo.update(session.id, {
      status: "failed",
      failedAt: nowIso(),
      providerPayload: {
        error: error instanceof Error ? error.message : "HitPay payment request failed",
      },
    }).catch(() => null);
    throw error;
  }
}

export async function refreshCheckoutGroupPaymentSessionFromProvider(input: {
  session: RentalCheckoutGroupPaymentSession;
  source: "status" | "webhook" | "admin";
  webhookPayload?: Record<string, unknown>;
}) {
  if (!input.session.providerPaymentRequestId) return input.session;
  const providerState = await fetchHitPayPaymentRequest(input.session.providerPaymentRequestId);
  return dbCheckoutGroupPaymentSessionRepo.update(input.session.id, {
    providerReferenceNumber: providerState.referenceNumber || input.session.providerReferenceNumber,
    status: providerState.status,
    paidAt:
      providerState.status === "paid"
        ? providerState.paidAt ?? input.session.paidAt ?? nowIso()
        : input.session.paidAt,
    expiredAt: providerState.status === "expired" ? nowIso() : input.session.expiredAt,
    failedAt: providerState.status === "failed" ? nowIso() : input.session.failedAt,
    providerPayload: {
      ...(input.session.providerPayload ?? {}),
      providerStatusCheck: {
        source: input.source,
        checkedAt: nowIso(),
        status: providerState.status,
        paidAt: providerState.paidAt ?? null,
      },
      provider: providerState.raw,
    },
    webhookPayload: input.webhookPayload
      ? {
          ...(input.session.webhookPayload ?? {}),
          webhook: input.webhookPayload,
        }
      : undefined,
  });
}

function childOrderIdForLine(line: RentalCheckoutGroupLine) {
  return `grp-${line.id}`;
}

function orderInputFromLine(group: RentalCheckoutGroup, line: RentalCheckoutGroupLine): CreateRentalOrderInput {
  return {
    id: line.rentalOrderId ?? childOrderIdForLine(line),
    customerId: group.customerId,
    equipmentId: line.equipmentId,
    equipmentTitle: line.equipmentTitleSnapshot,
    qty: line.qty,
    start: line.startDate,
    end: line.endDate,
    fulfillment: line.fulfillment,
    pricingSnapshot: line.pricingSnapshot,
    customerSnapshot: {
      customerId: group.customerId,
      companyName: group.companyName ?? group.customerName,
      contactName: group.customerName,
      email: group.customerEmail,
      phone: group.customerPhone,
    },
    checkoutGroupId: group.id,
    checkoutGroupLineId: line.id,
  };
}

async function issueInvoiceForOrder(input: {
  orderId: string;
  equipmentTitle: string;
  qty: number;
  start: string;
  end: string;
  pricingSnapshot: RentalCheckoutGroupLine["pricingSnapshot"];
}) {
  let invoice = await dbInvoiceRepo.findActiveByOrderId(input.orderId);
  if (!invoice) {
    invoice = await dbInvoiceRepo.createDraftFromOrder(input);
  }
  if (invoice.status === "draft") {
    invoice = await dbInvoiceRepo.issue(invoice.id);
  }
  return invoice;
}

async function recordGroupInvoicePayment(input: {
  session: RentalCheckoutGroupPaymentSession;
  invoiceId: string;
  amountCents: number;
}) {
  const supabase = supabaseAdmin();
  const existing = await supabase
    .from(INVOICE_PAYMENTS_TABLE)
    .select("id,amount_cents")
    .eq("source_checkout_group_payment_session_id", input.session.id)
    .eq("invoice_id", input.invoiceId)
    .limit(1)
    .maybeSingle<{ id: string; amount_cents: number }>();

  if (existing.error) throw new Error(`Group invoice payment lookup failed: ${existing.error.message}`);
  if (existing.data) {
    return {
      id: existing.data.id,
      amountCents: cents(existing.data.amount_cents),
    } satisfies GroupInvoicePayment;
  }

  const invoiceRes = await supabase
    .from(INVOICE_TABLE)
    .select("id,status,total_incl_gst_cents")
    .eq("id", input.invoiceId)
    .maybeSingle<{ id: string; status: string; total_incl_gst_cents: number | null }>();
  if (invoiceRes.error) throw new Error(`Invoice read failed: ${invoiceRes.error.message}`);
  const invoice = invoiceRes.data;
  if (!invoice) throw new Error("Invoice not found");
  if (invoice.status !== "issued") throw new Error("Invoice must be issued before payment allocation");

  const paidRes = await supabase
    .from(INVOICE_PAYMENTS_TABLE)
    .select("amount_cents")
    .eq("invoice_id", input.invoiceId);
  if (paidRes.error) throw new Error(`Invoice payment total read failed: ${paidRes.error.message}`);
  const paidCents = (paidRes.data ?? []).reduce(
    (sum, row: { amount_cents: number | null }) => sum + cents(row.amount_cents),
    0
  );
  const balanceCents = Math.max(cents(invoice.total_incl_gst_cents) - paidCents, 0);
  const amountCents = cents(input.amountCents);
  if (amountCents <= 0) throw new Error("Invoice allocation amount must be greater than zero");
  if (amountCents > balanceCents) throw new Error("Group invoice payment exceeds outstanding balance");

  const insertRes = await supabase
    .from(INVOICE_PAYMENTS_TABLE)
    .insert({
      invoice_id: input.invoiceId,
      amount_cents: amountCents,
      paid_at: input.session.paidAt ?? nowIso(),
      method: "HitPay",
      reference: input.session.providerReferenceNumber || input.session.providerPaymentRequestId || input.session.id,
      notes: `Grouped rental checkout payment ${input.session.id}`,
      source_checkout_group_payment_session_id: input.session.id,
    })
    .select("id,amount_cents")
    .single<{ id: string; amount_cents: number }>();

  if (insertRes.error) {
    if ((insertRes.error as { code?: string }).code === "23505") {
      return recordGroupInvoicePayment(input);
    }
    throw new Error(`Group invoice payment insert failed: ${insertRes.error.message}`);
  }

  return {
    id: insertRes.data.id,
    amountCents: cents(insertRes.data.amount_cents),
  } satisfies GroupInvoicePayment;
}

async function recordGroupDepositCollection(input: {
  session: RentalCheckoutGroupPaymentSession;
  orderId: string;
  customerId?: string;
  requiredAmountCents: number;
  invoiceId: string;
  invoicePaymentId: string;
}) {
  const amountCents = cents(input.requiredAmountCents);
  const deposit = await dbRentalDepositRepo.ensureOrderDeposit({
    orderId: input.orderId,
    customerId: input.customerId,
    requiredAmountCents: amountCents,
    sourceInvoiceId: input.invoiceId,
    metadata: {
      source: "checkout_group_payment_session",
      checkoutGroupPaymentSessionId: input.session.id,
    },
  });
  if (amountCents <= 0) return deposit;

  const supabase = supabaseAdmin();
  const existing = await supabase
    .from(DEPOSIT_TRANSACTIONS_TABLE)
    .select("id")
    .eq("deposit_id", deposit.id)
    .eq("transaction_type", "payment_collected")
    .eq("source_checkout_group_payment_session_id", input.session.id)
    .limit(1)
    .maybeSingle<{ id: string }>();
  if (existing.error) throw new Error(`Group deposit transaction lookup failed: ${existing.error.message}`);
  if (existing.data) return deposit;

  const txRes = await supabase
    .from(DEPOSIT_TRANSACTIONS_TABLE)
    .insert({
      deposit_id: deposit.id,
      order_id: input.orderId,
      customer_id: input.customerId ?? null,
      transaction_type: "payment_collected",
      amount_cents: amountCents,
      invoice_id: input.invoiceId,
      invoice_payment_id: input.invoicePaymentId,
      source_checkout_group_payment_session_id: input.session.id,
      notes: "Deposit collected via checkout group payment session",
      metadata: {
        source: "checkout_group_payment_session",
      },
    })
    .select("id")
    .single<{ id: string }>();
  if (txRes.error) {
    if ((txRes.error as { code?: string }).code === "23505") {
      const existingAfterConflict = await supabase
        .from(DEPOSIT_TRANSACTIONS_TABLE)
        .select("id")
        .eq("deposit_id", deposit.id)
        .eq("transaction_type", "payment_collected")
        .eq("source_checkout_group_payment_session_id", input.session.id)
        .limit(1)
        .maybeSingle<{ id: string }>();
      if (existingAfterConflict.error) {
        throw new Error(
          `Group deposit transaction conflict lookup failed: ${existingAfterConflict.error.message}`
        );
      }
      if (existingAfterConflict.data) {
        return deposit;
      }
      throw new Error("Group deposit transaction conflict could not be reconciled");
    } else {
      throw new Error(`Group deposit transaction insert failed: ${txRes.error.message}`);
    }
  }

  const nextHeldAmountCents = deposit.heldAmountCents + amountCents;
  const nextStatus = nextHeldAmountCents >= deposit.requiredAmountCents ? "held" : "partially_held";
  const updateRes = await supabase
    .from(ORDER_DEPOSITS_TABLE)
    .update({
      held_amount_cents: nextHeldAmountCents,
      status: nextStatus,
      source_invoice_id: input.invoiceId,
      last_checkout_group_payment_session_id: input.session.id,
      last_invoice_payment_id: input.invoicePaymentId,
      last_collected_at: nowIso(),
      updated_at: nowIso(),
    })
    .eq("id", deposit.id);

  if (updateRes.error) throw new Error(`Group deposit collection update failed: ${updateRes.error.message}`);
  return deposit;
}

async function ensureAllocation(input: {
  session: RentalCheckoutGroupPaymentSession;
  group: RentalCheckoutGroup;
  line: RentalCheckoutGroupLine;
  orderId: string;
  invoiceId: string;
  invoicePaymentId: string;
  invoiceAmountCents: number;
  depositAmountCents: number;
}) {
  const supabase = supabaseAdmin();
  const { error } = await supabase
    .from(ALLOCATIONS_TABLE)
    .upsert(
      {
        checkout_group_payment_session_id: input.session.id,
        checkout_group_id: input.group.id,
        checkout_group_line_id: input.line.id,
        rental_order_id: input.orderId,
        invoice_id: input.invoiceId,
        invoice_payment_id: input.invoicePaymentId,
        invoice_amount_cents: cents(input.invoiceAmountCents),
        deposit_amount_cents: cents(input.depositAmountCents),
        total_allocated_cents: cents(input.invoiceAmountCents) + cents(input.depositAmountCents),
        updated_at: nowIso(),
      },
      { onConflict: "checkout_group_payment_session_id,checkout_group_line_id" }
    );

  if (error) throw new Error(`Group payment allocation upsert failed: ${error.message}`);
}

async function claimGroupLineHold(input: {
  groupId: string;
  lineId: string;
}): Promise<{ id: string }> {
  const supabase = supabaseAdmin();
  const now = nowIso();
  const { data, error } = await supabase
    .from(HOLDS_TABLE)
    .update({
      notes: "Checkout group payment conversion claimed; hold remains active until child invoice is issued",
      updated_at: now,
    })
    .eq("checkout_group_id", input.groupId)
    .eq("checkout_group_line_id", input.lineId)
    .eq("status", "active")
    .gt("expires_at", now)
    .select("id")
    .maybeSingle<{ id: string }>();

  if (error) throw new Error(`Group hold claim failed: ${error.message}`);
  if (!data) {
    throw new Error("Checkout group hold could not be claimed because it is no longer active");
  }
  return data;
}

async function consumeClaimedGroupLineHold(input: {
  holdId: string;
  groupId: string;
  lineId: string;
  orderId: string;
}) {
  const supabase = supabaseAdmin();
  const now = nowIso();
  const { data, error } = await supabase
    .from(HOLDS_TABLE)
    .update({
      status: "consumed",
      order_id: input.orderId,
      consumed_at: now,
      notes: "Checkout group payment completed",
      updated_at: now,
    })
    .eq("id", input.holdId)
    .eq("checkout_group_id", input.groupId)
    .eq("checkout_group_line_id", input.lineId)
    .eq("status", "active")
    .select("id")
    .maybeSingle<{ id: string }>();

  if (error) throw new Error(`Group hold consume failed: ${error.message}`);
  if (!data) {
    throw new Error("Checkout group hold could not be consumed after child invoice creation");
  }
}

export async function reconcilePaidCheckoutGroupPayment(input: {
  session: RentalCheckoutGroupPaymentSession;
  source: "status" | "webhook" | "admin";
}) {
  if (input.session.status !== "paid") {
    return {
      session: input.session,
      group: await dbRentalCheckoutGroupRepo.getGroupWithLines(input.session.checkoutGroupId),
      converted: false,
    };
  }

  const group = await dbRentalCheckoutGroupRepo.getGroupWithLines(input.session.checkoutGroupId);
  if (!group) throw new Error("Checkout group not found");
  if (isGroupConversionComplete(group) || (input.session.convertedAt && group.status === "paid")) {
    return { session: input.session, group, converted: true };
  }

  if (input.session.amountCents !== groupPaymentAmountCents(group)) {
    const reason = "Paid amount does not match checkout group total";
    await markManualReview({
      groupId: group.id,
      sessionId: input.session.id,
      reason,
      payload: {
        source: input.source,
        reason,
        sessionAmountCents: input.session.amountCents,
        groupAmountCents: groupPaymentAmountCents(group),
      },
    });
    return {
      session: (await dbCheckoutGroupPaymentSessionRepo.get(input.session.id)) ?? input.session,
      group: await dbRentalCheckoutGroupRepo.getGroupWithLines(group.id),
      converted: false,
    };
  }

  const conversionClaim = await dbRentalCheckoutGroupRepo.beginPaidConversion(group.id, input.session.id);
  if (!conversionClaim) {
    const refreshedGroup = await dbRentalCheckoutGroupRepo.getGroupWithLines(group.id);
    if (isGroupConversionComplete(refreshedGroup)) {
      return { session: input.session, group: refreshedGroup, converted: true };
    }
    return {
      session: input.session,
      group: refreshedGroup,
      converted: false,
    };
  }

  const claimedGroup = (await dbRentalCheckoutGroupRepo.getGroupWithLines(group.id)) ?? group;

  try {
    await assertGroupHoldsActive(claimedGroup);
  } catch (error) {
    const reason = error instanceof Error ? error.message : "Checkout group holds are no longer active";
    await markManualReview({
      groupId: claimedGroup.id,
      sessionId: input.session.id,
      reason,
      payload: {
        source: input.source,
        reason,
      },
    });
    return {
      session: (await dbCheckoutGroupPaymentSessionRepo.get(input.session.id)) ?? input.session,
      group: await dbRentalCheckoutGroupRepo.getGroupWithLines(claimedGroup.id),
      converted: false,
    };
  }

  const childOrderIds: string[] = [];
  try {
    for (const line of claimedGroup.lines) {
      const claimedHold = await claimGroupLineHold({
        groupId: claimedGroup.id,
        lineId: line.id,
      });
      const orderInput = orderInputFromLine(claimedGroup, line);
      const order = (await dbOrderRepo.upsertMany([orderInput]))[0];
      if (!order) throw new Error(`Child order create failed for line ${line.lineIndex + 1}`);
      childOrderIds.push(order.id);
      await dbRentalCheckoutGroupRepo.linkOrderToLine(line.id, order.id);

      const invoice = await issueInvoiceForOrder({
        orderId: order.id,
        equipmentTitle: order.equipmentTitle,
        qty: order.qty,
        start: order.start,
        end: order.end,
        pricingSnapshot: order.pricingSnapshot,
      });
      await consumeClaimedGroupLineHold({
        holdId: claimedHold.id,
        groupId: claimedGroup.id,
        lineId: line.id,
        orderId: order.id,
      });
      const invoicePayment = await recordGroupInvoicePayment({
        session: input.session,
        invoiceId: invoice.id,
        amountCents: line.payableTotalCents,
      });
      await recordGroupDepositCollection({
        session: input.session,
        orderId: order.id,
        customerId: group.customerId,
        requiredAmountCents: line.depositCents,
        invoiceId: invoice.id,
        invoicePaymentId: invoicePayment.id,
      });
      await ensureAllocation({
        session: input.session,
        group: claimedGroup,
        line,
        orderId: order.id,
        invoiceId: invoice.id,
        invoicePaymentId: invoicePayment.id,
        invoiceAmountCents: invoicePayment.amountCents,
        depositAmountCents: line.depositCents,
      });
      await dbRentalCheckoutGroupRepo.linkInvoiceToLine({
        lineId: line.id,
        invoiceId: invoice.id,
        invoicePaymentId: invoicePayment.id,
      });
    }

    await dbRentalCheckoutGroupRepo.markPaid(claimedGroup.id, {
      paymentSessionId: input.session.id,
      childOrderIds,
    });
    const convertedAt = nowIso();
    const session = await dbCheckoutGroupPaymentSessionRepo.update(input.session.id, {
      status: "paid",
      convertedAt,
    });
    return {
      session,
      group: await dbRentalCheckoutGroupRepo.getGroupWithLines(claimedGroup.id),
      converted: true,
    };
  } catch (error) {
    const reason = error instanceof Error ? error.message : "Checkout group conversion failed";
    await markManualReview({
      groupId: claimedGroup.id,
      sessionId: input.session.id,
      reason,
      payload: {
        source: input.source,
        reason,
      },
    });
    return {
      session: (await dbCheckoutGroupPaymentSessionRepo.get(input.session.id)) ?? input.session,
      group: await dbRentalCheckoutGroupRepo.getGroupWithLines(claimedGroup.id),
      converted: false,
    };
  }
}

export async function refreshAndReconcileCheckoutGroupPayment(input: {
  session: RentalCheckoutGroupPaymentSession;
  source: "status" | "webhook" | "admin";
  webhookPayload?: Record<string, unknown>;
}) {
  const refreshed = await refreshCheckoutGroupPaymentSessionFromProvider({
    session: input.session,
    source: input.source,
    webhookPayload: input.webhookPayload,
  });
  if (refreshed.status === "paid") {
    return reconcilePaidCheckoutGroupPayment({
      session: refreshed,
      source: input.source,
    });
  }
  return {
    session: refreshed,
    group: await dbRentalCheckoutGroupRepo.getGroupWithLines(refreshed.checkoutGroupId),
    converted: false,
  };
}
