// src/app/api/public/rental/checkout/start-payment/route.ts
import { NextResponse } from "next/server";

import { isAdminAuthenticated } from "@/lib/auth/admin";
import { getAuthenticatedCustomer } from "@/lib/auth/customer";
import {
  evaluateRentalCreditCheckout,
  type RentalCreditCheckoutEvaluation,
} from "@/lib/rental/credit-control/checkout-credit-evaluator";
import {
  createAvailabilityHold,
  linkAvailabilityHoldToOrder,
  linkAvailabilityHoldToPaymentSession,
  markAvailabilityHoldConsumed,
  releaseAvailabilityHold,
} from "@/lib/rental/holds/db-rental-availability-service";
import { dbRentalDepositRepo } from "@/lib/rental/deposits/db-rental-deposit-repo";
import { processCreditCheckoutOrder } from "@/lib/rental/invoices/checkout-credit-automation";
import { dbRentalEquipmentRepo } from "@/lib/rental/equipment/db-rental-equipment-repo";
import { dbOrderRepo } from "@/lib/rental/orders/db-order-repo";
import { dbOrderPaymentSessionRepo } from "@/lib/rental/orders/db-order-payment-session-repo";
import {
  createHitPayPaymentRequest,
  getCheckoutOrderStatusPageUrl,
  getCheckoutStatusPageUrl,
} from "@/lib/rental/orders/hitpay";
import { calculateAuthoritativeRentalPricing } from "@/lib/rental/orders/pricing";
import type { CreateRentalOrderInput } from "@/lib/rental/orders/types";

export const runtime = "nodejs";

function requireCheckoutEnv() {
  const required = ["SUPABASE_URL", "SUPABASE_SERVICE_ROLE_KEY", "APP_BASE_URL"] as const;
  const missing = required.filter((name) => !process.env[name]);
  if (missing.length) {
    throw new Error(`Missing required env vars: ${missing.join(", ")}`);
  }
}

function requireHitPayEnv() {
  if (!process.env.HITPAY_API_KEY) {
    throw new Error("Missing required env vars: HITPAY_API_KEY");
  }
}

function getCreditCheckoutMessage(evaluation: RentalCreditCheckoutEvaluation): string | null {
  switch (evaluation.reasonCode) {
    case "manual_hold":
      return "Credit checkout is unavailable because your account is on manual hold. Please contact our team before placing another booking.";
    case "overdue_balance":
      return "Credit checkout is unavailable because your account has overdue invoices. Continue with upfront payment instead.";
    case "credit_limit_exceeded":
      return "Credit checkout is unavailable because this booking would exceed your available credit. Continue with upfront payment instead.";
    case "customer_not_pre_vetted":
      return "Your account is not pre-vetted for invoice-later credit. Continue with upfront payment instead.";
    case "payment_terms_not_credit":
      return "Your account is set to upfront payment terms. Continue with secure payment to complete this booking.";
    case "account_inactive":
      return "Your customer account is not active.";
    default:
      return null;
  }
}

function shouldHardStopCreditCheckout(evaluation: RentalCreditCheckoutEvaluation) {
  return evaluation.baselineEligible && evaluation.reasonCode === "manual_hold";
}

function shouldFallbackBlockedCreditToUpfront(evaluation: RentalCreditCheckoutEvaluation) {
  return (
    evaluation.baselineEligible &&
    (evaluation.reasonCode === "overdue_balance" || evaluation.reasonCode === "credit_limit_exceeded")
  );
}

function buildPricingRepricedNotice(input: {
  clientPayableTotal?: number;
  serverPayableTotal: number;
  clientDisplayTotal?: number;
  serverDisplayTotal: number;
}) {
  const payableDiff = Math.abs(Number(input.clientPayableTotal ?? 0) - input.serverPayableTotal);
  const totalDiff = Math.abs(Number(input.clientDisplayTotal ?? 0) - input.serverDisplayTotal);
  if (payableDiff < 0.01 && totalDiff < 0.01) return null;
  return "Checkout pricing was refreshed from the latest equipment rates before payment.";
}

