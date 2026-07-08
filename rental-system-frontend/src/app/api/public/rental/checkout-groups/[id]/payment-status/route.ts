import { NextResponse } from "next/server";

import { getAuthenticatedCustomer } from "@/lib/auth/customer";
import { dbRentalCheckoutGroupRepo } from "@/lib/rental/checkout-groups/db-checkout-group-repo";
import { dbCheckoutGroupPaymentSessionRepo } from "@/lib/rental/checkout-groups/db-checkout-group-payment-session-repo";
import {
  reconcilePaidCheckoutGroupPayment,
  refreshAndReconcileCheckoutGroupPayment,
} from "@/lib/rental/checkout-groups/group-payment-service";

export const runtime = "nodejs";

function requirePaymentStatusEnv() {
  const required = ["SUPABASE_URL", "SUPABASE_SERVICE_ROLE_KEY"] as const;
  const missing = required.filter((name) => !process.env[name]);
  if (missing.length) {
    throw new Error(`Missing required env vars: ${missing.join(", ")}`);
  }
}

export async function GET(req: Request, { params }: { params: { id: string } }) {
  try {
    requirePaymentStatusEnv();
    const customer = await getAuthenticatedCustomer(req);
    if (!customer) {
      return NextResponse.json({ error: "Customer login is required" }, { status: 401 });
    }

    const group = await dbRentalCheckoutGroupRepo.getGroupWithLines(params.id);
    if (!group || group.customerId !== customer.id) {
      return NextResponse.json({ error: "Checkout group not found" }, { status: 404 });
    }

    const session = await dbCheckoutGroupPaymentSessionRepo.getLatestForGroup(group.id);
    if (!session) {
      return NextResponse.json({
        group,
        paymentSession: null,
        converted: false,
      });
    }

    const shouldRefresh = Boolean(session.providerPaymentRequestId) && session.status === "pending";
    const result = shouldRefresh
      ? await refreshAndReconcileCheckoutGroupPayment({
          session,
          source: "status",
        })
      : session.status === "paid" && group.status !== "paid"
        ? await reconcilePaidCheckoutGroupPayment({
            session,
            source: "status",
          })
      : {
          group,
          session,
          converted: group.status === "paid",
        };

    return NextResponse.json({
      group: result.group ?? group,
      paymentSession: result.session,
      converted: result.converted,
    });
  } catch (error) {
    const message = error instanceof Error ? error.message : "Checkout group payment status failed";
    return NextResponse.json({ error: message }, { status: 400 });
  }
}
