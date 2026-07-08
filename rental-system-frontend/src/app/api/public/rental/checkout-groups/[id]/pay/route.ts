import { NextResponse } from "next/server";

import { getAuthenticatedCustomer } from "@/lib/auth/customer";
import {
  CheckoutGroupPaymentConflictError,
  createCheckoutGroupPaymentLink,
} from "@/lib/rental/checkout-groups/group-payment-service";

export const runtime = "nodejs";

function requirePaymentEnv() {
  const required = [
    "SUPABASE_URL",
    "SUPABASE_SERVICE_ROLE_KEY",
    "APP_BASE_URL",
    "HITPAY_API_KEY",
  ] as const;
  const missing = required.filter((name) => !process.env[name]);
  if (missing.length) {
    throw new Error(`Missing required env vars: ${missing.join(", ")}`);
  }
}

export async function POST(_req: Request, { params }: { params: { id: string } }) {
  try {
    requirePaymentEnv();
    const customer = await getAuthenticatedCustomer(_req);
    if (!customer) {
      return NextResponse.json({ error: "Customer login is required" }, { status: 401 });
    }
    if (customer.accountStatus !== "active") {
      return NextResponse.json({ error: "Customer account is suspended" }, { status: 403 });
    }

    const result = await createCheckoutGroupPaymentLink({
      checkoutGroupId: params.id,
      customerId: customer.id,
    });

    return NextResponse.json({
      group: result.group,
      paymentSession: result.session,
      redirectUrl: result.session.redirectUrl,
      reused: result.reused,
      paymentEnabled: true,
    });
  } catch (error) {
    const message = error instanceof Error ? error.message : "Checkout group payment failed";
    return NextResponse.json(
      { error: message },
      { status: error instanceof CheckoutGroupPaymentConflictError ? error.status : 400 }
    );
  }
}
