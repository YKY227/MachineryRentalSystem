import { NextResponse } from "next/server";

import {
  assertCustomer,
  customerUnauthorizedResponse,
  isCustomerUnauthorized,
} from "@/lib/auth/customer";
import { startRentalExtensionPayment } from "@/lib/rental/extensions/rental-extension-service";

export const runtime = "nodejs";

type RouteContext = {
  params: Promise<{ extensionId: string }>;
};

export async function POST(req: Request, ctx: RouteContext) {
  try {
    const customer = await assertCustomer(req);
    const { extensionId } = await ctx.params;
    const result = await startRentalExtensionPayment({
      customer,
      extensionId,
    });

    return NextResponse.json(result);
  } catch (error) {
    if (isCustomerUnauthorized(error)) return customerUnauthorizedResponse();
    const message = error instanceof Error ? error.message : "Extension payment start failed";
    const status = message === "Extension request not found" ? 404 : 400;
    return NextResponse.json({ error: message }, { status });
  }
}
