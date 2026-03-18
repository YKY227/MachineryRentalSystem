// src/app/admin/rental/calendar/page.tsx

"use client";

import React, { useEffect, useMemo, useRef, useState } from "react";
import type { Equipment } from "@/lib/rental/types";
import { useRouter } from "next/navigation";
import { useAdminEquipments } from "@/lib/rental/hooks/useAdminEquipments";
import {
  AlertTriangle,
  CalendarDays,
  ChevronLeft,
  ChevronRight,
  ClipboardList,
  Eye,
  Factory,
  Flag,
  Layers3,
  Settings2,
  ShieldAlert,
  ShieldCheck,
  TimerReset,
  Wrench,
  XCircle,
} from "lucide-react";
/**
 * Timeline / Gantt lanes (per-unit capacity slots)
 * - Default 7 days, toggle 14 days
 * - DB-backed orders + maintenance buffer tails (per unit)
 * - DB-backed downtime blocks
 * - Stable lane assignment persisted in localStorage
 */

// ---------- Types ----------
type ISODate = string; // YYYY-MM-DD
type BufferOverride = {
  id: string;
  orderId: string;
  orderUnitIndex: number;
  overrideBufferEndDate: ISODate;
  status: "active" | "cancelled";
  reason?: string;
  notes?: string;
};

type Order = {
  id: string;
  equipmentId: string;
  equipmentTitle?: string;
  start: ISODate;
  end: ISODate;
  qty: number;
  maintenanceBufferDaysApplied?: number;
  bufferOverrides?: BufferOverride[];
  fulfillment?: "deliver" | "self_collect";
  pricingSnapshot?: {
    days?: number;
    total?: number;
    deposit?: number;
  };
  createdAt?: string;
};


type HoldType = "maintenance" | "repair" | "inspection" | "admin_hold" | "internal_use";
type Hold = {
  id: string;
  equipmentId: string;
  type: HoldType;
  startDate: ISODate;
  endDate: ISODate;
  qty: number;
  unitAssignments: string[];
  status: "active" | "cancelled";
  reason?: string;
  notes?: string;
  createdAt?: string;
};

