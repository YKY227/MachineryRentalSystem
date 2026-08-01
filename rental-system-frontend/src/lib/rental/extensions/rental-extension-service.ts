import "server-only";

import {
  buildExtensionApprovedInvoiceTemplate,
  buildExtensionPaymentReceivedTemplate,
} from "@/lib/email/email-template-registry";
import type { RentalCreditCheckoutEvaluation } from "@/lib/rental/credit-control/checkout-credit-evaluator";
import { evaluateRentalCreditCheckout } from "@/lib/rental/credit-control/checkout-credit-evaluator";
import { dbRentalCustomerRepo } from "@/lib/rental/customers/db-rental-customer-repo";
import { dbRentalEquipmentDowntimeRepo } from "@/lib/rental/downtime/db-rental-equipment-downtime-repo";
import { dbRentalEquipmentRepo } from "@/lib/rental/equipment/db-rental-equipment-repo";
import { getCustomerExtensionStatusMessage } from "@/lib/rental/extensions/customer-messages";
import { dbRentalOrderExtensionRepo } from "@/lib/rental/extensions/db-rental-order-extension-repo";
import type {
  RentalOrderExtension,
  RentalOrderExtensionStatus,
} from "@/lib/rental/extensions/types";
import { dbInvoiceRepo } from "@/lib/rental/invoices/db-invoice-repo";
import { dbPaymentRepo } from "@/lib/rental/invoices/db-payment-repo";
import { sendIssuedInvoiceEmail } from "@/lib/rental/invoices/send-issued-invoice";
import { dbRentalAvailabilityHoldRepo } from "@/lib/rental/holds/db-rental-availability-hold-repo";
import { computeReservedQtyForRange } from "@/lib/rental/availability";
import { createHitPayPaymentRequest } from "@/lib/rental/orders/hitpay";
import { dbOrderPaymentSessionRepo } from "@/lib/rental/orders/db-order-payment-session-repo";
import { dbOrderBufferOverrideRepo } from "@/lib/rental/orders/db-order-buffer-override-repo";
import { dbOrderRepo } from "@/lib/rental/orders/db-order-repo";
import { calculateAuthoritativeRentalPricing, calculateRentalDaysInclusive } from "@/lib/rental/orders/pricing";
import type { RentalCustomer, RentalOrder } from "@/lib/rental/orders/types";
import { getRentalEquipmentAvailabilityConfig } from "@/lib/rental/server-equipment-config";
import { supabaseAdmin } from "@/lib/supabase/server";
const ORDERS_TABLE = process.env.SUPABASE_RENTAL_ORDERS_TABLE ?? "rental_orders";
const APP_BASE_URL = process.env.APP_BASE_URL ?? "";

type ExtensionAvailabilitySummary = {
  available: boolean;
  totalUnits: number;
  committedQty: number;
  heldQty: number;
  downtimeQty: number;
  availableQty: number;
  message: string;
};

type ExtensionRequestResult = {
  extension: RentalOrderExtension;
  availability: ExtensionAvailabilitySummary;
};

type ExtensionReviewResult = {
  extension: RentalOrderExtension;
  creditEvaluation: RentalCreditCheckoutEvaluation | null;
};

type OrderRangeRow = {
  id: string;
  equipment_id: string;
  qty: number;
  start_date: string;
  end_date: string;
  maintenance_buffer_days_applied: number | null;
  buffer_overrides?: Awaited<ReturnType<typeof dbOrderBufferOverrideRepo.listByOrderIds>>[string];
};

function nextDateIso(dateIso: string) {
  const date = new Date(`${dateIso}T12:00:00`);
  if (Number.isNaN(date.getTime())) return dateIso;
  date.setDate(date.getDate() + 1);
  return date.toISOString().slice(0, 10);
}

function nowIso() {
  return new Date().toISOString();
}

function rangesOverlap(aStart: string, aEnd: string, bStart: string, bEnd: string) {
  const as = new Date(`${aStart}T12:00:00`).getTime();
  const ae = new Date(`${aEnd}T12:00:00`).getTime();
  const bs = new Date(`${bStart}T12:00:00`).getTime();
  const be = new Date(`${bEnd}T12:00:00`).getTime();
  if (!Number.isFinite(as) || !Number.isFinite(ae) || !Number.isFinite(bs) || !Number.isFinite(be)) {
    return false;
  }
  return as <= be && bs <= ae;
}

