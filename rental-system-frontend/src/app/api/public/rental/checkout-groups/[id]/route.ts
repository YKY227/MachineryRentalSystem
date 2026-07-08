import { NextResponse } from "next/server";

import { getAuthenticatedCustomer } from "@/lib/auth/customer";
import { dbRentalCheckoutGroupRepo } from "@/lib/rental/checkout-groups/db-checkout-group-repo";

export const runtime = "nodejs";

function requireCheckoutGroupEnv() {
  const required = ["SUPABASE_URL", "SUPABASE_SERVICE_ROLE_KEY"] as const;
  const missing = required.filter((name) => !process.env[name]);
  if (missing.length) {
    throw new Error(`Missing required env vars: ${missing.join(", ")}`);
  }
}

export async function GET(req: Request, { params }: { params: { id: string } }) {
  try {
    requireCheckoutGroupEnv();
    const customer = await getAuthenticatedCustomer(req);
    if (!customer) {
      return NextResponse.json({ error: "Customer login is required" }, { status: 401 });
    }

    const group = await dbRentalCheckoutGroupRepo.getGroupWithLines(params.id);
    if (!group || group.customerId !== customer.id) {
      return NextResponse.json({ error: "Checkout group not found" }, { status: 404 });
    }

    return NextResponse.json({ group, paymentEnabled: true });
  } catch (error) {
    const message = error instanceof Error ? error.message : "Checkout group read failed";
    return NextResponse.json({ error: message }, { status: 400 });
  }
}
