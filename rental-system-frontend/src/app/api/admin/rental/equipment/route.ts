import { NextResponse } from "next/server";

import {
  adminUnauthorizedResponse,
  assertAdmin,
  isAdminUnauthorized,
} from "@/lib/auth/admin";
import {
  dbRentalEquipmentRepo,
} from "@/lib/rental/equipment/db-rental-equipment-repo";
import type { UpsertRentalEquipmentInput } from "@/lib/rental/equipment/types";
import type {
  EquipmentSaleFulfillmentMode,
  EquipmentSalePriceMode,
  EquipmentSaleStatus,
} from "@/lib/rental/types";

export const runtime = "nodejs";

type EquipmentBody = {
  slug?: string;
  title?: string;
  category?: string;
  brand?: string | null;
  model?: string | null;
  description?: string | null;
  shortDesc?: string | null;
  totalUnits?: number | string;
  maintenanceBufferDays?: number | string;
  dayRate?: number | string;
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
  "available_for_sale",
  "sold",
  "on_request",
  "not_available",
]);
const SALE_PRICE_MODES = new Set<EquipmentSalePriceMode>(["fixed", "request_quote"]);
const SALE_FULFILLMENT_MODES = new Set<EquipmentSaleFulfillmentMode>(["deliver", "self_collect"]);

function parseInteger(value: number | string | undefined, field: string, minimum: number) {
  if (value === undefined) throw new Error(`${field} is required`);
  const parsed = typeof value === "string" ? Number(value.trim()) : value;
  if (!Number.isFinite(parsed)) throw new Error(`${field} must be a valid number`);
  if (parsed < minimum) throw new Error(`${field} must be at least ${minimum}`);
  return Math.floor(parsed);
}

function parseMoney(
  value: number | string | null | undefined,
  field: string,
  opts: { minimum?: number; allowNull?: boolean } = {}
) {
  if (value === undefined) {
    if (opts.allowNull) return null;
    throw new Error(`${field} is required`);
  }
  if (value === null || value === "") {
    if (opts.allowNull) return null;
    throw new Error(`${field} is required`);
  }
  const parsed = typeof value === "string" ? Number(value.trim()) : value;
  if (!Number.isFinite(parsed)) throw new Error(`${field} must be a valid amount`);
  const minimum = opts.minimum ?? 0;
  if (parsed < minimum) throw new Error(`${field} cannot be less than ${minimum}`);
  return Number(parsed.toFixed(2));
}

function parseOptionalCents(value: number | string | null | undefined, field: string) {
  if (value === undefined || value === null || value === "") return null;
  const parsed = typeof value === "string" ? Number(value.trim()) : value;
  if (!Number.isFinite(parsed)) throw new Error(`${field} must be a valid amount`);
  if (!Number.isInteger(parsed)) throw new Error(`${field} must be a whole number of cents`);
  if (parsed < 0) throw new Error(`${field} cannot be less than 0`);
  return parsed;
}

function parseStringArray(value: string[] | undefined) {
  if (!Array.isArray(value)) return [];
  const seen = new Set<string>();
  const next: string[] = [];

  for (const item of value) {
    const trimmed = typeof item === "string" ? item.trim() : "";
    const key = trimmed.toLowerCase();
    if (!trimmed || seen.has(key)) continue;
    seen.add(key);
    next.push(trimmed);
  }

  return next;
}

function parseSpecs(value: EquipmentBody["specs"]) {
  if (!value || typeof value !== "object" || Array.isArray(value)) return {};
  return Object.entries(value).reduce<Record<string, string>>((acc, [key, raw]) => {
    const nextKey = key.trim();
    const nextValue = String(raw ?? "").trim();
    if (!nextKey || !nextValue) return acc;
    acc[nextKey] = nextValue;
    return acc;
  }, {});
}

function parseSaleStatus(value: string | undefined): EquipmentSaleStatus {
  return value && SALE_STATUSES.has(value as EquipmentSaleStatus)
    ? (value as EquipmentSaleStatus)
    : "not_available";
}

function parseSalePriceMode(value: string | undefined): EquipmentSalePriceMode {
  return value && SALE_PRICE_MODES.has(value as EquipmentSalePriceMode)
    ? (value as EquipmentSalePriceMode)
    : "request_quote";
}

