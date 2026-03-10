import { NextResponse } from "next/server";

import {
  adminUnauthorizedResponse,
  assertAdmin,
  isAdminUnauthorized,
} from "@/lib/auth/admin";
import { dbRentalEquipmentRepo } from "@/lib/rental/equipment/db-rental-equipment-repo";
import type { UpdateRentalEquipmentInput } from "@/lib/rental/equipment/types";

export const runtime = "nodejs";

type EquipmentPatchBody = {
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
};

function normalizeOptionalText(value: string | null | undefined) {
  if (value === undefined) return undefined;
  return value === null ? "" : value.trim();
}

function normalizeOptionalRequiredText(value: string | null | undefined) {
  if (value === undefined) return undefined;
  const normalized = value === null ? "" : value.trim();
  return normalized || undefined;
}

function parseOptionalInteger(value: number | string | undefined, field: string, minimum: number) {
  if (value === undefined) return undefined;
  const parsed = typeof value === "string" ? Number(value.trim()) : value;
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
  if (value === null || value === "") {
    return opts.allowNull ? null : undefined;
  }
  const parsed = typeof value === "string" ? Number(value.trim()) : value;
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
    const trimmed = typeof item === "string" ? item.trim() : "";
    const key = trimmed.toLowerCase();
    if (!trimmed || seen.has(key)) continue;
    seen.add(key);
    next.push(trimmed);
  }
  return next;
}

function parseSpecs(value: EquipmentPatchBody["specs"]) {
  if (value === undefined) return undefined;
  if (!value || typeof value !== "object" || Array.isArray(value)) return {};
  return Object.entries(value).reduce<Record<string, string>>((acc, [key, raw]) => {
    const nextKey = key.trim();
    const nextValue = String(raw ?? "").trim();
    if (!nextKey || !nextValue) return acc;
    acc[nextKey] = nextValue;
    return acc;
  }, {});
}

function normalizePatchBody(body: EquipmentPatchBody): UpdateRentalEquipmentInput {
  return {
    slug: normalizeOptionalRequiredText(body.slug),
    title: normalizeOptionalRequiredText(body.title),
    category: normalizeOptionalRequiredText(body.category),
    brand: normalizeOptionalText(body.brand),
    model: normalizeOptionalText(body.model),
    description: normalizeOptionalText(body.description),
    shortDesc:
      body.shortDesc !== undefined || body.description !== undefined
        ? normalizeOptionalText(body.shortDesc ?? body.description)
        : undefined,
    totalUnits: parseOptionalInteger(body.totalUnits, "totalUnits", 0),
    maintenanceBufferDays: parseOptionalInteger(body.maintenanceBufferDays, "maintenanceBufferDays", 0),
    dayRate: parseOptionalMoney(body.dayRate, "dayRate") ?? undefined,
    weekRate: parseOptionalMoney(body.weekRate, "weekRate", { allowNull: true }),
    monthRate: parseOptionalMoney(body.monthRate, "monthRate", { allowNull: true }),
    minDays: parseOptionalInteger(body.minDays, "minDays", 1),
    depositAmount: parseOptionalMoney(body.depositAmount, "depositAmount") ?? undefined,
    imageUrls: parseStringArray(body.imageUrls),
    catalogueUrl: normalizeOptionalText(body.catalogueUrl),
    trainingVideoUrl: normalizeOptionalText(body.trainingVideoUrl),
    keyFeatures: parseStringArray(body.keyFeatures),
    applications: parseStringArray(body.applications),
    specs: parseSpecs(body.specs),
    isPublished: typeof body.isPublished === "boolean" ? body.isPublished : undefined,
    displayOrder: parseOptionalInteger(body.displayOrder, "displayOrder", 0),
  };
}

export async function GET(req: Request, { params }: { params: { id: string } }) {
  try {
    assertAdmin(req);
    const equipment = await dbRentalEquipmentRepo.getById(params.id);
    if (!equipment) {
      return NextResponse.json({ error: "Equipment not found" }, { status: 404 });
    }
    return NextResponse.json({ equipment });
  } catch (error) {
    if (isAdminUnauthorized(error)) return adminUnauthorizedResponse();
    const message = error instanceof Error ? error.message : "Equipment read failed";
    return NextResponse.json({ error: message }, { status: 400 });
  }
}

export async function PATCH(req: Request, { params }: { params: { id: string } }) {
  try {
    assertAdmin(req);
    const existing = await dbRentalEquipmentRepo.getById(params.id);
    if (!existing) {
      return NextResponse.json({ error: "Equipment not found" }, { status: 404 });
    }

    const body = (await req.json()) as EquipmentPatchBody;
    const equipment = await dbRentalEquipmentRepo.update(params.id, normalizePatchBody(body));
    return NextResponse.json({ equipment });
  } catch (error) {
    if (isAdminUnauthorized(error)) return adminUnauthorizedResponse();
    const message = error instanceof Error ? error.message : "Equipment update failed";
    return NextResponse.json({ error: message }, { status: 400 });
  }
}
