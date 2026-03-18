import "server-only";

import { dbRentalEquipmentDowntimeRepo } from "@/lib/rental/downtime/db-rental-equipment-downtime-repo";
import { dbInvoiceRepo } from "@/lib/rental/invoices/db-invoice-repo";
import { dbRentalAvailabilityHoldRepo } from "@/lib/rental/holds/db-rental-availability-hold-repo";
import { computeReservedQtyForRange } from "@/lib/rental/availability";
import { dbOrderBufferOverrideRepo } from "@/lib/rental/orders/db-order-buffer-override-repo";
import { getRentalEquipmentAvailabilityConfig } from "@/lib/rental/server-equipment-config";
import { supabaseAdmin } from "@/lib/supabase/server";

const ORDERS_TABLE = process.env.SUPABASE_RENTAL_ORDERS_TABLE ?? "rental_orders";
const HOLD_TTL_MINUTES = 15;

type OrderRangeRow = {
  id: string;
  equipment_id: string;
  qty: number;
  start_date: string;
  end_date: string;
  maintenance_buffer_days_applied: number | null;
  buffer_overrides?: Awaited<ReturnType<typeof dbOrderBufferOverrideRepo.listByOrderIds>>[string];
};

export type RentalAvailabilitySnapshot = {
  totalUnits: number;
  committedQty: number;
  heldQty: number;
  downtimeQty: number;
  availableQty: number;
};

export type CreateAvailabilityHoldResult =
  | {
      ok: true;
      holdId: string;
      expiresAt: string;
      snapshot: RentalAvailabilitySnapshot;
    }
  | {
      ok: false;
      snapshot: RentalAvailabilitySnapshot;
      reasonCode: "insufficient_availability";
      message: string;
    };

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

function holdExpiryIso() {
  const now = new Date();
  now.setMinutes(now.getMinutes() + HOLD_TTL_MINUTES);
  return now.toISOString();
}

function parseAvailabilityErrorDetail(detail?: string | null) {
  if (!detail) return null;
  try {
    return JSON.parse(detail) as {
      availableQty?: number;
      requestedQty?: number;
      committedQty?: number;
      heldQty?: number;
      downtimeQty?: number;
      totalUnits?: number;
    };
  } catch {
    return null;
  }
}

