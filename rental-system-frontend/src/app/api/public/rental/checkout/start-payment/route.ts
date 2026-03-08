// src/app/api/public/rental/checkout/start-payment/route.ts
import { NextResponse } from "next/server";

import { getAuthenticatedCustomer } from "@/lib/auth/customer";
import { isCustomerCreditEligible } from "@/lib/rental/customers/db-rental-customer-repo";
import { processCreditCheckoutOrder } from "@/lib/rental/invoices/checkout-credit-automation";
import { dbOrderRepo } from "@/lib/rental/orders/db-order-repo";
import { dbOrderPaymentSessionRepo } from "@/lib/rental/orders/db-order-payment-session-repo";
import {
  createHitPayPaymentRequest,
  getCheckoutOrderStatusPageUrl,
  getCheckoutStatusPageUrl,
} from "@/lib/rental/orders/hitpay";
import { calculateRentalCharges } from "@/lib/rental/orders/pricing";
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

export async function POST(req: Request) {
  try {
    requireCheckoutEnv();

    const body = (await req.json()) as { order?: CreateRentalOrderInput };
    const order = body?.order;
    if (!order?.id) {
      return NextResponse.json({ error: "Missing order id" }, { status: 400 });
    }
    const payable = calculateRentalCharges(order.pricingSnapshot);
    const amountCents = Math.max(0, Math.round(payable.payableTotal * 100));
    if (amountCents <= 0) {
      return NextResponse.json({ error: "Invalid checkout total" }, { status: 400 });
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

    order.customerId = matchedCustomer.id;
    order.customerSnapshot = {
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
    };

    const persistedOrders = await dbOrderRepo.upsertMany([order]);
    const persistedOrder = persistedOrders[0] ?? null;
    if (!persistedOrder) {
      return NextResponse.json({ error: "Failed to persist order" }, { status: 400 });
    }

    if (matchedCustomer && isCustomerCreditEligible(matchedCustomer)) {
      const creditResult = await processCreditCheckoutOrder(persistedOrder.id);
      return NextResponse.json({
        order: persistedOrder,
        paymentSession: null,
        checkoutMode: "credit",
        redirectUrl: getCheckoutOrderStatusPageUrl(persistedOrder.id),
        invoiceId: creditResult.invoiceId,
        invoiceNo: creditResult.invoiceNo,
      });
    }

    requireHitPayEnv();

    const session = await dbOrderPaymentSessionRepo.create({
      orderId: persistedOrder.id,
      provider: "hitpay",
      amountCents,
      currency: "SGD",
      status: "pending",
      paymentPurpose: `Rental booking ${persistedOrder.equipmentTitle}`,
    });

    try {
      const paymentRequest = await createHitPayPaymentRequest({
        amountCents,
        currency: "SGD",
        purpose: `Rental booking ${persistedOrder.equipmentTitle}`,
        referenceNumber: persistedOrder.id,
        redirectUrl: getCheckoutStatusPageUrl(session.id),
      });

      const updatedSession = await dbOrderPaymentSessionRepo.update(session.id, {
        providerPaymentRequestId: paymentRequest.id,
        providerReferenceNumber: paymentRequest.referenceNumber,
        redirectUrl: paymentRequest.url,
        status: paymentRequest.status,
        webhookPayload: paymentRequest.raw,
      });

      return NextResponse.json({
        order: persistedOrder,
        paymentSession: updatedSession,
        checkoutMode: "payment",
        redirectUrl: paymentRequest.url,
      });
    } catch (error) {
      await dbOrderPaymentSessionRepo.update(session.id, {
        status: "failed",
        webhookPayload: {
          error: error instanceof Error ? error.message : "HitPay create payment request failed",
        },
      });
      throw error;
    }
  } catch (e) {
    const message = e instanceof Error ? e.message : "Checkout start payment failed";
    return NextResponse.json({ error: message }, { status: 400 });
  }
}
