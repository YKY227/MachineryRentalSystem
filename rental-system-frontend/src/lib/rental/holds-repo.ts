"use client";

import type { EquipmentHold, HoldStatus } from "./types";

const HOLDS_LS_KEY = "cms_rental_holds_v1";

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

function readAll(): EquipmentHold[] {
  if (typeof window === "undefined") return [];
  const parsed = safeParse<EquipmentHold[]>(localStorage.getItem(HOLDS_LS_KEY));
  return Array.isArray(parsed) ? parsed : [];
}

function writeAll(items: EquipmentHold[]) {
  if (typeof window === "undefined") return;
  localStorage.setItem(HOLDS_LS_KEY, JSON.stringify(items));
}

function makeId(prefix = "hold") {
  return `${prefix}-${Math.random().toString(16).slice(2)}-${Date.now()}`;
}

export const localHoldsRepo = {
  async listAll() {
    return readAll();
  },

  async listActive() {
    return readAll().filter((h) => h.status === "active");
  },

  async listByEquipment(equipmentId: string, status?: HoldStatus) {
    const all = readAll().filter((h) => h.equipmentId === equipmentId);
    return status ? all.filter((h) => h.status === status) : all;
  },

  async create(input: Omit<EquipmentHold, "id" | "createdAt" | "updatedAt">) {
    const all = readAll();
    const next: EquipmentHold = {
      ...input,
      id: makeId(),
      createdAt: nowIso(),
      updatedAt: nowIso(),
    };
    all.unshift(next);
    writeAll(all);
    return next;
  },

  async complete(id: string) {
    const all = readAll();
    const idx = all.findIndex((h) => h.id === id);
    if (idx < 0) return null;

    all[idx] = {
      ...all[idx],
      status: "completed",
      releasedAt: nowIso(),
      updatedAt: nowIso(),
    };
    writeAll(all);
    return all[idx];
  },

  async clearAll() {
    writeAll([]);
  },
};
