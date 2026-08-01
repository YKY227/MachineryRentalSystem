import { NextResponse } from "next/server";
import {
  adminUnauthorizedResponse,
  assertAdmin,
  isAdminUnauthorized,
} from "@/lib/auth/admin";
import {
  supabaseAdmin,
  supabaseBucket,
  supabaseEquipmentImagesBucket,
} from "@/lib/supabase/server";

export const runtime = "nodejs";

export async function GET(req: Request) {
  try {
    assertAdmin(req);
    const supabase = supabaseAdmin();
    const bucket = supabaseBucket();
    const equipmentImagesBucket = supabaseEquipmentImagesBucket();

    const [pdfListResult, equipmentBucketResult, equipmentListResult] = await Promise.all([
      supabase.storage.from(bucket).list("", { limit: 1 }),
      supabase.storage.getBucket(equipmentImagesBucket),
      supabase.storage.from(equipmentImagesBucket).list("equipment", { limit: 1 }),
    ]);

    if (pdfListResult.error) throw new Error(pdfListResult.error.message);
    if (equipmentBucketResult.error) throw new Error(equipmentBucketResult.error.message);
    if (equipmentListResult.error) throw new Error(equipmentListResult.error.message);
    if (!equipmentBucketResult.data.public) {
      throw new Error(`Equipment image bucket ${equipmentImagesBucket} must be public`);
    }

    return NextResponse.json({
      ok: true,
      bucket,
      sampleCount: pdfListResult.data?.length ?? 0,
      equipmentImages: {
        bucket: equipmentImagesBucket,
        public: equipmentBucketResult.data.public,
        sampleCount: equipmentListResult.data?.length ?? 0,
      },
    });
  } catch (e) {
    if (isAdminUnauthorized(e)) return adminUnauthorizedResponse();
    return NextResponse.json(
      { ok: false, error: e instanceof Error ? e.message : "unknown" },
      { status: 500 }
    );
  }
}
