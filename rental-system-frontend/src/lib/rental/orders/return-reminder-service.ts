import "server-only";

import { getConfiguredEmailProvider } from "@/lib/email/server-email";
import { EXTENSION_REVIEW_CLARIFICATION_MESSAGE } from "@/lib/rental/extensions/customer-messages";
import { dbRentalOrderExtensionRepo } from "@/lib/rental/extensions/db-rental-order-extension-repo";
import { deliverRentalEmail } from "@/lib/rental/invoices/email-delivery";
import {
  dbOrderReminderEventRepo,
  type RentalOrderReturnReminderStage,
} from "@/lib/rental/orders/db-order-reminder-event-repo";
import { dbOrderRepo } from "@/lib/rental/orders/db-order-repo";
import type { RentalOrder } from "@/lib/rental/orders/types";

const DEFAULT_RETURN_REMINDER_DAYS = [3, 1] as const;
const DEFAULT_RETURN_REMINDER_BATCH_LIMIT = 50;
const APP_BASE_URL = process.env.APP_BASE_URL ?? "";

export type ReturnReminderReasonCode =
  | "not_active"
  | "already_returned"
  | "stage_not_due"
  | "stage_already_sent"
  | "missing_email"
  | "dry_run"
  | "sent"
  | "send_failed";

export type ReturnReminderPolicy = {
  reminderDays: number[];
  includeDueToday: boolean;
  batchLimit: number;
};

export type ReturnReminderResult = {
  orderId: string;
  customerId?: string;
  recipient?: string;
  rentalEnd: string;
  equipmentTitle: string;
  daysUntilReturn: number;
  status: "sent" | "skipped" | "failed";
  reasonCode: ReturnReminderReasonCode;
  reminderStageEligible: RentalOrderReturnReminderStage | "none";
  reminderStageSent?: RentalOrderReturnReminderStage;
  lastReminderSentAt?: string;
  hasOpenExtensionRequest: boolean;
  error?: string;
};

export type ProcessReturnRemindersResult = {
  totalChecked: number;
  totalEligible: number;
  totalSent: number;
  totalSkipped: number;
  totalFailed: number;
  policy: ReturnReminderPolicy;
  results: ReturnReminderResult[];
};

