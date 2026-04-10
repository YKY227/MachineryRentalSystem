import { NextResponse } from "next/server";

import {
  adminUnauthorizedResponse,
  assertAdmin,
  isAdminUnauthorized,
} from "@/lib/auth/admin";
import {
  restoreAdminEmailTemplate,
  type EmailTemplateFieldValues,
  type EmailTemplateId,
  updateAdminEmailTemplate,
} from "@/lib/email/email-template-registry";

export const runtime = "nodejs";

type TemplateBody = Partial<EmailTemplateFieldValues>;

const NO_STORE_HEADERS = {
  "Cache-Control": "no-store, no-cache, must-revalidate, proxy-revalidate",
  Pragma: "no-cache",
  Expires: "0",
};

export async function PUT(
  req: Request,
  ctx: { params: Promise<{ templateId: string }> }
) {
  try {
    assertAdmin(req);
    const { templateId } = await ctx.params;
    const body = (await req.json()) as TemplateBody;
    const template = await updateAdminEmailTemplate(
      templateId as EmailTemplateId,
      body
    );
    return NextResponse.json(
      { template },
      {
        headers: NO_STORE_HEADERS,
      }
    );
  } catch (error) {
    if (isAdminUnauthorized(error)) return adminUnauthorizedResponse();
    const message = error instanceof Error ? error.message : "Email template save failed";
    return NextResponse.json({ error: message }, { status: 400 });
  }
}

export async function DELETE(
  req: Request,
  ctx: { params: Promise<{ templateId: string }> }
) {
  try {
    assertAdmin(req);
    const { templateId } = await ctx.params;
    const template = await restoreAdminEmailTemplate(templateId as EmailTemplateId);
    return NextResponse.json(
      { template },
      {
        headers: NO_STORE_HEADERS,
      }
    );
  } catch (error) {
    if (isAdminUnauthorized(error)) return adminUnauthorizedResponse();
    const message = error instanceof Error ? error.message : "Email template restore failed";
    return NextResponse.json({ error: message }, { status: 400 });
  }
}
