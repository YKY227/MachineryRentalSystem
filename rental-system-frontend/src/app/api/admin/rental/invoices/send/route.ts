// src/app/api/admin/rental/invoices/send/route.ts
import { NextResponse } from "next/server";

import {
  adminUnauthorizedResponse,
  assertAdmin,
  isAdminUnauthorized,
} from "@/lib/auth/admin";
import { sendIssuedInvoiceEmail } from "@/lib/rental/invoices/send-issued-invoice";

export const runtime = "nodejs";

type SendInvoiceBody = {
  invoiceId: string;
  to: string;
  cc?: string;
  subject?: string;
  message?: string;
  mode?: "send" | "resend";
};

export async function POST(req: Request) {
  try {
    assertAdmin(req);

    const body = (await req.json()) as SendInvoiceBody;
    const invoiceId = (body.invoiceId ?? "").trim();
    if (!invoiceId) return NextResponse.json({ error: "Missing invoiceId" }, { status: 400 });
    const result = await sendIssuedInvoiceEmail({
      invoiceId,
      to: body.to ?? "",
      cc: body.cc,
      subject: body.subject,
      message: body.message,
      mode: body.mode,
    });

    return NextResponse.json({
      ok: true,
      provider: result.provider,
      providerMessageId: result.providerMessageId,
      pdf: result.pdf,
      mode: result.mode,
    });
  } catch (e) {
    if (isAdminUnauthorized(e)) return adminUnauthorizedResponse();
    const message = e instanceof Error ? e.message : "Send failed";
    return NextResponse.json({ error: message }, { status: 400 });
  }
}
