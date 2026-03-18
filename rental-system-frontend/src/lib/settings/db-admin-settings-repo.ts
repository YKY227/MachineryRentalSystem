// rental-system-frontend/src/lib/settings/db-admin-settings-repo.ts
import "server-only";

import { supabaseAdmin } from "@/lib/supabase/server";

const SYSTEM_SETTINGS_TABLE =
  process.env.SUPABASE_SYSTEM_SETTINGS_TABLE ?? "system_settings";

const ADMIN_ORG_SETTINGS_KEY = "admin_org_settings";
const ADMIN_NOTIFICATION_SETTINGS_KEY = "admin_notification_settings";
const REMINDER_POLICY_SETTINGS_KEY = "rental_invoice_reminder_policy";
const OPERATIONS_POLICY_SETTINGS_KEY = "rental_operations_policy";

export type ReminderPolicySettings = {
  remindersEnabled: boolean;
  firstReminderDays: number;
  secondReminderDays: number;
  finalReminderDays: number;
  reminderGuardWindowHours: number;
  reminderBatchLimit: number;
};

export type AdminSettings = {
  orgName: string;
  supportEmail: string;
  whatsappNumber: string | null;
  companyUen: string | null;
  companyGstRegNo: string | null;
  companyAddress: string | null;
  companyPhone: string | null;
  bankName: string | null;
  bankAccountName: string | null;
  bankAccountNumber: string | null;
  adminNotificationEmails: string[];
  bccTesterEnabled: boolean;
  testerEmails: string[];
  bookingPaidRecipients: string[];
  overdueRecipients: string[];
  reminderPolicy: ReminderPolicySettings;
  operationsPolicy: {
    defaultMaintenanceBufferDays: number;
    enableDeveloperDeleteTools: boolean;
  };
  updatedAt: string;
};

type SystemSettingRow = {
  key: string;
  value: unknown;
  updated_at: string;
};

type AdminOrgSettingsValue = {
  orgName: string;
  supportEmail: string;
  whatsappNumber: string | null;
  companyUen: string | null;
  companyGstRegNo: string | null;
  companyAddress: string | null;
  companyPhone: string | null;
  bankName: string | null;
  bankAccountName: string | null;
  bankAccountNumber: string | null;
};

type AdminNotificationSettingsValue = {
  adminNotificationEmails: string[];
  bccTesterEnabled: boolean;
  testerEmails: string[];
  bookingPaidRecipients: string[];
  overdueRecipients: string[];
};

const DEFAULT_ADMIN_ORG_SETTINGS: AdminOrgSettingsValue = {
  orgName: "",
  supportEmail: "",
  whatsappNumber: null,
  companyUen: null,
  companyGstRegNo: null,
  companyAddress: null,
  companyPhone: null,
  bankName: null,
  bankAccountName: null,
  bankAccountNumber: null,
};

const DEFAULT_ADMIN_NOTIFICATION_SETTINGS: AdminNotificationSettingsValue = {
  adminNotificationEmails: [],
  bccTesterEnabled: false,
  testerEmails: [],
  bookingPaidRecipients: [],
  overdueRecipients: [],
};

export const DEFAULT_OPERATIONS_POLICY_SETTINGS = {
  defaultMaintenanceBufferDays: 7,
  enableDeveloperDeleteTools: false,
};

export const DEFAULT_REMINDER_POLICY_SETTINGS: ReminderPolicySettings = {
  remindersEnabled: true,
  firstReminderDays: 3,
  secondReminderDays: 7,
  finalReminderDays: 14,
  reminderGuardWindowHours: 24,
  reminderBatchLimit: 50,
};

function nowIso() {
  return new Date().toISOString();
}

function sanitizeStringArray(value: unknown): string[] {
  if (!Array.isArray(value)) return [];
  const seen = new Set<string>();
  const next: string[] = [];

  for (const item of value) {
    const trimmed = typeof item === "string" ? item.trim() : "";
    const key = trimmed.toLowerCase();
    if (!trimmed || seen.has(key)) continue;
    seen.add(key);
    next.push(trimmed);
  }

  return next;
}

