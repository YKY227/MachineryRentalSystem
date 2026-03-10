import "server-only";

import {
  computeRentalCustomerCreditControlSummary,
  type RentalCreditControlInvoice,
} from "@/lib/rental/credit-control/db-rental-credit-control";
import type { RentalCustomer } from "@/lib/rental/orders/types";
import { supabaseAdmin } from "@/lib/supabase/server";

const ORDERS_TABLE = process.env.SUPABASE_RENTAL_ORDERS_TABLE ?? "rental_orders";
const INVOICE_TABLE = process.env.SUPABASE_INVOICES_TABLE ?? "rental_invoices";

type CustomerOrderIdRow = {
  id: string;
};

type CreditControlInvoiceRow = {
  id: string;
  status: string;
  due_date: string | null;
  total_incl_gst_cents: number | null;
};

export type RentalCreditCheckoutReasonCode =
  | "account_inactive"
  | "customer_not_pre_vetted"
  | "payment_terms_not_credit"
  | "manual_hold"
  | "overdue_balance"
  | "credit_limit_exceeded"
  | "credit_control_disabled_bypass"
  | "eligible";

export type RentalCreditCheckoutEvaluation = {
  allowed: boolean;
  reasonCode: RentalCreditCheckoutReasonCode;
  baselineEligible: boolean;
  creditControlEnabled: boolean;
  hasManualCreditHold: boolean;
  creditLimit: number | null;
  creditUsed: number;
  availableCredit: number;
  proposedExposure: number;
  projectedCreditUsed: number;
  overdueAmount: number;
  overdueInvoiceCount: number;
};

function centsToAmount(cents: number) {
  return Number((Math.max(0, cents) / 100).toFixed(2));
}

function amountToCents(amount?: number | null) {
  if (typeof amount !== "number" || !Number.isFinite(amount)) return 0;
  return Math.max(0, Math.round(amount * 100));
}

async function listCustomerCollectibleInvoices(customerId: string): Promise<RentalCreditControlInvoice[]> {
  const supabase = supabaseAdmin();
  const { data: orderRows, error: orderError } = await supabase
    .from(ORDERS_TABLE)
    .select("id")
    .eq("customer_id", customerId);

  if (orderError) throw new Error(`Customer credit orders failed: ${orderError.message}`);

  const orderIds = ((orderRows ?? []) as CustomerOrderIdRow[]).map((row) => row.id);
  if (!orderIds.length) return [];

  const { data: invoiceRows, error: invoiceError } = await supabase
    .from(INVOICE_TABLE)
    .select("id,status,due_date,total_incl_gst_cents")
    .in("order_id", orderIds);

  if (invoiceError) throw new Error(`Customer credit invoices failed: ${invoiceError.message}`);

  return ((invoiceRows ?? []) as CreditControlInvoiceRow[]).map((invoice) => ({
    id: invoice.id,
    status: invoice.status,
    dueDate: invoice.due_date ?? undefined,
    totalInclGstCents: Math.max(0, Number(invoice.total_incl_gst_cents ?? 0)),
  }));
}

export async function evaluateRentalCreditCheckout(input: {
  customer: RentalCustomer;
  proposedExposureCents: number;
}): Promise<RentalCreditCheckoutEvaluation> {
  const proposedExposureCents = Math.max(0, Math.round(Number(input.proposedExposureCents ?? 0)));
  const customer = input.customer;

  const baselineEligible =
    customer.accountStatus === "active" &&
    customer.vettingStatus === "pre_vetted" &&
    customer.paymentTerms === "credit";

  const invoices = await listCustomerCollectibleInvoices(customer.id);
  const currentSummary = await computeRentalCustomerCreditControlSummary({
    customer,
    invoices,
  });

  const creditLimitCents = amountToCents(currentSummary.creditLimit);
  const creditUsedCents = amountToCents(currentSummary.creditUsed);
  const projectedCreditUsedCents = creditUsedCents + proposedExposureCents;

  let allowed = false;
  let reasonCode: RentalCreditCheckoutReasonCode = "eligible";

  if (customer.accountStatus !== "active") {
    reasonCode = "account_inactive";
  } else if (customer.vettingStatus !== "pre_vetted") {
    reasonCode = "customer_not_pre_vetted";
  } else if (customer.paymentTerms !== "credit") {
    reasonCode = "payment_terms_not_credit";
  } else if (currentSummary.hasManualCreditHold) {
    reasonCode = "manual_hold";
  } else if (!currentSummary.creditControlEnabled) {
    allowed = true;
    reasonCode = "credit_control_disabled_bypass";
  } else if (amountToCents(currentSummary.overdueAmount) > 0) {
    reasonCode = "overdue_balance";
  } else if (creditLimitCents <= 0 || projectedCreditUsedCents > creditLimitCents) {
    reasonCode = "credit_limit_exceeded";
  } else {
    allowed = true;
    reasonCode = "eligible";
  }

  return {
    allowed,
    reasonCode,
    baselineEligible,
    creditControlEnabled: currentSummary.creditControlEnabled,
    hasManualCreditHold: currentSummary.hasManualCreditHold,
    creditLimit: currentSummary.creditLimit,
    creditUsed: currentSummary.creditUsed,
    availableCredit: currentSummary.availableCredit,
    proposedExposure: centsToAmount(proposedExposureCents),
    projectedCreditUsed: centsToAmount(projectedCreditUsedCents),
    overdueAmount: currentSummary.overdueAmount,
    overdueInvoiceCount: currentSummary.overdueInvoiceCount,
  };
}
