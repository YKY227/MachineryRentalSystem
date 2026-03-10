import "server-only";

import { seedEquipment } from "@/lib/rental/seed-equipment";
import type { UpsertRentalEquipmentInput } from "@/lib/rental/equipment/types";

export type SeedRentalEquipmentRecord = {
  legacyId: string;
  slug: string;
  input: UpsertRentalEquipmentInput;
};

export function buildSeedRentalEquipmentImportRecords(): SeedRentalEquipmentRecord[] {
  return seedEquipment.map((item, index) => ({
    legacyId: item.id,
    slug: item.slug?.trim() || item.id.replace(/^eq-/, ""),
    input: {
      id: item.id,
      slug: item.slug?.trim() || item.id.replace(/^eq-/, ""),
      title: item.title,
      category: item.category,
      brand: item.brand,
      model: item.model,
      description: item.description ?? item.shortDesc,
      shortDesc: item.shortDesc,
      totalUnits: Math.max(0, Number(item.totalUnits ?? 0)),
      maintenanceBufferDays: Math.max(0, Number(item.maintenanceBufferDays ?? 7)),
      dayRate: Math.max(0, Number(item.pricing.dayRate ?? 0)),
      weekRate:
        item.pricing.weekRate === undefined ? undefined : Math.max(0, Number(item.pricing.weekRate ?? 0)),
      monthRate:
        item.pricing.monthRate === undefined ? undefined : Math.max(0, Number(item.pricing.monthRate ?? 0)),
      minDays: Math.max(1, Number(item.pricing.minDays ?? 1)),
      depositAmount: Math.max(0, Number(item.pricing.deposit ?? 0)),
      imageUrls: item.images ?? [],
      catalogueUrl: item.catalogueUrl,
      trainingVideoUrl: item.trainingVideoUrl,
      keyFeatures: item.keyFeatures ?? [],
      applications: item.applications ?? [],
      specs: item.specs ?? {},
      isPublished: item.isPublished,
      displayOrder: item.displayOrder ?? index,
    },
  }));
}
