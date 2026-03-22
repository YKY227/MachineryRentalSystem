import "server-only";

import { deliverRentalEmail } from "@/lib/rental/invoices/email-delivery";
import { dbRentalContactEnquiryRepo } from "@/lib/rental/contact-enquiries/db-rental-contact-enquiry-repo";
import type { CreateRentalContactEnquiryInput } from "@/lib/rental/contact-enquiries/types";
import { dbAdminSettingsRepo } from "@/lib/settings/db-admin-settings-repo";

export type SubmitRentalContactEnquiryResult = {
  enquiryId: string;
  stored: true;
  emailed: boolean;
};

function resolveRecipients(settings: Awaited<ReturnType<typeof dbAdminSettingsRepo.get>>) {
  if (settings.contactFormRecipients.length > 0) return settings.contactFormRecipients;
  return settings.adminNotificationEmails;
}

function formatSubmittedAt(iso: string) {
  const date = new Date(iso);
  if (Number.isNaN(date.getTime())) return iso;
  return date.toLocaleString("en-SG", { hour12: true });
}

function escapeHtml(value: string) {
  return value
    .replace(/&/g, "&amp;")
    .replace(/</g, "&lt;")
    .replace(/>/g, "&gt;")
    .replace(/\"/g, "&quot;")
    .replace(/'/g, "&#39;");
}

function buildEmailHtml(input: {
  name: string;
  companyName?: string;
  email: string;
  phone?: string;
  subject: string;
  message: string;
  submittedAt: string;
  enquiryId: string;
}) {
  return `
    <div style="font-family:Arial,sans-serif; line-height:1.5">
      <p>A new website contact enquiry has been submitted.</p>
      <p><strong>Name:</strong> ${escapeHtml(input.name)}</p>
      <p><strong>Company:</strong> ${escapeHtml(input.companyName || "-")}</p>
      <p><strong>Email:</strong> ${escapeHtml(input.email)}</p>
      <p><strong>Phone:</strong> ${escapeHtml(input.phone || "-")}</p>
      <p><strong>Subject:</strong> ${escapeHtml(input.subject)}</p>
      <p><strong>Submitted:</strong> ${escapeHtml(formatSubmittedAt(input.submittedAt))}</p>
      <p><strong>Enquiry ID:</strong> ${escapeHtml(input.enquiryId)}</p>
      <p><strong>Message:</strong></p>
      <div style="white-space:pre-wrap;border:1px solid #e2e8f0;background:#f8fafc;padding:12px;border-radius:8px;">${escapeHtml(input.message)}</div>
    </div>
  `;
}

export async function submitRentalContactEnquiry(
  input: CreateRentalContactEnquiryInput
): Promise<SubmitRentalContactEnquiryResult> {
  const enquiry = await dbRentalContactEnquiryRepo.create(input);
  const settings = await dbAdminSettingsRepo.get();
  const recipients = resolveRecipients(settings);

  if (!recipients.length) {
    await dbRentalContactEnquiryRepo.markEmailFailed(enquiry.id, "No contact enquiry recipients configured");
    return {
      enquiryId: enquiry.id,
      stored: true,
      emailed: false,
    };
  }

  try {
    await deliverRentalEmail({
      to: recipients,
      subject: `New website enquiry - ${enquiry.subject}`,
      html: buildEmailHtml({
        name: enquiry.name,
        companyName: enquiry.companyName,
        email: enquiry.email,
        phone: enquiry.phone,
        subject: enquiry.subject,
        message: enquiry.message,
        submittedAt: enquiry.createdAt,
        enquiryId: enquiry.id,
      }),
      replyTo: enquiry.email,
    });
    await dbRentalContactEnquiryRepo.markEmailSent(enquiry.id, new Date().toISOString());
    return {
      enquiryId: enquiry.id,
      stored: true,
      emailed: true,
    };
  } catch (error) {
    await dbRentalContactEnquiryRepo.markEmailFailed(
      enquiry.id,
      error instanceof Error ? error.message : "Contact enquiry email send failed"
    );
    return {
      enquiryId: enquiry.id,
      stored: true,
      emailed: false,
    };
  }
}
