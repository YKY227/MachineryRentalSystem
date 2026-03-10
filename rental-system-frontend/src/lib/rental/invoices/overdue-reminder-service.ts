import "server-only";

import { dbInvoiceRepo } from "@/lib/rental/invoices/db-invoice-repo";
import { deliverInvoiceEmail } from "@/lib/rental/invoices/email-delivery";
import { dbPaymentRepo } from "@/lib/rental/invoices/db-payment-repo";
import type { Invoice, InvoiceEmailLogItem } from "@/lib/rental/invoices/types";
import { dbOrderRepo } from "@/lib/rental/orders/db-order-repo";
import {
  dbAdminSettingsRepo,
  DEFAULT_REMINDER_POLICY_SETTINGS,
  type ReminderPolicySettings,
} from "@/lib/settings/db-admin-settings-repo";

const REMINDER_STAGES = ["first", "second", "final"] as const;

export type ReminderStage = (typeof REMINDER_STAGES)[number];

export type OverdueReminderReasonCode =
  | "reminders_disabled"
  | "not_issued"
  | "not_overdue"
  | "already_paid"
  | "stage_not_due"
  | "stage_already_sent"
  | "within_guard_window"
  | "missing_email"
  | "dry_run"
  | "sent"
  | "send_failed";

export type OverdueReminderResult = {
  invoiceId: string;
  invoiceNo?: string;
  orderId: string;
  customerId?: string;
  recipient?: string;
  dueDate?: string;
  daysOverdue: number;
  outstandingBalanceCents: number;
  status: "sent" | "skipped" | "failed";
  reasonCode: OverdueReminderReasonCode;
  reminderStageEligible: ReminderStage | "none";
  reminderStageSent?: ReminderStage;
  guardWindowHours: number;
  lastReminderSentAt?: string;
  error?: string;
};

export type ProcessOverdueRemindersResult = {
  totalChecked: number;
  totalEligible: number;
  totalSent: number;
  totalSkipped: number;
  totalFailed: number;
  policy: ReminderPolicySettings;
  results: OverdueReminderResult[];
};

type ReminderHistoryState = {
  sentStages: Set<ReminderStage>;
  latestSentAt?: string;
};

function moneyFromCents(cents: number) {
  const value = Number.isFinite(cents) ? cents : 0;
  return new Intl.NumberFormat("en-SG", {
    style: "currency",
    currency: "SGD",
    minimumFractionDigits: 2,
    maximumFractionDigits: 2,
  }).format(value / 100);
}

function formatDate(iso?: string) {
  if (!iso) return "-";
  const d = new Date(iso);
  if (Number.isNaN(d.getTime())) return iso;
  return d.toLocaleDateString("en-SG", {
    year: "numeric",
    month: "short",
    day: "2-digit",
  });
}

function startOfUtcDayMs(iso?: string, fallbackNow = Date.now()) {
  if (!iso) return fallbackNow;
  const date = new Date(iso);
  if (Number.isNaN(date.getTime())) return fallbackNow;
  return Date.UTC(date.getUTCFullYear(), date.getUTCMonth(), date.getUTCDate());
}

function getDaysOverdue(dueDate?: string, now = Date.now()) {
  if (!dueDate) return 0;
  const dueDay = startOfUtcDayMs(dueDate, now);
  const nowDay = startOfUtcDayMs(new Date(now).toISOString(), now);
  return Math.max(0, Math.floor((nowDay - dueDay) / (24 * 60 * 60 * 1000)));
}

function isWithinGuardWindow(sentAt: string | undefined, guardWindowHours: number, now = Date.now()) {
  if (!sentAt) return false;
  const sentTime = new Date(sentAt).getTime();
  if (!Number.isFinite(sentTime)) return false;
  return now - sentTime < guardWindowHours * 60 * 60 * 1000;
}

function parseReminderStageFromSubject(subject?: string): ReminderStage | null {
  const normalized = (subject ?? "").trim().toLowerCase();
  if (!normalized) return null;
  if (normalized.includes("first overdue reminder")) return "first";
  if (normalized.includes("second overdue reminder")) return "second";
  if (normalized.includes("final overdue reminder")) return "final";
  return null;
}

function deriveReminderHistory(items: InvoiceEmailLogItem[]): ReminderHistoryState {
  const sentReminderItems = items
    .filter((item) => item.type === "reminder" && item.status === "sent")
    .sort((left, right) => {
      const leftTime = new Date(left.sentAt).getTime();
      const rightTime = new Date(right.sentAt).getTime();
      return leftTime - rightTime;
    });

  const sentStages = new Set<ReminderStage>();

  for (const item of sentReminderItems) {
    const explicitStage = parseReminderStageFromSubject(item.subject);
    if (explicitStage) {
      sentStages.add(explicitStage);
      continue;
    }

    const fallbackStage = REMINDER_STAGES.find((stage) => !sentStages.has(stage)) ?? "final";
    sentStages.add(fallbackStage);
  }

  return {
    sentStages,
    latestSentAt: sentReminderItems.at(-1)?.sentAt,
  };
}

