import { NextResponse } from "next/server";

import {
  adminUnauthorizedResponse,
  assertAdmin,
  isAdminUnauthorized,
} from "@/lib/auth/admin";
import {
  dbOrderRepo,
  type UpdateRentalOrderOperationalInput,
} from "@/lib/rental/orders/db-order-repo";
import type {
  RentalOrderInspectionStatus,
  RentalOrderReturnStatus,
} from "@/lib/rental/orders/types";

export const runtime = "nodejs";

type RouteContext = {
  params: Promise<{ id: string }>;
};

type Body = {
  returnStatus?: RentalOrderReturnStatus;
  returnedAt?: string | null;
  returnNotes?: string | null;
  inspectionStatus?: RentalOrderInspectionStatus;
  inspectionNotes?: string | null;
  markCompleted?: boolean;
};

function requireOrderEnv() {
  const required = ["SUPABASE_URL", "SUPABASE_SERVICE_ROLE_KEY"] as const;
  const missing = required.filter((name) => !process.env[name]);
  if (missing.length) {
    throw new Error(`Missing required env vars: ${missing.join(", ")}`);
  }
}

const RETURN_STATUSES = new Set<RentalOrderReturnStatus>(["out", "returned", "completed"]);
const INSPECTION_STATUSES = new Set<RentalOrderInspectionStatus>([
  "not_started",
  "pending",
  "passed",
  "issues_found",
]);

export async function POST(req: Request, ctx: RouteContext) {
  try {
    assertAdmin(req);
    requireOrderEnv();
    const { id } = await ctx.params;
    const order = await dbOrderRepo.get(id);
    if (!order) return NextResponse.json({ error: "Order not found" }, { status: 404 });

    const body = (await req.json()) as Body;
    const nextReturnStatus = body.returnStatus ?? order.returnStatus;
    const nextInspectionStatus = body.inspectionStatus ?? order.inspectionStatus;

    if (!RETURN_STATUSES.has(nextReturnStatus)) {
      return NextResponse.json({ error: "Invalid return status" }, { status: 400 });
    }
    if (!INSPECTION_STATUSES.has(nextInspectionStatus)) {
      return NextResponse.json({ error: "Invalid inspection status" }, { status: 400 });
    }

    const now = new Date().toISOString();
    const returnedAt =
      nextReturnStatus === "out"
        ? null
        : body.returnedAt === undefined
          ? order.returnedAt ?? now
          : body.returnedAt;

    let completedAt: string | null | undefined = order.completedAt ?? null;
    let normalizedReturnStatus = nextReturnStatus;
    if (body.markCompleted) {
      if ((nextReturnStatus === "out" && !returnedAt) || nextInspectionStatus === "not_started" || nextInspectionStatus === "pending") {
        return NextResponse.json(
          { error: "Inspection must be completed before closing the workflow" },
          { status: 400 }
        );
      }
      normalizedReturnStatus = "completed";
      completedAt = order.completedAt ?? now;
    } else if (nextReturnStatus !== "completed") {
      completedAt = null;
    }

    const updated = await dbOrderRepo.updateOperational(id, {
      returnStatus: normalizedReturnStatus,
      returnedAt,
      returnNotes: body.returnNotes ?? order.returnNotes ?? null,
      inspectionStatus: nextInspectionStatus,
      inspectionNotes: body.inspectionNotes ?? order.inspectionNotes ?? null,
      completedAt,
    } satisfies UpdateRentalOrderOperationalInput);

    return NextResponse.json({ order: updated });
  } catch (error) {
    if (isAdminUnauthorized(error)) return adminUnauthorizedResponse();
    const message = error instanceof Error ? error.message : "Order operations update failed";
    return NextResponse.json({ error: message }, { status: 400 });
  }
}
