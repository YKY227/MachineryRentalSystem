import "server-only";

import { dbRentalEquipmentDowntimeRepo } from "@/lib/rental/downtime/db-rental-equipment-downtime-repo";
import { dbInvoiceRepo } from "@/lib/rental/invoices/db-invoice-repo";
import { dbRentalAvailabilityHoldRepo } from "@/lib/rental/holds/db-rental-availability-hold-repo";
import { dbOrderBufferOverrideRepo } from "@/lib/rental/orders/db-order-buffer-override-repo";
import { getRentalEquipmentAvailabilityConfig } from "@/lib/rental/server-equipment-config";
import { supabaseAdmin } from "@/lib/supabase/server";

const ORDERS_TABLE = process.env.SUPABASE_RENTAL_ORDERS_TABLE ?? "rental_orders";

type OrderRangeRow = {
  id: string;
  equipment_id: string;
  qty: number;
  start_date: string;
  end_date: string;
  maintenance_buffer_days_applied: number | null;
  buffer_overrides?: Awaited<ReturnType<typeof dbOrderBufferOverrideRepo.listByOrderIds>>[string];
};

export type RentalEquipmentInventoryProtection = {
  currentTotalUnits: number;
  protectedMinimum: number;
  currentCommittedQty: number;
  currentHeldQty: number;
  currentDowntimeQty: number;
  currentUnavailableQty: number;
  peakCommittedQty: number;
  peakHeldQty: number;
  peakDowntimeQty: number;
};

function addDaysISO(dateISO: string, days: number) {
  const date = new Date(`${dateISO}T12:00:00`);
  if (Number.isNaN(date.getTime())) return dateISO;
  date.setDate(date.getDate() + days);
  return date.toISOString().slice(0, 10);
}

function nextDayISO(dateISO: string) {
  return addDaysISO(dateISO, 1);
}

function todayIso() {
  return new Date().toISOString().slice(0, 10);
}

function isoMs(dateISO: string) {
  return new Date(`${dateISO}T12:00:00`).getTime();
}

function overlapsDay(start: string, end: string, day: string) {
  const dayMs = isoMs(day);
  return isoMs(start) <= dayMs && dayMs <= isoMs(end);
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

function incrementEvent(events: Map<string, number>, dateISO: string, qty: number) {
  events.set(dateISO, (events.get(dateISO) ?? 0) + qty);
}

function peakFromEvents(events: Map<string, number>) {
  let running = 0;
  let peak = 0;
  for (const date of [...events.keys()].sort()) {
    running += events.get(date) ?? 0;
    peak = Math.max(peak, running);
  }
  return peak;
}

export async function getRentalEquipmentInventoryProtection(
  equipmentId: string
): Promise<RentalEquipmentInventoryProtection> {
  const config = await getRentalEquipmentAvailabilityConfig(equipmentId);
  const today = todayIso();
  const [committedOrders, holds, downtime] = await Promise.all([
    listCommittedOrdersForEquipment(equipmentId),
    dbRentalAvailabilityHoldRepo.listByEquipment(equipmentId),
    dbRentalEquipmentDowntimeRepo.list({ equipmentId, status: "active" }),
  ]);

  const committedOrderIds = new Set(committedOrders.map((order) => order.id));
  const activeHolds = holds
    .filter((hold) => hold.status === "active")
    .filter((hold) => new Date(hold.expiresAt).getTime() > Date.now())
    .filter((hold) => !committedOrderIds.has(hold.orderId ?? hold.checkoutReference));
  const activeDowntime = downtime.filter((entry) => entry.status === "active");

  const committedEvents = new Map<string, number>();
  let currentCommittedQty = 0;
  for (const order of committedOrders) {
    const appliedBuffer = Math.max(
      0,
      Math.floor(Number(order.maintenance_buffer_days_applied ?? config.maintenanceBufferDays) || 0)
    );
    const defaultEffectiveEnd = addDaysISO(order.end_date, appliedBuffer);
    const activeOverrides = new Map(
      (order.buffer_overrides ?? [])
        .filter((override) => override.status === "active")
        .map((override) => [override.orderUnitIndex, override])
    );

    for (let unitIndex = 0; unitIndex < Math.max(0, Number(order.qty ?? 0)); unitIndex += 1) {
      const override = activeOverrides.get(unitIndex);
      const effectiveEnd =
        override && override.overrideBufferEndDate < defaultEffectiveEnd
          ? override.overrideBufferEndDate
          : defaultEffectiveEnd;
      incrementEvent(committedEvents, order.start_date, 1);
      incrementEvent(committedEvents, nextDayISO(effectiveEnd), -1);
      if (overlapsDay(order.start_date, effectiveEnd, today)) {
        currentCommittedQty += 1;
      }
    }
  }

  const holdEvents = new Map<string, number>();
  let currentHeldQty = 0;
  for (const hold of activeHolds) {
    const qty = Math.max(0, Number(hold.qty ?? 0));
    if (!qty) continue;
    incrementEvent(holdEvents, hold.rentalStart, qty);
    incrementEvent(holdEvents, nextDayISO(hold.rentalEnd), -qty);
    if (overlapsDay(hold.rentalStart, hold.rentalEnd, today)) {
      currentHeldQty += qty;
    }
  }

  const downtimeEvents = new Map<string, number>();
  let currentDowntimeQty = 0;
  for (const entry of activeDowntime) {
    const qty = Math.max(0, Number(entry.quantityAffected ?? 0));
    if (!qty) continue;
    incrementEvent(downtimeEvents, entry.startDate, qty);
    incrementEvent(downtimeEvents, nextDayISO(entry.endDate), -qty);
    if (overlapsDay(entry.startDate, entry.endDate, today)) {
      currentDowntimeQty += qty;
    }
  }

  const peakCommittedQty = peakFromEvents(committedEvents);
  const peakHeldQty = peakFromEvents(holdEvents);
  const peakDowntimeQty = peakFromEvents(downtimeEvents);
  const protectedMinimum = Math.max(
    currentCommittedQty + currentHeldQty + currentDowntimeQty,
    peakCommittedQty + peakHeldQty + peakDowntimeQty
  );

  return {
    currentTotalUnits: Math.max(0, Number(config.totalUnits ?? 0)),
    protectedMinimum,
    currentCommittedQty,
    currentHeldQty,
    currentDowntimeQty,
    currentUnavailableQty: currentCommittedQty + currentHeldQty + currentDowntimeQty,
    peakCommittedQty,
    peakHeldQty,
    peakDowntimeQty,
  };
}

