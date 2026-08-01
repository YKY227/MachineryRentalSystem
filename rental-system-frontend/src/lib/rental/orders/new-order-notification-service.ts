import "server-only";

import { buildNewOrderNotificationTemplate } from "@/lib/email/email-template-registry";
import { deliverRentalEmail } from "@/lib/rental/invoices/email-delivery";
import { dbOrderRepo } from "@/lib/rental/orders/db-order-repo";
import type { RentalOrder } from "@/lib/rental/orders/types";
import { dbAdminSettingsRepo } from "@/lib/settings/db-admin-settings-repo";

const APP_BASE_URL = process.env.APP_BASE_URL ?? "";

function resolveRecipients(settings: Awaited<ReturnType<typeof dbAdminSettingsRepo.get>>) {
  if (settings.newOrderRecipients.length > 0) {
    return {
      recipients: settings.newOrderRecipients,
      source: "newOrderRecipients" as const,
    };
  }

  return {
    recipients: settings.adminNotificationEmails,
    source: "adminNotificationEmails" as const,
  };
}

function buildAdminOrdersUrl(orderId: string) {
  const base = APP_BASE_URL.trim().replace(/\/+$/, "");
  if (!base) return "/admin/rental/orders";
  return base + "/admin/rental/orders?orderId=" + encodeURIComponent(orderId);
}

function equipmentSummary(order: RentalOrder) {
  return `${order.equipmentTitle} x${order.qty}`;
}

function maskEmail(email: string) {
  const trimmed = email.trim();
  const [local = "", domain = ""] = trimmed.split("@");
  if (!local || !domain) return "invalid";
  if (local.length <= 2) return `${local[0] ?? "*"}***@${domain}`;
  return `${local.slice(0, 2)}***@${domain}`;
}

export async function sendNewOrderNotificationIfNeeded(orderId: string) {
  const order = await dbOrderRepo.get(orderId);
  if (!order) return { sent: false as const, reason: "order_missing" as const };
  if (order.newOrderNotifiedAt) {
    return { sent: false as const, reason: "already_notified" as const };
  }

  const settings = await dbAdminSettingsRepo.get();
  const { recipients, source } = resolveRecipients(settings);
  if (!recipients.length) {
    console.warn("[new-order-notification] skipped due to missing recipients", {
      orderId,
      routingSource: source,
      adminNotificationCount: settings.adminNotificationEmails.length,
      newOrderRecipientCount: settings.newOrderRecipients.length,
    });
    return { sent: false as const, reason: "no_recipients" as const };
  }

  const companyName = order.customerSnapshot?.companyName?.trim() || "-";
  const customerName = order.customerSnapshot?.contactName?.trim() || "-";
  const adminUrl = buildAdminOrdersUrl(order.id);
  const template = await buildNewOrderNotificationTemplate({
    orderId: order.id,
    companyName,
    customerName,
    rentalPeriod: `${order.start} to ${order.end}`,
    equipmentSummary: equipmentSummary(order),
    adminUrl,
  });

  const notifiedAt = new Date().toISOString();
  const claimed = await dbOrderRepo.markNewOrderNotifiedIfUnset(order.id, notifiedAt);
  if (!claimed) {
    return { sent: false as const, reason: "already_notified" as const };
  }

  try {
    console.info("[new-order-notification] sending", {
      orderId: order.id,
      routingSource: source,
      recipientCount: recipients.length,
      recipients: recipients.slice(0, 3).map(maskEmail),
    });
    for (const recipient of recipients) {
      await deliverRentalEmail({
        to: recipient,
        subject: template.subject,
        html: template.html,
      });
    }
    console.info("[new-order-notification] sent", {
      orderId: order.id,
      routingSource: source,
      recipientCount: recipients.length,
    });
  } catch (error) {
    await dbOrderRepo.clearNewOrderNotifiedIfMatches(order.id, notifiedAt);
    console.error("[new-order-notification] send failed", {
      orderId: order.id,
      routingSource: source,
      recipientCount: recipients.length,
      error: error instanceof Error ? error.message : "unknown error",
    });
    throw error;
  }

  return {
    sent: true as const,
    reason: "sent" as const,
    recipientCount: recipients.length,
  };
}