export async function POST(req: Request) {
  try {
    requireCheckoutEnv();

    const body = (await req.json()) as { order?: CreateRentalOrderInput };
    const order = body?.order;
    if (!order?.id) {
      return NextResponse.json({ error: "Missing order id" }, { status: 400 });
    }
    if (isAdminAuthenticated(req)) {
      return NextResponse.json(
        { error: "Checkout is only available for customer accounts" },
        { status: 403 }
      );
    }

    const matchedCustomer = await getAuthenticatedCustomer(req);
    if (!matchedCustomer) {
      return NextResponse.json({ error: "Customer login is required before checkout" }, { status: 401 });
    }
    if (matchedCustomer.accountStatus !== "active") {
      return NextResponse.json({ error: "Customer account is suspended" }, { status: 403 });
    }
    if (!matchedCustomer.companyName.trim()) {
      return NextResponse.json({ error: "Customer account is missing company name" }, { status: 400 });
    }
    if (!matchedCustomer.contactName.trim()) {
      return NextResponse.json({ error: "Customer account is missing contact name" }, { status: 400 });
    }
    if (!matchedCustomer.email.trim()) {
      return NextResponse.json({ error: "Customer account is missing contact email" }, { status: 400 });
    }

    const equipment = await dbRentalEquipmentRepo.getPublicByIdOrSlug(order.equipmentId);
    if (!equipment) {
      return NextResponse.json({ error: "Equipment not found or unavailable" }, { status: 404 });
    }

    const authoritativePricing = calculateAuthoritativeRentalPricing({
      equipment,
      qty: order.qty,
      start: order.start,
      end: order.end,
      fulfillment: order.fulfillment,
    });
    const invoiceAmountCents = Math.max(
      0,
      Math.round(authoritativePricing.pricingSnapshot.payableTotal * 100)
    );
    const depositAmountCents = Math.max(
      0,
      Math.round(authoritativePricing.pricingSnapshot.deposit * 100)
    );
    const totalChargeAmountCents = invoiceAmountCents + depositAmountCents;
    if (invoiceAmountCents <= 0) {
      return NextResponse.json({ error: "Invalid checkout total" }, { status: 400 });
    }
    const pricingNotice = buildPricingRepricedNotice({
      clientPayableTotal: order.pricingSnapshot?.payableTotal,
      serverPayableTotal: authoritativePricing.pricingSnapshot.payableTotal ?? 0,
      clientDisplayTotal: order.pricingSnapshot?.total,
      serverDisplayTotal: authoritativePricing.pricingSnapshot.total,
    });

    const normalizedOrder: CreateRentalOrderInput = {
      ...order,
      equipmentId: equipment.id,
      equipmentTitle: equipment.title,
      qty: Math.max(1, Math.floor(Number(order.qty) || 1)),
      pricingSnapshot: authoritativePricing.pricingSnapshot,
      customerId: matchedCustomer.id,
      customerSnapshot: {
      ...order.customerSnapshot,
      customerId: matchedCustomer.id,
      companyName: matchedCustomer.companyName,
      contactName: matchedCustomer.contactName.trim(),
      email: matchedCustomer.email,
      phone: matchedCustomer.phone?.trim() || order.customerSnapshot.phone?.trim() || "",
      uen: matchedCustomer.uen?.trim() || order.customerSnapshot.uen?.trim() || "",
      address: matchedCustomer.address?.trim() || order.customerSnapshot.address?.trim() || "",
      paymentTerms: matchedCustomer.paymentTerms,
      vettingStatus: matchedCustomer.vettingStatus,
      accountStatus: matchedCustomer.accountStatus,
      },
    };

    const creditEvaluation = await evaluateRentalCreditCheckout({
      customer: matchedCustomer,
      proposedExposureCents: invoiceAmountCents,
    });
    const creditCheckoutMessage =
      matchedCustomer.paymentTerms === "credit" && !creditEvaluation.allowed
        ? getCreditCheckoutMessage(creditEvaluation)
        : null;

    if (shouldHardStopCreditCheckout(creditEvaluation)) {
      return NextResponse.json(
        {
          error: creditCheckoutMessage ?? "Credit checkout is unavailable.",
          creditDecision: creditEvaluation,
          creditCheckoutMessage,
          creditCheckoutBlocked: true,
          creditCheckoutFallbackToUpfront: false,
        },
        { status: 403 }
      );
    }

    const availabilityHold = await createAvailabilityHold({
      checkoutReference: normalizedOrder.id,
      equipmentId: normalizedOrder.equipmentId,
      customerId: matchedCustomer.id,
      qty: normalizedOrder.qty,
      start: normalizedOrder.start,
      end: normalizedOrder.end,
    });

    if (!availabilityHold.ok) {
      return NextResponse.json(
        {
          error: availabilityHold.message,
          availabilityBlocked: true,
          reasonCode: availabilityHold.reasonCode,
          message: availabilityHold.message,
          availabilitySnapshot: availabilityHold.snapshot,
        },
        { status: 409 }
      );
    }

    if (creditEvaluation.baselineEligible && creditEvaluation.allowed) {
      try {
        const persistedOrders = await dbOrderRepo.upsertMany([normalizedOrder]);
        const persistedOrder = persistedOrders[0] ?? null;
        if (!persistedOrder) {
          await releaseAvailabilityHold(normalizedOrder.id, "Order persistence failed before credit checkout completion");
          return NextResponse.json({ error: "Failed to persist order" }, { status: 400 });
        }

        await linkAvailabilityHoldToOrder(normalizedOrder.id, persistedOrder.id);
        const creditResult = await processCreditCheckoutOrder(persistedOrder.id);
        await dbRentalDepositRepo.ensureOrderDeposit({
          orderId: persistedOrder.id,
          customerId: matchedCustomer.id,
          requiredAmountCents: depositAmountCents,
          sourceInvoiceId: creditResult.invoiceId,
        });
        try {
          await markAvailabilityHoldConsumed({
            checkoutReference: normalizedOrder.id,
            orderId: persistedOrder.id,
            notes: "Credit checkout completed",
          });
        } catch (holdError) {
          console.warn("[checkout-start-payment] availability hold consume failed after credit checkout", {
            orderId: persistedOrder.id,
            holdCheckoutReference: normalizedOrder.id,
            error: holdError instanceof Error ? holdError.message : "unknown error",
          });
        }
        return NextResponse.json({
          order: persistedOrder,
          paymentSession: null,
          checkoutMode: "credit",
          redirectUrl: getCheckoutOrderStatusPageUrl(persistedOrder.id),
          invoiceId: creditResult.invoiceId,
          invoiceNo: creditResult.invoiceNo,
          pricingSnapshot: authoritativePricing.pricingSnapshot,
          pricingNotice,
          creditDecision: creditEvaluation,
          creditCheckoutBlocked: false,
          creditCheckoutFallbackToUpfront: false,
        });
      } catch (error) {
        await releaseAvailabilityHold(normalizedOrder.id, "Credit checkout failed before hold consumption");
        throw error;
      }
    }

    let session: Awaited<ReturnType<typeof dbOrderPaymentSessionRepo.create>> | null = null;
    try {
      const persistedOrders = await dbOrderRepo.upsertMany([normalizedOrder]);
      const persistedOrder = persistedOrders[0] ?? null;
      if (!persistedOrder) {
        await releaseAvailabilityHold(normalizedOrder.id, "Order persistence failed before payment session creation");
        return NextResponse.json({ error: "Failed to persist order" }, { status: 400 });
      }
      await linkAvailabilityHoldToOrder(normalizedOrder.id, persistedOrder.id);
      await dbRentalDepositRepo.ensureOrderDeposit({
        orderId: persistedOrder.id,
        customerId: matchedCustomer.id,
        requiredAmountCents: depositAmountCents,
      });

      requireHitPayEnv();

      session = await dbOrderPaymentSessionRepo.create({
        orderId: persistedOrder.id,
        provider: "hitpay",
        amountCents: totalChargeAmountCents,
        currency: "SGD",
        status: "pending",
        paymentPurpose:
          depositAmountCents > 0
            ? `Rental booking ${persistedOrder.equipmentTitle} (includes refundable deposit)`
            : `Rental booking ${persistedOrder.equipmentTitle}`,
        webhookPayload: {
          ...(shouldFallbackBlockedCreditToUpfront(creditEvaluation) && creditCheckoutMessage
            ? {
                creditDecision: creditEvaluation,
                creditCheckoutMessage,
              }
            : {}),
          chargeBreakdown: {
            invoiceAmountCents,
            depositAmountCents,
            totalChargeAmountCents,
          },
        },
      });
      await linkAvailabilityHoldToPaymentSession(normalizedOrder.id, session.id);

      const paymentRequest = await createHitPayPaymentRequest({
        amountCents: totalChargeAmountCents,
        currency: "SGD",
        purpose:
          depositAmountCents > 0
            ? `Rental booking ${persistedOrder.equipmentTitle} + refundable deposit`
            : `Rental booking ${persistedOrder.equipmentTitle}`,
        referenceNumber: persistedOrder.id,
        redirectUrl: getCheckoutStatusPageUrl(session.id),
      });

      const updatedSession = await dbOrderPaymentSessionRepo.update(session.id, {
        providerPaymentRequestId: paymentRequest.id,
        providerReferenceNumber: paymentRequest.referenceNumber,
        redirectUrl: paymentRequest.url,
        status: paymentRequest.status,
        webhookPayload: {
          ...(session.webhookPayload ?? {}),
          providerRequest: paymentRequest.raw,
        },
      });

      return NextResponse.json({
        order: persistedOrder,
        paymentSession: updatedSession,
        checkoutMode: "payment",
        redirectUrl: paymentRequest.url,
        pricingSnapshot: authoritativePricing.pricingSnapshot,
        pricingNotice,
        creditDecision: creditEvaluation,
        creditCheckoutMessage,
        creditCheckoutBlocked: false,
        creditCheckoutFallbackToUpfront: shouldFallbackBlockedCreditToUpfront(creditEvaluation),
        availabilityBlocked: false,
      });
    } catch (error) {
      if (session) {
        await dbOrderPaymentSessionRepo.update(session.id, {
          status: "failed",
          webhookPayload: {
            ...(session.webhookPayload ?? {}),
            error: error instanceof Error ? error.message : "HitPay create payment request failed",
          },
        }).catch(() => null);
      }
      await releaseAvailabilityHold(normalizedOrder.id, "Checkout payment initiation failed");
      throw error;
    }
  } catch (e) {
    const message = e instanceof Error ? e.message : "Checkout start payment failed";
    return NextResponse.json({ error: message }, { status: 400 });
  }
}