async function listCommittedOrdersForEquipment(equipmentId: string): Promise<OrderRangeRow[]> {
  const supabase = supabaseAdmin();
  const { data, error } = await supabase
    .from(ORDERS_TABLE)
    .select("id,equipment_id,qty,start_date,end_date,maintenance_buffer_days_applied")
    .eq("equipment_id", equipmentId);

  if (error) throw new Error(`Equipment orders read failed: ${error.message}`);

  const orders = (data ?? []) as OrderRangeRow[];
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

export async function getEquipmentAvailabilityForRange(input: {
  equipmentId: string;
  start: string;
  end: string;
}): Promise<RentalAvailabilitySnapshot> {
  const config = await getRentalEquipmentAvailabilityConfig(input.equipmentId);
  const [committedOrders, holds, downtime] = await Promise.all([
    listCommittedOrdersForEquipment(input.equipmentId),
    dbRentalAvailabilityHoldRepo.listByEquipment(input.equipmentId),
    dbRentalEquipmentDowntimeRepo.list({
      equipmentId: input.equipmentId,
      status: "active",
      startDateLte: input.end,
      endDateGte: input.start,
    }),
  ]);
  const committedOrderIds = new Set(committedOrders.map((order) => order.id));

  const committedQty = computeReservedQtyForRange({
    orders: committedOrders.map((order) => ({
      equipmentId: order.equipment_id,
      qty: order.qty,
      start: order.start_date,
      end: order.end_date,
      maintenanceBufferDaysApplied: order.maintenance_buffer_days_applied,
      bufferOverrides: order.buffer_overrides ?? [],
    })),
    equipmentId: input.equipmentId,
    start: input.start,
    end: input.end,
    maintenanceBufferDays: config.maintenanceBufferDays,
  });

  const heldQty = holds
    .filter((hold) => hold.status === "active")
    .filter((hold) => new Date(hold.expiresAt).getTime() > Date.now())
    .filter((hold) => !committedOrderIds.has(hold.orderId ?? hold.checkoutReference))
    .filter((hold) => rangesOverlap(hold.rentalStart, hold.rentalEnd, input.start, input.end))
    .reduce((sum, hold) => sum + Math.max(0, hold.qty), 0);
  const downtimeQty = computeDowntimeQtyForRange({
    downtime,
    start: input.start,
    end: input.end,
  });

  return {
    totalUnits: config.totalUnits,
    committedQty,
    heldQty,
    downtimeQty,
    availableQty: Math.max(0, config.totalUnits - committedQty - heldQty - downtimeQty),
  };
}

export async function createAvailabilityHold(input: {
  checkoutReference: string;
  equipmentId: string;
  customerId?: string;
  qty: number;
  start: string;
  end: string;
}): Promise<CreateAvailabilityHoldResult> {
  const config = await getRentalEquipmentAvailabilityConfig(input.equipmentId);
  const expiresAt = holdExpiryIso();

  try {
    const hold = await dbRentalAvailabilityHoldRepo.acquire({
      checkoutReference: input.checkoutReference,
      equipmentId: input.equipmentId,
      customerId: input.customerId,
      qty: input.qty,
      rentalStart: input.start,
      rentalEnd: input.end,
      expiresAt,
      totalUnits: config.totalUnits,
      maintenanceBufferDays: config.maintenanceBufferDays,
    });

    const snapshot = await getEquipmentAvailabilityForRange({
      equipmentId: input.equipmentId,
      start: input.start,
      end: input.end,
    });

    return {
      ok: true,
      holdId: hold.id,
      expiresAt: hold.expiresAt,
      snapshot,
    };
  } catch (error) {
    const err = error as { message?: string; details?: string };
    if (err?.message !== "INSUFFICIENT_AVAILABILITY") throw error;

    const parsed = parseAvailabilityErrorDetail(err.details);
    const snapshot: RentalAvailabilitySnapshot = {
      totalUnits: Math.max(0, Number(parsed?.totalUnits ?? config.totalUnits)),
      committedQty: Math.max(0, Number(parsed?.committedQty ?? 0)),
      heldQty: Math.max(0, Number(parsed?.heldQty ?? 0)),
      downtimeQty: Math.max(0, Number(parsed?.downtimeQty ?? 0)),
      availableQty: Math.max(0, Number(parsed?.availableQty ?? 0)),
    };

    return {
      ok: false,
      snapshot,
      reasonCode: "insufficient_availability",
      message: `Only ${snapshot.availableQty} unit(s) are currently available for the selected dates.`,
    };
  }
}

export async function linkAvailabilityHoldToOrder(checkoutReference: string, orderId: string): Promise<void> {
  await dbRentalAvailabilityHoldRepo.updateActiveByCheckoutReference(checkoutReference, {
    orderId,
    notes: `Linked to order ${orderId}`,
  });
}

export async function linkAvailabilityHoldToPaymentSession(
  checkoutReference: string,
  paymentSessionId: string
): Promise<void> {
  await dbRentalAvailabilityHoldRepo.updateActiveByCheckoutReference(checkoutReference, {
    paymentSessionId,
    notes: `Linked to payment session ${paymentSessionId}`,
  });
}

export async function releaseAvailabilityHold(checkoutReference: string, notes?: string): Promise<void> {
  await dbRentalAvailabilityHoldRepo.releaseActiveByCheckoutReference(checkoutReference, notes);
}

export async function markAvailabilityHoldConsumed(input: {
  checkoutReference: string;
  orderId?: string;
  paymentSessionId?: string;
  notes?: string;
}): Promise<void> {
  await dbRentalAvailabilityHoldRepo.consumeActiveByCheckoutReference(input);
}

export function getAvailabilityHoldExpiryMinutes() {
  return HOLD_TTL_MINUTES;
}
