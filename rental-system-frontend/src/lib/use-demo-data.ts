// src/lib/use-demo-data.ts
"use client";

import { useAppSettings } from "@/lib/app-settings";

/**
 * Demo data should appear only when:
 * - developerMode is ON
 * - demoMode is ON
 */
export function useDemoData() {
  const { developerMode, demoMode } = useAppSettings();
  const showDemoData = developerMode && demoMode;

  return { showDemoData, developerMode, demoMode };
}
