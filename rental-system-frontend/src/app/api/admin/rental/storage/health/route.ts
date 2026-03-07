import { NextResponse } from "next/server";
import { createClient } from "@supabase/supabase-js";
import {
  adminUnauthorizedResponse,
  assertAdmin,
  isAdminUnauthorized,
} from "@/lib/auth/admin";

export const runtime = "nodejs";

function mustEnv(name: string) {
  const v = process.env[name];
  if (!v) throw new Error(`Missing env: ${name}`);
  return v;
}

export async function GET(req: Request) {
  try {
    assertAdmin(req);
    const url = mustEnv("SUPABASE_URL");
    const key = mustEnv("SUPABASE_SERVICE_ROLE_KEY");
    const bucket = mustEnv("SUPABASE_STORAGE_BUCKET");

    const supabase = createClient(url, key, { auth: { persistSession: false } });

    // list bucket objects (root)
    const { data, error } = await supabase.storage.from(bucket).list("", { limit: 1 });

    if (error) throw new Error(error.message);

    return NextResponse.json({ ok: true, bucket, sampleCount: data?.length ?? 0 });
  } catch (e) {
    if (isAdminUnauthorized(e)) return adminUnauthorizedResponse();
    return NextResponse.json(
      { ok: false, error: e instanceof Error ? e.message : "unknown" },
      { status: 500 }
    );
  }
}
