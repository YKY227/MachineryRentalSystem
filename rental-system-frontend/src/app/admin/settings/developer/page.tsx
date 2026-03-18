"use client";

import { Code, ShieldAlert } from "lucide-react";

import {
  SettingsActions,
  SettingsBanner,
  SettingsCard,
  SettingsPageHeader,
  SettingsToggle,
} from "@/app/admin/settings/_components";
import { useAdminSettings } from "@/lib/admin-settings/use-admin-settings";

export default function AdminSettingsDeveloperPage() {
  const settings = useAdminSettings();

  return (
    <div className="space-y-6">
      <SettingsPageHeader
        icon={Code}
        title="Developer Tools"
        description="Control local developer and demo switches while keeping backend settings persistence unchanged."
      />

      {settings.error ? <SettingsBanner kind="error" message={settings.error} /> : null}
      {settings.okMsg ? <SettingsBanner kind="success" message={settings.okMsg} /> : null}

      <SettingsCard
        icon={Code}
        title="Developer Mode"
        description="These switches remain local admin UI controls and continue to behave exactly as before."
      >
        <div className="space-y-4">
          <div className="flex items-center justify-between gap-4 rounded-xl border border-slate-200 bg-slate-50 p-4">
            <div>
              <p className="text-sm font-medium text-slate-900">Developer Mode</p>
              <p className="text-xs text-slate-600">
                Enables extra switches for demo/testing. Turning this off also disables Demo Mode.
              </p>
            </div>

            <SettingsToggle
              enabled={settings.developerMode}
              onToggle={() => settings.setDeveloperMode(!settings.developerMode)}
              ariaLabel="Toggle developer mode"
            />
          </div>

          {settings.developerMode ? (
            <div className="flex items-center justify-between gap-4 rounded-xl border border-rose-200 bg-rose-50 p-4">
              <div>
                <p className="text-sm font-medium text-rose-900">Demo Mode</p>
                <p className="text-xs text-rose-700">
                  Shows mock data with a <span className="font-semibold">MOCK</span> badge.
                </p>
              </div>

              <SettingsToggle
                enabled={settings.demoMode}
                tone="danger"
                onToggle={() => settings.setDemoMode(!settings.demoMode)}
                ariaLabel="Toggle demo mode"
              />
            </div>
          ) : (
            <div className="rounded-xl border border-slate-200 bg-slate-50 p-4 text-xs text-slate-500">
              Demo Mode is only available while Developer Mode is enabled.
            </div>
          )}
        </div>
      </SettingsCard>

      <SettingsCard
        icon={ShieldAlert}
        title="Save Behavior"
        description="Developer toggles apply immediately in the admin UI. Save Changes still persists the current backend settings object unchanged."
      >
        <div className="text-sm text-slate-600">
          This page keeps the existing developer/demo toggle behavior intact while preserving the
          same full-object `PUT /api/admin/settings` save flow used by the rest of the workspace.
        </div>
      </SettingsCard>

      <SettingsActions
        saving={settings.saving}
        loading={settings.loading}
        onSave={settings.save}
        onReload={settings.load}
      />
    </div>
  );
}
