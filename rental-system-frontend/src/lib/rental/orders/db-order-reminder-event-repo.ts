import "server-only";

import { supabaseAdmin } from "@/lib/supabase/server";

const ORDER_REMINDER_EVENTS_TABLE =
  process.env.SUPABASE_RENTAL_ORDER_REMINDER_EVENTS_TABLE ?? "rental_order_reminder_events";

export type RentalOrderReminderKind = "return";
export type RentalOrderReturnReminderStage = "three_day" | "one_day" | "due_today";
export type RentalOrderReminderEventStatus = "sent" | "failed";
export type RentalOrderReminderProvider = "mock" | "resend" | "ses" | "postmark";

export type RentalOrderReminderEvent = {
  id: string;
  orderId: string;
  customerId?: string;
  reminderKind: RentalOrderReminderKind;
  reminderStage: RentalOrderReturnReminderStage;
  recipientEmail: string;
  subject: string;
  provider: RentalOrderReminderProvider;
  providerMessageId?: string;
  status: RentalOrderReminderEventStatus;
  errorMessage?: string;
  sentAt: string;
  createdAt: string;
};

type ReminderEventRow = {
  id: string;
  order_id: string;
  customer_id: string | null;
  reminder_kind: RentalOrderReminderKind;
  reminder_stage: RentalOrderReturnReminderStage;
  recipient_email: string;
  subject: string;
  provider: RentalOrderReminderProvider;
  provider_message_id: string | null;
  status: RentalOrderReminderEventStatus;
  error_message: string | null;
  sent_at: string;
  created_at: string;
};

function toReminderEvent(row: ReminderEventRow): RentalOrderReminderEvent {
  return {
    id: row.id,
    orderId: row.order_id,
    customerId: row.customer_id ?? undefined,
    reminderKind: row.reminder_kind,
    reminderStage: row.reminder_stage,
    recipientEmail: row.recipient_email,
    subject: row.subject,
    provider: row.provider,
    providerMessageId: row.provider_message_id ?? undefined,
    status: row.status,
    errorMessage: row.error_message ?? undefined,
    sentAt: row.sent_at,
    createdAt: row.created_at,
  };
}

export const dbOrderReminderEventRepo = {
  async listByOrderId(orderId: string): Promise<RentalOrderReminderEvent[]> {
    const supabase = supabaseAdmin();
    const { data, error } = await supabase
      .from(ORDER_REMINDER_EVENTS_TABLE)
      .select(
        "id,order_id,customer_id,reminder_kind,reminder_stage,recipient_email,subject,provider,provider_message_id,status,error_message,sent_at,created_at"
      )
      .eq("order_id", orderId)
      .order("sent_at", { ascending: false });

    if (error) throw new Error(`Order reminder event read failed: ${error.message}`);
    return ((data ?? []) as unknown as ReminderEventRow[]).map(toReminderEvent);
  },

  async create(input: {
    orderId: string;
    customerId?: string;
    reminderKind: RentalOrderReminderKind;
    reminderStage: RentalOrderReturnReminderStage;
    recipientEmail: string;
    subject: string;
    provider: RentalOrderReminderProvider;
    providerMessageId?: string;
    status: RentalOrderReminderEventStatus;
    errorMessage?: string;
    sentAt?: string;
  }): Promise<RentalOrderReminderEvent> {
    const supabase = supabaseAdmin();
    const { data, error } = await supabase
      .from(ORDER_REMINDER_EVENTS_TABLE)
      .insert({
        order_id: input.orderId,
        customer_id: input.customerId ?? null,
        reminder_kind: input.reminderKind,
        reminder_stage: input.reminderStage,
        recipient_email: input.recipientEmail.trim(),
        subject: input.subject.trim(),
        provider: input.provider,
        provider_message_id: input.providerMessageId ?? null,
        status: input.status,
        error_message: input.errorMessage?.trim() || null,
        sent_at: input.sentAt ?? new Date().toISOString(),
      })
      .select(
        "id,order_id,customer_id,reminder_kind,reminder_stage,recipient_email,subject,provider,provider_message_id,status,error_message,sent_at,created_at"
      )
      .single<ReminderEventRow>();

    if (error) throw new Error(`Order reminder event create failed: ${error.message}`);
    return toReminderEvent(data);
  },
};