function computeDowntimeQtyForRange(input: {
  downtime: Array<{ quantityAffected: number; startDate: string; endDate: string; status: string }>;
  start: string;
  end: string;
}) {
  return input.downtime
    .filter((entry) => entry.status === "active")
    .filter((entry) => rangesOverlap(entry.startDate, entry.endDate, input.start, input.end))
    .reduce((sum, entry) => sum + Math.max(0, Number(entry.quantityAffected ?? 0)), 0);
}

function getExtensionStatusLabel(status: RentalOrderExtensionStatus) {
  return getCustomerExtensionStatusMessage(status);
}

function buildExtensionPaymentReturnUrl(extensionId: string) {
  if (!APP_BASE_URL) throw new Error("Missing APP_BASE_URL");
  return `${APP_BASE_URL.replace(/\/+$/, "")}/rental/account?extensionPayment=submitted&extensionId=${encodeURIComponent(extensionId)}`;
}

function classifyExtensionWindowDays(order: RentalOrder) {
  const days = calculateRentalDaysInclusive(order.start, order.end);
  if (days <= 3) return 2;
  if (days <= 13) return 7;
  return 14;
}

function isWithinExtensionWindow(order: RentalOrder, now = new Date()) {
  const windowDays = classifyExtensionWindowDays(order);
  const endAt = new Date(`${order.end}T12:00:00`);
  if (Number.isNaN(endAt.getTime())) return false;
  endAt.setDate(endAt.getDate() - windowDays);
  return now.getTime() >= endAt.getTime();
}

async function listCommittedOrdersForEquipment(equipmentId: string, excludeOrderId?: string) {
  const supabase = supabaseAdmin();
  const { data, error } = await supabase
    .from(ORDERS_TABLE)
    .select("id,equipment_id,qty,start_date,end_date,maintenance_buffer_days_applied")
    .eq("equipment_id", equipmentId);

  if (error) throw new Error(`Equipment orders read failed: ${error.message}`);

  const orders = ((data ?? []) as OrderRangeRow[]).filter((order) => order.id !== excludeOrderId);
  if (!orders.length) return [];

  const activeInvoices = await dbInvoiceRepo.listByOrderIds(orders.map((order) => order.id));
  const activeOrderIds = new Set(activeInvoices.map((invoice) => invoice.orderId));
  const committedOrders = orders.filter((order) => activeOrderIds.has(order.id));
  const bufferOverridesByOrderId = await dbOrderBufferOverrideRepo.listByOrderIds(
    committedOrders.map((order) => order.id)
  );
  return committedOrders.map((order) => ({
    ...order,
    buffer_overrides: bufferOverridesByOrderId[order.id] ?? [],
  }));
}

async function evaluateExtensionAvailability(input: {
  order: RentalOrder;
  requestedRentalEnd: string;
}): Promise<ExtensionAvailabilitySummary> {
  const deltaStart = nextDateIso(input.order.end);
  if (deltaStart > input.requestedRentalEnd) {
    return {
      available: true,
      totalUnits: 0,
      committedQty: 0,
      heldQty: 0,
      downtimeQty: 0,
      availableQty: 0,
      message: "No extension period requested.",
    };
  }

  const config = await getRentalEquipmentAvailabilityConfig(input.order.equipmentId);
  const [committedOrders, holds, downtime] = await Promise.all([
    listCommittedOrdersForEquipment(input.order.equipmentId, input.order.id),
    dbRentalAvailabilityHoldRepo.listByEquipment(input.order.equipmentId),
    dbRentalEquipmentDowntimeRepo.list({
      equipmentId: input.order.equipmentId,
      status: "active",
      startDateLte: input.requestedRentalEnd,
      endDateGte: deltaStart,
    }),
  ]);

  const committedQty = computeReservedQtyForRange({
    orders: committedOrders.map((order) => ({
      equipmentId: order.equipment_id,
      qty: order.qty,
      start: order.start_date,
      end: order.end_date,
      maintenanceBufferDaysApplied: order.maintenance_buffer_days_applied,
      bufferOverrides: order.buffer_overrides ?? [],
    })),
    equipmentId: input.order.equipmentId,
    start: deltaStart,
    end: input.requestedRentalEnd,
    maintenanceBufferDays: config.maintenanceBufferDays,
  });

  const heldQty = holds
    .filter((hold) => hold.status === "active")
    .filter((hold) => new Date(hold.expiresAt).getTime() > Date.now())
    .filter((hold) => hold.orderId !== input.order.id)
    .filter((hold) => rangesOverlap(hold.rentalStart, hold.rentalEnd, deltaStart, input.requestedRentalEnd))
    .reduce((sum, hold) => sum + Math.max(0, hold.qty), 0);
  const downtimeQty = computeDowntimeQtyForRange({
    downtime,
    start: deltaStart,
    end: input.requestedRentalEnd,
  });

  const availableQty = Math.max(0, config.totalUnits - committedQty - heldQty - downtimeQty);

  return {
    available: availableQty >= input.order.qty,
    totalUnits: config.totalUnits,
    committedQty,
    heldQty,
    downtimeQty,
    availableQty,
    message:
      availableQty >= input.order.qty
        ? "Extension remains available for the requested dates."
        : `Only ${availableQty} unit(s) remain available for the requested extension dates.`,
  };
}

