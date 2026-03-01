"use client";

import { useEffect, useMemo, useState } from "react";
import { useAppSettings } from "@/lib/app-settings";

type OrgSettingsDto = {
  orgName: string;
  supportEmail: string;
  whatsappNumber?: string | null;
  brandingLogoUrl?: string | null;

  adminNotificationEmails: string[];
  bccTesterEnabled: boolean;
  testerEmails: string[];

  bookingPaidRecipients: string[];
  overdueRecipients: string[];

  updatedAt: string;
};

function parseEmailsCsv(input: string): string[] {
  return input
    .split(",")
    .map((s) => s.trim())
    .filter(Boolean);
}

function toCsv(arr: string[] | undefined | null): string {
  return (arr ?? []).join(", ");
}

export default function AdminSettingsPage() {
  const { developerMode, demoMode, setDeveloperMode, setDemoMode } =
    useAppSettings();

  // --- backend settings state ---
  const [loading, setLoading] = useState(true);
  const [saving, setSaving] = useState(false);
  const [testing, setTesting] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [okMsg, setOkMsg] = useState<string | null>(null);

  // Basic org
  const [orgName, setOrgName] = useState("");
  const [supportEmail, setSupportEmail] = useState("");
  const [whatsappNumber, setWhatsappNumber] = useState("");

  // Notifications
  const [adminNotificationEmailsCsv, setAdminNotificationEmailsCsv] =
    useState("");
  const [bookingPaidRecipientsCsv, setBookingPaidRecipientsCsv] = useState("");
  const [overdueRecipientsCsv, setOverdueRecipientsCsv] = useState("");

  // Tester BCC
  const [bccTesterEnabled, setBccTesterEnabled] = useState(false);
  const [testerEmailsCsv, setTesterEmailsCsv] = useState("");

  const adminKey = process.env.NEXT_PUBLIC_ADMIN_API_KEY;

  const headers = useMemo(() => {
    const h: Record<string, string> = { "Content-Type": "application/json" };
    if (adminKey) h["x-admin-key"] = adminKey;
    return h;
  }, [adminKey]);

  async function load() {
    setLoading(true);
    setError(null);
    setOkMsg(null);

    try {
      const res = await fetch("/api/backend/admin/settings", {
        method: "GET",
        headers,
        cache: "no-store",
      });

      if (!res.ok) {
        const text = await res.text();
        throw new Error(text || `Failed to load settings (${res.status})`);
      }

      const data: OrgSettingsDto = await res.json();

      setOrgName(data.orgName ?? "");
      setSupportEmail(data.supportEmail ?? "");
      setWhatsappNumber(data.whatsappNumber ?? "");

      setAdminNotificationEmailsCsv(toCsv(data.adminNotificationEmails));
      setBookingPaidRecipientsCsv(toCsv(data.bookingPaidRecipients));
      setOverdueRecipientsCsv(toCsv(data.overdueRecipients));

      setBccTesterEnabled(!!data.bccTesterEnabled);
      setTesterEmailsCsv(toCsv(data.testerEmails));
    } catch (e: any) {
      setError(e?.message ?? "Failed to load settings");
    } finally {
      setLoading(false);
    }
  }

  useEffect(() => {
    load();
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, []);

  async function save() {
    setSaving(true);
    setError(null);
    setOkMsg(null);

    try {
      const payload = {
        orgName,
        supportEmail,
        whatsappNumber,

        adminNotificationEmails: parseEmailsCsv(adminNotificationEmailsCsv),
        bookingPaidRecipients: parseEmailsCsv(bookingPaidRecipientsCsv),
        overdueRecipients: parseEmailsCsv(overdueRecipientsCsv),

        bccTesterEnabled,
        testerEmails: parseEmailsCsv(testerEmailsCsv),
      };

      const res = await fetch("/api/backend/admin/settings", {
        method: "PUT",
        headers,
        body: JSON.stringify(payload),
      });

      if (!res.ok) {
        const text = await res.text();
        throw new Error(text || `Failed to save settings (${res.status})`);
      }

      setOkMsg("Settings saved.");
      await load();
    } catch (e: any) {
      setError(e?.message ?? "Failed to save settings");
    } finally {
      setSaving(false);
    }
  }

  async function sendTestEmail() {
    setTesting(true);
    setError(null);
    setOkMsg(null);

    try {
      const res = await fetch("/api/backend/admin/settings/test-email", {
        method: "POST",
        headers,
      });

      if (!res.ok) {
        const text = await res.text();
        throw new Error(text || `Failed to send test email (${res.status})`);
      }

      setOkMsg("Test email sent (check inbox + spam).");
    } catch (e: any) {
      setError(e?.message ?? "Failed to send test email");
    } finally {
      setTesting(false);
    }
  }

  const inputClass =
    "border rounded px-2 py-1 text-sm outline-none focus:border-indigo-500 focus:ring-2 focus:ring-indigo-200 disabled:opacity-60";

  return (
    <div className="p-6 space-y-6 max-w-5xl">
      <div className="space-y-1">
        <h1 className="text-2xl font-semibold">Settings</h1>
        <p className="text-sm text-slate-600">
          Configure organisation details and notification routing.
        </p>
      </div>

      {!adminKey && (
        <div className="rounded-md bg-amber-50 border border-amber-200 px-3 py-2 text-sm text-amber-800">
          Missing{" "}
          <span className="font-mono">NEXT_PUBLIC_ADMIN_API_KEY</span>. Settings
          API calls will fail unless you add it.
        </div>
      )}

      {error && (
        <div className="rounded-md bg-red-50 border border-red-200 px-3 py-2 text-sm text-red-800">
          {error}
        </div>
      )}

      {okMsg && (
        <div className="rounded-md bg-green-50 border border-green-200 px-3 py-2 text-sm text-green-800">
          {okMsg}
        </div>
      )}

      <form
        className="space-y-6"
        onSubmit={(e) => {
          e.preventDefault();
          save();
        }}
      >
        {/* 1) Org */}
        <section className="space-y-3 border rounded-xl p-4 bg-white shadow-sm">
          <h2 className="text-lg font-medium">1. Organisation</h2>
          <p className="text-xs text-slate-500">
            These details are used in emails and (later) customer-facing pages.
          </p>

          <div className="grid gap-4 md:grid-cols-2">
            <label className="flex flex-col gap-1">
              <span className="text-sm">Organisation name</span>
              <input
                type="text"
                value={orgName}
                onChange={(e) => setOrgName(e.target.value)}
                disabled={loading}
                className={inputClass}
              />
            </label>

            <label className="flex flex-col gap-1">
              <span className="text-sm">Support email</span>
              <input
                type="email"
                value={supportEmail}
                onChange={(e) => setSupportEmail(e.target.value)}
                disabled={loading}
                className={inputClass}
              />
            </label>
          </div>

          <label className="flex flex-col gap-1">
            <span className="text-sm">WhatsApp business number</span>
            <input
              type="tel"
              value={whatsappNumber}
              onChange={(e) => setWhatsappNumber(e.target.value)}
              disabled={loading}
              className={inputClass}
              placeholder="+65 9123 4567"
            />
            <span className="text-xs text-slate-500">
              Used later for WhatsApp Cloud API and workflow integrations.
            </span>
          </label>
        </section>

        {/* 2) Notifications */}
        <section className="space-y-3 border rounded-xl p-4 bg-white shadow-sm">
          <h2 className="text-lg font-medium">2. Notification Routing</h2>
          <p className="text-xs text-slate-500">
            Control where operational notifications are delivered.
          </p>

          <div className="grid gap-4 md:grid-cols-2">
            <label className="flex flex-col gap-1">
              <span className="text-sm">
                Default admin notification emails (CSV)
              </span>
              <input
                type="text"
                value={adminNotificationEmailsCsv}
                onChange={(e) => setAdminNotificationEmailsCsv(e.target.value)}
                disabled={loading}
                className={inputClass}
                placeholder="ops@company.com, dispatcher@company.com"
              />
              <span className="text-xs text-slate-500">
                Fallback if event-specific recipients are empty.
              </span>
            </label>

            <label className="flex flex-col gap-1">
              <span className="text-sm">Booking paid recipients (CSV)</span>
              <input
                type="text"
                value={bookingPaidRecipientsCsv}
                onChange={(e) => setBookingPaidRecipientsCsv(e.target.value)}
                disabled={loading}
                className={inputClass}
                placeholder="dispatch@company.com"
              />
              <span className="text-xs text-slate-500">
                Event-specific override for paid bookings.
              </span>
            </label>

            <label className="flex flex-col gap-1">
              <span className="text-sm">
                Overdue / delayed job recipients (CSV)
              </span>
              <input
                type="text"
                value={overdueRecipientsCsv}
                onChange={(e) => setOverdueRecipientsCsv(e.target.value)}
                disabled={loading}
                className={inputClass}
                placeholder="ops@company.com"
              />
            </label>
          </div>

          {/* Tester BCC */}
          <div className="mt-2 rounded-lg border border-slate-200 bg-slate-50 p-3">
            <div className="flex items-center justify-between gap-4">
              <div>
                <p className="text-sm font-medium">BCC tester emails</p>
                <p className="text-xs text-slate-600">
                  If enabled, admin notification emails will also BCC the tester
                  list (useful for UAT).
                </p>
              </div>

              <button
                type="button"
                onClick={() => setBccTesterEnabled(!bccTesterEnabled)}
                className={[
                  "relative inline-flex h-6 w-11 items-center rounded-full border transition",
                  bccTesterEnabled
                    ? "border-indigo-600 bg-indigo-600"
                    : "border-slate-300 bg-white",
                ].join(" ")}
                aria-pressed={bccTesterEnabled}
                aria-label="Toggle BCC Tester"
              >
                <span
                  className={[
                    "inline-block h-5 w-5 transform rounded-full bg-white shadow transition",
                    bccTesterEnabled ? "translate-x-5" : "translate-x-1",
                  ].join(" ")}
                />
              </button>
            </div>

            <label className="mt-3 flex flex-col gap-1">
              <span className="text-sm">Tester emails (CSV)</span>
              <input
                type="text"
                value={testerEmailsCsv}
                onChange={(e) => setTesterEmailsCsv(e.target.value)}
                disabled={loading}
                className={inputClass}
                placeholder="tester@company.com"
              />
            </label>

            <div className="mt-3 flex flex-wrap gap-2">
              <button
                type="button"
                onClick={sendTestEmail}
                disabled={loading || testing}
                className="px-3 py-2 rounded-md bg-indigo-600 text-white text-sm font-medium hover:bg-indigo-700 disabled:opacity-50"
              >
                {testing ? "Sending test..." : "Send test email"}
              </button>
            </div>
          </div>
        </section>

        {/* 3) Developer tools */}
        <section className="space-y-3 border rounded-xl p-4 bg-white shadow-sm">
          <h2 className="text-lg font-medium">3. Developer Tools</h2>
          <p className="text-xs text-slate-500">
            Controls demo/testing switches in the admin UI.
          </p>

          <div className="space-y-3">
            <div className="flex items-center justify-between gap-4">
              <div>
                <p className="text-sm font-medium">Developer Mode</p>
                <p className="text-xs text-slate-600">
                  Enables extra switches for demo/testing. Turning this off also
                  disables Demo Mode.
                </p>
              </div>

              <button
                type="button"
                onClick={() => setDeveloperMode(!developerMode)}
                className={[
                  "relative inline-flex h-6 w-11 items-center rounded-full border transition",
                  developerMode
                    ? "border-indigo-600 bg-indigo-600"
                    : "border-slate-300 bg-white",
                ].join(" ")}
                aria-pressed={developerMode}
                aria-label="Toggle Developer Mode"
              >
                <span
                  className={[
                    "inline-block h-5 w-5 transform rounded-full bg-white shadow transition",
                    developerMode ? "translate-x-5" : "translate-x-1",
                  ].join(" ")}
                />
              </button>
            </div>

            {developerMode && (
              <div className="flex items-center justify-between gap-4">
                <div>
                  <p className="text-sm font-medium">Demo Mode</p>
                  <p className="text-xs text-slate-600">
                    Shows mock data with a{" "}
                    <span className="text-red-600 font-semibold">MOCK</span>{" "}
                    badge.
                  </p>
                </div>

                <button
                  type="button"
                  onClick={() => setDemoMode(!demoMode)}
                  className={[
                    "relative inline-flex h-6 w-11 items-center rounded-full border transition",
                    demoMode
                      ? "border-red-600 bg-red-600"
                      : "border-slate-300 bg-white",
                  ].join(" ")}
                  aria-pressed={demoMode}
                  aria-label="Toggle Demo Mode"
                >
                  <span
                    className={[
                      "inline-block h-5 w-5 transform rounded-full bg-white shadow transition",
                      demoMode ? "translate-x-5" : "translate-x-1",
                    ].join(" ")}
                  />
                </button>
              </div>
            )}
          </div>
        </section>

        {/* Actions */}
        <div className="flex flex-wrap gap-2">
          <button
            type="submit"
            disabled={loading || saving}
            className="px-4 py-2 rounded-md bg-emerald-600 text-white text-sm font-medium hover:bg-emerald-700 disabled:opacity-50"
          >
            {saving ? "Saving..." : "Save changes"}
          </button>

          <button
            type="button"
            onClick={load}
            disabled={loading}
            className="px-4 py-2 rounded-md border border-slate-300 bg-white text-sm font-medium hover:bg-slate-50 disabled:opacity-50"
          >
            Reload
          </button>
        </div>
      </form>
    </div>
  );
}
