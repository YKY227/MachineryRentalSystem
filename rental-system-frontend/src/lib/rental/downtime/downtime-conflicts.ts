import "server-only";

import { dbRentalEquipmentDowntimeRepo } from "@/lib/rental/downtime/db-rental-equipment-downtime-repo";
import type { RentalEquipmentDowntimeType } from "@/lib/rental/downtime/types";
import { dbRentalOrderExtensionRepo } from "@/lib/rental/extensions/db-rental-order-extension-repo";
import { dbOrderRepo } from "@/lib/rental/orders/db-order-repo";

function overlaps(aStart: string, aEnd: string, bStart: string, bEnd: string) {
  return !(aEnd < bStart || bEnd < aStart);
}

function addDays(isoDate: string, days: number) {
  const [year, month, day] = isoDate.split("-").map(Number);
  const date = new Date(year, (month ?? 1) - 1, day ?? 1);
  date.setDate(date.getDate() + days);
  const nextYear = date.getFullYear();
  const nextMonth = String(date.getMonth() + 1).padStart(2, "0");
  const nextDay = String(date.getDate()).padStart(2, "0");
  return `${nextYear}-${nextMonth}-${nextDay}`;
}

function intersectUnits(left: string[], right: string[]) {
  if (!left.length || !right.length) return [];
  const rightSet = new Set(right);
  return left.filter((unit) => rightSet.has(unit));
}

export type DowntimeConflictPreview = {
  hasConflicts: boolean;
  derivedQuantityAffected: number;
  selectedUnits: string[];
  summaryLines: string[];
  orders: Array<{
    orderId: string;
    startDate: string;
    endDate: string;
    quantity: number;
    equipmentTitle: string;
  }>;
  downtime: Array<{
    downtimeId: string;
    downtimeType: RentalEquipmentDowntimeType;
    startDate: string;
    endDate: string;
    quantityAffected: number;
    status: "active" | "cancelled";
    sharedUnits: string[];
  }>;
  extensions: Array<{
    extensionId: string;
    orderId: string;
    status: string;
    startDate: string;
    endDate: string;
  }>;
};

export async function previewDowntimeConflicts(input: {
  equipmentId: string;
  startDate: string;
  endDate: string;
  quantityAffected: number;
  unitAssignments?: string[];
  excludeDowntimeId?: string;
}): Promise<DowntimeConflictPreview> {
  const selectedUnits = [...new Set((input.unitAssignments ?? []).map((unit) => String(unit ?? "").trim()).filter(Boolean))];
  const derivedQuantityAffected = selectedUnits.length > 0 ? selectedUnits.length : Math.max(1, Math.floor(Number(input.quantityAffected) || 1));

  const [allOrders, overlappingDowntime] = await Promise.all([
    dbOrderRepo.list(),
    dbRentalEquipmentDowntimeRepo.list({
      equipmentId: input.equipmentId,
      startDateLte: input.endDate,
      endDateGte: input.startDate,
    }),
  ]);

  const activeOrders = allOrders.filter(
    (order) =>
      order.equipmentId === input.equipmentId &&
      order.returnStatus === "out" &&
      !order.completedAt &&
      overlaps(input.startDate, input.endDate, order.start, order.end)
  );

  const extensionCandidates = activeOrders.filter((order) => order.id);
  const extensionsByOrderId = await dbRentalOrderExtensionRepo.listByOrderIds(
    extensionCandidates.map((order) => order.id)
  );

  const overlappingExtensions = extensionCandidates.flatMap((order) =>
    (extensionsByOrderId[order.id] ?? [])
      .filter((extension) =>
        ["awaiting_admin_review", "approved_pending_payment", "approved_confirmed"].includes(extension.status)
      )
      .map((extension) => ({
        extensionId: extension.id,
        orderId: order.id,
        status: extension.status,
        startDate: addDays(extension.currentRentalEnd, 1),
        endDate: extension.requestedRentalEnd,
      }))
      .filter((extension) => overlaps(input.startDate, input.endDate, extension.startDate, extension.endDate))
  );

  const relevantDowntime = overlappingDowntime
    .filter((item) => item.id !== input.excludeDowntimeId && item.status === "active")
    .map((item) => ({
      downtimeId: item.id,
      downtimeType: item.downtimeType,
      startDate: item.startDate,
      endDate: item.endDate,
      quantityAffected: item.quantityAffected,
      status: item.status,
      sharedUnits: intersectUnits(selectedUnits, item.unitAssignments),
    }));

  const summaryLines: string[] = [];
  if (activeOrders.length > 0) {
    summaryLines.push(`Overlaps ${activeOrders.length} active booking${activeOrders.length === 1 ? "" : "s"}.`);
  }
  if (relevantDowntime.length > 0) {
    summaryLines.push(`Overlaps ${relevantDowntime.length} existing downtime block${relevantDowntime.length === 1 ? "" : "s"}.`);
  }
  if (overlappingExtensions.length > 0) {
    summaryLines.push(
      `May affect ${overlappingExtensions.length} pending or approved extension period${overlappingExtensions.length === 1 ? "" : "s"}.`
    );
  }
  if (selectedUnits.length > 0) {
    const sameUnitConflicts = relevantDowntime.filter((item) => item.sharedUnits.length > 0).length;
    if (sameUnitConflicts > 0) {
      summaryLines.push(
        `${sameUnitConflicts} overlapping downtime block${sameUnitConflicts === 1 ? "" : "s"} target the same unit selection.`
      );
    }
  }

  return {
    hasConflicts: summaryLines.length > 0,
    derivedQuantityAffected,
    selectedUnits,
    summaryLines,
    orders: activeOrders.map((order) => ({
      orderId: order.id,
      startDate: order.start,
      endDate: order.end,
      quantity: order.qty,
      equipmentTitle: order.equipmentTitle,
    })),
    downtime: relevantDowntime,
    extensions: overlappingExtensions,
  };
}
