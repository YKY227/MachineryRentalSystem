import { NextResponse } from "next/server";

import {
  adminUnauthorizedResponse,
  assertAdmin,
  isAdminUnauthorized,
} from "@/lib/auth/admin";
import {
  approveRentalExtension,
  rejectRentalExtension,
} from "@/lib/rental/extensions/rental-extension-service";

export const runtime = "nodejs";

type RouteContext = {
  params: Promise<{ id: string; extensionId: string }>;
};

type Body = {
  action?: "approve" | "reject";
  reviewNote?: string;
};

export async function POST(req: Request, ctx: RouteContext) {
  try {
    assertAdmin(req);
    const { extensionId } = await ctx.params;
    const body = (await req.json()) as Body;
    const action = body.action;
    if (action !== "approve" && action !== "reject") {
      return NextResponse.json({ error: "Invalid action" }, { status: 400 });
    }

    if (action === "approve") {
      const result = await approveRentalExtension({
        extensionId,
        reviewNote: body.reviewNote,
      });
      return NextResponse.json(result);
    }

    const extension = await rejectRentalExtension({
      extensionId,
      reviewNote: body.reviewNote,
    });
    return NextResponse.json({ extension });
  } catch (error) {
    if (isAdminUnauthorized(error)) return adminUnauthorizedResponse();
    const message = error instanceof Error ? error.message : "Extension review failed";
    const status = message === "Extension request not found" ? 404 : 400;
    return NextResponse.json({ error: message }, { status });
  }
}