function sanitizeReminderPolicy(value: unknown): ReminderPolicySettings {
  const raw = value && typeof value === "object" ? (value as Record<string, unknown>) : {};
  const normalizeInt = (input: unknown, fallback: number, minimum: number) => {
    const parsed =
      typeof input === "number"
        ? input
        : typeof input === "string"
          ? Number(input.trim())
          : Number.NaN;
    if (!Number.isFinite(parsed)) return fallback;
    return Math.max(minimum, Math.floor(parsed));
  };

  const firstReminderDays = normalizeInt(
    raw.firstReminderDays,
    DEFAULT_REMINDER_POLICY_SETTINGS.firstReminderDays,
    0
  );
  const secondReminderDays = Math.max(
    firstReminderDays,
    normalizeInt(raw.secondReminderDays, DEFAULT_REMINDER_POLICY_SETTINGS.secondReminderDays, 0)
  );
  const finalReminderDays = Math.max(
    secondReminderDays,
    normalizeInt(raw.finalReminderDays, DEFAULT_REMINDER_POLICY_SETTINGS.finalReminderDays, 0)
  );

  return {
    remindersEnabled:
      typeof raw.remindersEnabled === "boolean"
        ? raw.remindersEnabled
        : DEFAULT_REMINDER_POLICY_SETTINGS.remindersEnabled,
    firstReminderDays,
    secondReminderDays,
    finalReminderDays,
    reminderGuardWindowHours: normalizeInt(
      raw.reminderGuardWindowHours,
      DEFAULT_REMINDER_POLICY_SETTINGS.reminderGuardWindowHours,
      1
    ),
    reminderBatchLimit: normalizeInt(
      raw.reminderBatchLimit,
      DEFAULT_REMINDER_POLICY_SETTINGS.reminderBatchLimit,
      1
    ),
  };
}

function sanitizeAdminOrgSettings(value: unknown): AdminOrgSettingsValue {
  const raw = value && typeof value === "object" ? (value as Record<string, unknown>) : {};
  return {
    orgName: typeof raw.orgName === "string" ? raw.orgName.trim() : "",
    supportEmail: typeof raw.supportEmail === "string" ? raw.supportEmail.trim() : "",
    whatsappNumber:
      typeof raw.whatsappNumber === "string" && raw.whatsappNumber.trim()
        ? raw.whatsappNumber.trim()
        : null,
    companyUen:
      typeof raw.companyUen === "string" && raw.companyUen.trim()
        ? raw.companyUen.trim()
        : null,
    companyGstRegNo:
      typeof raw.companyGstRegNo === "string" && raw.companyGstRegNo.trim()
        ? raw.companyGstRegNo.trim()
        : null,
    companyAddress:
      typeof raw.companyAddress === "string" && raw.companyAddress.trim()
        ? raw.companyAddress.trim()
        : null,
    companyPhone:
      typeof raw.companyPhone === "string" && raw.companyPhone.trim()
        ? raw.companyPhone.trim()
        : null,
    bankName:
      typeof raw.bankName === "string" && raw.bankName.trim()
        ? raw.bankName.trim()
        : null,
    bankAccountName:
      typeof raw.bankAccountName === "string" && raw.bankAccountName.trim()
        ? raw.bankAccountName.trim()
        : null,
    bankAccountNumber:
      typeof raw.bankAccountNumber === "string" && raw.bankAccountNumber.trim()
        ? raw.bankAccountNumber.trim()
        : null,
  };
}

function sanitizeAdminNotificationSettings(value: unknown): AdminNotificationSettingsValue {
  const raw = value && typeof value === "object" ? (value as Record<string, unknown>) : {};
  return {
    adminNotificationEmails: sanitizeStringArray(raw.adminNotificationEmails),
    bccTesterEnabled: Boolean(raw.bccTesterEnabled),
    testerEmails: sanitizeStringArray(raw.testerEmails),
    bookingPaidRecipients: sanitizeStringArray(raw.bookingPaidRecipients),
    overdueRecipients: sanitizeStringArray(raw.overdueRecipients),
  };
}

function sanitizeOperationsPolicy(value: unknown): AdminSettings["operationsPolicy"] {
  const raw = value && typeof value === "object" ? (value as Record<string, unknown>) : {};
  const parsed =
    typeof raw.defaultMaintenanceBufferDays === "number"
      ? raw.defaultMaintenanceBufferDays
      : typeof raw.defaultMaintenanceBufferDays === "string"
        ? Number(raw.defaultMaintenanceBufferDays.trim())
        : Number.NaN;

  return {
    defaultMaintenanceBufferDays: Number.isFinite(parsed)
      ? Math.max(0, Math.floor(parsed))
      : DEFAULT_OPERATIONS_POLICY_SETTINGS.defaultMaintenanceBufferDays,
    enableDeveloperDeleteTools:
      typeof raw.enableDeveloperDeleteTools === "boolean"
        ? raw.enableDeveloperDeleteTools
        : DEFAULT_OPERATIONS_POLICY_SETTINGS.enableDeveloperDeleteTools,
  };
}

