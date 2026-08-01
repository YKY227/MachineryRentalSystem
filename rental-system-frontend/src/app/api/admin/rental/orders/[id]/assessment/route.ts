import { NextResponse } from "next/server";

import {
  adminUnauthorizedResponse,
  assertAdmin,
  isAdminUnauthorized,
} from "@/lib/auth/admin";
import {
  rentalDamageAssessmentService,
  type RentalDamageAssessmentMutationInput,
} from "@/lib/rental/damage-assessments/damage-assessment-service";

export const runtime = "nodejs";

type RouteContext = {
  params: Promise<{ id: string }>;
};

function requireOrderEnv() {
  const required = ["SUPABASE_URL", "SUPABASE_SERVICE_ROLE_KEY"] as const;
  const missing = required.filter((name) => !process.env[name]);
  if (missing.length) {
    throw new Error(`Missing required env vars: ${missing.join(", ")}`);
  }
}

export async function GET(req: Request, ctx: RouteContext) {
  try {
    assertAdmin(req);
    requireOrderEnv();
    const { id } = await ctx.params;
    const assessment = await rentalDamageAssessmentService.getByOrderId(id);
    const summary = await rentalDamageAssessmentService.getSummaryByOrderId(id);
    return NextResponse.json({ assessment, summary });
  } catch (error) {
    if (isAdminUnauthorized(error)) return adminUnauthorizedResponse();
    const message = error instanceof Error ? error.message : "Damage assessment read failed";
    return NextResponse.json({ error: message }, { status: 400 });
  }
}

export async function POST(req: Request, ctx: RouteContext) {
  try {
    assertAdmin(req);
    requireOrderEnv();
    const { id } = await ctx.params;
    const body = ((await req.json().catch(() => ({}))) ?? {}) as RentalDamageAssessmentMutationInput;
    const assessment = await rentalDamageAssessmentService.saveDraft({
      orderId: id,
      data: body,
    });
    const summary = await rentalDamageAssessmentService.getSummaryByOrderId(id);
    return NextResponse.json({ assessment, summary });
  } catch (error) {
    if (isAdminUnauthorized(error)) return adminUnauthorizedResponse();
    const message = error instanceof Error ? error.message : "Damage assessment save failed";
    return NextResponse.json({ error: message }, { status: 400 });
  }
}
