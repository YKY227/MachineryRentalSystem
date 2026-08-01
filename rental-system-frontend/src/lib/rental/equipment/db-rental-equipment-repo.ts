import "server-only";

import type {
  RentalEquipment,
  UpdateRentalEquipmentInput,
  UpsertRentalEquipmentInput,
} from "@/lib/rental/equipment/types";
import {
  buildRentalEquipmentPayload,
  uniqueEquipmentStrings,
} from "@/lib/rental/equipment/equipment-payload";
import type {
  EquipmentSaleFulfillmentMode,
  EquipmentSalePriceMode,
  EquipmentSaleStatus,
} from "@/lib/rental/types";
import { supabaseAdmin } from "@/lib/supabase/server";

const EQUIPMENT_TABLE = process.env.SUPABASE_RENTAL_EQUIPMENT_TABLE ?? "rental_equipment";

type RentalEquipmentRow = {
  id: string;
  slug: string;
  title: string;
  category: string;
  brand: string | null;
  model: string | null;
  description: string | null;
  short_description: string | null;
  total_units: number;
  maintenance_buffer_days: number | null;
  day_rate: string | number;
  week_rate: string | number | null;
  month_rate: string | number | null;
  min_rental_days: number;
  deposit_amount: string | number | null;
  image_url: string | null;
  image_urls: unknown;
  catalogue_url: string | null;
  training_video_url: string | null;
  key_features: unknown;
  applications: unknown;
  specifications: unknown;
  is_published: boolean;
  display_order: number | null;
  sale_enabled: boolean | null;
  sale_status: string | null;
  sale_price_cents: number | null;
  sale_price_mode: string | null;
  sale_condition: string | null;
  sale_warranty: string | null;
  sale_notes: string | null;
  sale_fulfillment_modes: unknown;
  created_at: string;
  updated_at: string;
};

const EQUIPMENT_COLUMNS = [
  "id",
  "slug",
  "title",
  "category",
  "brand",
  "model",
  "description",
  "short_description",
  "total_units",
  "maintenance_buffer_days",
  "day_rate",
  "week_rate",
  "month_rate",
  "min_rental_days",
  "deposit_amount",
  "image_url",
  "image_urls",
  "catalogue_url",
  "training_video_url",
  "key_features",
  "applications",
  "specifications",
  "is_published",
  "display_order",
  "sale_enabled",
  "sale_status",
  "sale_price_cents",
  "sale_price_mode",
  "sale_condition",
  "sale_warranty",
  "sale_notes",
  "sale_fulfillment_modes",
  "created_at",
  "updated_at",
].join(",");

function toNumber(value: string | number | null | undefined, fallback = 0) {
  if (value === null || value === undefined || value === "") return fallback;
  const parsed = Number(value);
  return Number.isFinite(parsed) ? parsed : fallback;
}

function toStringArray(value: unknown): string[] {
  if (!Array.isArray(value)) return [];
  return value
    .map((item) => (typeof item === "string" ? item.trim() : ""))
    .filter(Boolean);
}

const SALE_STATUSES = new Set<EquipmentSaleStatus>([
  "available_for_sale",
  "sold",
  "on_request",
  "not_available",
]);
const SALE_PRICE_MODES = new Set<EquipmentSalePriceMode>(["fixed", "request_quote"]);
const SALE_FULFILLMENT_MODES = new Set<EquipmentSaleFulfillmentMode>(["deliver", "self_collect"]);

function toSaleStatus(value: unknown): EquipmentSaleStatus {
  return typeof value === "string" && SALE_STATUSES.has(value as EquipmentSaleStatus)
    ? (value as EquipmentSaleStatus)
    : "not_available";
}

function toSalePriceMode(value: unknown): EquipmentSalePriceMode {
  return typeof value === "string" && SALE_PRICE_MODES.has(value as EquipmentSalePriceMode)
    ? (value as EquipmentSalePriceMode)
    : "request_quote";
}

function toSaleFulfillmentModes(value: unknown): EquipmentSaleFulfillmentMode[] | undefined {
  if (!Array.isArray(value)) return undefined;
  const modes = value.filter((item): item is EquipmentSaleFulfillmentMode =>
    typeof item === "string" && SALE_FULFILLMENT_MODES.has(item as EquipmentSaleFulfillmentMode)
  );
  return modes.length ? [...new Set(modes)] : undefined;
}

function toSpecs(value: unknown): Record<string, string> {
  if (!value || typeof value !== "object" || Array.isArray(value)) return {};

  return Object.entries(value as Record<string, unknown>).reduce<Record<string, string>>((acc, [key, raw]) => {
    const nextKey = key.trim();
    const nextValue = typeof raw === "string" ? raw.trim() : String(raw ?? "").trim();
    if (!nextKey || !nextValue) return acc;
    acc[nextKey] = nextValue;
    return acc;
  }, {});
}

function sanitizeIdSegment(value: string) {
  return value
    .trim()
    .toLowerCase()
    .replace(/[^a-z0-9]+/g, "-")
    .replace(/^-+|-+$/g, "")
    .slice(0, 80);
}

function buildSlug(input: string) {
  const slug = sanitizeIdSegment(input);
  if (!slug) throw new Error("Equipment slug could not be generated");
  return slug;
}

function buildId(title: string, slug?: string) {
  return `eq-${buildSlug(slug || title)}`;
}

