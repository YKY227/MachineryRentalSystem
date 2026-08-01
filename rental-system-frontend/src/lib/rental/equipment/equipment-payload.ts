import type {
  UpdateRentalEquipmentInput,
  UpsertRentalEquipmentInput,
} from './types';
import { normalizeEquipmentImageUrls } from './equipment-images.ts';

function trimOrNull(value?: string | null) {
  const trimmed = value?.trim();
  return trimmed ? trimmed : null;
}

export function uniqueEquipmentStrings(values?: string[]) {
  const seen = new Set<string>();
  const next: string[] = [];

  for (const value of values ?? []) {
    const trimmed = value.trim();
    const key = trimmed.toLowerCase();
    if (!trimmed || seen.has(key)) continue;
    seen.add(key);
    next.push(trimmed);
  }

  return next;
}

export function buildRentalEquipmentPayload(
  input: UpsertRentalEquipmentInput | UpdateRentalEquipmentInput,
  updatedAt = new Date().toISOString()
) {
  const payload: Record<string, unknown> = { updated_at: updatedAt };

  if (input.title !== undefined) payload.title = input.title.trim();
  if (input.category !== undefined) payload.category = input.category.trim();
  if (input.brand !== undefined) payload.brand = trimOrNull(input.brand);
  if (input.model !== undefined) payload.model = trimOrNull(input.model);
  if (input.description !== undefined) payload.description = trimOrNull(input.description);
  if (input.shortDesc !== undefined) payload.short_description = trimOrNull(input.shortDesc);
  if (input.totalUnits !== undefined) {
    payload.total_units = Math.max(0, Math.floor(Number(input.totalUnits)));
  }
  if (input.maintenanceBufferDays !== undefined) {
    payload.maintenance_buffer_days = Math.max(
      0,
      Math.floor(Number(input.maintenanceBufferDays))
    );
  }
  if (input.dayRate !== undefined) {
    payload.day_rate = Number(Number(input.dayRate).toFixed(2));
  }
  if (input.weekRate !== undefined) {
    payload.week_rate =
      input.weekRate === null ? null : Number(Number(input.weekRate).toFixed(2));
  }
  if (input.monthRate !== undefined) {
    payload.month_rate =
      input.monthRate === null ? null : Number(Number(input.monthRate).toFixed(2));
  }
  if (input.minDays !== undefined) {
    payload.min_rental_days = Math.max(1, Math.floor(Number(input.minDays)));
  }
  if (input.depositAmount !== undefined) {
    payload.deposit_amount = Number(Number(input.depositAmount).toFixed(2));
  }
  if (input.imageUrls !== undefined) {
    const imageUrls = normalizeEquipmentImageUrls(input.imageUrls);
    payload.image_urls = imageUrls;
    payload.image_url = imageUrls[0] ?? null;
  }
  if (input.catalogueUrl !== undefined) {
    payload.catalogue_url = trimOrNull(input.catalogueUrl);
  }
  if (input.trainingVideoUrl !== undefined) {
    payload.training_video_url = trimOrNull(input.trainingVideoUrl);
  }
  if (input.keyFeatures !== undefined) {
    payload.key_features = uniqueEquipmentStrings(input.keyFeatures);
  }
  if (input.applications !== undefined) {
    payload.applications = uniqueEquipmentStrings(input.applications);
  }
  if (input.specs !== undefined) payload.specifications = input.specs;
  if (input.isPublished !== undefined) payload.is_published = input.isPublished;
  if (input.displayOrder !== undefined) {
    payload.display_order = Math.floor(Number(input.displayOrder) || 0);
  }

  return payload;
}
