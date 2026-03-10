import { NextResponse } from "next/server";

import {
  adminUnauthorizedResponse,
  assertAdmin,
  isAdminUnauthorized,
} from "@/lib/auth/admin";
import { dbRentalEquipmentRepo } from "@/lib/rental/equipment/db-rental-equipment-repo";
import { buildSeedRentalEquipmentImportRecords } from "@/lib/rental/equipment/seed-import";

export const runtime = "nodejs";

type ImportOutcome = {
  legacyId: string;
  slug: string;
  status: "inserted" | "skipped";
  reason?: string;
  equipmentId?: string;
};

export async function POST(req: Request) {
  try {
    assertAdmin(req);

    const records = buildSeedRentalEquipmentImportRecords();
    const outcomes: ImportOutcome[] = [];

    for (const record of records) {
      const existingById = await dbRentalEquipmentRepo.getById(record.legacyId);
      if (existingById) {
        outcomes.push({
          legacyId: record.legacyId,
          slug: record.slug,
          status: "skipped",
          reason: "existing_id",
          equipmentId: existingById.id,
        });
        continue;
      }

      const existingBySlug = await dbRentalEquipmentRepo.getBySlug(record.slug);
      if (existingBySlug) {
        outcomes.push({
          legacyId: record.legacyId,
          slug: record.slug,
          status: "skipped",
          reason: "existing_slug",
          equipmentId: existingBySlug.id,
        });
        continue;
      }

      const created = await dbRentalEquipmentRepo.create(record.input);
      outcomes.push({
        legacyId: record.legacyId,
        slug: record.slug,
        status: "inserted",
        equipmentId: created.id,
      });
    }

    const inserted = outcomes.filter((item) => item.status === "inserted").length;
    const skipped = outcomes.filter((item) => item.status === "skipped").length;

    return NextResponse.json({
      importedFrom: "seed_equipment",
      mergePolicy: "seed_missing_rows_only_skip_existing_id_or_slug",
      inserted,
      updated: 0,
      skipped,
      outcomes,
    });
  } catch (error) {
    if (isAdminUnauthorized(error)) return adminUnauthorizedResponse();
    const message = error instanceof Error ? error.message : "Equipment seed import failed";
    return NextResponse.json({ error: message }, { status: 400 });
  }
}
