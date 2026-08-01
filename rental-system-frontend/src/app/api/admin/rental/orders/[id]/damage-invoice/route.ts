import { NextResponse } from "next/server";

import {
  adminUnauthorizedResponse,
  assertAdmin,
  isAdminUnauthorized,
} from "@/lib/auth/admin";
import { damageChargeInvoiceService } from "@/lib/rental/invoices/damage-charge-invoice-service";

export const runtime = "nodejs";

type RouteContext = {
  params: Promise<{ id: string }>;
};

type CreateDamageInvoiceBody = {
  description?: string;
  amountExclGstCents?: number | string;
  notes?: string;
  damageAssessmentId?: string;
  depositTransactionId?: string;
};

function parseAmount(value: number | string | undefined) {
  if (value === undefined || value === null || value === "") return 0;
  const parsed = typeof value === "number" ? value : Number(String(value).trim());
  if (!Number.isFinite(parsed)) throw new Error("Amount must be a valid number");
  return Math.max(0, Math.round(parsed));
}

function requireInvoiceEnv() {
  const required = ["SUPABASE_URL", "SUPABASE_SERVICE_ROLE_KEY"] as const;
  const missing = required.filter((name) => !process.env[name]);
  if (missing.length) {
    throw new Error(`Missing required env vars: ${missing.join(", ")}`);
  }
}

export async function POST(req: Request, ctx: RouteContext) {
  try {
    assertAdmin(req);
    requireInvoiceEnv();

    const { id } = await ctx.params;
    const body = ((await req.json().catch(() => ({}))) ?? {}) as CreateDamageInvoiceBody;
    const invoice = await damageChargeInvoiceService.createDraft({
      orderId: id,
      description: body.description?.trim() || "",
      amountExclGstCents: parseAmount(body.amountExclGstCents),
      notes: body.notes?.trim() || undefined,
      damageAssessmentId: body.damageAssessmentId?.trim() || undefined,
      depositTransactionId: body.depositTransactionId?.trim() || undefined,
    });

    return NextResponse.json({
      invoice,
      message: "Damage charge invoice draft created.",
    });
  } catch (error) {
    if (isAdminUnauthorized(error)) return adminUnauthorizedResponse();
    const message = error instanceof Error ? error.message : "Damage invoice create failed";
    return NextResponse.json({ error: message }, { status: 400 });
  }
}
