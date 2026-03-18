"use client";

import { Clock } from "lucide-react";

import {
  SettingsActions,
  SettingsBanner,
  SettingsCard,
  SettingsPageHeader,
  SettingsToggle,
  settingsInputClass,
} from "@/app/admin/settings/_components";
import { useAdminSettings } from "@/lib/admin-settings/use-admin-settings";

export default function AdminSettingsRemindersPage() {
  const settings = useAdminSettings();

  return (
    <div className="space-y-6">
      <SettingsPageHeader
        icon={Clock}
        title="Reminder Automation"
        description="Configure overdue reminder timing and guardrails using the existing server-side reminder engine."
      />

      {settings.error ? <SettingsBanner kind="error" message={settings.error} /> : null}
      {settings.okMsg ? <SettingsBanner kind="success" message={settings.okMsg} /> : null}

      <SettingsCard
        icon={Clock}
        title="Reminder Policy"
        description="Configure staged overdue reminder behavior without changing backend route or DTO structure."
      >
        <div className="rounded-xl border border-slate-200 bg-slate-50 p-4">
          <div className="flex items-center justify-between gap-4">
            <div>
              <p className="text-sm font-medium text-slate-900">Enable overdue reminders</p>
              <p className="text-xs text-slate-600">
                When disabled, overdue reminder runs stay read-only and skip sends.
              </p>
            </div>

            <SettingsToggle
              enabled={settings.remindersEnabled}
              onToggle={() => settings.setRemindersEnabled(!settings.remindersEnabled)}
              ariaLabel="Toggle reminder automation"
            />
          </div>
        </div>

        <div className="grid gap-4 md:grid-cols-2 xl:grid-cols-5">
          <label className="flex flex-col gap-1">
            <span className="text-sm font-medium text-slate-700">First reminder days overdue</span>
            <input
              type="number"
              min={0}
              step={1}
              value={settings.firstReminderDays}
              onChange={(e) => settings.setFirstReminderDays(e.target.value)}
              disabled={settings.loading}
              className={settingsInputClass}
            />
          </label>

          <label className="flex flex-col gap-1">
            <span className="text-sm font-medium text-slate-700">Second reminder days overdue</span>
            <input
              type="number"
              min={0}
              step={1}
              value={settings.secondReminderDays}
              onChange={(e) => settings.setSecondReminderDays(e.target.value)}
              disabled={settings.loading}
              className={settingsInputClass}
            />
          </label>

          <label className="flex flex-col gap-1">
            <span className="text-sm font-medium text-slate-700">Final reminder days overdue</span>
            <input
              type="number"
              min={0}
              step={1}
              value={settings.finalReminderDays}
              onChange={(e) => settings.setFinalReminderDays(e.target.value)}
              disabled={settings.loading}
              className={settingsInputClass}
            />
          </label>

          <label className="flex flex-col gap-1">
            <span className="text-sm font-medium text-slate-700">Guard window hours</span>
            <input
              type="number"
              min={1}
              step={1}
              value={settings.reminderGuardWindowHours}
              onChange={(e) => settings.setReminderGuardWindowHours(e.target.value)}
              disabled={settings.loading}
              className={settingsInputClass}
            />
          </label>

          <label className="flex flex-col gap-1">
            <span className="text-sm font-medium text-slate-700">Batch limit</span>
            <input
              type="number"
              min={1}
              step={1}
              value={settings.reminderBatchLimit}
              onChange={(e) => settings.setReminderBatchLimit(e.target.value)}
              disabled={settings.loading}
              className={settingsInputClass}
            />
          </label>
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
