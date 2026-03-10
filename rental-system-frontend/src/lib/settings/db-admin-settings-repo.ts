import "server-only";

import { supabaseAdmin } from "@/lib/supabase/server";

const SYSTEM_SETTINGS_TABLE =
  process.env.SUPABASE_SYSTEM_SETTINGS_TABLE ?? "system_settings";

const ADMIN_ORG_SETTINGS_KEY = "admin_org_settings";
const ADMIN_NOTIFICATION_SETTINGS_KEY = "admin_notification_settings";
const REMINDER_POLICY_SETTINGS_KEY = "rental_invoice_reminder_policy";

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
  adminNotificationEmails: string[];
  bccTesterEnabled: boolean;
  testerEmails: string[];
  bookingPaidRecipients: string[];
  overdueRecipients: string[];
  reminderPolicy: ReminderPolicySettings;
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
};

const DEFAULT_ADMIN_NOTIFICATION_SETTINGS: AdminNotificationSettingsValue = {
  adminNotificationEmails: [],
  bccTesterEnabled: false,
  testerEmails: [],
  bookingPaidRecipients: [],
  overdueRecipients: [],
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
    const [orgSettings, notificationSettings, reminderPolicy] = await Promise.all([
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
    ]);

    const updatedAt = [orgSettings.updatedAt, notificationSettings.updatedAt, reminderPolicy.updatedAt]
      .filter(Boolean)
      .sort()
      .at(-1) ?? nowIso();

    return {
      ...orgSettings.value,
      ...notificationSettings.value,
      reminderPolicy: reminderPolicy.value,
      updatedAt,
    };
  },

  async update(input: Omit<AdminSettings, "updatedAt">): Promise<AdminSettings> {
    const [orgSettings, notificationSettings, reminderPolicy] = await Promise.all([
      upsertSetting(ADMIN_ORG_SETTINGS_KEY, sanitizeAdminOrgSettings(input)),
      upsertSetting(ADMIN_NOTIFICATION_SETTINGS_KEY, sanitizeAdminNotificationSettings(input)),
      upsertSetting(REMINDER_POLICY_SETTINGS_KEY, sanitizeReminderPolicy(input.reminderPolicy)),
    ]);

    return {
      ...sanitizeAdminOrgSettings(orgSettings.value),
      ...sanitizeAdminNotificationSettings(notificationSettings.value),
      reminderPolicy: sanitizeReminderPolicy(reminderPolicy.value),
      updatedAt: [orgSettings.updatedAt, notificationSettings.updatedAt, reminderPolicy.updatedAt]
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
};