function parseSaleFulfillmentModes(value: string[] | null | undefined) {
  if (!Array.isArray(value)) return null;
  const modes = value.filter((mode): mode is EquipmentSaleFulfillmentMode =>
    SALE_FULFILLMENT_MODES.has(mode as EquipmentSaleFulfillmentMode)
  );
  return modes.length ? [...new Set(modes)] : null;
}

function assertValidSalePricing(input: Pick<UpsertRentalEquipmentInput, "saleEnabled" | "salePriceMode" | "salePriceCents">) {
  if (
    input.saleEnabled &&
    input.salePriceMode === "fixed" &&
    (!Number.isInteger(input.salePriceCents) || Number(input.salePriceCents) <= 0)
  ) {
    throw new Error("salePriceCents must be a positive integer when fixed sale pricing is enabled");
  }
}

function normalizeCreateBody(body: EquipmentBody): UpsertRentalEquipmentInput {
  const title = body.title?.trim() ?? "";
  const category = body.category?.trim() ?? "";
  if (!title) throw new Error("title is required");
  if (!category) throw new Error("category is required");

  const input: UpsertRentalEquipmentInput = {
    slug: body.slug?.trim() || undefined,
    title,
    category,
    brand: body.brand?.trim() || undefined,
    model: body.model?.trim() || undefined,
    description: body.description?.trim() || undefined,
    shortDesc: body.shortDesc?.trim() || body.description?.trim() || undefined,
    totalUnits: parseInteger(body.totalUnits, "totalUnits", 0),
    maintenanceBufferDays:
      body.maintenanceBufferDays === undefined
        ? undefined
        : parseInteger(body.maintenanceBufferDays, "maintenanceBufferDays", 0),
    dayRate: parseMoney(body.dayRate, "dayRate") ?? 0,
    weekRate: parseMoney(body.weekRate, "weekRate", { allowNull: true }),
    monthRate: parseMoney(body.monthRate, "monthRate", { allowNull: true }),
    minDays: parseInteger(body.minDays, "minDays", 1),
    depositAmount: parseMoney(body.depositAmount ?? 0, "depositAmount") ?? 0,
    imageUrls: parseStringArray(body.imageUrls),
    catalogueUrl: body.catalogueUrl?.trim() || undefined,
    trainingVideoUrl: body.trainingVideoUrl?.trim() || undefined,
    keyFeatures: parseStringArray(body.keyFeatures),
    applications: parseStringArray(body.applications),
    specs: parseSpecs(body.specs),
    isPublished: Boolean(body.isPublished),
    displayOrder:
      body.displayOrder === undefined ? undefined : parseInteger(body.displayOrder, "displayOrder", 0),
    saleEnabled: Boolean(body.saleEnabled),
    saleStatus: parseSaleStatus(body.saleStatus),
    salePriceCents: parseOptionalCents(body.salePriceCents, "salePriceCents"),
    salePriceMode: parseSalePriceMode(body.salePriceMode),
    saleCondition: body.saleCondition?.trim() || undefined,
    saleWarranty: body.saleWarranty?.trim() || undefined,
    saleNotes: body.saleNotes?.trim() || undefined,
    saleFulfillmentModes: parseSaleFulfillmentModes(body.saleFulfillmentModes),
  };
  assertValidSalePricing(input);
  return input;
}

export async function GET(req: Request) {
  try {
    assertAdmin(req);
    const equipment = await dbRentalEquipmentRepo.listAdmin();
    return NextResponse.json({ equipment });
  } catch (error) {
    if (isAdminUnauthorized(error)) return adminUnauthorizedResponse();
    const message = error instanceof Error ? error.message : "Equipment list failed";
    return NextResponse.json({ error: message }, { status: 400 });
  }
}

export async function POST(req: Request) {
  try {
    assertAdmin(req);
    const body = (await req.json()) as EquipmentBody;
    const equipment = await dbRentalEquipmentRepo.create(normalizeCreateBody(body));
    return NextResponse.json({ equipment }, { status: 201 });
  } catch (error) {
    if (isAdminUnauthorized(error)) return adminUnauthorizedResponse();
    const message = error instanceof Error ? error.message : "Equipment create failed";
    return NextResponse.json({ error: message }, { status: 400 });
  }
}
