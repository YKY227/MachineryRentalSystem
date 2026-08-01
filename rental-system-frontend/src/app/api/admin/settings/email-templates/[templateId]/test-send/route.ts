import { NextResponse } from "next/server";

import {
  adminUnauthorizedResponse,
  assertAdmin,
  isAdminUnauthorized,
} from "@/lib/auth/admin";
import {
  getAdminEmailTemplate,
  type EmailTemplateId,
} from "@/lib/email/email-template-registry";
import { getEmailConfigDiagnostics, sendServerEmail } from "@/lib/email/server-email";

export const runtime = "nodejs";

type TestSendBody = {
  to?: string;
};

function sanitizeEmail(value: unknown) {
  return typeof value === "string" ? value.trim().toLowerCase() : "";
}

export async function POST(
  req: Request,
  ctx: { params: Promise<{ templateId: string }> }
) {
  try {
    assertAdmin(req);
    const { templateId } = await ctx.params;
    const body = (await req.json()) as TestSendBody;
    const to = sanitizeEmail(body.to);
    if (!to) {
      return NextResponse.json({ error: "Missing test recipient email" }, { status: 400 });
    }
    if (!/^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(to)) {
      return NextResponse.json({ error: "Invalid test recipient email" }, { status: 400 });
    }

    const template = await getAdminEmailTemplate(templateId as EmailTemplateId);
    const delivery = await sendServerEmail({
      templateId,
      to,
      subject: `[TEST] ${template.subjectPreview}`,
      html: template.htmlPreview,
    });

    return NextResponse.json({
      ok: true,
      provider: delivery.provider,
      providerMessageId: delivery.providerMessageId,
      recipient: to,
    });
  } catch (error) {
    if (isAdminUnauthorized(error)) return adminUnauthorizedResponse();
    const message = error instanceof Error ? error.message : "Email template test send failed";
    const config = getEmailConfigDiagnostics();
    return NextResponse.json(
      {
        error: message,
        provider: config.provider,
        senderDomain: config.fromDomain ?? null,
        hasResendApiKey: config.hasResendApiKey,
      },
      { status: 400 }
    );
  }
}
