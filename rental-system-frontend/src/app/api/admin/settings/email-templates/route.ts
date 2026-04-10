import { NextResponse } from "next/server";

import {
  adminUnauthorizedResponse,
  assertAdmin,
  isAdminUnauthorized,
} from "@/lib/auth/admin";
import { listAdminEmailTemplates } from "@/lib/email/email-template-registry";

export const runtime = "nodejs";
export const dynamic = "force-dynamic";

const NO_STORE_HEADERS = {
  "Cache-Control": "no-store, no-cache, must-revalidate, proxy-revalidate",
  Pragma: "no-cache",
  Expires: "0",
};

export async function GET(req: Request) {
  try {
    assertAdmin(req);
    const templates = await listAdminEmailTemplates();
    return NextResponse.json(
      { templates },
      {
        headers: NO_STORE_HEADERS,
      }
    );
  } catch (error) {
    if (isAdminUnauthorized(error)) return adminUnauthorizedResponse();
    const message = error instanceof Error ? error.message : "Email templates load failed";
    return NextResponse.json({ error: message }, { status: 400 });
  }
}