function getNextEligibleStage(input: {
  daysOverdue: number;
  policy: ReminderPolicySettings;
  sentStages: Set<ReminderStage>;
}): ReminderStage | "none" {
  const { daysOverdue, policy, sentStages } = input;

  if (!sentStages.has("first")) {
    return daysOverdue >= policy.firstReminderDays ? "first" : "none";
  }
  if (!sentStages.has("second")) {
    return daysOverdue >= policy.secondReminderDays ? "second" : "none";
  }
  if (!sentStages.has("final")) {
    return daysOverdue >= policy.finalReminderDays ? "final" : "none";
  }
  return "none";
}

function getStageLabel(stage: ReminderStage) {
  switch (stage) {
    case "first":
      return "First";
    case "second":
      return "Second";
    case "final":
      return "Final";
  }
}

async function buildReminderHtml(input: {
  invoice: Invoice;
  outstandingBalanceCents: number;
  reminderStage: ReminderStage;
}) {
  const invoice = input.invoice;
  const order = await dbOrderRepo.get(invoice.orderId);
  const customerName = invoice.billTo?.contactName || invoice.billTo?.name || "Customer";
  const dueDateLine = invoice.dueDate
    ? `<p><strong>Due Date:</strong> ${formatDate(invoice.dueDate)}</p>`
    : "";
  const overdueLabel = invoice.dueDate ? formatDate(invoice.dueDate) : "the due date";
  const stageLabel = getStageLabel(input.reminderStage);

  return {
    customerId: order?.customerId,
    html: `
      <div style="font-family:Arial,sans-serif; line-height:1.5">
        <p>Dear ${customerName},</p>
        <p><strong>${stageLabel} reminder:</strong> invoice <strong>${invoice.invoiceNo ?? invoice.id}</strong> remains overdue as of <strong>${overdueLabel}</strong>.</p>
        <p><strong>Outstanding Balance:</strong> ${moneyFromCents(input.outstandingBalanceCents)}</p>
        ${dueDateLine}
        <p>Please arrange payment and quote the invoice number as reference. A copy of the invoice is attached for convenience.</p>
        <p>Thank you.</p>
      </div>
    `,
  };
}