function formatDate(iso?: string) {
  if (!iso) return "-";
  const date = new Date(iso);
  if (Number.isNaN(date.getTime())) return iso;
  return date.toLocaleDateString("en-SG", {
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

function getDaysUntilReturn(returnDate: string, now = Date.now()) {
  const returnDay = startOfUtcDayMs(returnDate, now);
  const nowDay = startOfUtcDayMs(new Date(now).toISOString(), now);
  return Math.floor((returnDay - nowDay) / (24 * 60 * 60 * 1000));
}

function normalizeReminderDays(input?: number[]) {
  const values = Array.isArray(input) ? input : [...DEFAULT_RETURN_REMINDER_DAYS];
  const normalized = Array.from(
    new Set(
      values
        .map((value) => Math.max(0, Math.floor(Number(value))))
        .filter((value) => Number.isFinite(value))
    )
  ).sort((left, right) => right - left);

  return normalized.length ? normalized : [...DEFAULT_RETURN_REMINDER_DAYS];
}

function getReturnReminderStage(input: {
  daysUntilReturn: number;
  reminderDays: number[];
  includeDueToday: boolean;
}): RentalOrderReturnReminderStage | "none" {
  if (input.daysUntilReturn < 0) return "none";
  if (input.daysUntilReturn === 0) {
    return input.includeDueToday ? "due_today" : "none";
  }
  if (input.reminderDays.includes(3) && input.daysUntilReturn === 3) return "three_day";
  if (input.reminderDays.includes(1) && input.daysUntilReturn === 1) return "one_day";
  return "none";
}

function getStageLabel(stage: RentalOrderReturnReminderStage) {
  switch (stage) {
    case "three_day":
      return "3-Day Return Reminder";
    case "one_day":
      return "1-Day Return Reminder";
    case "due_today":
      return "Return Due Today Reminder";
  }
}

function buildPortalInstruction(hasOpenExtensionRequest: boolean) {
  const portalUrl = APP_BASE_URL
    ? `${APP_BASE_URL.replace(/\/+$/, "")}/rental/account`
    : "";

  if (hasOpenExtensionRequest) {
    return `An extension request is already in progress for this rental. ${EXTENSION_REVIEW_CLARIFICATION_MESSAGE}`;
  }

  if (portalUrl) {
    return `If you need more time, you may request an extension from your customer portal: <a href="${portalUrl}">${portalUrl}</a>. ${EXTENSION_REVIEW_CLARIFICATION_MESSAGE}`;
  }

  return `If you need more time, you may request an extension from your customer portal. ${EXTENSION_REVIEW_CLARIFICATION_MESSAGE}`;
}

async function buildReminderHtml(input: {
  order: RentalOrder;
  reminderStage: RentalOrderReturnReminderStage;
  hasOpenExtensionRequest: boolean;
}) {
  const customerName =
    input.order.customerSnapshot?.contactName?.trim() ||
    input.order.customerSnapshot?.companyName?.trim() ||
    "Customer";

  return `
    <div style="font-family:Arial,sans-serif; line-height:1.5">
      <p>Dear ${customerName},</p>
      <p><strong>${getStageLabel(input.reminderStage)}:</strong> your rental for <strong>${input.order.equipmentTitle}</strong> is currently scheduled to end on <strong>${formatDate(input.order.end)}</strong>.</p>
      <p>Please arrange for the equipment to be returned by the current return date unless a separate extension request is approved.</p>
      <p>${buildPortalInstruction(input.hasOpenExtensionRequest)}</p>
      <p>Thank you.</p>
    </div>
  `;
}

async function processSingleOrder(input: {
  order: RentalOrder;
  policy: ReturnReminderPolicy;
  dryRun?: boolean;
}): Promise<ReturnReminderResult> {
  const recipient = input.order.customerSnapshot?.email?.trim() || undefined;
  const daysUntilReturn = getDaysUntilReturn(input.order.end);
  const existingEvents = await dbOrderReminderEventRepo.listByOrderId(input.order.id);
  const stage = getReturnReminderStage({
    daysUntilReturn,
    reminderDays: input.policy.reminderDays,
    includeDueToday: input.policy.includeDueToday,
  });
  const hasOpenExtensionRequest = Boolean(await dbRentalOrderExtensionRepo.findOpenByOrderId(input.order.id));
  const lastReminderSentAt = existingEvents
    .filter((event) => event.reminderKind === "return" && event.status === "sent")
    .sort((left, right) => new Date(right.sentAt).getTime() - new Date(left.sentAt).getTime())
    .at(0)?.sentAt;

  const baseResult: ReturnReminderResult = {
    orderId: input.order.id,
    customerId: input.order.customerId,
    recipient,
    rentalEnd: input.order.end,
    equipmentTitle: input.order.equipmentTitle,
    daysUntilReturn,
    status: "skipped",
    reasonCode: "stage_not_due",
    reminderStageEligible: stage,
    lastReminderSentAt,
    hasOpenExtensionRequest,
  };

  if (input.order.returnStatus !== "out") {
    return { ...baseResult, reasonCode: "not_active", reminderStageEligible: "none" };
  }
  if (input.order.returnedAt || input.order.completedAt) {
    return { ...baseResult, reasonCode: "already_returned", reminderStageEligible: "none" };
  }
  if (!recipient) {
    return { ...baseResult, reasonCode: "missing_email" };
  }
  if (stage === "none") {
    return { ...baseResult, reasonCode: "stage_not_due" };
  }

  const alreadySent = existingEvents.some(
    (event) => event.reminderKind === "return" && event.reminderStage === stage && event.status === "sent"
  );
  if (alreadySent) {
    return { ...baseResult, reasonCode: "stage_already_sent" };
  }

  if (input.dryRun) {
    return { ...baseResult, reasonCode: "dry_run" };
  }

  const subject = `${getStageLabel(stage)} for Rental Order ${input.order.id}`;

  try {
    const delivery = await deliverRentalEmail({
      to: recipient,
      subject,
      html: await buildReminderHtml({
        order: input.order,
        reminderStage: stage,
        hasOpenExtensionRequest,
      }),
    });
    const sentAt = new Date().toISOString();

    await dbOrderReminderEventRepo.create({
      orderId: input.order.id,
      customerId: input.order.customerId,
      reminderKind: "return",
      reminderStage: stage,
      recipientEmail: recipient,
      subject,
      provider: delivery.provider,
      providerMessageId: delivery.providerMessageId ?? undefined,
      status: "sent",
      sentAt,
    });

    return {
      ...baseResult,
      status: "sent",
      reasonCode: "sent",
      reminderStageSent: stage,
      lastReminderSentAt: sentAt,
    };
  } catch (error) {
    await dbOrderReminderEventRepo.create({
      orderId: input.order.id,
      customerId: input.order.customerId,
      reminderKind: "return",
      reminderStage: stage,
      recipientEmail: recipient,
      subject,
      provider: getConfiguredEmailProvider(),
      status: "failed",
      errorMessage: error instanceof Error ? error.message : "Return reminder send failed",
    });

    return {
      ...baseResult,
      status: "failed",
      reasonCode: "send_failed",
      error: error instanceof Error ? error.message : "Return reminder send failed",
    };
  }
}

export async function processReturnReminderAutomation(input?: {
  orderId?: string;
  limit?: number;
  dryRun?: boolean;
  reminderDays?: number[];
  includeDueToday?: boolean;
}): Promise<ProcessReturnRemindersResult> {
  const policy: ReturnReminderPolicy = {
    reminderDays: normalizeReminderDays(input?.reminderDays),
    includeDueToday: input?.includeDueToday ?? true,
    batchLimit:
      input?.limit === undefined
        ? DEFAULT_RETURN_REMINDER_BATCH_LIMIT
        : Math.max(1, Math.floor(Number(input.limit))),
  };

  let orders: RentalOrder[] = [];
  if (input?.orderId?.trim()) {
    const order = await dbOrderRepo.get(input.orderId.trim());
    if (!order) throw new Error("Order not found");
    orders = [order];
  } else {
    orders = await dbOrderRepo.listActiveForReturnReminders(policy.batchLimit);
  }

  const results: ReturnReminderResult[] = [];
  for (const order of orders) {
    results.push(await processSingleOrder({ order, policy, dryRun: input?.dryRun }));
  }

  return {
    totalChecked: results.length,
    totalEligible: results.filter(
      (item) => item.reminderStageEligible !== "none" && (item.reasonCode === "dry_run" || item.reasonCode === "sent")
    ).length,
    totalSent: results.filter((item) => item.status === "sent").length,
    totalSkipped: results.filter((item) => item.status === "skipped").length,
    totalFailed: results.filter((item) => item.status === "failed").length,
    policy,
    results,
  };
}
