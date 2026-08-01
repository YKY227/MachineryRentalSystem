import type { UpdateRentalEquipmentInput } from './types';
import { normalizeEquipmentImageUrls } from './equipment-images.ts';
import { normalizeHttpResourceUrl } from './resource-urls.ts';
import { isEquipmentCatalogueStoragePath } from './catalogue-pdfs.ts';
import type {
  EquipmentSaleFulfillmentMode,
  EquipmentSalePriceMode,
  EquipmentSaleStatus,
} from '../types.ts';

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
  catalogueStoragePath?: string | null;
  catalogueFileName?: string | null;
  trainingVideoUrl?: string | null;
  keyFeatures?: string[];
  applications?: string[];
  specs?: Record<string, string>;
  isPublished?: boolean;
  displayOrder?: number | string;
  saleEnabled?: boolean;
  saleStatus?: string;
  salePriceCents?: number | string | null;
  salePriceMode?: string;
  saleCondition?: string | null;
  saleWarranty?: string | null;
  saleNotes?: string | null;
  saleFulfillmentModes?: string[] | null;
};

const SALE_STATUSES = new Set<EquipmentSaleStatus>([
  'available_for_sale',
  'sold',
  'on_request',
  'not_available',
]);
const SALE_PRICE_MODES = new Set<EquipmentSalePriceMode>(['fixed', 'request_quote']);
const SALE_FULFILLMENT_MODES = new Set<EquipmentSaleFulfillmentMode>([
  'deliver',
  'self_collect',
]);

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

function parseOptionalCents(value: number | string | null | undefined) {
  if (value === undefined) return undefined;
  if (value === null || value === '') return null;
  const parsed = typeof value === 'string' ? Number(value.trim()) : value;
  if (!Number.isFinite(parsed) || !Number.isInteger(parsed) || parsed < 0) {
    throw new Error('salePriceCents must be a whole number of cents greater than or equal to 0');
  }
  return parsed;
}

function parseSaleStatus(value: string | undefined): EquipmentSaleStatus {
  return value && SALE_STATUSES.has(value as EquipmentSaleStatus)
    ? (value as EquipmentSaleStatus)
    : 'not_available';
}

function parseSalePriceMode(value: string | undefined): EquipmentSalePriceMode {
  return value && SALE_PRICE_MODES.has(value as EquipmentSalePriceMode)
    ? (value as EquipmentSalePriceMode)
    : 'request_quote';
}

function parseSaleFulfillmentModes(value: string[] | null | undefined) {
  if (value === null) return null;
  if (!Array.isArray(value)) return undefined;
  const modes = value.filter((mode): mode is EquipmentSaleFulfillmentMode =>
    SALE_FULFILLMENT_MODES.has(mode as EquipmentSaleFulfillmentMode)
  );
  return modes.length ? [...new Set(modes)] : null;
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
  if (hasOwn(body, 'catalogueStoragePath')) {
    const path = normalizeOptionalText(body.catalogueStoragePath);
    if (path && !isEquipmentCatalogueStoragePath(path)) {
      throw new Error('Invalid equipment catalogue storage path');
    }
    patch.catalogueStoragePath = path;
  }
  if (hasOwn(body, 'catalogueFileName')) {
    patch.catalogueFileName = normalizeOptionalText(body.catalogueFileName);
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
  if (hasOwn(body, 'saleEnabled') && typeof body.saleEnabled === 'boolean') {
    patch.saleEnabled = body.saleEnabled;
  }
  if (hasOwn(body, 'saleStatus')) patch.saleStatus = parseSaleStatus(body.saleStatus);
  if (hasOwn(body, 'salePriceCents')) {
    patch.salePriceCents = parseOptionalCents(body.salePriceCents);
  }
  if (hasOwn(body, 'salePriceMode')) {
    patch.salePriceMode = parseSalePriceMode(body.salePriceMode);
  }
  if (hasOwn(body, 'saleCondition')) patch.saleCondition = normalizeOptionalText(body.saleCondition);
  if (hasOwn(body, 'saleWarranty')) patch.saleWarranty = normalizeOptionalText(body.saleWarranty);
  if (hasOwn(body, 'saleNotes')) patch.saleNotes = normalizeOptionalText(body.saleNotes);
  if (hasOwn(body, 'saleFulfillmentModes')) {
    patch.saleFulfillmentModes = parseSaleFulfillmentModes(body.saleFulfillmentModes);
  }

  return patch;
}