function toEquipment(row: RentalEquipmentRow): RentalEquipment {
  const imageUrls = uniqueEquipmentStrings([
    ...toStringArray(row.image_urls),
    ...(row.image_url ? [row.image_url] : []),
  ]);

  const shortDesc = row.short_description?.trim() || row.description?.trim() || "";
  const description = row.description?.trim() || shortDesc;

  return {
    id: row.id,
    slug: row.slug,
    title: row.title,
    category: row.category,
    brand: row.brand ?? undefined,
    model: row.model ?? undefined,
    description: description || undefined,
    shortDesc,
    images: imageUrls,
    keyFeatures: toStringArray(row.key_features),
    applications: toStringArray(row.applications),
    specs: toSpecs(row.specifications),
    totalUnits: Math.max(0, Number(row.total_units ?? 0)),
    isPublished: row.is_published,
    maintenanceBufferDays:
      row.maintenance_buffer_days === null || row.maintenance_buffer_days === undefined
        ? undefined
        : Math.max(0, Number(row.maintenance_buffer_days)),
    pricing: {
      minDays: Math.max(1, Number(row.min_rental_days ?? 1)),
      dayRate: toNumber(row.day_rate),
      weekRate: row.week_rate === null ? undefined : toNumber(row.week_rate),
      monthRate: row.month_rate === null ? undefined : toNumber(row.month_rate),
      deposit: toNumber(row.deposit_amount),
    },
    imageUrl: imageUrls[0] ?? undefined,
    catalogueUrl: row.catalogue_url ?? undefined,
    trainingVideoUrl: row.training_video_url ?? undefined,
    displayOrder: Number(row.display_order ?? 0),
    sale: {
      enabled: Boolean(row.sale_enabled),
      status: toSaleStatus(row.sale_status),
      priceCents:
        row.sale_price_cents === null || row.sale_price_cents === undefined
          ? undefined
          : Math.max(0, Math.floor(Number(row.sale_price_cents))),
      priceMode: toSalePriceMode(row.sale_price_mode),
      condition: row.sale_condition ?? undefined,
      warranty: row.sale_warranty ?? undefined,
      notes: row.sale_notes ?? undefined,
      fulfillmentModes: toSaleFulfillmentModes(row.sale_fulfillment_modes),
    },
    createdAt: row.created_at,
    updatedAt: row.updated_at,
  };
}

async function getBy(column: "id" | "slug", value: string, scope: "admin" | "public") {
  const supabase = supabaseAdmin();
  let query = supabase.from(EQUIPMENT_TABLE).select(EQUIPMENT_COLUMNS).eq(column, value);
  if (scope === "public") query = query.eq("is_published", true);

  const { data, error } = await query.maybeSingle<RentalEquipmentRow>();
  if (error) throw new Error(`Rental equipment read failed: ${error.message}`);
  return data ? toEquipment(data) : null;
}

export const dbRentalEquipmentRepo = {
  buildDefaultId(input: { title: string; slug?: string }) {
    return buildId(input.title, input.slug);
  },

  async listAdmin(): Promise<RentalEquipment[]> {
    const supabase = supabaseAdmin();
    const { data, error } = await supabase
      .from(EQUIPMENT_TABLE)
      .select(EQUIPMENT_COLUMNS)
      .order("display_order", { ascending: true })
      .order("updated_at", { ascending: false });

    if (error) throw new Error(`Rental equipment list failed: ${error.message}`);
    return ((data ?? []) as unknown as RentalEquipmentRow[]).map(toEquipment);
  },

  async listPublic(): Promise<RentalEquipment[]> {
    const supabase = supabaseAdmin();
    const { data, error } = await supabase
      .from(EQUIPMENT_TABLE)
      .select(EQUIPMENT_COLUMNS)
      .eq("is_published", true)
      .order("display_order", { ascending: true })
      .order("updated_at", { ascending: false });

    if (error) throw new Error(`Public rental equipment list failed: ${error.message}`);
    return ((data ?? []) as unknown as RentalEquipmentRow[]).map(toEquipment);
  },

  async getById(id: string) {
    return getBy("id", id, "admin");
  },

  async getBySlug(slug: string) {
    return getBy("slug", slug, "admin");
  },

  async getPublicByIdOrSlug(value: string) {
    const byId = await getBy("id", value, "public");
    if (byId) return byId;
    return getBy("slug", value, "public");
  },

  async create(input: UpsertRentalEquipmentInput): Promise<RentalEquipment> {
    const id = input.id?.trim() || buildId(input.title, input.slug);
    const payload = {
      id,
      slug: buildSlug(input.slug || input.title),
      created_at: new Date().toISOString(),
      ...buildRentalEquipmentPayload(input),
    };

    const supabase = supabaseAdmin();
    const { data, error } = await supabase
      .from(EQUIPMENT_TABLE)
      .insert(payload)
      .select(EQUIPMENT_COLUMNS)
      .single<RentalEquipmentRow>();

    if (error) throw new Error(`Rental equipment create failed: ${error.message}`);
    return toEquipment(data);
  },

  async update(id: string, input: UpdateRentalEquipmentInput): Promise<RentalEquipment> {
    const supabase = supabaseAdmin();
    const { data, error } = await supabase
      .from(EQUIPMENT_TABLE)
      .update({
        ...(input.slug !== undefined ? { slug: buildSlug(input.slug || input.title || "") } : {}),
        ...buildRentalEquipmentPayload(input),
      })
      .eq("id", id)
      .select(EQUIPMENT_COLUMNS)
      .single<RentalEquipmentRow>();

    if (error) throw new Error(`Rental equipment update failed: ${error.message}`);
    return toEquipment(data);
  },
};