async function processSingleInvoice(input: {
  invoice: Invoice;
  policy: ReminderPolicySettings;
  dryRun?: boolean;
}): Promise<OverdueReminderResult> {
  const invoice = input.invoice;
  const paymentTotals = await dbPaymentRepo.getTotals(invoice.id);
  const recipient = (invoice.billTo?.email ?? "").trim() || undefined;
  const emailHistory = await dbInvoiceRepo.listEmails(invoice.id);
  const reminderHistory = deriveReminderHistory(emailHistory);
  const daysOverdue = getDaysOverdue(invoice.dueDate);

  const baseResult = {
    invoiceId: invoice.id,
    invoiceNo: invoice.invoiceNo,
    orderId: invoice.orderId,
    recipient,
    dueDate: invoice.dueDate,
    daysOverdue,
    outstandingBalanceCents: paymentTotals.balanceCents,
    guardWindowHours: input.policy.reminderGuardWindowHours,
    lastReminderSentAt: reminderHistory.latestSentAt,
    reminderStageEligible: "none" as const,
  };

  if (!input.policy.remindersEnabled) {
    return { ...baseResult, status: "skipped", reasonCode: "reminders_disabled" };
  }
  if (invoice.status !== "issued") {
    return { ...baseResult, status: "skipped", reasonCode: "not_issued" };
  }
  if (paymentTotals.status === "paid") {
    return { ...baseResult, status: "skipped", reasonCode: "already_paid" };
  }
  if (paymentTotals.status !== "overdue") {
    return { ...baseResult, status: "skipped", reasonCode: "not_overdue" };
  }
  if (!recipient) {
    return { ...baseResult, status: "skipped", reasonCode: "missing_email" };
  }

  const eligibleStage = getNextEligibleStage({
    daysOverdue,
    policy: input.policy,
    sentStages: reminderHistory.sentStages,
  });

  if (eligibleStage === "none") {
    const reasonCode = reminderHistory.sentStages.has("final")
      ? "stage_already_sent"
      : "stage_not_due";
    return { ...baseResult, status: "skipped", reasonCode };
  }

  if (isWithinGuardWindow(reminderHistory.latestSentAt, input.policy.reminderGuardWindowHours)) {
    return {
      ...baseResult,
      status: "skipped",
      reasonCode: "within_guard_window",
      reminderStageEligible: eligibleStage,
    };
  }

  if (input.dryRun) {
    const order = await dbOrderRepo.get(invoice.orderId);
    return {
      ...baseResult,
      customerId: order?.customerId,
      status: "skipped",
      reasonCode: "dry_run",
      reminderStageEligible: eligibleStage,
    };
  }

  try {
    const stageLabel = getStageLabel(eligibleStage);
    const subject = `${stageLabel} Overdue Reminder for Invoice ${invoice.invoiceNo ?? invoice.id}`;
    const reminderContent = await buildReminderHtml({
      invoice,
      outstandingBalanceCents: paymentTotals.balanceCents,
      reminderStage: eligibleStage,
    });
    const delivery = await deliverInvoiceEmail({
      invoice,
      to: recipient,
      subject,
      html: reminderContent.html,
    });

    const sentAt = new Date().toISOString();
    await dbInvoiceRepo.createEmailEvent({
      invoiceId: invoice.id,
      type: "reminder",
      to: recipient,
      subject,
      provider: delivery.provider,
      status: "sent",
      providerMessageId: delivery.providerMessageId ?? undefined,
      pdfSha256: delivery.pdf.sha256 ?? undefined,
      sentAt,
    });
    await dbInvoiceRepo.appendEmailLog(invoice.id, {
      type: "reminder",
      to: recipient,
      subject,
      provider: delivery.provider,
      status: "sent",
      providerMessageId: delivery.providerMessageId ?? undefined,
      pdfSha256: delivery.pdf.sha256 ?? undefined,
    });

    return {
      ...baseResult,
      customerId: reminderContent.customerId,
      status: "sent",
      reasonCode: "sent",
      reminderStageEligible: eligibleStage,
      reminderStageSent: eligibleStage,
      lastReminderSentAt: sentAt,
    };
  } catch (error) {
    return {
      ...baseResult,
      status: "failed",
      reasonCode: "send_failed",
      reminderStageEligible: eligibleStage,
      error: error instanceof Error ? error.message : "Reminder send failed",
    };
  }
}

export async function processOverdueInvoiceReminders(input?: {
  invoiceId?: string;
  guardWindowHours?: number;
  limit?: number;
  dryRun?: boolean;
}): Promise<ProcessOverdueRemindersResult> {
  const storedPolicy = await dbAdminSettingsRepo.getReminderPolicy();
  const policy: ReminderPolicySettings = {
    ...storedPolicy,
    reminderGuardWindowHours:
      input?.guardWindowHours === undefined
        ? storedPolicy.reminderGuardWindowHours
        : Math.max(1, Math.floor(Number(input.guardWindowHours))),
    reminderBatchLimit:
      input?.limit === undefined
        ? storedPolicy.reminderBatchLimit
        : Math.max(1, Math.floor(Number(input.limit))),
  };

  const dryRun = Boolean(input?.dryRun);

  let invoices: Invoice[] = [];
  if (input?.invoiceId?.trim()) {
    const invoice = await dbInvoiceRepo.get(input.invoiceId.trim());
    if (!invoice) throw new Error("Invoice not found");
    invoices = [invoice];
  } else {
    const issuedInvoices = await dbInvoiceRepo.listAll({ lifecycleStatus: "issued" });
    const sorted = [...issuedInvoices].sort((left, right) => {
      const leftDue = new Date(left.dueDate ?? left.createdAt).getTime();
      const rightDue = new Date(right.dueDate ?? right.createdAt).getTime();
      return leftDue - rightDue;
    });
    invoices = sorted.slice(0, policy.reminderBatchLimit);
  }

  const results: OverdueReminderResult[] = [];
  for (const invoice of invoices) {
    results.push(
      await processSingleInvoice({
        invoice,
        policy,
        dryRun,
      })
    );
  }

  const totalEligible = results.filter(
    (item) =>
      item.reminderStageEligible !== "none" &&
      (item.reasonCode === "sent" || item.reasonCode === "dry_run")
  ).length;

  return {
    totalChecked: results.length,
    totalEligible,
    totalSent: results.filter((item) => item.status === "sent").length,
    totalSkipped: results.filter((item) => item.status === "skipped").length,
    totalFailed: results.filter((item) => item.status === "failed").length,
    policy,
    results,
  };
}

export function getOverdueReminderGuardWindowHours() {
  return DEFAULT_REMINDER_POLICY_SETTINGS.reminderGuardWindowHours;
}
