// src/app/admin/rental/calendar/page.tsx

"use client";

import React, { useEffect, useMemo, useRef, useState } from "react";
import type { Equipment } from "@/lib/rental/types";
import { localEquipmentRepo } from "@/lib/rental/equipment-repo";
import { useRouter } from "next/navigation";
import { useAdminEquipments } from "@/lib/rental/hooks/useAdminEquipments";
/**
 * Timeline / Gantt lanes (per-unit capacity slots)
 * - Default 7 days, toggle 14 days
 * - Orders + maintenance buffer tails (per unit)
 * - Holds supported (schema included) but empty by default
 * - Stable lane assignment persisted in localStorage
 *
 * NOTE: This page reads orders from localStorage using a few common keys.
 * If your project uses a different key, update ORDER_STORAGE_KEYS below.
 */

// ---------- Types ----------
type ISODate = string; // YYYY-MM-DD
type Order = {
  id: string;
  equipmentId: string;
  equipmentTitle?: string;
  start: ISODate;
  end: ISODate;
  qty: number;
  fulfillment?: "deliver" | "self_collect";
  pricingSnapshot?: {
    days?: number;
    total?: number;
    deposit?: number;
  };
  createdAt?: string;
};


type HoldType = "maintenance" | "repair" | "admin_hold";
type Hold = {
  id: string;
  equipmentId: string;
  type: HoldType;
  startDate: ISODate;
  endDate: ISODate;
  qty: number;
  reason?: string;
  createdAt?: string;
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

function readFirstAvailable<T>(keys: readonly string[]): { key: string | null; data: T | null } {
  for (const k of keys) {
    const data = readJSON<T>(k);
    if (data != null) return { key: k, data };
  }
  return { key: null, data: null };
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

  const bufferDays = equipment.maintenanceBufferDays ?? 7;

  const occs: Occurrence[] = [];

  // Orders -> per-unit occurrences
  for (const order of orders) {
  if (order.equipmentId.trim() !== String(equipment.id).trim()) continue;


    // We need orders that could affect window either by booking range or by buffer spillover
    const orderStart = order.start;
const orderEnd = order.end;


    const bufferStart = addDaysISO(orderEnd, 1);
    const bufferEnd = addDaysISO(orderEnd, bufferDays);

    const relevant =
      overlaps(orderStart, orderEnd, windowStart, windowEnd) ||
      (showBuffer && bufferDays > 0 && overlaps(bufferStart, bufferEnd, windowStart, windowEnd));

    if (!relevant) continue;

   const baseLabel = `Order #${order.id.slice(0, 6)}${order.equipmentTitle ? ` · ${order.equipmentTitle}` : ""}`;


    for (let i = 0; i < (order.qty ?? 0); i++) {
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

      if (showBuffer && bufferDays > 0) {
        occs.push({
          kind: "buffer",
          sourceId: order.id,
          occIndex: i,
          equipmentId: equipment.id,
          start: bufferStart,
          end: bufferEnd,
          label: `Buffer for ${baseLabel}`,
          meta: { order, bufferDays },
        });
      }
    }
  }

  // Holds -> per-unit occurrences
  for (const hold of holds) {
    if (hold.equipmentId !== equipment.id) continue;
    if (!overlaps(hold.startDate, hold.endDate, windowStart, windowEnd)) continue;

    const label = `Hold (${hold.type})`;
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
      return "Hold";
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

export default function AdminRentalCalendarPage() {
    const router = useRouter();
//   const [equipments, setEquipments] = useState<Equipment[]>([]);
//   const [selectedEquipmentId, setSelectedEquipmentId] = useState<string>("");
  const [orders, setOrders] = useState<Order[]>([]);
  const [holds, setHolds] = useState<Hold[]>([]);

  const [daySpan, setDaySpan] = useState<7 | 14>(7);
  const [anchorDate, setAnchorDate] = useState<Date>(() => startOfDay(new Date()));

  const [showBuffer, setShowBuffer] = useState(true);
  const [showHolds, setShowHolds] = useState(true);

  const [selectedBlock, setSelectedBlock] = useState<Occurrence | null>(null);

  // Load equipment + data

    const {
  equipments,
  selectedEquipmentId,
  setSelectedEquipmentId,
  selectedEquipment,
} = useAdminEquipments({ persistKey: "rental_calendar_selected_equipment" });



  useEffect(() => {
    // Orders: read from localStorage (adjust key if needed)
    const { data: orderData } = readFirstAvailable<any[]>(ORDER_STORAGE_KEYS);
const raw = Array.isArray(orderData) ? orderData : [];

const normalized: Order[] = raw
  .map((x) => ({
    id: String(x.id ?? x.orderId ?? "").trim(),
    equipmentId: String(x.equipmentId ?? x.equipmentID ?? x.equipment?.id ?? "").trim(),
    equipmentTitle: (x.equipmentTitle ?? x.title ?? x.equipment?.title ?? undefined) as string | undefined,
    start: String(x.start ?? x.startDate ?? "").slice(0, 10).trim(),
    end: String(x.end ?? x.endDate ?? "").slice(0, 10).trim(),
    qty: Number(x.qty ?? x.quantity ?? 0),
    fulfillment: x.fulfillment,
    pricingSnapshot: x.pricingSnapshot,
    createdAt: x.createdAt,
  }))
  .filter((o) => o.id && o.equipmentId && o.start && o.end && o.qty > 0);

setOrders(normalized);


    const { data: holdData } = readFirstAvailable<Hold[]>(HOLD_STORAGE_KEYS);
    setHolds(Array.isArray(holdData) ? holdData : []);
  }, []);


  const windowStartISO = useMemo(() => toISODate(anchorDate), [anchorDate]);
  const windowEndISO = useMemo(() => toISODate(addDaysDate(anchorDate, daySpan - 1)), [anchorDate, daySpan]);

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

    const visibleHolds = showHolds ? holds : [];

    const occs = buildOccurrencesForEquipment({
      equipment: selectedEquipment,
      orders,
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
    showHolds,
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

  return (
    <div className="p-6 space-y-4">
      <div className="flex items-start justify-between gap-4">
        <div>
          <h1 className="text-2xl font-semibold">Rental Calendar</h1>
          <p className="text-sm text-slate-600">
            Timeline view with per-unit lanes (capacity slots). Window: <span className="font-medium">{windowStartISO}</span> →{" "}
            <span className="font-medium">{windowEndISO}</span>
          </p>
        </div>

        <div className="flex flex-col items-end gap-2">
          <div className="flex items-center gap-2">
            <label className="text-sm text-slate-600">Equipment</label>
            <select
              className="border rounded-md px-2 py-1 text-sm"
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

          <div className="flex items-center gap-2">
            <button className="border rounded-md px-3 py-1 text-sm hover:bg-slate-50" onClick={() => shiftWindow(-daySpan)}>
              Prev
            </button>
            <button className="border rounded-md px-3 py-1 text-sm hover:bg-slate-50" onClick={resetToday}>
              Today
            </button>
            <button className="border rounded-md px-3 py-1 text-sm hover:bg-slate-50" onClick={() => shiftWindow(daySpan)}>
              Next
            </button>

            <div className="ml-2 flex items-center gap-1 border rounded-md p-1">
              <button
                className={`px-2 py-1 text-sm rounded ${daySpan === 7 ? "bg-slate-900 text-white" : "hover:bg-slate-100"}`}
                onClick={() => setDaySpan(7)}
              >
                7 days
              </button>
              <button
                className={`px-2 py-1 text-sm rounded ${daySpan === 14 ? "bg-slate-900 text-white" : "hover:bg-slate-100"}`}
                onClick={() => setDaySpan(14)}
              >
                14 days
              </button>
            </div>
          </div>

          <div className="flex items-center gap-3">
            <label className="flex items-center gap-2 text-sm">
              <input type="checkbox" checked={showBuffer} onChange={(e) => setShowBuffer(e.target.checked)} />
              Show buffer
            </label>
            <label className="flex items-center gap-2 text-sm">
              <input type="checkbox" checked={showHolds} onChange={(e) => setShowHolds(e.target.checked)} />
              Show holds
            </label>
          </div>
        </div>
      </div>

      {/* Legend + quick stats */}
      <div className="flex flex-wrap items-center justify-between gap-3">
        <div className="flex items-center gap-2 text-sm">
          <span className="text-slate-600">Legend:</span>
          <span className="inline-flex items-center gap-2">
            <span className="h-3 w-3 rounded bg-blue-600/90" /> Order
          </span>
          <span className="inline-flex items-center gap-2">
            <span className="h-3 w-3 rounded bg-blue-200 border border-blue-300" /> Buffer
          </span>
          <span className="inline-flex items-center gap-2">
            <span className="h-3 w-3 rounded bg-amber-500/90" /> Hold
          </span>
          <span className="inline-flex items-center gap-2">
            <span className="h-3 w-3 rounded bg-red-600" /> Overbooked/unassigned
          </span>
        </div>

        <div className="text-sm text-slate-600">
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

      {/* Unassigned queue */}
      {timeline.unassigned.length > 0 && (
        <div className="border border-red-200 bg-red-50 rounded-lg p-3">
          <div className="flex items-center justify-between gap-3">
            <div className="font-medium text-red-800">
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
                title={getBlockTitle(u)}
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
      <div className="border rounded-xl overflow-hidden">
        {/* Header row: dates */}
        <div className="flex bg-slate-50 border-b">
          <div className="w-44 shrink-0 px-3 py-2 text-sm font-medium text-slate-700 border-r">
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
                    <div key={d.iso} className="border-r last:border-r-0 px-2 py-2">
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
<div className="w-44 shrink-0 border-r bg-white">
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

                      const outline = isSelected ? "ring-2 ring-slate-900" : "hover:ring-2 hover:ring-slate-400";

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

                          title={getBlockTitle(b)}
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

      {/* Right drawer */}
      {selectedBlock && (
        <div className="fixed top-0 right-0 h-full w-[420px] bg-white border-l shadow-xl z-50">
          <div className="p-4 border-b flex items-start justify-between gap-3">
            <div>
              <div className="text-sm text-slate-600">{kindBadge(selectedBlock.kind)}</div>
              <div className="text-lg font-semibold">{selectedBlock.label}</div>
              <div className="text-sm text-slate-600">
                {selectedBlock.start} → {selectedBlock.end} · occ {selectedBlock.occIndex + 1}
              </div>
            </div>
            <button
              className="border rounded-md px-2 py-1 text-sm hover:bg-slate-50"
              onClick={() => setSelectedBlock(null)}
            >
              Close
            </button>
          </div>

          <div className="p-4 space-y-4">
            <div className="rounded-lg border p-3">
              <div className="text-sm font-medium mb-2">Details</div>
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

            <div className="rounded-lg border p-3">
              <div className="text-sm font-medium mb-2">Actions</div>
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


                {(selectedBlock.kind === "buffer" || selectedBlock.kind === "hold") && (
                  <button
                    className="border rounded-md px-3 py-2 text-sm hover:bg-slate-50 text-left"
                    onClick={() => {
                      alert("Stub: Release early action not implemented yet.");
                    }}
                  >
                    Release early (stub)
                  </button>
                )}

                <button
                  className="border rounded-md px-3 py-2 text-sm hover:bg-slate-50 text-left"
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

            <div className="rounded-lg border p-3">
              <div className="text-sm font-medium mb-2">Notes</div>
              <ul className="text-sm text-slate-700 list-disc pl-5 space-y-1">
                <li>
                  If orders aren’t appearing, update <code className="text-xs bg-slate-100 px-1 rounded">ORDER_STORAGE_KEYS</code>{" "}
                  to match your localStorage key.
                </li>
                <li>
                  Unassigned items indicate overbooking or lane conflicts within the window.
                </li>
                <li>
                  When you later add real unit IDs, you can replace lane labels while keeping the same allocation/persistence model.
                </li>
              </ul>
            </div>
          </div>
        </div>
      )}
    </div>
  );
}