async function computeExtensionCharge(order: RentalOrder, requestedRentalEnd: string) {
  const equipment = await dbRentalEquipmentRepo.getPublicByIdOrSlug(order.equipmentId);
  if (!equipment) throw new Error("Equipment not found or unavailable");

  const repriced = calculateAuthoritativeRentalPricing({
    equipment,
    qty: order.qty,
    start: order.start,
    end: requestedRentalEnd,
    fulfillment: order.fulfillment,
  });

  const currentPayableCents = Math.max(
    0,
    Math.round(Number(order.pricingSnapshot?.payableTotal ?? 0) * 100)
  );
  const revisedPayableCents = Math.max(
    0,
    Math.round(Number(repriced.pricingSnapshot.payableTotal ?? 0) * 100)
  );
  const currentExclGstCents = Math.max(
    0,
    Math.round(
      (Number(order.pricingSnapshot?.rentalSubtotal ?? 0) +
        Number(order.pricingSnapshot?.deliveryFee ?? 0) +
        Number(order.pricingSnapshot?.collectionFee ?? 0)) * 100
    )
  );
  const revisedExclGstCents = Math.max(
    0,
    Math.round(
      (Number(repriced.pricingSnapshot.rentalSubtotal ?? 0) +
        Number(repriced.pricingSnapshot.deliveryFee ?? 0) +
        Number(repriced.pricingSnapshot.collectionFee ?? 0)) * 100
    )
  );

  return {
    payableCents: Math.max(0, revisedPayableCents - currentPayableCents),
    exclGstCents: Math.max(0, revisedExclGstCents - currentExclGstCents),
  };
}

function getCustomerBillTo(order: RentalOrder) {
  const customer = order.customerSnapshot;
  return {
    name: customer?.companyName?.trim() || customer?.contactName?.trim() || "Customer",
    contactName: customer?.contactName?.trim() || undefined,
    email: customer?.email?.trim() || undefined,
    addressLines: customer?.address?.trim() ? [customer.address.trim()] : ["-"],
    uen: customer?.uen?.trim() || undefined,
  };
}

async function createExtensionInvoice(input: {
  order: RentalOrder;
  extension: RentalOrderExtension;
  chargeExclGstCents: number;
}) {
  let invoice = await dbInvoiceRepo.createDraftCustom({
    orderId: input.order.id,
    billTo: getCustomerBillTo(input.order),
    description: `Rental extension for ${input.order.equipmentTitle} (${input.extension.currentRentalEnd} to ${input.extension.requestedRentalEnd})`,
    amountExclGstCents: input.chargeExclGstCents,
  });

  invoice = await dbInvoiceRepo.issue(invoice.id);
  return invoice;
}

