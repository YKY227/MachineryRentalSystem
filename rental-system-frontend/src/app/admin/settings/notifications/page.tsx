"use client";

import { Bell, FlaskConical } from "lucide-react";

import {
  SettingsActions,
  SettingsBanner,
  SettingsCard,
  SettingsPageHeader,
  SettingsToggle,
  settingsInputClass,
} from "@/app/admin/settings/_components";
import { useAdminSettings } from "@/lib/admin-settings/use-admin-settings";

export default function AdminSettingsNotificationsPage() {
  const settings = useAdminSettings();

  return (
    <div className="space-y-6">
      <SettingsPageHeader
        icon={Bell}
        title="Notifications"
        description="Control operational routing, reminder recipients, and tester BCC behavior without changing backend delivery rules."
      />

      {settings.error ? <SettingsBanner kind="error" message={settings.error} /> : null}
      {settings.okMsg ? <SettingsBanner kind="success" message={settings.okMsg} /> : null}

      <SettingsCard
        icon={Bell}
        title="Notification Routing"
        description="Define fallback and event-specific recipient routing for admin rental notifications."
      >
        <div className="grid gap-4 md:grid-cols-2">
          <label className="flex flex-col gap-1">
            <span className="text-sm font-medium text-slate-700">
              Default admin notification emails (CSV)
            </span>
            <input
              type="text"
              value={settings.adminNotificationEmailsCsv}
              onChange={(e) => settings.setAdminNotificationEmailsCsv(e.target.value)}
              disabled={settings.loading}
              className={settingsInputClass}
              placeholder="ops@company.com, dispatcher@company.com"
            />
            <span className="text-xs text-slate-500">
              Fallback if event-specific recipients are empty.
            </span>
          </label>

          <label className="flex flex-col gap-1">
            <span className="text-sm font-medium text-slate-700">
              Booking paid recipients (CSV)
            </span>
            <input
              type="text"
              value={settings.bookingPaidRecipientsCsv}
              onChange={(e) => settings.setBookingPaidRecipientsCsv(e.target.value)}
              disabled={settings.loading}
              className={settingsInputClass}
              placeholder="dispatch@company.com"
            />
            <span className="text-xs text-slate-500">
              Event-specific override for paid bookings.
            </span>
          </label>

          <label className="flex flex-col gap-1">
            <span className="text-sm font-medium text-slate-700">
              Overdue / delayed job recipients (CSV)
            </span>
            <input
              type="text"
              value={settings.overdueRecipientsCsv}
              onChange={(e) => settings.setOverdueRecipientsCsv(e.target.value)}
              disabled={settings.loading}
              className={settingsInputClass}
              placeholder="ops@company.com"
            />
          </label>

          <label className="flex flex-col gap-1">
            <span className="text-sm font-medium text-slate-700">
              New order recipients (CSV)
            </span>
            <input
              type="text"
              value={settings.newOrderRecipientsCsv}
              onChange={(e) => settings.setNewOrderRecipientsCsv(e.target.value)}
              disabled={settings.loading}
              className={settingsInputClass}
              placeholder="ops@company.com, rentals@company.com"
            />
            <span className="text-xs text-slate-500">
              Event-specific override for newly received rental orders.
            </span>
          </label>
        </div>
      </SettingsCard>

      <SettingsCard
        icon={FlaskConical}
        title="Tester BCC"
        description="Maintain the same tester BCC and test-email flow used for UAT and notification verification."
      >
        <div className="rounded-xl border border-slate-200 bg-slate-50 p-4">
          <div className="flex items-center justify-between gap-4">
            <div>
              <p className="text-sm font-medium text-slate-900">BCC tester emails</p>
              <p className="text-xs text-slate-600">
                If enabled, admin notification emails will also BCC the tester list.
              </p>
            </div>

            <SettingsToggle
              enabled={settings.bccTesterEnabled}
              onToggle={() => settings.setBccTesterEnabled(!settings.bccTesterEnabled)}
              ariaLabel="Toggle BCC tester emails"
            />
          </div>

          <label className="mt-4 flex flex-col gap-1">
            <span className="text-sm font-medium text-slate-700">Tester emails (CSV)</span>
            <input
              type="text"
              value={settings.testerEmailsCsv}
              onChange={(e) => settings.setTesterEmailsCsv(e.target.value)}
              disabled={settings.loading}
              className={settingsInputClass}
              placeholder="tester@company.com"
            />
          </label>

          <div className="mt-4 flex flex-wrap gap-2">
            <button
              type="button"
              onClick={settings.sendTestEmail}
              disabled={settings.loading || settings.testing}
              aria-label="Send test email"
              className="rounded-xl bg-[#D24338] px-4 py-2 text-sm font-medium text-white hover:bg-[#B9382E] disabled:opacity-50"
            >
              {settings.testing ? "Sending test..." : "Send test email"}
            </button>
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

