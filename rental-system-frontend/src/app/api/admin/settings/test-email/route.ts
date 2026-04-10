import { NextResponse } from "next/server";

import {
  adminUnauthorizedResponse,
  assertAdmin,
  isAdminUnauthorized,
} from "@/lib/auth/admin";
import { buildAdminTestEmailTemplate } from "@/lib/email/email-template-registry";
import { getEmailConfigDiagnostics, sendServerEmail } from "@/lib/email/server-email";
import { dbAdminSettingsRepo } from "@/lib/settings/db-admin-settings-repo";

export const runtime = "nodejs";

export async function POST(req: Request) {
  try {
    assertAdmin(req);

    const settings = await dbAdminSettingsRepo.get();
    const recipient =
      settings.supportEmail ||
      settings.testerEmails[0] ||
      settings.adminNotificationEmails[0] ||
      settings.bookingPaidRecipients[0] ||
      settings.overdueRecipients[0] ||
      settings.newOrderRecipients[0] ||
      settings.contactFormRecipients[0];

    if (!recipient) {
      return NextResponse.json(
        { error: "No recipient configured in settings for test email" },
        { status: 400 }
      );
    }

    const provider = (process.env.EMAIL_PROVIDER ?? "resend").toLowerCase();
    const sentAt = new Date().toISOString();

    if (provider === "mock") {
      return NextResponse.json({
        ok: true,
        provider: "mock",
        recipient,
        sentAt,
      });
    }

    const template = await buildAdminTestEmailTemplate({
      organisation: settings.orgName || "Rental System",
      sentAt,
    });
    const delivery = await sendServerEmail({
      templateId: "admin_test_email",
      to: recipient,
      subject: template.subject,
      html: template.html,
    });

    return NextResponse.json({
      ok: true,
      provider: delivery.provider,
      recipient,
      providerMessageId: delivery.providerMessageId,
      sentAt,
    });
  } catch (error) {
    if (isAdminUnauthorized(error)) return adminUnauthorizedResponse();
    const message = error instanceof Error ? error.message : "Test email failed";
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

