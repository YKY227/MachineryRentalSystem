"use client";

import type { ReactNode } from "react";
import type { LucideIcon } from "lucide-react";

export const settingsInputClass =
  "w-full rounded-xl border border-slate-200 bg-white px-3 py-2 text-sm text-slate-900 outline-none transition focus:border-[#D24338] focus:ring-2 focus:ring-[#FCE9E7] disabled:bg-slate-50 disabled:text-slate-500";

export function SettingsPageHeader({
  icon: Icon,
  title,
  description,
}: {
  icon: LucideIcon;
  title: string;
  description: string;
}) {
  return (
    <div className="space-y-2">
      <div className="inline-flex items-center gap-2 rounded-full border border-[#F2C7C2] bg-[#FCE9E7] px-3 py-1 text-[11px] font-semibold uppercase tracking-[0.22em] text-[#B9382E]">
        <Icon className="h-3.5 w-3.5" />
        Settings workspace
      </div>
      <div className="flex items-center gap-3">
        <div className="flex h-11 w-11 items-center justify-center rounded-2xl border border-[#F2C7C2] bg-[#FCE9E7]">
          <Icon className="h-5 w-5 text-[#B9382E]" />
        </div>
        <div>
          <h1 className="text-2xl font-semibold tracking-tight text-[#2A2A2A]">{title}</h1>
          <p className="text-sm text-slate-600">{description}</p>
        </div>
      </div>
    </div>
  );
}

export function SettingsCard({
  icon: Icon,
  title,
  description,
  children,
}: {
  icon: LucideIcon;
  title: string;
  description?: string;
  children: ReactNode;
}) {
  return (
    <section className="space-y-4 rounded-xl border border-slate-200 bg-white p-5 shadow-sm">
      <div className="flex items-start gap-3">
        <div className="flex h-10 w-10 items-center justify-center rounded-xl border border-[#F2C7C2] bg-[#FCE9E7]">
          <Icon className="h-4 w-4 text-[#B9382E]" />
        </div>
        <div>
          <h2 className="text-lg font-semibold text-slate-900">{title}</h2>
          {description ? <p className="text-xs text-slate-500">{description}</p> : null}
        </div>
      </div>
      {children}
    </section>
  );
}

export function SettingsBanner({
  kind,
  message,
}: {
  kind: "success" | "error";
  message: string;
}) {
  return (
    <div
      className={[
        "rounded-xl border px-3 py-2 text-sm",
        kind === "error"
          ? "border-rose-200 bg-rose-50 text-rose-800"
          : "border-emerald-200 bg-emerald-50 text-emerald-800",
      ].join(" ")}
    >
      {message}
    </div>
  );
}

export function SettingsToggle({
  enabled,
  onToggle,
  ariaLabel,
  tone = "brand",
}: {
  enabled: boolean;
  onToggle: () => void;
  ariaLabel: string;
  tone?: "brand" | "danger";
}) {
  const activeClasses =
    tone === "danger" ? "border-rose-600 bg-rose-600" : "border-[#D24338] bg-[#D24338]";

  return (
    <button
      type="button"
      onClick={onToggle}
      className={[
        "relative inline-flex h-6 w-11 items-center rounded-full border transition",
        enabled ? activeClasses : "border-slate-300 bg-white",
      ].join(" ")}
      aria-pressed={enabled}
      aria-label={ariaLabel}
    >
      <span
        className={[
          "inline-block h-5 w-5 transform rounded-full bg-white shadow transition",
          enabled ? "translate-x-5" : "translate-x-1",
        ].join(" ")}
      />
    </button>
  );
}

export function SettingsActions({
  saving,
  loading,
  onSave,
  onReload,
  saveLabel = "Save Changes",
}: {
  saving: boolean;
  loading: boolean;
  onSave: () => void;
  onReload: () => void;
  saveLabel?: string;
}) {
  return (
    <div className="flex flex-wrap gap-2">
      <button
        type="button"
        onClick={onSave}
        disabled={loading || saving}
        aria-label={saveLabel}
        className="rounded-xl bg-[#D24338] px-4 py-2 text-sm font-medium text-white hover:bg-[#B9382E] disabled:opacity-50"
      >
        {saving ? "Saving..." : saveLabel}
      </button>

      <button
        type="button"
        onClick={onReload}
        disabled={loading}
        aria-label="Reload settings"
        className="rounded-xl border border-slate-300 bg-white px-4 py-2 text-sm font-medium text-slate-700 hover:bg-slate-50 disabled:opacity-50"
      >
        Reload
      </button>
    </div>
  );
}