export async function createRentalExtensionRequest(input: {
  customer: RentalCustomer;
  orderId: string;
  requestedRentalEnd: string;
}): Promise<ExtensionRequestResult> {
  const order = await dbOrderRepo.get(input.orderId);
  if (!order) throw new Error("Order not found");
  if ((order.customerId ?? order.customerSnapshot?.customerId) !== input.customer.id) {
    throw new Error("Order not found");
  }
  if (order.returnStatus === "completed") {
    throw new Error("This rental is already completed");
  }
  if (!isWithinExtensionWindow(order)) {
    throw new Error("Extension requests are not open yet for this rental");
  }
  if (input.requestedRentalEnd <= order.end) {
    throw new Error("Requested end date must be later than the current rental end");
  }

  const existingOpen = await dbRentalOrderExtensionRepo.findOpenByOrderId(order.id);
  if (existingOpen) {
    throw new Error("An extension request is already in progress for this order");
  }

  const availability = await evaluateExtensionAvailability({
    order,
    requestedRentalEnd: input.requestedRentalEnd,
  });
  const estimate = await computeExtensionCharge(order, input.requestedRentalEnd);

  const extension = await dbRentalOrderExtensionRepo.create({
    orderId: order.id,
    customerId: input.customer.id,
    currentRentalEnd: order.end,
    requestedRentalEnd: input.requestedRentalEnd,
    status: availability.available ? "awaiting_admin_review" : "availability_blocked",
    extensionChargeEstimateCents: estimate.payableCents,
    paymentTermsSnapshot: input.customer.paymentTerms,
    availabilityStatus: availability.available ? "available" : "blocked",
    availabilityMessage: availability.message,
    customerMessage: availability.available
      ? getCustomerExtensionStatusMessage("awaiting_admin_review")
      : getCustomerExtensionStatusMessage("availability_blocked"),
  });

  return {
    extension,
    availability,
  };
}

export async function approveRentalExtension(input: {
  extensionId: string;
  reviewNote?: string;
}): Promise<ExtensionReviewResult> {
  const extension = await dbRentalOrderExtensionRepo.get(input.extensionId);
  if (!extension) throw new Error("Extension request not found");
  if (extension.status === "approved_confirmed") {
    return { extension, creditEvaluation: null };
  }
  if (extension.status === "rejected" || extension.status === "cancelled") {
    throw new Error("Extension request is already closed");
  }

  const order = await dbOrderRepo.get(extension.orderId);
  if (!order) throw new Error("Linked rental order not found");

  const customerSnapshot = order.customerSnapshot;
  if (!customerSnapshot?.email?.trim()) {
    throw new Error("Customer email is required before approving an extension");
  }

  const availability = await evaluateExtensionAvailability({
    order,
    requestedRentalEnd: extension.requestedRentalEnd,
  });
  const finalCharge = await computeExtensionCharge(order, extension.requestedRentalEnd);
  const finalChargeCents = finalCharge.payableCents;

  if (!availability.available) {
    throw new Error("Extension is no longer available for the requested dates");
  }

  const customer =
    extension.customerId === (order.customerId ?? order.customerSnapshot?.customerId)
      ? ({
          id: extension.customerId,
          companyName: customerSnapshot.companyName,
          contactName: customerSnapshot.contactName,
          email: customerSnapshot.email,
          phone: customerSnapshot.phone,
          uen: customerSnapshot.uen,
          address: customerSnapshot.address,
          paymentTerms: customerSnapshot.paymentTerms ?? extension.paymentTermsSnapshot,
          vettingStatus: customerSnapshot.vettingStatus ?? "new",
          accountStatus: customerSnapshot.accountStatus ?? "active",
          creditControlEnabled: true,
          createdAt: order.createdAt,
          updatedAt: order.updatedAt,
      } as RentalCustomer)
      : null;

  let creditEvaluation: RentalCreditCheckoutEvaluation | null = null;
  if (customer && customer.paymentTerms === "credit") {
    const liveCustomer = await dbRentalCustomerRepo.getById(customer.id);
    if (liveCustomer) {
      creditEvaluation = await evaluateRentalCreditCheckout({
        customer: liveCustomer,
        proposedExposureCents: finalChargeCents,
      });
      if (creditEvaluation.baselineEligible && creditEvaluation.allowed) {
        const invoice = await createExtensionInvoice({
          order,
          extension,
          chargeExclGstCents: finalCharge.exclGstCents,
        });
        const emailTemplate = await buildExtensionApprovedInvoiceTemplate({
          customerName:
            liveCustomer.contactName.trim() || liveCustomer.companyName.trim() || "Customer",
          invoiceNo: invoice.invoiceNo ?? invoice.id,
          requestedRentalEnd: extension.requestedRentalEnd,
          billTo: invoice.billTo?.name ?? "-",
        });

        await sendIssuedInvoiceEmail({
          invoiceId: invoice.id,
          to: liveCustomer.email.trim(),
          subject: emailTemplate.subject,
          html: emailTemplate.html,
          mode: "send",
        });

        const updatedOrder = await dbOrderRepo.updatePeriod(order.id, {
          end: extension.requestedRentalEnd,
        });

        const confirmed = await dbRentalOrderExtensionRepo.update(extension.id, {
          status: "approved_confirmed",
          finalExtensionChargeCents: finalChargeCents,
          availabilityStatus: "available",
          availabilityMessage: availability.message,
          customerMessage: getExtensionStatusLabel("approved_confirmed"),
          reviewNote: input.reviewNote ?? extension.reviewNote,
          invoiceId: invoice.id,
          approvedAt: extension.approvedAt ?? nowIso(),
          confirmedAt: nowIso(),
        });

        return { extension: confirmed, creditEvaluation };
      }
    }
  }

  const pending = await dbRentalOrderExtensionRepo.update(extension.id, {
    status: "approved_pending_payment",
    finalExtensionChargeCents: finalChargeCents,
    availabilityStatus: "available",
    availabilityMessage: availability.message,
    customerMessage: getExtensionStatusLabel("approved_pending_payment"),
    reviewNote: input.reviewNote ?? extension.reviewNote,
    approvedAt: extension.approvedAt ?? nowIso(),
  });

  return { extension: pending, creditEvaluation };
}

