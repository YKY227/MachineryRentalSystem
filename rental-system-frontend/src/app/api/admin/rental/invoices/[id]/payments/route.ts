//rental-system-frontend/src/app/api/admin/rental/invoices/[id]/payments/route.ts
import { NextResponse } from "next/server";

import {
  adminUnauthorizedResponse,
  assertAdmin,
  isAdminUnauthorized,
} from "@/lib/auth/admin";
import { dbPaymentRepo } from "@/lib/rental/invoices/db-payment-repo";

export const runtime = "nodejs";

type RouteContext = {
  params: Promise<{ id: string }>;
};

function requireInvoiceEnv() {
  const required = ["SUPABASE_URL", "SUPABASE_SERVICE_ROLE_KEY"] as const;
  const missing = required.filter((name) => !process.env[name]);
  if (missing.length) {
    throw new Error(`Missing required env vars: ${missing.join(", ")}`);
  }
}

export async function GET(req: Request, ctx: RouteContext) {
  try {
    assertAdmin(req);
    requireInvoiceEnv();
    const { id } = await ctx.params;
    const result = await dbPaymentRepo.listWithTotals(id);
    return NextResponse.json(result);
  } catch (e) {
    if (isAdminUnauthorized(e)) return adminUnauthorizedResponse();
    const message = e instanceof Error ? e.message : "Invoice payments read failed";
    return NextResponse.json({ error: message }, { status: 400 });
  }
}

export async function POST(req: Request, ctx: RouteContext) {
  try {
    assertAdmin(req);
    requireInvoiceEnv();
    const { id } = await ctx.params;
    const body = (await req.json()) as {
      amountCents?: number;
      paidAt?: string;
      method?: string;
      reference?: string;
      notes?: string;
    };

    const result = await dbPaymentRepo.recordPayment({
      invoiceId: id,
      amountCents: Number(body?.amountCents),
      paidAt: body?.paidAt,
      method: body?.method,
      reference: body?.reference,
      notes: body?.notes,
    });

    return NextResponse.json({
      payments: result.payments,
      totals: result.totals,
    });
  } catch (e) {
    if (isAdminUnauthorized(e)) return adminUnauthorizedResponse();
    const message = e instanceof Error ? e.message : "Invoice payment create failed";
    return NextResponse.json({ error: message }, { status: 400 });
  }
}
