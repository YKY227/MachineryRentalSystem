"use client";

import { ShieldAlert, Wrench } from "lucide-react";

import {
  SettingsActions,
  SettingsBanner,
  SettingsCard,
  SettingsPageHeader,
  SettingsToggle,
  settingsInputClass,
} from "@/app/admin/settings/_components";
import { useAdminSettings } from "@/lib/admin-settings/use-admin-settings";

export default function AdminSettingsOperationsPage() {
  const settings = useAdminSettings();

  return (
    <div className="space-y-6">
      <SettingsPageHeader
        icon={Wrench}
        title="Operations"
        description="Manage operational defaults and guarded admin tooling while keeping server-side policy and persistence unchanged."
      />

      {settings.error ? <SettingsBanner kind="error" message={settings.error} /> : null}
      {settings.okMsg ? <SettingsBanner kind="success" message={settings.okMsg} /> : null}

      <SettingsCard
        icon={Wrench}
        title="Operations Defaults"
        description="Global defaults used when rental operations records do not provide an explicit override."
      >
        <div className="grid gap-4 md:grid-cols-2">
          <label className="flex flex-col gap-1">
            <span className="text-sm font-medium text-slate-700">
              Default maintenance buffer days
            </span>
            <input
              type="number"
              min={0}
              step={1}
              value={settings.defaultMaintenanceBufferDays}
              onChange={(e) => settings.setDefaultMaintenanceBufferDays(e.target.value)}
              disabled={settings.loading}
              className={settingsInputClass}
            />
            <span className="text-xs text-slate-500">
              Used as the server fallback when equipment records do not have an explicit maintenance buffer.
            </span>
          </label>
        </div>
      </SettingsCard>

      <SettingsCard
        icon={ShieldAlert}
        title="Developer Delete Tools"
        description="Developer-only permanent rental order deletion controls for test-data cleanup."
      >
        <div className="rounded-xl border border-rose-200 bg-rose-50 p-4">
          <div className="flex items-center justify-between gap-4">
            <div>
              <p className="text-sm font-medium text-rose-900">Enable developer delete tools</p>
              <p className="text-xs text-rose-700">
                Shows permanent rental order deletion controls in admin orders for test-data cleanup only.
              </p>
            </div>

            <SettingsToggle
              enabled={settings.enableDeveloperDeleteTools}
              tone="danger"
              onToggle={() => {
                if (!settings.enableDeveloperDeleteTools) {
                  const confirmed = window.confirm(
                    "Enable developer delete tools? This will expose permanent rental order deletion controls in admin orders. Deleting an order will also remove linked invoices and operational records."
                  );
                  if (!confirmed) return;
                }
                settings.setEnableDeveloperDeleteTools(!settings.enableDeveloperDeleteTools);
              }}
              ariaLabel="Toggle developer delete tools"
            />
          </div>
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