export async function rejectRentalExtension(input: {
  extensionId: string;
  reviewNote?: string;
}) {
  const extension = await dbRentalOrderExtensionRepo.get(input.extensionId);
  if (!extension) throw new Error("Extension request not found");
  if (extension.status === "approved_confirmed" || extension.status === "rejected" || extension.status === "cancelled") {
    throw new Error("Extension request is already closed");
  }

  return dbRentalOrderExtensionRepo.update(extension.id, {
    status: "rejected",
    reviewNote: input.reviewNote ?? extension.reviewNote,
    customerMessage: getExtensionStatusLabel("rejected"),
    rejectedAt: nowIso(),
  });
}

export async function startRentalExtensionPayment(input: {
  customer: RentalCustomer;
  extensionId: string;
}) {
  const extension = await dbRentalOrderExtensionRepo.get(input.extensionId);
  if (!extension) throw new Error("Extension request not found");
  if (extension.customerId !== input.customer.id) throw new Error("Extension request not found");
  if (extension.status !== "approved_pending_payment") {
    throw new Error("Extension payment is not available for this request");
  }

  const order = await dbOrderRepo.get(extension.orderId);
  if (!order) throw new Error("Linked rental order not found");

  const finalChargeCents =
    extension.finalExtensionChargeCents ??
    (await computeExtensionCharge(order, extension.requestedRentalEnd)).payableCents;
  if (finalChargeCents <= 0) {
    throw new Error("Invalid extension payment amount");
  }

  const existingSession =
    extension.paymentSessionId ? await dbOrderPaymentSessionRepo.get(extension.paymentSessionId) : null;
  if (existingSession?.status === "pending" && existingSession.redirectUrl) {
    return {
      extension,
      paymentSession: existingSession,
      redirectUrl: existingSession.redirectUrl,
    };
  }

  const session = await dbOrderPaymentSessionRepo.create({
    orderId: order.id,
    provider: "hitpay",
    amountCents: finalChargeCents,
    currency: "SGD",
    status: "pending",
    paymentPurpose: `Rental extension ${order.equipmentTitle} through ${extension.requestedRentalEnd}`,
    webhookPayload: {
      paymentMode: "order_extension",
      extensionId: extension.id,
      requestedRentalEnd: extension.requestedRentalEnd,
      finalExtensionChargeCents: finalChargeCents,
    },
  });

  const paymentRequest = await createHitPayPaymentRequest({
    amountCents: finalChargeCents,
    currency: "SGD",
    purpose: `Rental extension ${order.equipmentTitle} through ${extension.requestedRentalEnd}`,
    referenceNumber: `${order.id}-EXT-${extension.id}`,
    redirectUrl: buildExtensionPaymentReturnUrl(extension.id),
  });

  const updatedSession = await dbOrderPaymentSessionRepo.update(session.id, {
    providerPaymentRequestId: paymentRequest.id,
    providerReferenceNumber: paymentRequest.referenceNumber,
    redirectUrl: paymentRequest.url,
    status: paymentRequest.status,
    webhookPayload: {
      paymentMode: "order_extension",
      extensionId: extension.id,
      requestedRentalEnd: extension.requestedRentalEnd,
      finalExtensionChargeCents: finalChargeCents,
      provider: paymentRequest.raw,
    },
  });

  const updatedExtension = await dbRentalOrderExtensionRepo.update(extension.id, {
    finalExtensionChargeCents: finalChargeCents,
    paymentSessionId: updatedSession.id,
    customerMessage: getExtensionStatusLabel("approved_pending_payment"),
  });

  return {
    extension: updatedExtension,
    paymentSession: updatedSession,
    redirectUrl: paymentRequest.url,
  };
}

