"use client";

import { Building2, Building, CreditCard, Mail } from "lucide-react";

import {
  SettingsActions,
  SettingsBanner,
  SettingsCard,
  SettingsPageHeader,
  settingsInputClass,
} from "@/app/admin/settings/_components";
import { useAdminSettings } from "@/lib/admin-settings/use-admin-settings";

export default function AdminSettingsOrganisationPage() {
  const settings = useAdminSettings();

  return (
    <div className="space-y-6">
      <SettingsPageHeader
        icon={Building2}
        title="Organisation"
        description="Manage the core organisation details used across admin communications and customer-facing workflows."
      />

      {settings.error ? <SettingsBanner kind="error" message={settings.error} /> : null}
      {settings.okMsg ? <SettingsBanner kind="success" message={settings.okMsg} /> : null}

      <SettingsCard
        icon={Building2}
        title="Organisation Details"
        description="These values now act as the central source of truth for billing identity and invoice payment instructions."
      >
        <div className="space-y-5">
          <div className="rounded-xl border border-slate-200 bg-slate-50 p-4">
            <div className="mb-4 flex items-center gap-2 text-sm font-semibold text-slate-900">
              <Building className="h-4 w-4 text-[#B9382E]" />
              Business identity
            </div>
            <div className="grid gap-4 md:grid-cols-2">
              <label className="flex flex-col gap-1">
                <span className="text-sm font-medium text-slate-700">Company name</span>
                <input
                  type="text"
                  value={settings.orgName}
                  onChange={(e) => settings.setOrgName(e.target.value)}
                  disabled={settings.loading}
                  className={settingsInputClass}
                />
              </label>

              <label className="flex flex-col gap-1">
                <span className="text-sm font-medium text-slate-700">UEN</span>
                <input
                  type="text"
                  value={settings.companyUen}
                  onChange={(e) => settings.setCompanyUen(e.target.value)}
                  disabled={settings.loading}
                  className={settingsInputClass}
                />
              </label>

              <label className="flex flex-col gap-1 md:col-span-2">
                <span className="text-sm font-medium text-slate-700">Address</span>
                <textarea
                  rows={4}
                  value={settings.companyAddress}
                  onChange={(e) => settings.setCompanyAddress(e.target.value)}
                  disabled={settings.loading}
                  className={settingsInputClass}
                  placeholder="Address line 1&#10;Address line 2&#10;Singapore 123456"
                />
              </label>

              <label className="flex flex-col gap-1">
                <span className="text-sm font-medium text-slate-700">GST</span>
                <input
                  type="text"
                  value={settings.companyGstRegNo}
                  onChange={(e) => settings.setCompanyGstRegNo(e.target.value)}
                  disabled={settings.loading}
                  className={settingsInputClass}
                />
              </label>
            </div>
          </div>

          <div className="rounded-xl border border-slate-200 bg-slate-50 p-4">
            <div className="mb-4 flex items-center gap-2 text-sm font-semibold text-slate-900">
              <Mail className="h-4 w-4 text-[#B9382E]" />
              Contact details
            </div>
            <div className="grid gap-4 md:grid-cols-2">
              <label className="flex flex-col gap-1">
                <span className="text-sm font-medium text-slate-700">Email</span>
                <input
                  type="email"
                  value={settings.supportEmail}
                  onChange={(e) => settings.setSupportEmail(e.target.value)}
                  disabled={settings.loading}
                  className={settingsInputClass}
                />
              </label>

              <label className="flex flex-col gap-1">
                <span className="text-sm font-medium text-slate-700">Phone</span>
                <input
                  type="tel"
                  value={settings.companyPhone}
                  onChange={(e) => settings.setCompanyPhone(e.target.value)}
                  disabled={settings.loading}
                  className={settingsInputClass}
                  placeholder="+65 6123 4567"
                />
              </label>

              <label className="flex flex-col gap-1">
                <span className="text-sm font-medium text-slate-700">WhatsApp business number</span>
                <input
                  type="tel"
                  value={settings.whatsappNumber}
                  onChange={(e) => settings.setWhatsappNumber(e.target.value)}
                  disabled={settings.loading}
                  className={settingsInputClass}
                  placeholder="+65 9123 4567"
                />
                <span className="text-xs text-slate-500">
                  Used later for WhatsApp Cloud API and workflow integrations.
                </span>
              </label>
            </div>
          </div>

          <div className="rounded-xl border border-slate-200 bg-slate-50 p-4">
            <div className="mb-4 flex items-center gap-2 text-sm font-semibold text-slate-900">
              <CreditCard className="h-4 w-4 text-[#B9382E]" />
              Payment details
            </div>
            <div className="grid gap-4 md:grid-cols-3">
              <label className="flex flex-col gap-1">
                <span className="text-sm font-medium text-slate-700">Bank Name</span>
                <input
                  type="text"
                  value={settings.bankName}
                  onChange={(e) => settings.setBankName(e.target.value)}
                  disabled={settings.loading}
                  className={settingsInputClass}
                />
              </label>

              <label className="flex flex-col gap-1">
                <span className="text-sm font-medium text-slate-700">Account Name</span>
                <input
                  type="text"
                  value={settings.bankAccountName}
                  onChange={(e) => settings.setBankAccountName(e.target.value)}
                  disabled={settings.loading}
                  className={settingsInputClass}
                />
              </label>

              <label className="flex flex-col gap-1">
                <span className="text-sm font-medium text-slate-700">Account Number</span>
                <input
                  type="text"
                  value={settings.bankAccountNumber}
                  onChange={(e) => settings.setBankAccountNumber(e.target.value)}
                  disabled={settings.loading}
                  className={settingsInputClass}
                />
              </label>
            </div>
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
