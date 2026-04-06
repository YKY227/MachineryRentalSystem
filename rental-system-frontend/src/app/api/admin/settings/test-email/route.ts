import { NextResponse } from "next/server";

import {
  adminUnauthorizedResponse,
  assertAdmin,
  isAdminUnauthorized,
} from "@/lib/auth/admin";
import { sendServerEmail } from "@/lib/email/server-email";
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

    const provider = (process.env.EMAIL_PROVIDER ?? "sendgrid").toLowerCase();
    const sentAt = new Date().toISOString();

    if (provider === "mock") {
      return NextResponse.json({
        ok: true,
        provider: "mock",
        recipient,
        sentAt,
      });
    }

    const delivery = await sendServerEmail({
      to: recipient,
      subject: `Admin settings test email - ${settings.orgName || "Rental System"}`,
      html: `
        <div style="font-family:Arial,sans-serif;line-height:1.5">
          <p>This is a test email from the admin settings page.</p>
          <p><strong>Organisation:</strong> ${settings.orgName || "-"}</p>
          <p><strong>Sent At:</strong> ${sentAt}</p>
        </div>
      `,
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
    return NextResponse.json({ error: message }, { status: 400 });
  }
}

