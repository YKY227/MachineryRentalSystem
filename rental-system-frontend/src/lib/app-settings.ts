//src/lib/app-settings.ts
"use client";

import { create } from "zustand";
import { persist } from "zustand/middleware";

type AppSettingsState = {
  developerMode: boolean;
  demoMode: boolean;
  setDeveloperMode: (v: boolean) => void;
  setDemoMode: (v: boolean) => void;
};

export const useAppSettings = create<AppSettingsState>()(
  persist(
    (set, get) => ({
      developerMode: false,
      demoMode: false,
      setDeveloperMode: (v) =>
        set(() => ({
          developerMode: v,
          demoMode: v ? get().demoMode : false, // turning off dev mode disables demo mode
        })),
      setDemoMode: (v) => set(() => ({ demoMode: v })),
    }),
    { name: "cms-app-settings-v1" }
  )
);