async function readSetting<T>(key: string, sanitize: (value: unknown) => T, fallback: T) {
  const supabase = supabaseAdmin();
  const { data, error } = await supabase
    .from(SYSTEM_SETTINGS_TABLE)
    .select("key,value,updated_at")
    .eq("key", key)
    .maybeSingle<SystemSettingRow>();

  if (error) throw new Error(`Settings read failed: ${error.message}`);
  if (!data) return { value: fallback, updatedAt: nowIso() };
  return { value: sanitize(data.value), updatedAt: data.updated_at };
}

async function upsertSetting<T>(key: string, value: T) {
  const supabase = supabaseAdmin();
  const updatedAt = nowIso();
  const { data, error } = await supabase
    .from(SYSTEM_SETTINGS_TABLE)
    .upsert(
      {
        key,
        value,
        updated_at: updatedAt,
      },
      { onConflict: "key" }
    )
    .select("key,value,updated_at")
    .single<SystemSettingRow>();

  if (error) throw new Error(`Settings write failed: ${error.message}`);
  return { value: data.value as T, updatedAt: data.updated_at };
}

export const dbAdminSettingsRepo = {
  async get(): Promise<AdminSettings> {
    const [orgSettings, notificationSettings, reminderPolicy, operationsPolicy] = await Promise.all([
      readSetting(ADMIN_ORG_SETTINGS_KEY, sanitizeAdminOrgSettings, DEFAULT_ADMIN_ORG_SETTINGS),
      readSetting(
        ADMIN_NOTIFICATION_SETTINGS_KEY,
        sanitizeAdminNotificationSettings,
        DEFAULT_ADMIN_NOTIFICATION_SETTINGS
      ),
      readSetting(
        REMINDER_POLICY_SETTINGS_KEY,
        sanitizeReminderPolicy,
        DEFAULT_REMINDER_POLICY_SETTINGS
      ),
      readSetting(
        OPERATIONS_POLICY_SETTINGS_KEY,
        sanitizeOperationsPolicy,
        DEFAULT_OPERATIONS_POLICY_SETTINGS
      ),
    ]);

    const updatedAt = [orgSettings.updatedAt, notificationSettings.updatedAt, reminderPolicy.updatedAt, operationsPolicy.updatedAt]
      .filter(Boolean)
      .sort()
      .at(-1) ?? nowIso();

    return {
      ...orgSettings.value,
      ...notificationSettings.value,
      reminderPolicy: reminderPolicy.value,
      operationsPolicy: operationsPolicy.value,
      updatedAt,
    };
  },

  async update(input: Omit<AdminSettings, "updatedAt">): Promise<AdminSettings> {
    const [orgSettings, notificationSettings, reminderPolicy, operationsPolicy] = await Promise.all([
      upsertSetting(ADMIN_ORG_SETTINGS_KEY, sanitizeAdminOrgSettings(input)),
      upsertSetting(ADMIN_NOTIFICATION_SETTINGS_KEY, sanitizeAdminNotificationSettings(input)),
      upsertSetting(REMINDER_POLICY_SETTINGS_KEY, sanitizeReminderPolicy(input.reminderPolicy)),
      upsertSetting(OPERATIONS_POLICY_SETTINGS_KEY, sanitizeOperationsPolicy(input.operationsPolicy)),
    ]);

    return {
      ...sanitizeAdminOrgSettings(orgSettings.value),
      ...sanitizeAdminNotificationSettings(notificationSettings.value),
      reminderPolicy: sanitizeReminderPolicy(reminderPolicy.value),
      operationsPolicy: sanitizeOperationsPolicy(operationsPolicy.value),
      updatedAt: [orgSettings.updatedAt, notificationSettings.updatedAt, reminderPolicy.updatedAt, operationsPolicy.updatedAt]
        .filter(Boolean)
        .sort()
        .at(-1) ?? nowIso(),
    };
  },

  async getReminderPolicy(): Promise<ReminderPolicySettings> {
    const setting = await readSetting(
      REMINDER_POLICY_SETTINGS_KEY,
      sanitizeReminderPolicy,
      DEFAULT_REMINDER_POLICY_SETTINGS
    );
    return setting.value;
  },

  async getOperationsPolicy(): Promise<AdminSettings["operationsPolicy"]> {
    const setting = await readSetting(
      OPERATIONS_POLICY_SETTINGS_KEY,
      sanitizeOperationsPolicy,
      DEFAULT_OPERATIONS_POLICY_SETTINGS
    );
    return setting.value;
  },
};
