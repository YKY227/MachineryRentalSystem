// src/lib/rental/equipment-repo.ts
"use client";

import type { Equipment } from "./types";
import { seedEquipment } from "./seed-equipment";

const LS_KEY = "cms_rental_equipment_v1";

export type EquipmentRepo = {
  listPublic(): Promise<Equipment[]>;
  listAdmin(): Promise<Equipment[]>;
  getById(id: string): Promise<Equipment | null>;
  upsert(item: Equipment): Promise<Equipment>;
  togglePublish(id: string, publish: boolean): Promise<Equipment | null>;
  resetToSeed(): Promise<void>;
};

function nowIso() {
  return new Date().toISOString();
}

function safeParse<T>(raw: string | null): T | null {
  if (!raw) return null;
  try {
    return JSON.parse(raw) as T;
  } catch {
    return null;
  }
}

function ensureInitialized(): Equipment[] {
  // SSR guard
  if (typeof window === "undefined") return seedEquipment;

  const existing = safeParse<Equipment[]>(localStorage.getItem(LS_KEY));
  if (existing && Array.isArray(existing) && existing.length > 0) return existing;

  localStorage.setItem(LS_KEY, JSON.stringify(seedEquipment));
  return seedEquipment;
}

function readAll(): Equipment[] {
  return ensureInitialized();
}

function writeAll(items: Equipment[]) {
  if (typeof window === "undefined") return;
  localStorage.setItem(LS_KEY, JSON.stringify(items));
}

function sortNewestFirst(items: Equipment[]) {
  return [...items].sort((a, b) => {
    const ta = new Date(a.updatedAt || a.createdAt).getTime();
    const tb = new Date(b.updatedAt || b.createdAt).getTime();
    return tb - ta;
  });
}

export const localEquipmentRepo: EquipmentRepo = {
  async listPublic() {
    const items = readAll().filter((x) => x.isPublished);
    return sortNewestFirst(items);
  },

  async listAdmin() {
    return sortNewestFirst(readAll());
  },

  async getById(id) {
    return readAll().find((x) => x.id === id) ?? null;
  },

  async upsert(item) {
    const all = readAll();
    const idx = all.findIndex((x) => x.id === item.id);

    const next: Equipment = {
      ...item,
      updatedAt: nowIso(),
      createdAt: item.createdAt ?? nowIso(),
    };

    if (idx >= 0) all[idx] = next;
    else all.unshift(next);

    writeAll(all);
    return next;
  },

  async togglePublish(id, publish) {
    const all = readAll();
    const idx = all.findIndex((x) => x.id === id);
    if (idx < 0) return null;

    all[idx] = { ...all[idx], isPublished: publish, updatedAt: nowIso() };
    writeAll(all);
    return all[idx];
  },

  async resetToSeed() {
    writeAll(seedEquipment);
  },
};
