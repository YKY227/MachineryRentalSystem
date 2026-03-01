// src/lib/api/drivers.ts
import { API_BASE_URL, USE_BACKEND } from "../config";
import type { Driver } from "../types";
import { fetchJson } from "./http";

/**
 * Fetch all drivers from backend (GET /admin/drivers)
 */
export async function fetchAdminDrivers(): Promise<Driver[]> {
  if (!USE_BACKEND) {
    console.warn("fetchAdminDrivers() called while USE_BACKEND=false");
    return [];
  }

  const data = await fetchJson<unknown>(`${API_BASE_URL}/admin/drivers`, {
    method: "GET",
  });

  if (!Array.isArray(data)) {
    console.error("[fetchAdminDrivers] Expected array, got:", data);
    return [];
  }

  return data as Driver[];
}

/**
 * Update a driver (PATCH /admin/drivers/:id)
 */
export async function updateDriverOnBackend(
  id: string,
  payload: Partial<Driver>
): Promise<Driver> {
  if (!USE_BACKEND) {
    throw new Error("updateDriverOnBackend() called while USE_BACKEND=false");
  }

  const mapRegionToBackend = (r: string) => {
    if (r === "north-east") return "north_east";
    if (r === "island-wide") return "island_wide";
    return r;
  };

  const normalized: any = { ...payload };

  if (normalized.primaryRegion) {
    normalized.primaryRegion = mapRegionToBackend(normalized.primaryRegion);
  }
  if (Array.isArray(normalized.secondaryRegions)) {
    normalized.secondaryRegions = normalized.secondaryRegions.map(mapRegionToBackend);
  }

  return fetchJson<Driver>(`${API_BASE_URL}/admin/drivers/${id}`, {
    method: "PATCH",
    headers: { "Content-Type": "application/json" },
    body: JSON.stringify(normalized),
  });
}
