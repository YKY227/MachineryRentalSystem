import "server-only";

import type {
  RentalEquipment,
  UpdateRentalEquipmentInput,
  UpsertRentalEquipmentInput,
} from "@/lib/rental/equipment/types";
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

function trimOrNull(value?: string | null) {
  const trimmed = value?.trim();
  return trimmed ? trimmed : null;
}

function uniqueStrings(values?: string[]) {
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
  const imageUrls = uniqueStrings([
    ...toStringArray(row.image_urls),
    ...(row.image_url ? [row.image_url] : []),
  ]);

  const shortDesc = trimOrNull(row.short_description) ?? trimOrNull(row.description) ?? "";
  const description = trimOrNull(row.description) ?? shortDesc;

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
    createdAt: row.created_at,
    updatedAt: row.updated_at,
  };
}

function toPayload(input: UpsertRentalEquipmentInput | UpdateRentalEquipmentInput) {
  const payload: Record<string, unknown> = {
    updated_at: new Date().toISOString(),
  };

  if ("title" in input && input.title !== undefined) payload.title = input.title.trim();
  if ("slug" in input && input.slug !== undefined) payload.slug = buildSlug(input.slug || input.title || "");
  if ("category" in input && input.category !== undefined) payload.category = input.category.trim();
  if ("brand" in input) payload.brand = trimOrNull(input.brand);
  if ("model" in input) payload.model = trimOrNull(input.model);
  if ("description" in input) payload.description = trimOrNull(input.description);
  if ("shortDesc" in input) payload.short_description = trimOrNull(input.shortDesc);
  if ("totalUnits" in input && input.totalUnits !== undefined) {
    payload.total_units = Math.max(0, Math.floor(Number(input.totalUnits)));
  }
  if ("maintenanceBufferDays" in input && input.maintenanceBufferDays !== undefined) {
    payload.maintenance_buffer_days = Math.max(0, Math.floor(Number(input.maintenanceBufferDays)));
  }
  if ("dayRate" in input && input.dayRate !== undefined) {
    payload.day_rate = Number(Number(input.dayRate).toFixed(2));
  }
  if ("weekRate" in input) {
    payload.week_rate = input.weekRate === null || input.weekRate === undefined ? null : Number(Number(input.weekRate).toFixed(2));
  }
  if ("monthRate" in input) {
    payload.month_rate =
      input.monthRate === null || input.monthRate === undefined ? null : Number(Number(input.monthRate).toFixed(2));
  }
  if ("minDays" in input && input.minDays !== undefined) {
    payload.min_rental_days = Math.max(1, Math.floor(Number(input.minDays)));
  }
  if ("depositAmount" in input && input.depositAmount !== undefined) {
    payload.deposit_amount = Number(Number(input.depositAmount).toFixed(2));
  }
  if ("imageUrls" in input && input.imageUrls !== undefined) {
    const imageUrls = uniqueStrings(input.imageUrls);
    payload.image_urls = imageUrls;
    payload.image_url = imageUrls[0] ?? null;
  }
  if ("catalogueUrl" in input) payload.catalogue_url = trimOrNull(input.catalogueUrl);
  if ("trainingVideoUrl" in input) payload.training_video_url = trimOrNull(input.trainingVideoUrl);
  if ("keyFeatures" in input && input.keyFeatures !== undefined) {
    payload.key_features = uniqueStrings(input.keyFeatures);
  }
  if ("applications" in input && input.applications !== undefined) {
    payload.applications = uniqueStrings(input.applications);
  }
  if ("specs" in input && input.specs !== undefined) payload.specifications = input.specs;
  if ("isPublished" in input && input.isPublished !== undefined) payload.is_published = input.isPublished;
  if ("displayOrder" in input && input.displayOrder !== undefined) {
    payload.display_order = Math.floor(Number(input.displayOrder) || 0);
  }

  return payload;
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
      ...toPayload(input),
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
      .update(toPayload(input))
      .eq("id", id)
      .select(EQUIPMENT_COLUMNS)
      .single<RentalEquipmentRow>();

    if (error) throw new Error(`Rental equipment update failed: ${error.message}`);
    return toEquipment(data);
  },
};
