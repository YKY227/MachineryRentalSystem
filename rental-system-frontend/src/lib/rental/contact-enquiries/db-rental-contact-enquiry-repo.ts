import "server-only";

import { supabaseAdmin } from "@/lib/supabase/server";
import type {
  CreateRentalContactEnquiryInput,
  RentalContactEnquiry,
  RentalContactEnquiryStatus,
} from "@/lib/rental/contact-enquiries/types";

const CONTACT_ENQUIRIES_TABLE =
  process.env.SUPABASE_RENTAL_CONTACT_ENQUIRIES_TABLE ?? "rental_contact_enquiries";

type RentalContactEnquiryRow = {
  id: string;
  name: string;
  company_name: string | null;
  email: string;
  phone: string | null;
  subject: string;
  message: string;
  status: RentalContactEnquiryStatus;
  source: string;
  email_sent_at: string | null;
  email_send_error: string | null;
  created_at: string;
  updated_at: string;
};

function nowIso() {
  return new Date().toISOString();
}

function toEnquiry(row: RentalContactEnquiryRow): RentalContactEnquiry {
  return {
    id: row.id,
    name: row.name,
    companyName: row.company_name ?? undefined,
    email: row.email,
    phone: row.phone ?? undefined,
    subject: row.subject,
    message: row.message,
    status: row.status,
    source: row.source as RentalContactEnquiry["source"],
    emailSentAt: row.email_sent_at ?? undefined,
    emailSendError: row.email_send_error ?? undefined,
    createdAt: row.created_at,
    updatedAt: row.updated_at,
  };
}

const CONTACT_ENQUIRY_COLUMNS = [
  "id",
  "name",
  "company_name",
  "email",
  "phone",
  "subject",
  "message",
  "status",
  "source",
  "email_sent_at",
  "email_send_error",
  "created_at",
  "updated_at",
].join(",");

export const dbRentalContactEnquiryRepo = {
  async create(input: CreateRentalContactEnquiryInput): Promise<RentalContactEnquiry> {
    const supabase = supabaseAdmin();
    const { data, error } = await supabase
      .from(CONTACT_ENQUIRIES_TABLE)
      .insert({
        id: crypto.randomUUID(),
        name: input.name.trim(),
        company_name: input.companyName?.trim() || null,
        email: input.email.trim().toLowerCase(),
        phone: input.phone?.trim() || null,
        subject: input.subject.trim(),
        message: input.message.trim(),
        status: "new",
        source: input.source ?? "website_contact_form",
        created_at: nowIso(),
        updated_at: nowIso(),
      })
      .select(CONTACT_ENQUIRY_COLUMNS)
      .single<RentalContactEnquiryRow>();

    if (error) throw new Error(`Contact enquiry create failed: ${error.message}`);
    return toEnquiry(data);
  },

  async markEmailSent(id: string, emailSentAt: string): Promise<RentalContactEnquiry> {
    const supabase = supabaseAdmin();
    const { data, error } = await supabase
      .from(CONTACT_ENQUIRIES_TABLE)
      .update({
        status: "emailed",
        email_sent_at: emailSentAt,
        email_send_error: null,
        updated_at: nowIso(),
      })
      .eq("id", id)
      .select(CONTACT_ENQUIRY_COLUMNS)
      .single<RentalContactEnquiryRow>();

    if (error) throw new Error(`Contact enquiry mark sent failed: ${error.message}`);
    return toEnquiry(data);
  },

  async markEmailFailed(id: string, errorMessage: string): Promise<RentalContactEnquiry> {
    const supabase = supabaseAdmin();
    const { data, error } = await supabase
      .from(CONTACT_ENQUIRIES_TABLE)
      .update({
        status: "email_failed",
        email_send_error: errorMessage.trim() || "Email send failed",
        updated_at: nowIso(),
      })
      .eq("id", id)
      .select(CONTACT_ENQUIRY_COLUMNS)
      .single<RentalContactEnquiryRow>();

    if (error) throw new Error(`Contact enquiry mark failed failed: ${error.message}`);
    return toEnquiry(data);
  },
};
