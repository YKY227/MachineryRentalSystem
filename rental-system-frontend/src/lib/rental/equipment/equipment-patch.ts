import type { UpdateRentalEquipmentInput } from './types';
import { normalizeEquipmentImageUrls } from './equipment-images.ts';
import { normalizeHttpResourceUrl } from './resource-urls.ts';

export type EquipmentPatchBody = {
  slug?: string | null;
  title?: string | null;
  category?: string | null;
  brand?: string | null;
  model?: string | null;
  description?: string | null;
  shortDesc?: string | null;
  totalUnits?: number | string;
  maintenanceBufferDays?: number | string;
  dayRate?: number | string | null;
  weekRate?: number | string | null;
  monthRate?: number | string | null;
  minDays?: number | string;
  depositAmount?: number | string | null;
  imageUrls?: string[];
  catalogueUrl?: string | null;
  trainingVideoUrl?: string | null;
  keyFeatures?: string[];
  applications?: string[];
  specs?: Record<string, string>;
  isPublished?: boolean;
  displayOrder?: number | string;
};

function hasOwn(body: EquipmentPatchBody, key: keyof EquipmentPatchBody) {
  return Object.prototype.hasOwnProperty.call(body, key);
}

function normalizeOptionalText(value: string | null | undefined) {
  if (value === undefined) return undefined;
  return value === null ? '' : value.trim();
}

function normalizeOptionalRequiredText(value: string | null | undefined) {
  const normalized = normalizeOptionalText(value);
  return normalized || undefined;
}

function parseOptionalInteger(value: number | string | undefined, field: string, minimum: number) {
  if (value === undefined) return undefined;
  const parsed = typeof value === 'string' ? Number(value.trim()) : value;
  if (!Number.isFinite(parsed)) throw new Error(`${field} must be a valid number`);
  if (parsed < minimum) throw new Error(`${field} must be at least ${minimum}`);
  return Math.floor(parsed);
}

function parseOptionalMoney(
  value: number | string | null | undefined,
  field: string,
  opts: { minimum?: number; allowNull?: boolean } = {}
) {
  if (value === undefined) return undefined;
  if (value === null || value === '') return opts.allowNull ? null : undefined;
  const parsed = typeof value === 'string' ? Number(value.trim()) : value;
  if (!Number.isFinite(parsed)) throw new Error(`${field} must be a valid amount`);
  const minimum = opts.minimum ?? 0;
  if (parsed < minimum) throw new Error(`${field} cannot be less than ${minimum}`);
  return Number(parsed.toFixed(2));
}

function parseStringArray(value: string[] | undefined) {
  if (!Array.isArray(value)) return undefined;
  const seen = new Set<string>();
  const next: string[] = [];
  for (const item of value) {
    const trimmed = typeof item === 'string' ? item.trim() : '';
    const key = trimmed.toLowerCase();
    if (!trimmed || seen.has(key)) continue;
    seen.add(key);
    next.push(trimmed);
  }
  return next;
}

function parseSpecs(value: EquipmentPatchBody['specs']) {
  if (value === undefined) return undefined;
  if (!value || typeof value !== 'object' || Array.isArray(value)) return {};
  return Object.entries(value).reduce<Record<string, string>>((acc, [key, raw]) => {
    const nextKey = key.trim();
    const nextValue = String(raw ?? '').trim();
    if (!nextKey || !nextValue) return acc;
    acc[nextKey] = nextValue;
    return acc;
  }, {});
}

export function normalizeEquipmentPatchBody(body: EquipmentPatchBody) {
  const patch: UpdateRentalEquipmentInput = {};

  if (hasOwn(body, 'slug')) patch.slug = normalizeOptionalRequiredText(body.slug);
  if (hasOwn(body, 'title')) patch.title = normalizeOptionalRequiredText(body.title);
  if (hasOwn(body, 'category')) patch.category = normalizeOptionalRequiredText(body.category);
  if (hasOwn(body, 'brand')) patch.brand = normalizeOptionalText(body.brand);
  if (hasOwn(body, 'model')) patch.model = normalizeOptionalText(body.model);
  if (hasOwn(body, 'description')) patch.description = normalizeOptionalText(body.description);
  if (hasOwn(body, 'shortDesc') || hasOwn(body, 'description')) {
    patch.shortDesc = normalizeOptionalText(body.shortDesc ?? body.description);
  }
  if (hasOwn(body, 'totalUnits')) {
    patch.totalUnits = parseOptionalInteger(body.totalUnits, 'totalUnits', 0);
  }
  if (hasOwn(body, 'maintenanceBufferDays')) {
    patch.maintenanceBufferDays = parseOptionalInteger(
      body.maintenanceBufferDays,
      'maintenanceBufferDays',
      0
    );
  }
  if (hasOwn(body, 'dayRate')) {
    patch.dayRate = parseOptionalMoney(body.dayRate, 'dayRate') ?? undefined;
  }
  if (hasOwn(body, 'weekRate')) {
    patch.weekRate = parseOptionalMoney(body.weekRate, 'weekRate', { allowNull: true });
  }
  if (hasOwn(body, 'monthRate')) {
    patch.monthRate = parseOptionalMoney(body.monthRate, 'monthRate', { allowNull: true });
  }
  if (hasOwn(body, 'minDays')) {
    patch.minDays = parseOptionalInteger(body.minDays, 'minDays', 1);
  }
  if (hasOwn(body, 'depositAmount')) {
    patch.depositAmount =
      parseOptionalMoney(body.depositAmount, 'depositAmount') ?? undefined;
  }
  if (hasOwn(body, 'imageUrls')) {
    patch.imageUrls = Array.isArray(body.imageUrls)
      ? normalizeEquipmentImageUrls(body.imageUrls)
      : undefined;
  }
  if (hasOwn(body, 'catalogueUrl')) {
    patch.catalogueUrl = normalizeHttpResourceUrl(body.catalogueUrl, 'Catalogue URL');
  }
  if (hasOwn(body, 'trainingVideoUrl')) {
    patch.trainingVideoUrl = normalizeHttpResourceUrl(
      body.trainingVideoUrl,
      'Training video URL'
    );
  }
  if (hasOwn(body, 'keyFeatures')) patch.keyFeatures = parseStringArray(body.keyFeatures);
  if (hasOwn(body, 'applications')) patch.applications = parseStringArray(body.applications);
  if (hasOwn(body, 'specs')) patch.specs = parseSpecs(body.specs);
  if (hasOwn(body, 'isPublished') && typeof body.isPublished === 'boolean') {
    patch.isPublished = body.isPublished;
  }
  if (hasOwn(body, 'displayOrder')) {
    patch.displayOrder = parseOptionalInteger(body.displayOrder, 'displayOrder', 0);
  }

  return patch;
}