export async function confirmPaidRentalExtension(sessionId: string) {
  const session = await dbOrderPaymentSessionRepo.get(sessionId);
  if (!session) throw new Error("Payment session not found");
  if (session.status !== "paid") throw new Error("Only paid sessions can confirm extensions");

  const extensionId = String(session.webhookPayload?.extensionId ?? "").trim();
  if (!extensionId) throw new Error("Missing extension linkage on payment session");

  const extension = await dbRentalOrderExtensionRepo.get(extensionId);
  if (!extension) throw new Error("Extension request not found");
  if (extension.status === "approved_confirmed") return extension;
  if (extension.status !== "approved_pending_payment") {
    throw new Error("Extension request is not awaiting payment");
  }

  const order = await dbOrderRepo.get(extension.orderId);
  if (!order) throw new Error("Linked rental order not found");

  const finalCharge = await computeExtensionCharge(order, extension.requestedRentalEnd);
  const finalChargeCents =
    extension.finalExtensionChargeCents ?? finalCharge.payableCents ?? Math.max(0, Number(session.amountCents ?? 0));
  const invoice = await createExtensionInvoice({
    order,
    extension,
    chargeExclGstCents: finalCharge.exclGstCents,
  });

  const paymentResult = await dbPaymentRepo.recordPaymentForCheckoutSession({
    invoiceId: invoice.id,
    sourcePaymentSessionId: session.id,
    amountCents: Math.min(finalChargeCents, invoice.totalInclGstCents),
    paidAt: session.paidAt ?? nowIso(),
    method: "HitPay",
    reference: session.providerReferenceNumber,
    notes: `Payment received for rental extension ${extension.id}`,
  });

  await dbOrderPaymentSessionRepo.update(session.id, {
    invoiceId: invoice.id,
    invoicePaymentId: paymentResult.payment.id,
    invoiceAppliedAt: nowIso(),
  });
  const emailTemplate = await buildExtensionPaymentReceivedTemplate({
    customerName:
      order.customerSnapshot?.contactName?.trim() ||
      order.customerSnapshot?.companyName?.trim() ||
      "Customer",
    invoiceNo: invoice.invoiceNo ?? invoice.id,
    requestedRentalEnd: extension.requestedRentalEnd,
    billTo: invoice.billTo?.name ?? "-",
  });

  await sendIssuedInvoiceEmail({
    invoiceId: invoice.id,
    to: order.customerSnapshot?.email?.trim() || invoice.billTo?.email || "",
    subject: emailTemplate.subject,
    html: emailTemplate.html,
    mode: "send",
  });

  await dbOrderRepo.updatePeriod(order.id, {
    end: extension.requestedRentalEnd,
  });

  return dbRentalOrderExtensionRepo.update(extension.id, {
    status: "approved_confirmed",
    invoiceId: invoice.id,
    paymentSessionId: session.id,
    customerMessage: getExtensionStatusLabel("approved_confirmed"),
    confirmedAt: nowIso(),
  });
}
