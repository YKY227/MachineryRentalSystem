import { NextResponse } from "next/server";
import { Resend } from "resend";

import {
  adminUnauthorizedResponse,
  assertAdmin,
  isAdminUnauthorized,
} from "@/lib/auth/admin";
import { dbAdminSettingsRepo } from "@/lib/settings/db-admin-settings-repo";

export const runtime = "nodejs";

function mustEnv(name: string) {
  const value = process.env[name];
  if (!value) throw new Error(`Missing env: ${name}`);
  return value;
}

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

    if (provider !== "resend") {
      return NextResponse.json(
        { error: `Unsupported EMAIL_PROVIDER for test email: ${provider}` },
        { status: 400 }
      );
    }

    const resend = new Resend(mustEnv("RESEND_API_KEY"));
    const result = await resend.emails.send({
      from: mustEnv("RESEND_FROM"),
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

    if (result.error) {
      throw new Error(result.error.message);
    }

    return NextResponse.json({
      ok: true,
      provider: "resend",
      recipient,
      providerMessageId: result.data?.id ?? null,
      sentAt,
    });
  } catch (error) {
    if (isAdminUnauthorized(error)) return adminUnauthorizedResponse();
    const message = error instanceof Error ? error.message : "Test email failed";
    return NextResponse.json({ error: message }, { status: 400 });
  }
}

