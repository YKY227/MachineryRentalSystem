// src/lib/rental/availability.ts
import type { Equipment, EquipmentHold } from "./types";

type OrderLike = {
  equipmentId: string;
  qty: number;
  start: string; // YYYY-MM-DD
  end: string;   // YYYY-MM-DD
};

function dateToDay(d: string) {
  const t = new Date(d + "T12:00:00").getTime();
  return Number.isNaN(t) ? 0 : t;
}

function addDaysISO(dateISO: string, days: number) {
  const d = new Date(dateISO + "T12:00:00");
  if (Number.isNaN(d.getTime())) return dateISO;
  d.setDate(d.getDate() + days);
  return d.toISOString().slice(0, 10); // YYYY-MM-DD
}

function rangesOverlap(aStart: string, aEnd: string, bStart: string, bEnd: string) {
  const as = dateToDay(aStart);
  const ae = dateToDay(aEnd);
  const bs = dateToDay(bStart);
  const be = dateToDay(bEnd);
  if (!as || !ae || !bs || !be) return false;
  return as <= be && bs <= ae; // inclusive overlap
}

/**
 * ✅ Option B:
 * Orders "consume" units until endDate + maintenanceBufferDays (default 7),
 * so you don't need to manually create maintenance holds after every rental.
 */
export function computeReservedQtyForRange(args: {
  orders: OrderLike[];
  equipmentId: string;
  start: string;
  end: string;
  maintenanceBufferDays?: number;
}) {
  const { orders, equipmentId, start, end, maintenanceBufferDays } = args;

  const buffer = Math.max(0, Math.floor(maintenanceBufferDays ?? 7));

  return orders
    .filter((o) => o.equipmentId === equipmentId)
    .filter((o) => {
      const effectiveEnd = addDaysISO(o.end, buffer);
      return rangesOverlap(o.start, effectiveEnd, start, end);
    })
    .reduce((sum, o) => sum + Math.max(0, Number(o.qty ?? 0)), 0);
}

export function computeHoldQtyForRange(
  holds: EquipmentHold[],
  equipmentId: string,
  start: string,
  end: string
) {
  return holds
    .filter((h) => h.equipmentId === equipmentId)
    .filter((h) => h.status === "active")
    .filter((h) => rangesOverlap(h.startDate, h.endDate, start, end))
    .reduce((sum, h) => sum + (h.qty ?? 0), 0);
}

export function computeAvailableUnitsForRange(args: {
  equipment: Equipment;
  orders: OrderLike[];
  holds: EquipmentHold[];
  start: string;
  end: string;
}) {
  const { equipment, orders, holds, start, end } = args;

  const reserved = computeReservedQtyForRange({
    orders,
    equipmentId: equipment.id,
    start,
    end,
    maintenanceBufferDays: equipment.maintenanceBufferDays,
  });

  const held = computeHoldQtyForRange(holds, equipment.id, start, end);

  const available = Math.max(0, (equipment.totalUnits ?? 0) - reserved - held);
  return { available, reserved, held };
}
