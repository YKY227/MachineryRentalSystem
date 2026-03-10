// rental-system-frontend/src/lib/rental/credit-control/db-rental-credit-control.ts
import "server-only";

import { dbPaymentRepo } from "@/lib/rental/invoices/db-payment-repo";
import type { RentalCustomer } from "@/lib/rental/orders/types";

export type RentalCreditControlInvoice = {
  id: string;
  status: string;
  dueDate?: string;
  totalInclGstCents: number;
};

export type RentalCreditDecision =
  | "blocked_manual_hold"
  | "control_disabled"
  | "blocked_overdue"
  | "blocked_limit"
  | "eligible";

export type RentalCreditReasonCode =
  | "manual_hold"
  | "credit_control_disabled"
  | "overdue_balance"
  | "credit_limit_unavailable"
  | "eligible";

export type RentalCustomerCreditControlSummary = {
  creditLimit: number | null;
  creditUsed: number;
  availableCredit: number;
  overdueAmount: number;
  overdueInvoiceCount: number;
  oldestOverdueInvoiceDate: string | null;
  creditControlEnabled: boolean;
  hasManualCreditHold: boolean;
  creditHoldReason: string | null;
  recommendedDecision: RentalCreditDecision;
  recommendedReasonCode: RentalCreditReasonCode;
};

const COLLECTIBLE_INVOICE_STATUSES = new Set(["issued"]);
const EXCLUDED_INVOICE_STATUSES = new Set(["void", "cancelled", "cancelled_void"]);

function centsToAmount(cents: number) {
  return Number((Math.max(0, cents) / 100).toFixed(2));
}

function amountToCents(amount?: number | null) {
  if (typeof amount !== "number" || !Number.isFinite(amount)) return 0;
  return Math.max(0, Math.round(amount * 100));
}

function normalizeCreditLimit(value?: number) {
  if (typeof value !== "number" || !Number.isFinite(value)) return null;
  return Number(value.toFixed(2));
}

function hasPositiveCreditLimit(creditLimit: number | null) {
  return creditLimit !== null && creditLimit > 0;
}

export async function computeRentalCustomerCreditControlSummary(input: {
  customer: Pick<RentalCustomer, "creditLimit" | "creditControlEnabled" | "creditHoldReason">;
  invoices: RentalCreditControlInvoice[];
}): Promise<RentalCustomerCreditControlSummary> {
  const collectibleInvoices = input.invoices.filter((invoice) => {
    if (EXCLUDED_INVOICE_STATUSES.has(invoice.status)) return false;
    return COLLECTIBLE_INVOICE_STATUSES.has(invoice.status);
  });

  const totalsByInvoiceId = await dbPaymentRepo.listTotalsByInvoiceIds(
    collectibleInvoices.map((invoice) => ({
      id: invoice.id,
      dueDate: invoice.dueDate,
      totalInclGstCents: invoice.totalInclGstCents,
    }))
  );

  let creditUsedCents = 0;
  let overdueAmountCents = 0;
  let overdueInvoiceCount = 0;
  let oldestOverdueInvoiceDate: string | null = null;

  for (const invoice of collectibleInvoices) {
    const totals = totalsByInvoiceId[invoice.id];
    const balanceCents = totals?.balanceCents ?? Math.max(0, invoice.totalInclGstCents);
    creditUsedCents += balanceCents;

    if (totals?.status !== "overdue" || balanceCents <= 0) continue;

    overdueAmountCents += balanceCents;
    overdueInvoiceCount += 1;

    if (!invoice.dueDate) continue;
    if (!oldestOverdueInvoiceDate || invoice.dueDate < oldestOverdueInvoiceDate) {
      oldestOverdueInvoiceDate = invoice.dueDate;
    }
  }

  const creditLimit = normalizeCreditLimit(input.customer.creditLimit);
  const hasConfiguredCreditLimit = hasPositiveCreditLimit(creditLimit);
  const creditLimitCents = hasConfiguredCreditLimit ? amountToCents(creditLimit) : 0;
  const availableCreditCents = hasConfiguredCreditLimit ? Math.max(creditLimitCents - creditUsedCents, 0) : 0;
  const creditHoldReason = input.customer.creditHoldReason?.trim() || null;
  const hasManualCreditHold = Boolean(creditHoldReason);

  let recommendedDecision: RentalCreditDecision = "eligible";
  let recommendedReasonCode: RentalCreditReasonCode = "eligible";

  if (hasManualCreditHold) {
    recommendedDecision = "blocked_manual_hold";
    recommendedReasonCode = "manual_hold";
  } else if (!input.customer.creditControlEnabled) {
    recommendedDecision = "control_disabled";
    recommendedReasonCode = "credit_control_disabled";
  } else if (overdueAmountCents > 0) {
    recommendedDecision = "blocked_overdue";
    recommendedReasonCode = "overdue_balance";
  } else if (!hasConfiguredCreditLimit || availableCreditCents <= 0) {
    recommendedDecision = "blocked_limit";
    recommendedReasonCode = "credit_limit_unavailable";
  }

  return {
    creditLimit,
    creditUsed: centsToAmount(creditUsedCents),
    availableCredit: centsToAmount(availableCreditCents),
    overdueAmount: centsToAmount(overdueAmountCents),
    overdueInvoiceCount,
    oldestOverdueInvoiceDate,
    creditControlEnabled: input.customer.creditControlEnabled,
    hasManualCreditHold,
    creditHoldReason,
    recommendedDecision,
    recommendedReasonCode,
  };
}