type HoldConflictPreview = {
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
    downtimeType: HoldType;
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

type OccKind = "order" | "buffer" | "hold";
type Occurrence = {
  kind: OccKind;
  sourceId: string; // orderId/holdId
  occIndex: number; // 0..qty-1
  equipmentId: string;
  start: ISODate;
  end: ISODate;
  label: string;
  meta?: Record<string, any>;
};

type LaneId = string; // "unit-1" ... "unit-N"
type Lane = { id: LaneId; name: string };

type AssignedBlock = Occurrence & {
  laneId: LaneId;
  // for rendering
  startIndex: number; // within window
  endIndex: number; // within window (inclusive)
  clippedLeft: boolean;
  clippedRight: boolean;
};

// ---------- LocalStorage keys (adjust if needed) ----------
// IMPORTANT: set the first key to exactly match ORDERS_LS_KEY from your Orders page.
const ORDER_STORAGE_KEYS = [
  "cms_rental_orders_v1", // ✅ matches ORDERS_LS_KEY from your Orders tab
  "rental_orders_v1",
  "rental_orders",
  "orders",
  "rental:orders",
] as const;



const HOLD_STORAGE_KEYS = [
  "rental_holds_v1",
  "rental_holds",
  "holds",
  "rental:holds",
] as const;

const ASSIGNMENTS_KEY = "rental_lane_assignments_v1";
const BUFFER_BEHAVIOR_NOTE =
  "Buffer is derived from the equipment maintenance buffer policy. Changing buffer days updates derived buffer blocks for existing and future orders.";

// ---------- Date helpers ----------
function pad2(n: number) {
  return String(n).padStart(2, "0");
}
function toISODate(d: Date): ISODate {
  return `${d.getFullYear()}-${pad2(d.getMonth() + 1)}-${pad2(d.getDate())}`;
}
function parseISODate(s: ISODate): Date {
  // Treat as local date (no timezone shifting in UI)
  const [y, m, d] = s.split("-").map(Number);
  return new Date(y, (m ?? 1) - 1, d ?? 1);
}
function startOfDay(d: Date): Date {
  const x = new Date(d);
  x.setHours(0, 0, 0, 0);
  return x;
}
function addDaysISO(iso: ISODate, days: number): ISODate {
  const d = startOfDay(parseISODate(iso));
  d.setDate(d.getDate() + days);
  return toISODate(d);
}
function addDaysDate(d: Date, days: number): Date {
  const x = startOfDay(d);
  x.setDate(x.getDate() + days);
  return x;
}
function diffDaysISO(a: ISODate, b: ISODate) {
  // b - a in whole days
  const da = startOfDay(parseISODate(a)).getTime();
  const db = startOfDay(parseISODate(b)).getTime();
  return Math.round((db - da) / (1000 * 60 * 60 * 24));
}
function clamp(n: number, min: number, max: number) {
  return Math.max(min, Math.min(max, n));
}
function overlaps(aStart: ISODate, aEnd: ISODate, bStart: ISODate, bEnd: ISODate) {
  // No overlap if A ends before B starts, or B ends before A starts.
  // diffDaysISO(x, y) = y - x (in days)
  const aEndsBeforeBStarts = diffDaysISO(aEnd, bStart) > 0; // bStart > aEnd
  const bEndsBeforeAStarts = diffDaysISO(bEnd, aStart) > 0; // aStart > bEnd
  return !(aEndsBeforeBStarts || bEndsBeforeAStarts);
}

function isoInRange(iso: ISODate, start: ISODate, end: ISODate) {
  return diffDaysISO(start, iso) >= 0 && diffDaysISO(iso, end) >= 0;
}
function weekdayShort(d: Date) {
  return d.toLocaleDateString(undefined, { weekday: "short" });
}
function monthDay(d: Date) {
  return d.toLocaleDateString(undefined, { month: "short", day: "numeric" });
}

// ---------- Storage helpers ----------
function readJSON<T>(key: string): T | null {
  try {
    const raw = localStorage.getItem(key);
    if (!raw) return null;
    return JSON.parse(raw) as T;
  } catch {
    return null;
  }
}

type PersistedAssignments = Record<
  string, // equipmentId
  Record<
    string, // occKey
    LaneId
  >
>;

function occKey(o: Occurrence) {
  return `${o.kind}:${o.sourceId}:${o.occIndex}`;
}

function normalizeUnitAssignments(units: string[]) {
  return [...new Set(units.map((unit) => unit.trim()).filter(Boolean))];
}

function formatUnitLabel(unitId: string) {
  return unitId.replace(/^unit-/, "Unit ");
}

function sortHoldList(left: Hold, right: Hold, todayIso: ISODate) {
  const leftActive = left.status === "active" ? 0 : 1;
  const rightActive = right.status === "active" ? 0 : 1;
  if (leftActive !== rightActive) return leftActive - rightActive;

  const leftCurrent = overlaps(left.startDate, left.endDate, todayIso, todayIso) ? 0 : 1;
  const rightCurrent = overlaps(right.startDate, right.endDate, todayIso, todayIso) ? 0 : 1;
  if (leftCurrent !== rightCurrent) return leftCurrent - rightCurrent;

  const leftFuture = left.endDate >= todayIso ? 0 : 1;
  const rightFuture = right.endDate >= todayIso ? 0 : 1;
  if (leftFuture !== rightFuture) return leftFuture - rightFuture;

  if (leftFuture === 0 && rightFuture === 0) {
    const byStart = diffDaysISO(todayIso, left.startDate) - diffDaysISO(todayIso, right.startDate);
    if (byStart !== 0) return byStart;
  }

  return right.startDate.localeCompare(left.startDate);
}

function getOrderBufferEnd(order: Order, unitIndex: number, fallbackBufferDays: number) {
  const appliedBufferDays = Math.max(
    0,
    Math.floor(Number(order.maintenanceBufferDaysApplied ?? fallbackBufferDays) || 0)
  );
  const defaultBufferEnd = addDaysISO(order.end, appliedBufferDays);
  const activeOverride = (order.bufferOverrides ?? [])
    .filter((override) => override.status === "active")
    .find((override) => override.orderUnitIndex === unitIndex);

  if (activeOverride && activeOverride.overrideBufferEndDate < defaultBufferEnd) {
    return activeOverride.overrideBufferEndDate;
  }
  return defaultBufferEnd;
}

function readAssignments(): PersistedAssignments {
  return readJSON<PersistedAssignments>(ASSIGNMENTS_KEY) ?? {};
}
function writeAssignments(v: PersistedAssignments) {
  localStorage.setItem(ASSIGNMENTS_KEY, JSON.stringify(v));
}

// ---------- Allocation ----------
function buildOccurrencesForEquipment(opts: {
  equipment: Equipment;
  orders: Order[];
  holds: Hold[];
  showBuffer: boolean;
  windowStart: ISODate;
  windowEnd: ISODate;
}): Occurrence[] {
  const { equipment, orders, holds, showBuffer, windowStart, windowEnd } = opts;

  const fallbackBufferDays = equipment.maintenanceBufferDays ?? 7;
  const bufferDays = fallbackBufferDays;

  const occs: Occurrence[] = [];

  // Orders -> per-unit occurrences
  for (const order of orders) {
  if (order.equipmentId.trim() !== String(equipment.id).trim()) continue;


    // We need orders that could affect window either by booking range or by buffer spillover
    const orderStart = order.start;
const orderEnd = order.end;
    const bufferDays = Math.max(
      0,
      Math.floor(Number(order.maintenanceBufferDaysApplied ?? fallbackBufferDays) || 0)
    );


    const bufferStart = addDaysISO(orderEnd, 1);
    const bufferEnd = addDaysISO(orderEnd, bufferDays);

    const relevant =
      overlaps(orderStart, orderEnd, windowStart, windowEnd) ||
      (showBuffer && bufferDays > 0 && overlaps(bufferStart, bufferEnd, windowStart, windowEnd));

    if (!relevant) continue;

   const baseLabel = `Order #${order.id.slice(0, 6)}${order.equipmentTitle ? ` · ${order.equipmentTitle}` : ""}`;


    for (let i = 0; i < (order.qty ?? 0); i++) {
      const bufferDaysApplied = Math.max(
        0,
        Math.floor(Number(order.maintenanceBufferDaysApplied ?? fallbackBufferDays) || 0)
      );
      const unitBufferStart = addDaysISO(orderEnd, 1);
      const unitBufferEnd = getOrderBufferEnd(order, i, fallbackBufferDays);
      occs.push({
        kind: "order",
        sourceId: order.id,
        occIndex: i,
        equipmentId: equipment.id,
        start: orderStart,
        end: orderEnd,
        label: baseLabel,
        meta: { order },
      });

      if (
        showBuffer &&
        bufferDaysApplied > 0 &&
        unitBufferEnd >= unitBufferStart &&
        overlaps(unitBufferStart, unitBufferEnd, windowStart, windowEnd)
      ) {
        occs.push({
          kind: "buffer",
          sourceId: order.id,
          occIndex: i,
          equipmentId: equipment.id,
          start: unitBufferStart,
          end: unitBufferEnd,
          label: `Buffer for ${baseLabel}`,
          meta: {
            order,
            bufferDays: bufferDaysApplied,
            bufferOverride: (order.bufferOverrides ?? []).find(
              (override) => override.status === "active" && override.orderUnitIndex === i
            ),
          },
        });
      }
    }
  }

  // Holds -> per-unit occurrences
  for (const hold of holds) {
    if (hold.equipmentId !== equipment.id) continue;
    if (hold.status !== "active") continue;
    if (!overlaps(hold.startDate, hold.endDate, windowStart, windowEnd)) continue;

    const assignedUnits = normalizeUnitAssignments(hold.unitAssignments ?? []);
    const label =
      assignedUnits.length > 0
        ? `Downtime (${hold.type})`
        : `Downtime (${hold.type})`;

    if (assignedUnits.length > 0) {
      assignedUnits.forEach((unitAssignment, index) => {
        occs.push({
          kind: "hold",
          sourceId: hold.id,
          occIndex: index,
          equipmentId: equipment.id,
          start: hold.startDate,
          end: hold.endDate,
          label: `${label} · ${formatUnitLabel(unitAssignment)}`,
          meta: { hold, preferredLaneId: unitAssignment, unitAssignment },
        });
      });
      continue;
    }

    for (let i = 0; i < (hold.qty ?? 0); i++) {
      occs.push({
        kind: "hold",
        sourceId: hold.id,
        occIndex: i,
        equipmentId: equipment.id,
        start: hold.startDate,
        end: hold.endDate,
        label,
        meta: { hold },
      });
    }
  }

  return occs;
}

function sortOccurrencesStable(occs: Occurrence[]) {
  // Deterministic: start asc, longer first, kind priority, then IDs.
  const kindPriority: Record<OccKind, number> = {
    // Pick your policy: holds should usually "win" for ops, so allocate them earlier.
    hold: 0,
    order: 1,
    buffer: 2,
  };

  return [...occs].sort((a, b) => {
    const s = diffDaysISO(a.start, b.start);
    if (s !== 0) return s;

    const aLen = diffDaysISO(a.start, a.end);
    const bLen = diffDaysISO(b.start, b.end);
    if (aLen !== bLen) return bLen - aLen; // longer first

    const kp = kindPriority[a.kind] - kindPriority[b.kind];
    if (kp !== 0) return kp;

    const id = a.sourceId.localeCompare(b.sourceId);
    if (id !== 0) return id;

    return a.occIndex - b.occIndex;
  });
}

function allocateToLanes(opts: {
  lanes: Lane[];
  occurrences: Occurrence[];
  windowStart: ISODate;
  windowEnd: ISODate;
  persistedLaneByOccKey: Record<string, LaneId>;
}): {
  assigned: AssignedBlock[];
  unassigned: Occurrence[];
  newPersistedLaneByOccKey: Record<string, LaneId>;
} {
  const { lanes, occurrences, windowStart, windowEnd, persistedLaneByOccKey } = opts;

  // per-lane placed blocks (in original iso dates)
  const placed: Record<LaneId, Occurrence[]> = Object.fromEntries(lanes.map((l) => [l.id, []]));

  const unassigned: Occurrence[] = [];
  const newPersisted = { ...persistedLaneByOccKey };

  const sorted = sortOccurrencesStable(occurrences);

  function laneCanFit(laneId: LaneId, occ: Occurrence) {
    for (const existing of placed[laneId] ?? []) {
      if (overlaps(existing.start, existing.end, occ.start, occ.end)) return false;
    }
    return true;
  }

  function place(laneId: LaneId, occ: Occurrence) {
    placed[laneId].push(occ);
    newPersisted[occKey(occ)] = laneId;
  }

  for (const occ of sorted) {
    const hardPreferredLane = occ.meta?.preferredLaneId as LaneId | undefined;
    if (hardPreferredLane) {
      if (placed[hardPreferredLane] && laneCanFit(hardPreferredLane, occ)) {
        place(hardPreferredLane, occ);
      } else {
        unassigned.push(occ);
      }
      continue;
    }

    // First try persisted lane (stability)
    const k = occKey(occ);
    const preferred = persistedLaneByOccKey[k];
    if (preferred && placed[preferred] && laneCanFit(preferred, occ)) {
      place(preferred, occ);
      continue;
    }

    // Otherwise first-fit
    let did = false;
    for (const lane of lanes) {
      if (laneCanFit(lane.id, occ)) {
        place(lane.id, occ);
        did = true;
        break;
      }
    }
    if (!did) unassigned.push(occ);
  }

  // Convert placed -> AssignedBlocks (clipped to window)
  const assigned: AssignedBlock[] = [];
  for (const lane of lanes) {
    for (const occ of placed[lane.id] ?? []) {
      const clippedStart = isoInRange(occ.start, windowStart, windowEnd) ? occ.start : windowStart;
      const clippedEnd = isoInRange(occ.end, windowStart, windowEnd) ? occ.end : windowEnd;

      const startIndex = clamp(diffDaysISO(windowStart, clippedStart), 0, 10_000);
      const endIndex = clamp(diffDaysISO(windowStart, clippedEnd), 0, 10_000);

      assigned.push({
        ...occ,
        laneId: lane.id,
        startIndex,
        endIndex,
        clippedLeft: diffDaysISO(occ.start, windowStart) < 0,
        clippedRight: diffDaysISO(windowEnd, occ.end) < 0,
      });
    }
  }

  return { assigned, unassigned, newPersistedLaneByOccKey: newPersisted };
}

// ---------- UI ----------
const CELL_W = 86; // px per day column (adjust as desired)
const ROW_H = 44; // px lane row height

function kindClass(kind: OccKind) {
  switch (kind) {
    case "order":
      return "bg-blue-600/90 text-white";
    case "buffer":
      return "bg-blue-200 text-blue-900 border border-blue-300";
    case "hold":
      return "bg-amber-500/90 text-white";
    default:
      return "bg-slate-500 text-white";
  }
}

function kindBadge(kind: OccKind) {
  switch (kind) {
    case "order":
      return "Order";
    case "buffer":
      return "Buffer";
    case "hold":
      return "Downtime";
  }
}

function getBlockTitle(block: Occurrence) {
  if (block.kind === "order") {
const o = block.meta?.order as Order | undefined;
return `${block.label}\n${o?.start} → ${o?.end}\nUnit occ: ${block.occIndex + 1} of ${o?.qty ?? "?"}`;

  }
  if (block.kind === "buffer") {
    const o = block.meta?.order as Order | undefined;
    const bufferDays = block.meta?.bufferDays as number | undefined;
    return `${block.label}\n${block.start} → ${block.end}\nBuffer days: ${bufferDays ?? "?"}\nUnit occ: ${block.occIndex + 1} of ${o?.qty ?? "?"}`;
  }
  const h = block.meta?.hold as Hold | undefined;
  return `${block.label}\n${h?.startDate} → ${h?.endDate}\nUnit occ: ${block.occIndex + 1} of ${h?.qty ?? "?"}`;
}

function getOccurrenceTitle(block: Occurrence) {
  if (block.kind === "hold") {
    const hold = block.meta?.hold as Hold | undefined;
    const unitAssignment = block.meta?.unitAssignment as string | undefined;
    const unitsText =
      hold?.unitAssignments?.length
        ? hold.unitAssignments.map(formatUnitLabel).join(", ")
        : `${hold?.qty ?? "?"} unit(s)`;
    return `${block.label}\n${hold?.startDate} → ${hold?.endDate}\nUnits: ${unitAssignment ? formatUnitLabel(unitAssignment) : unitsText}`;
  }

  if (block.kind === "buffer") {
    const order = block.meta?.order as Order | undefined;
    const bufferDays = block.meta?.bufferDays as number | undefined;
    return `${block.label}\n${block.start} → ${block.end}\nBuffer days: ${bufferDays ?? "?"}\nUnit occ: ${block.occIndex + 1} of ${order?.qty ?? "?"}`;
  }

  const order = block.meta?.order as Order | undefined;
  return `${block.label}\n${order?.start} → ${order?.end}\nUnit occ: ${block.occIndex + 1} of ${order?.qty ?? "?"}`;
}

function getEquipmentSku(equipment: Equipment | null): string | null {
  // Keep TS happy even if Equipment doesn't type sku yet.
  const sku = (equipment as any)?.sku;
  if (typeof sku !== "string") return null;
  const trimmed = sku.trim();
  return trimmed.length ? trimmed : null;
}

function buildOrdersHref(opts: { equipmentId: string; date: ISODate }) {
  const { equipmentId, date } = opts;
  return `/admin/rental/orders?equipmentId=${encodeURIComponent(
    equipmentId
  )}&date=${encodeURIComponent(date)}`;
}

function togglePillClass(active: boolean) {
  return active
    ? "border-[#F2C7C2] bg-[#FCE9E7] text-[#B9382E] shadow-sm"
    : "border-slate-200 bg-white text-slate-600 hover:bg-slate-50";
}

export default function AdminRentalCalendarPage() {
  const router = useRouter();
  const [orders, setOrders] = useState<Order[]>([]);
  const [holds, setHolds] = useState<Hold[]>([]);

  const [daySpan, setDaySpan] = useState<7 | 14>(7);
  const [anchorDate, setAnchorDate] = useState<Date>(() => startOfDay(new Date()));

  const [showBuffer, setShowBuffer] = useState(true);
  const [showOrders, setShowOrders] = useState(true);
  const [showHolds, setShowHolds] = useState(true);
  const [holdTypeFilter, setHoldTypeFilter] = useState<HoldType | "all">("all");
  const [includeCancelledHolds, setIncludeCancelledHolds] = useState(false);
  const [holdType, setHoldType] = useState<HoldType>("maintenance");
  const [holdStartDate, setHoldStartDate] = useState("");
  const [holdEndDate, setHoldEndDate] = useState("");
  const [holdQty, setHoldQty] = useState("1");
  const [holdUnitAssignments, setHoldUnitAssignments] = useState<string[]>([]);
  const [holdReason, setHoldReason] = useState("");
  const [holdNotes, setHoldNotes] = useState("");
  const [holdSaving, setHoldSaving] = useState(false);
  const [holdPreviewLoading, setHoldPreviewLoading] = useState(false);
  const [holdError, setHoldError] = useState<string | null>(null);
  const [holdBanner, setHoldBanner] = useState<string | null>(null);
  const [holdPreview, setHoldPreview] = useState<HoldConflictPreview | null>(null);
  const [holdNeedsConflictConfirmation, setHoldNeedsConflictConfirmation] = useState(false);
  const [bufferOverrideEndDate, setBufferOverrideEndDate] = useState("");
  const [bufferOverrideReason, setBufferOverrideReason] = useState("");
  const [bufferOverrideNotes, setBufferOverrideNotes] = useState("");
  const [bufferOverrideSaving, setBufferOverrideSaving] = useState(false);
  const [bufferOverrideError, setBufferOverrideError] = useState<string | null>(null);
  const [bufferOverrideBanner, setBufferOverrideBanner] = useState<string | null>(null);

  const [selectedBlock, setSelectedBlock] = useState<Occurrence | null>(null);

  // Load equipment + data
  const {
  equipments,
  selectedEquipmentId,
  setSelectedEquipmentId,
  selectedEquipment,
} = useAdminEquipments({ persistKey: "rental_calendar_selected_equipment" });

  async function refreshOrders() {
    const res = await fetch("/api/admin/rental/orders", {
      cache: "no-store",
      credentials: "include",
    });
    const data = await res.json().catch(() => ({}));
    if (!res.ok) throw new Error(data?.error ?? "Failed to load orders");
    const raw = Array.isArray(data?.orders) ? data.orders : [];
    const bufferOverridesByOrderId =
      data?.bufferOverridesByOrderId && typeof data.bufferOverridesByOrderId === "object"
        ? (data.bufferOverridesByOrderId as Record<string, BufferOverride[]>)
        : {};
    setOrders(
      raw
        .map((x: any) => ({
          id: String(x.id ?? "").trim(),
          equipmentId: String(x.equipmentId ?? "").trim(),
          equipmentTitle: x.equipmentTitle,
          start: String(x.start ?? "").slice(0, 10).trim(),
          end: String(x.end ?? "").slice(0, 10).trim(),
          qty: Number(x.qty ?? 0),
          maintenanceBufferDaysApplied:
            typeof x.maintenanceBufferDaysApplied === "number"
              ? Math.max(0, Math.floor(x.maintenanceBufferDaysApplied))
              : undefined,
          bufferOverrides: Array.isArray(bufferOverridesByOrderId[String(x.id ?? "").trim()])
            ? bufferOverridesByOrderId[String(x.id ?? "").trim()]
            : [],
          fulfillment: x.fulfillment,
          pricingSnapshot: x.pricingSnapshot,
          createdAt: x.createdAt,
        }))
        .filter((o: Order) => o.id && o.equipmentId && o.start && o.end && o.qty > 0)
    );
  }

  async function refreshHolds(equipmentId: string) {
    const res = await fetch(
      `/api/admin/rental/downtime?equipmentId=${encodeURIComponent(equipmentId)}`,
      {
        cache: "no-store",
        credentials: "include",
      }
    );
    const data = await res.json().catch(() => ({}));
    if (!res.ok) throw new Error(data?.error ?? "Failed to load downtime");
    const raw = Array.isArray(data?.downtime) ? data.downtime : [];
    setHolds(
      raw.map((item: any) => ({
        id: String(item.id ?? "").trim(),
        equipmentId: String(item.equipmentId ?? "").trim(),
        type: item.downtimeType as HoldType,
        startDate: String(item.startDate ?? "").slice(0, 10),
        endDate: String(item.endDate ?? "").slice(0, 10),
        qty: Math.max(0, Number(item.quantityAffected ?? 0)),
        unitAssignments: normalizeUnitAssignments(
          Array.isArray(item.unitAssignments) ? item.unitAssignments.map((value: unknown) => String(value ?? "")) : []
        ),
        status: (item.status ?? "active") as "active" | "cancelled",
        reason: item.reason ?? undefined,
        notes: item.notes ?? undefined,
        createdAt: item.createdAt,
      }))
    );
  }

  useEffect(() => {
    refreshOrders().catch((error) => {
      console.error("calendar orders load failed", error);
      setOrders([]);
    });
  }, []);

  const windowStartISO = useMemo(() => toISODate(anchorDate), [anchorDate]);
  const windowEndISO = useMemo(() => toISODate(addDaysDate(anchorDate, daySpan - 1)), [anchorDate, daySpan]);
  const unitOptions = useMemo(
    () =>
      Array.from({ length: selectedEquipment?.totalUnits ?? 0 }, (_, index) => {
        const unitId = `unit-${index + 1}`;
        return { id: unitId, label: formatUnitLabel(unitId) };
      }),
    [selectedEquipment?.totalUnits]
  );
  const effectiveHoldQty = holdUnitAssignments.length > 0 ? String(holdUnitAssignments.length) : holdQty;
  const todayISO = useMemo(() => toISODate(startOfDay(new Date())), []);

  const filteredHoldList = useMemo(() => {
    return [...holds]
      .filter((hold) => includeCancelledHolds || hold.status === "active")
      .filter((hold) => holdTypeFilter === "all" || hold.type === holdTypeFilter)
      .sort((left, right) => sortHoldList(left, right, todayISO));
  }, [holds, holdTypeFilter, includeCancelledHolds, todayISO]);

  function buildHoldPayload(confirmConflicts = false) {
    return {
      equipmentId: selectedEquipment?.id,
      downtimeType: holdType,
      startDate: holdStartDate,
      endDate: holdEndDate,
      quantityAffected: effectiveHoldQty,
      unitAssignments: holdUnitAssignments,
      reason: holdReason,
      notes: holdNotes,
      confirmConflicts,
    };
  }

  function resetHoldPreviewState() {
    setHoldPreview(null);
    setHoldNeedsConflictConfirmation(false);
  }

  function openHoldInDrawer(hold: Hold) {
    const unitAssignment = hold.unitAssignments[0];
    setSelectedBlock({
      kind: "hold",
      sourceId: hold.id,
      occIndex: 0,
      equipmentId: hold.equipmentId,
      start: hold.startDate,
      end: hold.endDate,
      label:
        hold.unitAssignments.length > 0
          ? `Downtime (${hold.type}) · ${formatUnitLabel(unitAssignment)}`
          : `Downtime (${hold.type})`,
      meta: {
        hold,
        unitAssignment,
        preferredLaneId: unitAssignment,
      },
    });
  }

  useEffect(() => {
    if (!selectedEquipment?.id) {
      setHolds([]);
      resetHoldPreviewState();
      setHoldUnitAssignments([]);
      return;
    }

    setHoldError(null);
    setHoldBanner(null);
    setHoldStartDate((current) => current || windowStartISO);
    setHoldEndDate((current) => current || windowStartISO);
    refreshHolds(selectedEquipment.id).catch((error) => {
      console.error("calendar downtime load failed", error);
      setHolds([]);
      setHoldError(error instanceof Error ? error.message : "Failed to load downtime");
    });
  }, [selectedEquipment?.id, windowStartISO]);

  useEffect(() => {
    resetHoldPreviewState();
  }, [holdType, holdStartDate, holdEndDate, holdQty, holdReason, holdNotes, holdUnitAssignments]);

  useEffect(() => {
    setHoldUnitAssignments((current) =>
      current.filter((unitId) => unitOptions.some((option) => option.id === unitId))
    );
  }, [unitOptions]);

  useEffect(() => {
    const drawerOrder =
      selectedBlock?.kind === "order" || selectedBlock?.kind === "buffer"
        ? ((selectedBlock.meta?.order as Order | undefined) ?? undefined)
        : undefined;
    const drawerBufferOverride =
      selectedBlock?.kind === "buffer"
        ? ((selectedBlock.meta?.bufferOverride as BufferOverride | undefined) ?? undefined)
        : undefined;

    if (selectedBlock?.kind === "buffer") {
      setBufferOverrideEndDate(
        drawerBufferOverride?.overrideBufferEndDate ?? drawerOrder?.end ?? selectedBlock.end
      );
      setBufferOverrideReason(drawerBufferOverride?.reason ?? "");
      setBufferOverrideNotes(drawerBufferOverride?.notes ?? "");
      setBufferOverrideError(null);
      setBufferOverrideBanner(null);
      return;
    }

    setBufferOverrideEndDate("");
    setBufferOverrideReason("");
    setBufferOverrideNotes("");
    setBufferOverrideError(null);
    setBufferOverrideBanner(null);
  }, [selectedBlock]);

  async function previewHoldConflicts() {
    if (!selectedEquipment?.id || holdSaving || holdPreviewLoading) return;
    try {
      setHoldPreviewLoading(true);
      setHoldError(null);
      setHoldBanner(null);
      const res = await fetch("/api/admin/rental/downtime", {
        method: "POST",
        credentials: "include",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          ...buildHoldPayload(false),
          previewOnly: true,
        }),
      });
      const data = await res.json().catch(() => ({}));
      if (!res.ok) throw new Error(data?.error ?? "Failed to preview downtime conflicts");
      setHoldPreview((data?.conflicts ?? null) as HoldConflictPreview | null);
      setHoldNeedsConflictConfirmation(Boolean(data?.conflicts?.hasConflicts));
      setHoldBanner(
        data?.conflicts?.hasConflicts
          ? "Operational conflicts found. Review the warning summary before saving."
          : "No active booking, downtime, or extension conflicts were found for this block."
      );
    } catch (error) {
      setHoldError(error instanceof Error ? error.message : "Failed to preview downtime conflicts");
    } finally {
      setHoldPreviewLoading(false);
    }
  }

  async function createHold() {
    if (!selectedEquipment?.id || holdSaving) return;
    try {
      setHoldSaving(true);
      setHoldError(null);
      setHoldBanner(null);
      const res = await fetch("/api/admin/rental/downtime", {
        method: "POST",
        credentials: "include",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify(buildHoldPayload(holdNeedsConflictConfirmation)),
      });
      const data = await res.json().catch(() => ({}));
      if (res.status === 409 && data?.requiresConfirmation) {
        setHoldPreview((data?.conflicts ?? null) as HoldConflictPreview | null);
        setHoldNeedsConflictConfirmation(true);
        setHoldError("Downtime overlaps existing operational activity. Review the warning summary and save again to confirm.");
        return;
      }
      if (!res.ok) throw new Error(data?.error ?? "Failed to create downtime");
      await refreshHolds(selectedEquipment.id);
      setHoldBanner("Downtime block created.");
      setHoldPreview((data?.conflicts ?? null) as HoldConflictPreview | null);
      setHoldNeedsConflictConfirmation(false);
      setHoldReason("");
      setHoldNotes("");
      setHoldUnitAssignments([]);
      setHoldQty("1");
    } catch (error) {
      setHoldError(error instanceof Error ? error.message : "Failed to create downtime");
    } finally {
      setHoldSaving(false);
    }
  }

  async function cancelHold(holdId: string) {
    if (!selectedEquipment?.id || holdSaving) return;
    try {
      setHoldSaving(true);
      setHoldError(null);
      setHoldBanner(null);
      const res = await fetch(`/api/admin/rental/downtime/${encodeURIComponent(holdId)}`, {
        method: "PATCH",
        credentials: "include",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ status: "cancelled" }),
      });
      const data = await res.json().catch(() => ({}));
      if (!res.ok) throw new Error(data?.error ?? "Failed to cancel downtime");
      await refreshHolds(selectedEquipment.id);
      setHoldBanner("Downtime block cancelled.");
      if (selectedBlock?.sourceId === holdId) {
        setSelectedBlock(null);
      }
    } catch (error) {
      setHoldError(error instanceof Error ? error.message : "Failed to cancel downtime");
    } finally {
      setHoldSaving(false);
    }
  }

  async function releaseBufferEarly() {
    if (selectedBlock?.kind !== "buffer" || !selectedOrder || bufferOverrideSaving) return;

    try {
      setBufferOverrideSaving(true);
      setBufferOverrideError(null);
      setBufferOverrideBanner(null);
      const res = await fetch(
        `/api/admin/rental/orders/${encodeURIComponent(selectedOrder.id)}/buffer-release`,
        {
          method: "POST",
          credentials: "include",
          headers: { "Content-Type": "application/json" },
          body: JSON.stringify({
            orderUnitIndex: selectedBlock.occIndex,
            overrideBufferEndDate: bufferOverrideEndDate,
            reason: bufferOverrideReason,
            notes: bufferOverrideNotes,
          }),
        }
      );
      const data = await res.json().catch(() => ({}));
      if (!res.ok) throw new Error(data?.error ?? "Failed to release buffer early");

      await refreshOrders();
      setBufferOverrideBanner("Buffer release saved.");
    } catch (error) {
      setBufferOverrideError(error instanceof Error ? error.message : "Failed to release buffer early");
    } finally {
      setBufferOverrideSaving(false);
    }
  }

  const days = useMemo(() => {
    const out: { iso: ISODate; date: Date }[] = [];
    for (let i = 0; i < daySpan; i++) {
      const d = addDaysDate(anchorDate, i);
      out.push({ iso: toISODate(d), date: d });
    }
    return out;
  }, [anchorDate, daySpan]);

  const lanes = useMemo<Lane[]>(() => {
    const n = selectedEquipment?.totalUnits ?? 0;
    return Array.from({ length: n }, (_, i) => ({
      id: `unit-${i + 1}`,
      name: `Unit ${i + 1}`,
    }));
  }, [selectedEquipment?.totalUnits]);

  const timeline = useMemo(() => {
    if (!selectedEquipment) {
      return { assigned: [] as AssignedBlock[], unassigned: [] as Occurrence[], overbookDays: new Set<ISODate>() };
    }

    const visibleOrders = showOrders ? orders : [];
    const visibleHolds = showHolds
      ? holds.filter((hold) => hold.status === "active" && (holdTypeFilter === "all" || hold.type === holdTypeFilter))
      : [];

    const occs = buildOccurrencesForEquipment({
      equipment: selectedEquipment,
      orders: visibleOrders,
      holds: visibleHolds,
      showBuffer,
      windowStart: windowStartISO,
      windowEnd: windowEndISO,
    }).filter((o) => overlaps(o.start, o.end, windowStartISO, windowEndISO));

    const allAssignments = readAssignments();
    const eqAssignments = allAssignments[selectedEquipment.id] ?? {};

    const { assigned, unassigned, newPersistedLaneByOccKey } = allocateToLanes({
      lanes,
      occurrences: occs,
      windowStart: windowStartISO,
      windowEnd: windowEndISO,
      persistedLaneByOccKey: eqAssignments,
    });

    // persist updated assignment map
    const next: PersistedAssignments = { ...allAssignments, [selectedEquipment.id]: newPersistedLaneByOccKey };
    writeAssignments(next);

    // compute days with unassigned overlap (for header markers)
    const overbookDays = new Set<ISODate>();
    for (const u of unassigned) {
      for (const day of days) {
        if (overlaps(u.start, u.end, day.iso, day.iso)) overbookDays.add(day.iso);
      }
    }

    return { assigned, unassigned, overbookDays };
  }, [
    selectedEquipment,
    holds,
    orders,
    showOrders,
    showHolds,
    holdTypeFilter,
    showBuffer,
    windowStartISO,
    windowEndISO,
    lanes,
    days,
  ]);

  // group assigned blocks by lane
  const blocksByLane = useMemo(() => {
    const map: Record<LaneId, AssignedBlock[]> = {};
    for (const l of lanes) map[l.id] = [];
    for (const b of timeline.assigned) {
      map[b.laneId] = map[b.laneId] ?? [];
      map[b.laneId].push(b);
    }
    // sort within lane for nicer rendering
    for (const lid of Object.keys(map)) {
      map[lid].sort((a, b) => a.startIndex - b.startIndex || a.endIndex - b.endIndex);
    }
    return map;
  }, [timeline.assigned, lanes]);

  const scrollRef = useRef<HTMLDivElement | null>(null);

  function shiftWindow(deltaDays: number) {
    setSelectedBlock(null);
    setAnchorDate((d) => addDaysDate(d, deltaDays));
  }

  function resetToday() {
    setSelectedBlock(null);
    setAnchorDate(startOfDay(new Date()));
    scrollRef.current?.scrollTo({ left: 0, behavior: "smooth" });
  }

  const contentW = daySpan * CELL_W;
  const selectedHold = selectedBlock?.kind === "hold" ? ((selectedBlock.meta?.hold as Hold | undefined) ?? undefined) : undefined;
  const selectedOrder =
    selectedBlock?.kind === "order" || selectedBlock?.kind === "buffer"
      ? ((selectedBlock.meta?.order as Order | undefined) ?? undefined)
      : undefined;
  const selectedBufferDays =
    selectedBlock?.kind === "buffer" ? ((selectedBlock.meta?.bufferDays as number | undefined) ?? undefined) : undefined;
  const selectedBufferOverride =
    selectedBlock?.kind === "buffer"
      ? ((selectedBlock.meta?.bufferOverride as BufferOverride | undefined) ?? undefined)
      : undefined;

  return (
    <div className="space-y-3 bg-slate-50 p-5">
      <div className="flex flex-col gap-3 xl:flex-row xl:items-start xl:justify-between">
        <div className="min-w-0">
          <div className="inline-flex items-center gap-2 rounded-full border border-[#F2C7C2] bg-[#FCE9E7] px-3 py-1 text-[11px] font-semibold uppercase tracking-[0.16em] text-[#B9382E]">
            <CalendarDays className="h-4 w-4" />
            Rental planning workspace
          </div>
          <div className="mt-3 flex flex-wrap items-end gap-x-4 gap-y-1">
            <h1 className="text-xl font-semibold text-[#2A2A2A]">Rental Calendar</h1>
            <p className="text-sm text-slate-600">Timeline view with per-unit lanes.</p>
          </div>
          <p className="mt-1 text-sm text-slate-500">
            Timeline view with per-unit lanes (capacity slots). Window: <span className="font-medium">{windowStartISO}</span> →{" "}
            <span className="font-medium">{windowEndISO}</span>
          </p>
        </div>

        <div className="grid gap-2 rounded-2xl border border-slate-200 bg-white p-3 shadow-sm xl:min-w-[720px] xl:grid-cols-[minmax(240px,1fr)_auto]">
          <div className="rounded-xl border border-slate-200 bg-slate-50 px-3 py-2.5">
            <div className="mb-2 flex items-center gap-2 text-xs font-semibold uppercase tracking-wide text-slate-500">
              <Factory className="h-4 w-4 text-[#D24338]" />
              Equipment
            </div>
            <select
              className="w-full rounded-lg border border-slate-200 bg-white px-3 py-2 text-sm font-medium text-slate-900"
              value={selectedEquipmentId}
              onChange={(e) => {
                setSelectedBlock(null);
                setSelectedEquipmentId(e.target.value);
              }}
            >
              {equipments.map((eq) => (
                <option key={eq.id} value={eq.id}>
  {eq.title} ({eq.totalUnits} units)
</option>

              ))}
            </select>
          </div>

          <div className="rounded-xl border border-slate-200 bg-slate-50 px-3 py-2.5">
            <div className="mb-2 flex items-center gap-2 text-xs font-semibold uppercase tracking-wide text-slate-500">
              <Settings2 className="h-4 w-4 text-[#D24338]" />
              Calendar scope
            </div>
            <div className="flex flex-wrap items-center gap-2">
            <button className="inline-flex items-center rounded-lg border border-slate-200 bg-white px-3 py-2 text-sm font-medium text-slate-700 hover:bg-slate-50" onClick={() => shiftWindow(-daySpan)}>
              <ChevronLeft className="mr-1 h-4 w-4" />
              Prev
            </button>
            <button className="inline-flex items-center rounded-lg border border-slate-200 bg-white px-3 py-2 text-sm font-medium text-slate-700 hover:bg-slate-50" onClick={resetToday}>
              <TimerReset className="mr-1 h-4 w-4" />
              Today
            </button>
            <button className="inline-flex items-center rounded-lg border border-slate-200 bg-white px-3 py-2 text-sm font-medium text-slate-700 hover:bg-slate-50" onClick={() => shiftWindow(daySpan)}>
              Next
              <ChevronRight className="ml-1 h-4 w-4" />
            </button>

            <div className="ml-2 flex items-center gap-1 rounded-lg border border-slate-200 bg-white p-1">
              <button
                className={`rounded-md px-3 py-1.5 text-sm font-medium ${daySpan === 7 ? "bg-[#D24338] text-white hover:bg-[#B9382E]" : "text-slate-600 hover:bg-slate-100"}`}
                onClick={() => setDaySpan(7)}
              >
                7 days
              </button>
              <button
                className={`rounded-md px-3 py-1.5 text-sm font-medium ${daySpan === 14 ? "bg-[#D24338] text-white hover:bg-[#B9382E]" : "text-slate-600 hover:bg-slate-100"}`}
                onClick={() => setDaySpan(14)}
              >
                14 days
              </button>
            </div>
          </div>
          </div>

          <div className="xl:col-span-2 flex flex-wrap items-center gap-2 rounded-xl border border-slate-200 bg-slate-50 px-3 py-2.5 text-sm text-slate-600">
            {selectedEquipment ? (
              <>
                <span className="inline-flex items-center gap-2 rounded-full border border-[#F2C7C2] bg-[#FCE9E7] px-3 py-1 text-xs font-semibold uppercase tracking-wide text-[#B9382E]">
                  <Factory className="h-3.5 w-3.5" />
                  Selected equipment
                </span>
                <span className="font-medium text-slate-900">{selectedEquipment.title}</span>
                <span>{selectedEquipment.totalUnits} lanes</span>
                <span>buffer {selectedEquipment.maintenanceBufferDays ?? 7} days</span>
              </>
            ) : (
              <span>No equipment yet.</span>
            )}
          </div>
        </div>
      </div>

      <div className="flex flex-col gap-4">
      {/* Legend + secondary display controls */}
      <div className="order-2 flex flex-wrap items-start justify-between gap-3">
        <div className="flex flex-wrap items-center gap-2 rounded-2xl border border-slate-200 bg-white px-3 py-3 text-sm shadow-sm">
          <span className="mr-2 inline-flex items-center gap-2 text-xs font-semibold uppercase tracking-wide text-slate-500">
            <Layers3 className="h-4 w-4 text-[#D24338]" />
            Legend
          </span>
          <span className="inline-flex items-center gap-2 rounded-full border border-slate-200 bg-slate-50 px-3 py-1">
            <span className="h-3 w-3 rounded bg-blue-600/90" /> Order
          </span>
          <span className="inline-flex items-center gap-2 rounded-full border border-slate-200 bg-slate-50 px-3 py-1">
            <span className="h-3 w-3 rounded bg-blue-200 border border-blue-300" /> Buffer
          </span>
          <span className="inline-flex items-center gap-2 rounded-full border border-slate-200 bg-slate-50 px-3 py-1">
            <span className="h-3 w-3 rounded bg-amber-500/90" /> Downtime
          </span>
          <span className="inline-flex items-center gap-2 rounded-full border border-red-200 bg-red-50 px-3 py-1 text-red-700">
            <span className="h-3 w-3 rounded bg-red-600" /> Overbooked/unassigned
          </span>
        </div>

        <div className="flex flex-wrap items-center gap-3 rounded-2xl border border-slate-200 bg-white px-4 py-3 text-sm text-slate-600 shadow-sm">
          {selectedEquipment ? (
            <>
              <span className="font-medium">{selectedEquipment.title}</span>
 · {selectedEquipment.totalUnits} lanes · buffer{" "}
              {selectedEquipment.maintenanceBufferDays ?? 7} days
            </>
          ) : (
            "No equipment yet."
          )}
        </div>
      </div>
      {selectedEquipment && (
        <div className="order-2 rounded-2xl border border-[#F2C7C2] bg-[#FCE9E7] px-4 py-2.5 text-xs text-slate-700 shadow-sm">
          {BUFFER_BEHAVIOR_NOTE}
        </div>
      )}

      <div className="order-3 grid gap-4 lg:grid-cols-[minmax(0,1fr)_360px]">
        <div className="rounded-2xl border border-slate-200 bg-white p-5 shadow-sm">
          <div className="flex items-center gap-2 text-sm font-semibold text-slate-900">
            <Wrench className="h-4 w-4 text-[#D24338]" />
            Downtime workflow
          </div>
          <div className="mt-1 text-xs text-slate-500">
            DB-backed operational blocks for maintenance, repairs, inspections, admin holds, or internal use.
          </div>
          {holdBanner && (
            <div className="mt-3 flex items-start gap-2 rounded-xl border border-emerald-200 bg-emerald-50 px-3 py-2 text-sm text-emerald-800">
              <ShieldCheck className="mt-0.5 h-4 w-4 shrink-0" />
              {holdBanner}
            </div>
          )}
          {holdError && (
            <div className="mt-3 flex items-start gap-2 rounded-xl border border-rose-200 bg-rose-50 px-3 py-2 text-sm text-rose-700">
              <AlertTriangle className="mt-0.5 h-4 w-4 shrink-0" />
              {holdError}
            </div>
          )}
          {selectedEquipment ? (
            <>
              <div className="mt-4 rounded-2xl border border-slate-200 bg-slate-50 p-4">
                <div className="mb-3 flex items-center gap-2 text-xs font-semibold uppercase tracking-wide text-slate-500">
                  <ClipboardList className="h-4 w-4 text-[#D24338]" />
                  Create and setup
                </div>
                <div className="grid gap-3 md:grid-cols-2 xl:grid-cols-5">
                <select
                  value={holdType}
                  onChange={(e) => setHoldType(e.target.value as HoldType)}
                  className="rounded-md border border-slate-200 px-3 py-2 text-sm"
                >
                  <option value="maintenance">Maintenance</option>
                  <option value="repair">Repair</option>
                  <option value="inspection">Inspection</option>
                  <option value="admin_hold">Admin hold</option>
                  <option value="internal_use">Internal use</option>
                </select>
                <input
                  type="date"
                  value={holdStartDate}
                  onChange={(e) => setHoldStartDate(e.target.value)}
                  className="rounded-md border border-slate-200 px-3 py-2 text-sm"
                />
                <input
                  type="date"
                  value={holdEndDate}
                  onChange={(e) => setHoldEndDate(e.target.value)}
                  className="rounded-md border border-slate-200 px-3 py-2 text-sm"
                />
                <input
                  type="number"
                  min={1}
                  max={selectedEquipment.totalUnits ?? 1}
                  value={effectiveHoldQty}
                  onChange={(e) => setHoldQty(e.target.value)}
                  disabled={holdUnitAssignments.length > 0}
                  className="rounded-md border border-slate-200 px-3 py-2 text-sm"
                />
                <button
                  type="button"
                  onClick={previewHoldConflicts}
                  disabled={holdSaving || holdPreviewLoading}
                  className="rounded-md border border-slate-200 bg-white px-3 py-2 text-sm font-medium text-slate-700 hover:bg-slate-50 disabled:bg-slate-100 disabled:text-slate-400"
                >
                  {holdPreviewLoading ? "Checking..." : "Check conflicts"}
                </button>
              </div>
              <div className="mt-3 grid gap-3 md:grid-cols-2">
                <input
                  type="text"
                  value={holdReason}
                  onChange={(e) => setHoldReason(e.target.value)}
                  placeholder="Reason"
                  className="rounded-md border border-slate-200 px-3 py-2 text-sm"
                />
                <input
                  type="text"
                  value={holdNotes}
                  onChange={(e) => setHoldNotes(e.target.value)}
                  placeholder="Optional notes"
                  className="rounded-md border border-slate-200 px-3 py-2 text-sm"
                />
              </div>
              </div>
              <div className="mt-3 rounded-lg border border-slate-200 bg-slate-50 p-3">
                <div className="flex items-center justify-between gap-3">
                  <div>
                    <div className="flex items-center gap-2 text-sm font-medium text-slate-900">
                      <Layers3 className="h-4 w-4 text-[#D24338]" />
                      Target units
                    </div>
                    <div className="mt-1 text-xs text-slate-500">
                      Select specific units when downtime should target known lanes. Leave empty to use the legacy quantity fallback.
                    </div>
                  </div>
                  <div className="text-xs text-slate-500">
                    Quantity affected: <span className="font-medium text-slate-700">{effectiveHoldQty}</span>
                  </div>
                </div>
                <div className="mt-3 flex flex-wrap gap-2">
                  {unitOptions.map((unit) => {
                    const checked = holdUnitAssignments.includes(unit.id);
                    return (
                      <label
                        key={unit.id}
                        className={`inline-flex items-center gap-2 rounded-md border px-3 py-2 text-sm ${
                          checked ? "border-slate-900 bg-slate-900 text-white" : "border-slate-200 bg-white text-slate-700"
                        }`}
                      >
                        <input
                          type="checkbox"
                          checked={checked}
                          onChange={(e) => {
                            setHoldUnitAssignments((current) => {
                              const next = e.target.checked
                                ? [...current, unit.id]
                                : current.filter((item) => item !== unit.id);
                              return normalizeUnitAssignments(next);
                            });
                          }}
                          className="sr-only"
                        />
                        {unit.label}
                      </label>
                    );
                  })}
                </div>
              </div>
              {holdPreview && (
                <div className="mt-3 rounded-xl border border-amber-200 bg-amber-50 p-3">
                  <div className="flex items-center gap-2 text-sm font-medium text-amber-900">
                    <ShieldAlert className="h-4 w-4" />
                    Conflict summary
                  </div>
                  <div className="mt-1 text-xs text-amber-800">
                    Server-side check against active bookings, existing downtime, and pending or approved extensions.
                  </div>
                  {holdPreview.summaryLines.length > 0 ? (
                    <ul className="mt-3 list-disc space-y-1 pl-5 text-sm text-amber-900">
                      {holdPreview.summaryLines.map((line) => (
                        <li key={line}>{line}</li>
                      ))}
                    </ul>
                  ) : (
                    <div className="mt-3 text-sm text-emerald-800">No operational conflicts found for the selected dates.</div>
                  )}
                </div>
              )}
              <div className="mt-3 flex flex-wrap gap-3">
                <button
                  type="button"
                  onClick={createHold}
                  disabled={holdSaving}
                  className="rounded-lg bg-[#D24338] px-4 py-2 text-sm font-medium text-white hover:bg-[#B9382E] disabled:bg-slate-300"
                >
                  {holdSaving ? "Saving..." : holdNeedsConflictConfirmation ? "Add downtime anyway" : "Add downtime"}
                </button>
                {holdUnitAssignments.length === 0 && (
                  <div className="self-center text-xs text-slate-500">
                    No units selected: this uses the legacy quantity-based fallback.
                  </div>
                )}
              </div>
            </>
          ) : (
            <div className="mt-3 text-sm text-slate-600">Select equipment to manage downtime.</div>
          )}
        </div>

        <div className="rounded-2xl border border-slate-200 bg-white p-5 shadow-sm">
          <div className="flex items-center gap-2 text-sm font-semibold text-slate-900">
            <Flag className="h-4 w-4 text-[#D24338]" />
            Current equipment downtime
          </div>
          <div className="mt-1 text-xs text-slate-500">
            Showing DB-backed downtime entries for the selected equipment.
          </div>
          <div className="mt-3 flex items-center justify-between gap-3">
            <label className="flex items-center gap-2 text-xs text-slate-600">
              <input
                type="checkbox"
                checked={includeCancelledHolds}
                onChange={(e) => setIncludeCancelledHolds(e.target.checked)}
              />
              Include cancelled
            </label>
            <div className="text-xs text-slate-500">{filteredHoldList.length} visible block(s)</div>
          </div>
          <div className="mt-3 max-h-[420px] space-y-2 overflow-y-auto pr-1">
            {filteredHoldList.length ? (
              filteredHoldList.map((hold) => (
                <div
                  key={hold.id}
                  onClick={() => openHoldInDrawer(hold)}
                  className="block w-full rounded-xl border border-slate-200 p-3 text-left text-sm hover:border-slate-300 hover:bg-slate-50"
                  role="button"
                  tabIndex={0}
                  onKeyDown={(event) => {
                    if (event.key === "Enter" || event.key === " ") {
                      event.preventDefault();
                      openHoldInDrawer(hold);
                    }
                  }}
                >
                  <div className="flex items-start justify-between gap-3">
                    <div>
                      <div className="font-medium text-slate-900">
                        {hold.type} · {hold.qty} unit(s)
                      </div>
                      <div className="mt-1 text-xs text-slate-500">
                        {hold.startDate} → {hold.endDate}
                      </div>
                      {hold.reason && <div className="mt-2 text-xs text-slate-600">{hold.reason}</div>}
                      {hold.unitAssignments.length > 0 && (
                        <div className="mt-1 text-xs text-slate-500">
                          Units: {hold.unitAssignments.map(formatUnitLabel).join(", ")}
                        </div>
                      )}
                      {hold.notes && <div className="mt-1 text-xs text-slate-500">{hold.notes}</div>}
                    </div>
                    <div className="flex flex-col items-end gap-2">
                      <span className={`rounded-full px-2 py-1 text-[11px] font-semibold ${hold.status === "active" ? "bg-[#FCE9E7] text-[#B9382E]" : "bg-slate-100 text-slate-700"}`}>
                        {hold.status}
                      </span>
                      {hold.status === "active" && (
                        <button
                          type="button"
                          onClick={(event) => {
                            event.stopPropagation();
                            void cancelHold(hold.id);
                          }}
                          disabled={holdSaving}
                          className="rounded-md border border-rose-200 bg-rose-50 px-2 py-1 text-xs font-medium text-rose-700 hover:bg-rose-100 disabled:text-slate-400"
                        >
                          Cancel
                        </button>
                      )}
                    </div>
                  </div>
                </div>
              ))
            ) : (
              <div className="text-sm text-slate-600">No downtime blocks recorded for this equipment.</div>
            )}
          </div>
        </div>
      </div>

      {/* Unassigned queue */}
      {timeline.unassigned.length > 0 && (
        <div className="order-1 rounded-2xl border border-red-200 bg-red-50 p-4 shadow-sm">
          <div className="flex items-center justify-between gap-3">
            <div className="inline-flex items-center gap-2 font-medium text-red-800">
              <XCircle className="h-4 w-4" />
              Unassigned / Overbooked ({timeline.unassigned.length})
            </div>
            <div className="text-xs text-red-700">
              These blocks couldn’t fit into {lanes.length} lanes due to overlaps.
            </div>
          </div>

          <div className="mt-2 flex flex-wrap gap-2">
            {timeline.unassigned.slice(0, 16).map((u) => (
              <button
                key={`${u.kind}:${u.sourceId}:${u.occIndex}`}
                className="text-xs border border-red-200 bg-white hover:bg-red-50 rounded-md px-2 py-1"
                onClick={() => setSelectedBlock(u)}
                title={getOccurrenceTitle(u)}
              >
                <span className="font-medium">{kindBadge(u.kind)}</span> · {u.label} · {u.start}→{u.end} · occ{" "}
                {u.occIndex + 1}
              </button>
            ))}
            {timeline.unassigned.length > 16 && (
              <span className="text-xs text-red-700 self-center">
                +{timeline.unassigned.length - 16} more…
              </span>
            )}
          </div>
        </div>
      )}

      {/* <div className="border rounded-lg p-3 text-sm bg-white">
  <div className="font-medium mb-2">Debug</div>
  <div>selectedEquipmentId: {selectedEquipmentId || "—"}</div>
  <div>equipment title: {selectedEquipment?.title || "—"}</div>
  <div>equipment totalUnits: {selectedEquipment?.totalUnits ?? "—"}</div>
  <div>orders loaded: {orders.length}</div>
<div>holds loaded: {holds.length}</div>
<div>occurrences: {timeline.assigned.length + timeline.unassigned.length}</div>
<div>assigned blocks: {timeline.assigned.length}</div>
<div>
  window: {windowStartISO} → {windowEndISO}
</div>
<div>selectedEquipment.id: {selectedEquipment?.id ?? "—"}</div>
<div>matching orders for equipment: {selectedEquipment ? orders.filter(o => o.equipmentId.trim() === selectedEquipment.id.trim()).length : 0}</div>
<div className="text-xs text-slate-500">
  first order equipmentId: {orders[0]?.equipmentId ?? "—"} · start: {orders[0]?.start ?? "—"} · end: {orders[0]?.end ?? "—"}
</div>

</div> */}


      {/* Timeline grid */}
      <div className="order-1 overflow-hidden rounded-2xl border border-slate-200 bg-white shadow-sm">
        {/* Header row: dates */}
        <div className="flex border-b bg-slate-50">
          <div className="w-44 shrink-0 border-r px-3 py-3 text-sm font-medium text-slate-700">
            Lanes
          </div>
          <div className="flex-1 overflow-x-auto" ref={scrollRef}>
            <div className="relative" style={{ width: contentW }}>
              <div
                className="grid"
                style={{
                  gridTemplateColumns: `repeat(${daySpan}, ${CELL_W}px)`,
                }}
              >
                {days.map((d) => {
                  const isOver = timeline.overbookDays.has(d.iso);
                  return (
                    <div key={d.iso} className={`border-r last:border-r-0 px-2 py-3 ${d.iso === toISODate(startOfDay(new Date())) ? "bg-[#FCE9E7]/70" : ""}`}>
                      <div className="flex items-center justify-between">
                        <div className="text-xs text-slate-600">{weekdayShort(d.date)}</div>
                        {isOver && <span className="inline-block h-2 w-2 rounded-full bg-red-600" title="Overbooked/unassigned on this day" />}
                      </div>
                      <div className="text-sm font-medium">{monthDay(d.date)}</div>
                      <div className="text-[11px] text-slate-500">{d.iso}</div>
                    </div>
                  );
                })}
              </div>
            </div>
          </div>
        </div>

        {/* Body: lanes */}
        <div className="flex">
          {/* Lane labels */}
{/* Lane labels */}
          <div className="w-44 shrink-0 border-r bg-slate-50/70">
  {lanes.length === 0 ? (
    <div className="p-4 text-sm text-slate-600">No units (totalUnits=0).</div>
  ) : (
    lanes.map((lane) => {
      const sku = getEquipmentSku(selectedEquipment);
      const tooltipLines = [
        selectedEquipment?.title ? `Equipment: ${selectedEquipment.title}` : "Equipment: —",
        `SKU: ${sku ?? "—"}`,
        `Lane: ${lane.name}`,
      ];

      return (
        <div
          key={lane.id}
          className="h-[44px] px-3 flex items-center border-b last:border-b-0 text-sm"
          title={tooltipLines.join("\n")}
        >
          <div className="font-medium text-slate-800">{lane.name}</div>
        </div>
      );
    })
  )}
</div>


          {/* Scrollable timeline */}
          <div className="flex-1 overflow-x-auto bg-white">
            <div className="relative" style={{ width: contentW }}>
              {/* vertical day grid lines */}
              <div
                className="absolute inset-0 pointer-events-none"
                style={{
                  backgroundImage: `linear-gradient(to right, rgba(148,163,184,0.35) 1px, transparent 1px)`,
                  backgroundSize: `${CELL_W}px 1px`,
                }}
              />

              {lanes.map((lane) => {
                const blocks = blocksByLane[lane.id] ?? [];
                return (
                  <div
                    key={lane.id}
                    className="relative border-b last:border-b-0"
                    style={{ height: ROW_H }}
                  >
                    {/* per-day subtle cells */}
                    <div
                      className="absolute inset-0 pointer-events-none"
                      style={{
                        backgroundImage:
                          "linear-gradient(to bottom, rgba(226,232,240,0.6) 1px, transparent 1px)",
                        backgroundSize: `1px ${ROW_H}px`,
                      }}
                    />

                    {/* blocks */}
                    {blocks.map((b) => {
                      const left = b.startIndex * CELL_W + 4;
                      const width = (b.endIndex - b.startIndex + 1) * CELL_W - 8;

                      const isSelected =
                        selectedBlock &&
                        occKey(selectedBlock) === occKey(b) &&
                        selectedBlock.kind === b.kind &&
                        selectedBlock.sourceId === b.sourceId;

                      const baseCls =
                        b.kind === "buffer"
                          ? "rounded-md"
                          : "rounded-md shadow-sm";

                      const outline = isSelected ? "ring-2 ring-[#D24338]" : "hover:ring-2 hover:ring-slate-400";

                      // Buffer tail should look attached; slightly shorter height
                      const heightCls = b.kind === "buffer" ? "h-6 top-2" : "h-7 top-1";


                      return (
                        <button
                          key={`${b.kind}:${b.sourceId}:${b.occIndex}:${b.startIndex}:${b.endIndex}`}
                          className={`absolute ${heightCls} ${baseCls} ${outline} ${kindClass(
                            b.kind
                          )} text-left px-2 flex items-center gap-2`}
                          style={{ left, width }}
                          onClick={(e) => {
  // Ctrl/⌘ click = jump straight to Orders filtered by equipment + date
  const equipmentId = selectedEquipment?.id;
  if (equipmentId && (e.ctrlKey || e.metaKey)) {
    // For buffer blocks, it’s often more useful to jump to the order end date.
const dateFromMeta =
  b.kind === "buffer"
    ? ((b.meta?.order as Order | undefined)?.end ?? b.start)
    : b.start;


    router.push(buildOrdersHref({ equipmentId, date: dateFromMeta }));
    return;
  }

  setSelectedBlock(b);
}}

                          title={getOccurrenceTitle(b)}
                        >
                          <span className="text-[11px] font-semibold whitespace-nowrap">
                            {kindBadge(b.kind)}
                          </span>
                          <span className="text-[11px] truncate">
                            {b.label}
                            {b.clippedLeft ? " ↤" : ""}
                            {b.clippedRight ? " ↦" : ""}
                          </span>
                          <span className="ml-auto text-[10px] opacity-80 whitespace-nowrap">
                            occ {b.occIndex + 1}
                          </span>
                        </button>
                      );
                    })}
                  </div>
                );
              })}
            </div>
          </div>
        </div>
      </div>

      <div className="order-2 flex flex-wrap items-center gap-3 rounded-2xl border border-slate-200 bg-white px-4 py-3 text-sm text-slate-600 shadow-sm">
        <span className="inline-flex items-center gap-2 text-xs font-semibold uppercase tracking-wide text-slate-500">
          <Eye className="h-4 w-4 text-[#D24338]" />
          Display controls
        </span>
        <label className={`inline-flex items-center gap-2 rounded-full border px-3 py-1.5 text-sm ${togglePillClass(showOrders)}`}>
          <input type="checkbox" checked={showOrders} onChange={(e) => setShowOrders(e.target.checked)} />
          Show orders
        </label>
        <label className={`inline-flex items-center gap-2 rounded-full border px-3 py-1.5 text-sm ${togglePillClass(showBuffer)}`}>
          <input type="checkbox" checked={showBuffer} onChange={(e) => setShowBuffer(e.target.checked)} />
          Show buffer
        </label>
        <label className={`inline-flex items-center gap-2 rounded-full border px-3 py-1.5 text-sm ${togglePillClass(showHolds)}`}>
          <input type="checkbox" checked={showHolds} onChange={(e) => setShowHolds(e.target.checked)} />
          Show downtime
        </label>
        <select
          value={holdTypeFilter}
          onChange={(e) => setHoldTypeFilter(e.target.value as HoldType | "all")}
          className="rounded-lg border border-slate-200 bg-white px-3 py-2 text-sm"
        >
          <option value="all">All downtime types</option>
          <option value="maintenance">Maintenance</option>
          <option value="repair">Repair</option>
          <option value="inspection">Inspection</option>
          <option value="admin_hold">Admin hold</option>
          <option value="internal_use">Internal use</option>
        </select>
      </div>
      </div>

      {/* Right drawer */}
      {selectedBlock && (
        <div className="fixed top-0 right-0 z-50 flex h-full w-[420px] flex-col border-l border-slate-200 bg-white shadow-xl">
          <div className="shrink-0 border-b border-slate-200 bg-slate-50 p-4">
          <div className="flex items-start justify-between gap-3">
            <div>
              <div className="inline-flex rounded-full border border-[#F2C7C2] bg-[#FCE9E7] px-3 py-1 text-xs font-semibold uppercase tracking-wide text-[#B9382E]">
                {kindBadge(selectedBlock.kind)}
              </div>
              <div className="mt-3 text-lg font-semibold text-[#2A2A2A]">{selectedBlock.label}</div>
              <div className="text-sm text-slate-600">
                {selectedBlock.start} → {selectedBlock.end} · occ {selectedBlock.occIndex + 1}
              </div>
            </div>
            <button
              className="rounded-md border border-slate-200 px-2 py-1 text-sm hover:bg-white"
              onClick={() => setSelectedBlock(null)}
            >
              Close
            </button>
          </div>
          </div>

          <div className="min-h-0 flex-1 overflow-y-auto p-4">
          <div className="space-y-4 pb-8">
            <div className="rounded-xl border border-slate-200 p-4">
              <div className="mb-2 flex items-center gap-2 text-sm font-medium text-slate-900">
                <ClipboardList className="h-4 w-4 text-[#D24338]" />
                Summary
              </div>
              <div className="text-sm text-slate-700 space-y-1">
                <div>
                  <span className="text-slate-500">Kind:</span> {kindBadge(selectedBlock.kind)}
                </div>
                <div>
                  <span className="text-slate-500">Source ID:</span> {selectedBlock.sourceId}
                </div>
                <div>
                 <span className="text-slate-500">Equipment:</span> {selectedEquipment?.title ?? "—"}

                </div>
                {selectedBlock.kind !== "hold" && (
                  <div className="text-xs text-slate-500 mt-2">
                    Buffer is derived per-unit: each qty slot produces its own buffer tail.
                  </div>
                )}
              </div>
            </div>

            {(selectedHold || selectedBlock.kind === "buffer") && (
              <div className="rounded-xl border border-slate-200 p-4">
                <div className="mb-2 flex items-center gap-2 text-sm font-medium text-slate-900">
                  <Wrench className="h-4 w-4 text-[#D24338]" />
                  Operational details
                </div>
                <div className="space-y-2 text-sm text-slate-700">
                  {selectedBlock.kind === "buffer" && (
                    <>
                      <div>
                        <span className="text-slate-500">Buffer days:</span> {selectedBufferDays ?? "—"}
                      </div>
                      <div className="text-xs text-slate-500">{BUFFER_BEHAVIOR_NOTE}</div>
                    </>
                  )}
                  {selectedHold && (
                    <>
                      <div>
                        <span className="text-slate-500">Downtime type:</span> {selectedHold.type}
                      </div>
                      <div>
                        <span className="text-slate-500">Status:</span> {selectedHold.status}
                      </div>
                      <div>
                        <span className="text-slate-500">Date range:</span> {selectedHold.startDate} → {selectedHold.endDate}
                      </div>
                      <div>
                        <span className="text-slate-500">Affected units:</span>{" "}
                        {selectedHold.unitAssignments.length > 0
                          ? selectedHold.unitAssignments.map(formatUnitLabel).join(", ")
                          : `${selectedHold.qty} unit(s)`}
                      </div>
                      {selectedHold.reason && (
                        <div>
                          <span className="text-slate-500">Reason:</span> {selectedHold.reason}
                        </div>
                      )}
                      {selectedHold.notes && (
                        <div>
                          <span className="text-slate-500">Notes:</span> {selectedHold.notes}
                        </div>
                      )}
                    </>
                  )}
                </div>
              </div>
            )}

            {selectedBlock.kind === "buffer" && selectedOrder && (
              <div className="rounded-xl border border-slate-200 p-4">
                <div className="mb-2 flex items-center gap-2 text-sm font-medium text-slate-900">
                  <TimerReset className="h-4 w-4 text-[#D24338]" />
                  Early Buffer Release
                </div>
                <div className="text-xs text-slate-500">
                  DB-backed override for this order unit. Use after return when the unit is ready earlier than the original applied buffer.
                </div>
                {bufferOverrideBanner && (
                  <div className="mt-3 rounded-md border border-emerald-200 bg-emerald-50 px-3 py-2 text-sm text-emerald-800">
                    {bufferOverrideBanner}
                  </div>
                )}
                {bufferOverrideError && (
                  <div className="mt-3 rounded-md border border-rose-200 bg-rose-50 px-3 py-2 text-sm text-rose-700">
                    {bufferOverrideError}
                  </div>
                )}
                <div className="mt-3 grid gap-3">
                  <div className="text-xs text-slate-600">
                    Order unit: <span className="font-medium text-slate-800">occ {selectedBlock.occIndex + 1}</span>
                    {" · "}
                    Rental end: <span className="font-medium text-slate-800">{selectedOrder.end}</span>
                  </div>
                  <label className="grid gap-1 text-sm">
                    <span className="text-slate-700">Effective buffer end</span>
                    <input
                      type="date"
                      value={bufferOverrideEndDate}
                      onChange={(event) => setBufferOverrideEndDate(event.target.value)}
                      className="rounded-md border border-slate-200 px-3 py-2 text-sm"
                    />
                  </label>
                  <label className="grid gap-1 text-sm">
                    <span className="text-slate-700">Reason</span>
                    <input
                      type="text"
                      value={bufferOverrideReason}
                      onChange={(event) => setBufferOverrideReason(event.target.value)}
                      className="rounded-md border border-slate-200 px-3 py-2 text-sm"
                      placeholder="Maintenance completed, cleaned, ready for redeploy..."
                    />
                  </label>
                  <label className="grid gap-1 text-sm">
                    <span className="text-slate-700">Notes</span>
                    <textarea
                      value={bufferOverrideNotes}
                      onChange={(event) => setBufferOverrideNotes(event.target.value)}
                      className="min-h-24 rounded-md border border-slate-200 px-3 py-2 text-sm"
                      placeholder="Optional operational notes"
                    />
                  </label>
                  <button
                    type="button"
                    onClick={releaseBufferEarly}
                    disabled={bufferOverrideSaving}
                    className="rounded-lg bg-[#D24338] px-3 py-2 text-sm font-medium text-white hover:bg-[#B9382E] disabled:bg-slate-300"
                  >
                    {bufferOverrideSaving ? "Saving..." : "Save Early Release"}
                  </button>
                </div>
              </div>
            )}

            <div className="rounded-xl border border-slate-200 p-4">
              <div className="mb-2 flex items-center gap-2 text-sm font-medium text-slate-900">
                <Flag className="h-4 w-4 text-[#D24338]" />
                Actions
              </div>
              <div className="flex flex-col gap-2">
                <button
  className="border rounded-md px-3 py-2 text-sm hover:bg-slate-50 text-left"
  onClick={() => {
    if (!selectedEquipment) return;

    const dateFromMeta =
  selectedBlock.kind === "buffer"
    ? ((selectedBlock.meta?.order as Order | undefined)?.end ?? selectedBlock.start)
    : selectedBlock.start;


    router.push(buildOrdersHref({ equipmentId: selectedEquipment.id, date: dateFromMeta }));
  }}
>
  View in Orders
</button>


                {selectedBlock.kind === "hold" && (
                  <button
                    className="rounded-md border border-rose-200 bg-rose-50 px-3 py-2 text-left text-sm font-medium text-rose-700 hover:bg-rose-100"
                    onClick={() => cancelHold(selectedBlock.sourceId)}
                  >
                    Cancel downtime block
                  </button>
                )}

                <button
                  className="rounded-md border border-slate-200 px-3 py-2 text-left text-sm text-slate-500 hover:bg-slate-50"
                  onClick={() => {
                    // Remove persisted assignment for this occurrence to allow reshuffle next render
                    if (!selectedEquipment) return;
                    const all = readAssignments();
                    const eqMap = { ...(all[selectedEquipment.id] ?? {}) };
                    delete eqMap[occKey(selectedBlock)];
                    const next: PersistedAssignments = { ...all, [selectedEquipment.id]: eqMap };
                    writeAssignments(next);
                    alert("Cleared lane assignment for this occurrence. It may move lanes on next render.");
                  }}
                >
                  Clear lane assignment (debug)
                </button>
              </div>
            </div>

            <div className="rounded-xl border border-slate-200 bg-slate-50 p-4">
              <div className="mb-2 flex items-center gap-2 text-sm font-medium text-slate-900">
                <ShieldAlert className="h-4 w-4 text-amber-600" />
                Operator notes
              </div>
              <ul className="text-sm text-slate-700 list-disc pl-5 space-y-1">
                <li>
                  Unassigned items indicate overbooking or lane conflicts within the window.
                </li>
                <li>
                  Lane assignment persistence is local UI state only; orders and downtime are now loaded from DB-backed admin routes.
                </li>
              </ul>
            </div>
          </div>
          </div>
        </div>
      )}
    </div>
  );
}
