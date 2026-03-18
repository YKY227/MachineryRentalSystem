import { NextResponse } from "next/server";

import {
  assertCustomer,
  customerUnauthorizedResponse,
  isCustomerUnauthorized,
} from "@/lib/auth/customer";
import { createRentalExtensionRequest } from "@/lib/rental/extensions/rental-extension-service";

export const runtime = "nodejs";

type RouteContext = {
  params: Promise<{ id: string }>;
};

type Body = {
  requestedRentalEnd?: string;
};

export async function POST(req: Request, ctx: RouteContext) {
  try {
    const customer = await assertCustomer(req);
    const { id } = await ctx.params;
    const body = (await req.json()) as Body;
    const requestedRentalEnd = String(body.requestedRentalEnd ?? "").trim();
    if (!requestedRentalEnd) {
      return NextResponse.json({ error: "Requested rental end date is required" }, { status: 400 });
    }

    const result = await createRentalExtensionRequest({
      customer,
      orderId: id,
      requestedRentalEnd,
    });

    return NextResponse.json({
      extension: result.extension,
      availability: result.availability,
      availabilityBlocked: result.extension.status === "availability_blocked",
      message: result.extension.customerMessage,
    });
  } catch (error) {
    if (isCustomerUnauthorized(error)) return customerUnauthorizedResponse();
    const message = error instanceof Error ? error.message : "Extension request failed";
    const status = message === "Order not found" ? 404 : 400;
    return NextResponse.json({ error: message }, { status });
  }
}
