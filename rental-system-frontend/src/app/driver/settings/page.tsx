"use client";

import { useEffect, useState } from "react";

const STORAGE_KEY = "driver-jobs-state-v1"; // keep in sync with driver-jobs-store

export default function DriverSettingsPage() {
  const [offlineEnabled, setOfflineEnabled] = useState(true);
  const [darkMode, setDarkMode] = useState(true);
  const [clearing, setClearing] = useState(false);

  // For now these toggles are just local UI state – later can persist to backend or localStorage
  useEffect(() => {
    // If you want, load saved prefs here later
  }, []);

  const handleClearOfflineData = () => {
    if (typeof window === "undefined") return;
    const ok = window.confirm(
      "Clear locally cached jobs and pending actions? This is safe in the prototype, but will remove offline data."
    );
    if (!ok) return;

    setClearing(true);
    try {
      window.localStorage.removeItem(STORAGE_KEY);
    } catch (e) {
      console.error("Failed to clear offline data", e);
    } finally {
      // Simple approach: reload the app so hooks re-initialise
      window.location.reload();
    }
  };

  return (
    <div className="px-4 py-4 space-y-4">
      <header>
        <h2 className="text-sm font-semibold text-slate-50">Settings</h2>
        <p className="text-[11px] text-slate-400">
          Driver app preferences. In a real system this can be tied to the driver
          account in the backend.
        </p>
      </header>

      {/* App appearance */}
      <section className="space-y-2 rounded-xl border border-slate-800 bg-slate-900/70 p-4">
        <h3 className="text-xs font-semibold text-slate-200">
          App appearance
        </h3>

        <label className="mt-2 flex items-center justify-between text-[11px] text-slate-200">
          <span>Dark mode</span>
          <button
            type="button"
            onClick={() => setDarkMode((v) => !v)}
            className={[
              "relative inline-flex h-5 w-9 items-center rounded-full border transition",
              darkMode
                ? "border-sky-400 bg-sky-500/40"
                : "border-slate-600 bg-slate-800",
            ].join(" ")}
          >
            <span
              className={[
                "inline-block h-3.5 w-3.5 transform rounded-full bg-white transition",
                darkMode ? "translate-x-4" : "translate-x-1",
              ].join(" ")}
            />
          </button>
        </label>
        <p className="text-[10px] text-slate-500">
          Currently this is just a visual toggle. Later you can wire it to a theme
          provider or system preference.
        </p>
      </section>

      {/* Offline / data */}
      <section className="space-y-2 rounded-xl border border-slate-800 bg-slate-900/70 p-4">
        <h3 className="text-xs font-semibold text-slate-200">
          Offline & data
        </h3>

        <label className="mt-2 flex items-center justify-between text-[11px] text-slate-200">
          <span>Enable offline usage</span>
          <button
            type="button"
            onClick={() => setOfflineEnabled((v) => !v)}
            className={[
              "relative inline-flex h-5 w-9 items-center rounded-full border transition",
              offlineEnabled
                ? "border-emerald-400 bg-emerald-500/30"
                : "border-slate-600 bg-slate-800",
            ].join(" ")}
          >
            <span
              className={[
                "inline-block h-3.5 w-3.5 transform rounded-full bg-white transition",
                offlineEnabled ? "translate-x-4" : "translate-x-1",
              ].join(" ")}
            />
          </button>
        </label>
        <p className="text-[10px] text-slate-500">
          Prototype only – actual offline logic is already enabled by caching
          jobs in localStorage. Later this toggle can control sync behaviour.
        </p>

        <button
          type="button"
          onClick={handleClearOfflineData}
          disabled={clearing}
          className="mt-3 inline-flex w-full items-center justify-center rounded-lg border border-red-500/60 bg-red-500/10 px-3 py-2 text-[11px] font-medium text-red-200 hover:bg-red-500/20 disabled:opacity-60"
        >
          {clearing ? "Clearing offline data…" : "Clear offline data"}
        </button>
        <p className="text-[10px] text-slate-500">
          This clears locally cached jobs and pending sync actions. Useful when
          testing or after schema changes.
        </p>
      </section>

      {/* About */}
      <section className="space-y-1 rounded-xl border border-slate-800 bg-slate-900/70 p-4 text-[11px] text-slate-300">
        <h3 className="text-xs font-semibold text-slate-200">About</h3>
        <p>Courier Driver PWA · Prototype build</p>
        <p className="text-slate-500">
          Later you can show app version, build number, and links to support or
          training materials.
        </p>
      </section>
    </div>
  );
}
