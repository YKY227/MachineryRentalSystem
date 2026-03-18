// rental-system-frontend/src/lib/admin-settings/use-admin-settings.ts
"use client";

import { useCallback, useEffect, useMemo, useState } from "react";

import { useAppSettings } from "@/lib/app-settings";

export type OrgSettingsDto = {
  orgName: string;
  supportEmail: string;
  whatsappNumber?: string | null;
  companyUen?: string | null;
  companyGstRegNo?: string | null;
  companyAddress?: string | null;
  companyPhone?: string | null;
  bankName?: string | null;
  bankAccountName?: string | null;
  bankAccountNumber?: string | null;
  brandingLogoUrl?: string | null;
  adminNotificationEmails: string[];
  bccTesterEnabled: boolean;
  testerEmails: string[];
  bookingPaidRecipients: string[];
  overdueRecipients: string[];
  operationsPolicy: {
    defaultMaintenanceBufferDays: number;
    enableDeveloperDeleteTools: boolean;
  };
  reminderPolicy: {
    remindersEnabled: boolean;
    firstReminderDays: number;
    secondReminderDays: number;
    finalReminderDays: number;
    reminderGuardWindowHours: number;
    reminderBatchLimit: number;
  };
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

export function useAdminSettings() {
  const { developerMode, demoMode, setDeveloperMode, setDemoMode } = useAppSettings();

  const [loading, setLoading] = useState(true);
  const [saving, setSaving] = useState(false);
  const [testing, setTesting] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [okMsg, setOkMsg] = useState<string | null>(null);

  const [orgName, setOrgName] = useState("");
  const [supportEmail, setSupportEmail] = useState("");
  const [whatsappNumber, setWhatsappNumber] = useState("");
  const [companyUen, setCompanyUen] = useState("");
  const [companyGstRegNo, setCompanyGstRegNo] = useState("");
  const [companyAddress, setCompanyAddress] = useState("");
  const [companyPhone, setCompanyPhone] = useState("");
  const [bankName, setBankName] = useState("");
  const [bankAccountName, setBankAccountName] = useState("");
  const [bankAccountNumber, setBankAccountNumber] = useState("");
  const [adminNotificationEmailsCsv, setAdminNotificationEmailsCsv] = useState("");
  const [bookingPaidRecipientsCsv, setBookingPaidRecipientsCsv] = useState("");
  const [overdueRecipientsCsv, setOverdueRecipientsCsv] = useState("");
  const [bccTesterEnabled, setBccTesterEnabled] = useState(false);
  const [testerEmailsCsv, setTesterEmailsCsv] = useState("");
  const [defaultMaintenanceBufferDays, setDefaultMaintenanceBufferDays] = useState("7");
  const [enableDeveloperDeleteTools, setEnableDeveloperDeleteTools] = useState(false);
  const [remindersEnabled, setRemindersEnabled] = useState(true);
  const [firstReminderDays, setFirstReminderDays] = useState("3");
  const [secondReminderDays, setSecondReminderDays] = useState("7");
  const [finalReminderDays, setFinalReminderDays] = useState("14");
  const [reminderGuardWindowHours, setReminderGuardWindowHours] = useState("24");
  const [reminderBatchLimit, setReminderBatchLimit] = useState("50");

  const headers = useMemo(() => ({ "Content-Type": "application/json" }), []);

  const clearMessages = useCallback(() => {
    setError(null);
    setOkMsg(null);
  }, []);

  const load = useCallback(async () => {
    setLoading(true);
    clearMessages();

    try {
      const res = await fetch("/api/admin/settings", {
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
      setCompanyUen(data.companyUen ?? "");
      setCompanyGstRegNo(data.companyGstRegNo ?? "");
      setCompanyAddress(data.companyAddress ?? "");
      setCompanyPhone(data.companyPhone ?? "");
      setBankName(data.bankName ?? "");
      setBankAccountName(data.bankAccountName ?? "");
      setBankAccountNumber(data.bankAccountNumber ?? "");
      setAdminNotificationEmailsCsv(toCsv(data.adminNotificationEmails));
      setBookingPaidRecipientsCsv(toCsv(data.bookingPaidRecipients));
      setOverdueRecipientsCsv(toCsv(data.overdueRecipients));
      setBccTesterEnabled(Boolean(data.bccTesterEnabled));
      setTesterEmailsCsv(toCsv(data.testerEmails));
      setDefaultMaintenanceBufferDays(
        String(data.operationsPolicy?.defaultMaintenanceBufferDays ?? 7)
      );
      setEnableDeveloperDeleteTools(
        Boolean(data.operationsPolicy?.enableDeveloperDeleteTools)
      );
      setRemindersEnabled(Boolean(data.reminderPolicy?.remindersEnabled));
      setFirstReminderDays(String(data.reminderPolicy?.firstReminderDays ?? 3));
      setSecondReminderDays(String(data.reminderPolicy?.secondReminderDays ?? 7));
      setFinalReminderDays(String(data.reminderPolicy?.finalReminderDays ?? 14));
      setReminderGuardWindowHours(
        String(data.reminderPolicy?.reminderGuardWindowHours ?? 24)
      );
      setReminderBatchLimit(String(data.reminderPolicy?.reminderBatchLimit ?? 50));
    } catch (e) {
      setError(e instanceof Error ? e.message : "Failed to load settings");
    } finally {
      setLoading(false);
    }
  }, [clearMessages, headers]);

  useEffect(() => {
    load();
  }, [load]);

  const save = useCallback(async () => {
    setSaving(true);
    clearMessages();

    try {
      const payload = {
        orgName,
        supportEmail,
        whatsappNumber,
        companyUen,
        companyGstRegNo,
        companyAddress,
        companyPhone,
        bankName,
        bankAccountName,
        bankAccountNumber,
        adminNotificationEmails: parseEmailsCsv(adminNotificationEmailsCsv),
        bookingPaidRecipients: parseEmailsCsv(bookingPaidRecipientsCsv),
        overdueRecipients: parseEmailsCsv(overdueRecipientsCsv),
        bccTesterEnabled,
        testerEmails: parseEmailsCsv(testerEmailsCsv),
        operationsPolicy: {
          defaultMaintenanceBufferDays,
          enableDeveloperDeleteTools,
        },
        reminderPolicy: {
          remindersEnabled,
          firstReminderDays,
          secondReminderDays,
          finalReminderDays,
          reminderGuardWindowHours,
          reminderBatchLimit,
        },
      };

      const res = await fetch("/api/admin/settings", {
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
    } catch (e) {
      setError(e instanceof Error ? e.message : "Failed to save settings");
    } finally {
      setSaving(false);
    }
  }, [
    adminNotificationEmailsCsv,
    bankAccountName,
    bankAccountNumber,
    bankName,
    bccTesterEnabled,
    bookingPaidRecipientsCsv,
    clearMessages,
    companyAddress,
    companyGstRegNo,
    companyPhone,
    companyUen,
    defaultMaintenanceBufferDays,
    enableDeveloperDeleteTools,
    finalReminderDays,
    firstReminderDays,
    headers,
    load,
    orgName,
    overdueRecipientsCsv,
    reminderBatchLimit,
    reminderGuardWindowHours,
    remindersEnabled,
    secondReminderDays,
    supportEmail,
    testerEmailsCsv,
    whatsappNumber,
  ]);

  const sendTestEmail = useCallback(async () => {
    setTesting(true);
    clearMessages();

    try {
      const res = await fetch("/api/admin/settings/test-email", {
        method: "POST",
        headers,
      });

      if (!res.ok) {
        const text = await res.text();
        throw new Error(text || `Failed to send test email (${res.status})`);
      }

      setOkMsg("Test email sent (check inbox + spam).");
    } catch (e) {
      setError(e instanceof Error ? e.message : "Failed to send test email");
    } finally {
      setTesting(false);
    }
  }, [clearMessages, headers]);

  return {
    loading,
    saving,
    testing,
    error,
    okMsg,
    clearMessages,
    load,
    save,
    sendTestEmail,
    developerMode,
    demoMode,
    setDeveloperMode,
    setDemoMode,
    orgName,
    setOrgName,
    supportEmail,
    setSupportEmail,
    whatsappNumber,
    setWhatsappNumber,
    companyUen,
    setCompanyUen,
    companyGstRegNo,
    setCompanyGstRegNo,
    companyAddress,
    setCompanyAddress,
    companyPhone,
    setCompanyPhone,
    bankName,
    setBankName,
    bankAccountName,
    setBankAccountName,
    bankAccountNumber,
    setBankAccountNumber,
    adminNotificationEmailsCsv,
    setAdminNotificationEmailsCsv,
    bookingPaidRecipientsCsv,
    setBookingPaidRecipientsCsv,
    overdueRecipientsCsv,
    setOverdueRecipientsCsv,
    bccTesterEnabled,
    setBccTesterEnabled,
    testerEmailsCsv,
    setTesterEmailsCsv,
    defaultMaintenanceBufferDays,
    setDefaultMaintenanceBufferDays,
    enableDeveloperDeleteTools,
    setEnableDeveloperDeleteTools,
    remindersEnabled,
    setRemindersEnabled,
    firstReminderDays,
    setFirstReminderDays,
    secondReminderDays,
    setSecondReminderDays,
    finalReminderDays,
    setFinalReminderDays,
    reminderGuardWindowHours,
    setReminderGuardWindowHours,
    reminderBatchLimit,
    setReminderBatchLimit,
  };
}
