// src/lib/use-driver-identity.tsx
"use client";

import {
  useEffect,
  useState,
  useCallback,
  useMemo,
  useContext,
  createContext,
  type ReactNode,
} from "react";
import type { RegionCode, VehicleType } from "@/lib/types";

const STORAGE_KEY = "cms-current-driver-v1";

/**
 * Minimal driver profile we store as "current driver" on the device.
 * This is intentionally smaller than the full Driver model.
 */
export interface DriverIdentity {
  id: string; // matches Driver.id
  code?: string;
  name: string;
  email?: string;
  phone?: string;
  primaryRegion?: RegionCode;
  vehicleType?: VehicleType;
}

export interface UseDriverIdentityResult {
  driver: DriverIdentity | null;
  loaded: boolean;
  setDriver: (driver: DriverIdentity | null) => void;
  logoutDriver: () => void;
}

/**
 * Safely read the current driver from localStorage (browser only).
 */
function readDriverFromStorage(): DriverIdentity | null {
  if (typeof window === "undefined") return null;

  try {
    const raw = window.localStorage.getItem(STORAGE_KEY);
    if (!raw) return null;
    const parsed = JSON.parse(raw) as DriverIdentity;
    if (!parsed || typeof parsed !== "object") return null;
    if (!parsed.id || !parsed.name) return null;
    return parsed;
  } catch (err) {
    console.error("[useDriverIdentity] Failed to parse driver from storage", err);
    return null;
  }
}

/**
 * Save / clear the current driver in localStorage (browser only).
 */
function writeDriverToStorage(driver: DriverIdentity | null) {
  if (typeof window === "undefined") return;

  try {
    if (!driver) {
      window.localStorage.removeItem(STORAGE_KEY);
    } else {
      window.localStorage.setItem(STORAGE_KEY, JSON.stringify(driver));
    }
  } catch (err) {
    console.error("[useDriverIdentity] Failed to write driver to storage", err);
  }
}

// ─────────────────────────────────────────────
// Context
// ─────────────────────────────────────────────

const DriverIdentityContext = createContext<UseDriverIdentityResult | undefined>(
  undefined
);

export function DriverIdentityProvider({ children }: { children: ReactNode }) {
  const [driver, setDriverState] = useState<DriverIdentity | null>(null);
  const [loaded, setLoaded] = useState(false);

  // Initial load from localStorage (once per app mount)
  useEffect(() => {
    const existing = readDriverFromStorage();
    if (existing) {
      setDriverState(existing);
    }
    setLoaded(true);
  }, []);

  const setDriver = useCallback((next: DriverIdentity | null) => {
    setDriverState(next);
    writeDriverToStorage(next);
  }, []);

  const logoutDriver = useCallback(() => {
    setDriver(null);
  }, [setDriver]);

  const value = useMemo<UseDriverIdentityResult>(
    () => ({
      driver,
      loaded,
      setDriver,
      logoutDriver,
    }),
    [driver, loaded, setDriver, logoutDriver]
  );

  return (
    <DriverIdentityContext.Provider value={value}>
      {children}
    </DriverIdentityContext.Provider>
  );
}

export function useDriverIdentity(): UseDriverIdentityResult {
  const ctx = useContext(DriverIdentityContext);
  if (!ctx) {
    throw new Error(
      "useDriverIdentity must be used within a <DriverIdentityProvider>"
    );
  }
  return ctx;
}
