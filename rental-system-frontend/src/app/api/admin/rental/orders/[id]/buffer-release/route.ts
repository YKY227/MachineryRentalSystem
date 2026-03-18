import { NextResponse } from "next/server";

import {
  adminUnauthorizedResponse,
  assertAdmin,
  isAdminUnauthorized,
} from "@/lib/auth/admin";
import { dbOrderBufferOverrideRepo } from "@/lib/rental/orders/db-order-buffer-override-repo";
import { dbOrderRepo } from "@/lib/rental/orders/db-order-repo";

export const runtime = "nodejs";

type RouteContext = {
  params: Promise<{ id: string }>;
};

type BufferReleaseBody = {
  orderUnitIndex?: number | string;
  overrideBufferEndDate?: string;
  reason?: string | null;
  notes?: string | null;
};

function parseInteger(value: number | string | undefined, field: string, minimum: number) {
  const parsed = typeof value === "number" ? value : typeof value === "string" ? Number(value.trim()) : Number.NaN;
  if (!Number.isFinite(parsed)) throw new Error(`${field} must be a valid integer`);
  if (parsed < minimum) throw new Error(`${field} must be at least ${minimum}`);
  return Math.floor(parsed);
}

function normalizeDate(value: string | undefined, field: string) {
  const trimmed = String(value ?? "").trim();
  if (!trimmed) throw new Error(`${field} is required`);
  return trimmed.slice(0, 10);
}

function addDaysISO(dateISO: string, days: number) {
  const date = new Date(`${dateISO}T12:00:00`);
  if (Number.isNaN(date.getTime())) return dateISO;
  date.setDate(date.getDate() + days);
  return date.toISOString().slice(0, 10);
}

export async function POST(req: Request, ctx: RouteContext) {
  try {
    assertAdmin(req);
    const { id } = await ctx.params;
    const order = await dbOrderRepo.get(id);
    if (!order) return NextResponse.json({ error: "Order not found" }, { status: 404 });
    if (order.returnStatus === "out") {
      return NextResponse.json(
        { error: "Buffer can only be released after the rental is returned" },
        { status: 400 }
      );
    }

    const body = (await req.json()) as BufferReleaseBody;
    const orderUnitIndex = parseInteger(body.orderUnitIndex, "orderUnitIndex", 0);
    if (orderUnitIndex >= Math.max(1, Number(order.qty ?? 0))) {
      throw new Error("orderUnitIndex is outside the booked quantity range");
    }

    const overrideBufferEndDate = normalizeDate(body.overrideBufferEndDate, "overrideBufferEndDate");
    const appliedBufferDays = Math.max(0, Number(order.maintenanceBufferDaysApplied ?? 0));
    const defaultBufferEndDate = addDaysISO(order.end, appliedBufferDays);
    if (overrideBufferEndDate < order.end) {
      throw new Error("overrideBufferEndDate cannot be earlier than the rental end date");
    }
    if (overrideBufferEndDate > defaultBufferEndDate) {
      throw new Error("overrideBufferEndDate cannot extend beyond the originally applied buffer end");
    }

    const bufferOverride = await dbOrderBufferOverrideRepo.upsertActive({
      orderId: order.id,
      orderUnitIndex,
      overrideBufferEndDate,
      reason: body.reason ?? undefined,
      notes: body.notes ?? undefined,
    });

    return NextResponse.json({
      bufferOverride,
      appliedBufferDays,
      defaultBufferEndDate,
    });
  } catch (error) {
    if (isAdminUnauthorized(error)) return adminUnauthorizedResponse();
    const message = error instanceof Error ? error.message : "Buffer release failed";
    return NextResponse.json({ error: message }, { status: 400 });
  }
}
