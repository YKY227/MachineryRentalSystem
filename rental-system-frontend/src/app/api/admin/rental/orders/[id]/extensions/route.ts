import { NextResponse } from "next/server";

import {
  adminUnauthorizedResponse,
  assertAdmin,
  isAdminUnauthorized,
} from "@/lib/auth/admin";
import { dbRentalOrderExtensionRepo } from "@/lib/rental/extensions/db-rental-order-extension-repo";

export const runtime = "nodejs";

type RouteContext = {
  params: Promise<{ id: string }>;
};

export async function GET(req: Request, ctx: RouteContext) {
  try {
    assertAdmin(req);
    const { id } = await ctx.params;
    const extensions = await dbRentalOrderExtensionRepo.listByOrderId(id);
    return NextResponse.json({ extensions });
  } catch (error) {
    if (isAdminUnauthorized(error)) return adminUnauthorizedResponse();
    const message = error instanceof Error ? error.message : "Extension list failed";
    return NextResponse.json({ error: message }, { status: 400 });
  }
}
