import "server-only";

import { buildContactEnquiryTemplate } from "@/lib/email/email-template-registry";
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
    const template = await buildContactEnquiryTemplate({
      enquiryId: enquiry.id,
      name: enquiry.name,
      companyName: enquiry.companyName || "-",
      email: enquiry.email,
      phone: enquiry.phone || "-",
      subjectLine: enquiry.subject,
      message: enquiry.message,
      submittedAt: enquiry.createdAt,
    });
    await deliverRentalEmail({
      to: recipients,
      subject: template.subject,
      html: template.html,
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
