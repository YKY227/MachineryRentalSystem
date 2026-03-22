import "server-only";

import { deliverRentalEmail } from "@/lib/rental/invoices/email-delivery";
import { dbOrderRepo } from "@/lib/rental/orders/db-order-repo";
import type { RentalOrder } from "@/lib/rental/orders/types";
import { dbAdminSettingsRepo } from "@/lib/settings/db-admin-settings-repo";

const APP_BASE_URL = process.env.APP_BASE_URL ?? "";

function resolveRecipients(settings: Awaited<ReturnType<typeof dbAdminSettingsRepo.get>>) {
  if (settings.newOrderRecipients.length > 0) return settings.newOrderRecipients;
  return settings.adminNotificationEmails;
}

function buildAdminOrdersUrl(orderId: string) {
  const base = APP_BASE_URL.trim().replace(/\/+$/, "");
  if (!base) return "/admin/rental/orders";
  return base + "/admin/rental/orders?orderId=" + encodeURIComponent(orderId);
}

function equipmentSummary(order: RentalOrder) {
  return `${order.equipmentTitle} x${order.qty}`;
}

export async function sendNewOrderNotificationIfNeeded(orderId: string) {
  const order = await dbOrderRepo.get(orderId);
  if (!order) return { sent: false as const, reason: "order_missing" as const };
  if (order.newOrderNotifiedAt) {
    return { sent: false as const, reason: "already_notified" as const };
  }

  const settings = await dbAdminSettingsRepo.get();
  const recipients = resolveRecipients(settings);
  if (!recipients.length) {
    return { sent: false as const, reason: "no_recipients" as const };
  }

  const companyName = order.customerSnapshot?.companyName?.trim() || "-";
  const customerName = order.customerSnapshot?.contactName?.trim() || "-";
  const adminUrl = buildAdminOrdersUrl(order.id);
  const subject = `New rental order received - ${order.id}`;
  const html = `
    <div style="font-family:Arial,sans-serif; line-height:1.5">
      <p>A new rental order has been received.</p>
      <p><strong>Customer / Company:</strong> ${companyName}</p>
      <p><strong>Contact:</strong> ${customerName}</p>
      <p><strong>Order ID:</strong> ${order.id}</p>
      <p><strong>Rental Period:</strong> ${order.start} to ${order.end}</p>
      <p><strong>Equipment:</strong> ${equipmentSummary(order)}</p>
      <p><a href="${adminUrl}">Open in admin orders</a></p>
    </div>
  `;

  const notifiedAt = new Date().toISOString();
  const claimed = await dbOrderRepo.markNewOrderNotifiedIfUnset(order.id, notifiedAt);
  if (!claimed) {
    return { sent: false as const, reason: "already_notified" as const };
  }

  try {
    for (const recipient of recipients) {
      await deliverRentalEmail({
        to: recipient,
        subject,
        html,
      });
    }
  } catch (error) {
    await dbOrderRepo.clearNewOrderNotifiedIfMatches(order.id, notifiedAt);
    throw error;
  }

  return {
    sent: true as const,
    reason: "sent" as const,
    recipientCount: recipients.length,
  };
}

