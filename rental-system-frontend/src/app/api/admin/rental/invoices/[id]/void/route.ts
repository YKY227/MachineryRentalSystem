import { NextResponse } from "next/server";

import { dbInvoiceRepo } from "@/lib/rental/invoices/db-invoice-repo";
import {
  adminUnauthorizedResponse,
  assertAdmin,
  isAdminUnauthorized,
} from "@/lib/auth/admin";

export const runtime = "nodejs";

type RouteContext = {
  params: Promise<{ id: string }>;
};

export async function POST(req: Request, ctx: RouteContext) {
  try {
    assertAdmin(req);
    const { id } = await ctx.params;
    const body = (await req.json()) as { reason?: string };
    const reason = (body?.reason ?? "").trim();
    if (!reason) return NextResponse.json({ error: "Void reason is required" }, { status: 400 });

    const invoice = await dbInvoiceRepo.void(id, reason);
    return NextResponse.json({ invoice });
  } catch (e) {
    if (isAdminUnauthorized(e)) return adminUnauthorizedResponse();
    const message = e instanceof Error ? e.message : "Invoice void failed";
    return NextResponse.json({ error: message }, { status: 400 });
  }
}
