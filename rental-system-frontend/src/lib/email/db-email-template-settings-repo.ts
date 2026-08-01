import "server-only";

import { supabaseAdmin } from "@/lib/supabase/server";

import type {
  EmailTemplateFieldValues,
  EmailTemplateId,
} from "@/lib/email/email-template-registry";

const SYSTEM_SETTINGS_TABLE =
  process.env.SUPABASE_SYSTEM_SETTINGS_TABLE ?? "system_settings";
const EMAIL_TEMPLATE_SETTINGS_KEY = "email_template_overrides_v1";

type SystemSettingRow = {
  key: string;
  value: unknown;
  updated_at: string;
};

export type EmailTemplateOverrideMap = Partial<
  Record<EmailTemplateId, Partial<EmailTemplateFieldValues>>
>;

function nowIso() {
  return new Date().toISOString();
}

function trimOptionalString(value: unknown) {
  return typeof value === "string" ? value.trim() : "";
}

function sanitizeTemplateFields(
  value: unknown
): Partial<EmailTemplateFieldValues> {
  const raw = value && typeof value === "object" ? (value as Record<string, unknown>) : {};
  const next: Partial<EmailTemplateFieldValues> = {};

  for (const key of ["subject", "heading", "intro", "footer", "ctaLabel"] as const) {
    const trimmed = trimOptionalString(raw[key]);
    if (trimmed) next[key] = trimmed;
  }

  return next;
}

function sanitizeOverrideMap(value: unknown): EmailTemplateOverrideMap {
  const raw = value && typeof value === "object" ? (value as Record<string, unknown>) : {};
  const next: EmailTemplateOverrideMap = {};

  for (const [key, entry] of Object.entries(raw)) {
    const sanitized = sanitizeTemplateFields(entry);
    if (!Object.keys(sanitized).length) continue;
    next[key as EmailTemplateId] = sanitized;
  }

  return next;
}

async function readOverrides(): Promise<{
  overrides: EmailTemplateOverrideMap;
  updatedAt: string;
}> {
  const supabase = supabaseAdmin();
  const { data, error } = await supabase
    .from(SYSTEM_SETTINGS_TABLE)
    .select("key,value,updated_at")
    .eq("key", EMAIL_TEMPLATE_SETTINGS_KEY)
    .maybeSingle<SystemSettingRow>();

  if (error) throw new Error(`Email template settings read failed: ${error.message}`);
  if (!data) return { overrides: {}, updatedAt: nowIso() };
  return {
    overrides: sanitizeOverrideMap(data.value),
    updatedAt: data.updated_at,
  };
}

async function writeOverrides(overrides: EmailTemplateOverrideMap) {
  const supabase = supabaseAdmin();
  const updatedAt = nowIso();
  const { data, error } = await supabase
    .from(SYSTEM_SETTINGS_TABLE)
    .upsert(
      {
        key: EMAIL_TEMPLATE_SETTINGS_KEY,
        value: overrides,
        updated_at: updatedAt,
      },
      { onConflict: "key" }
    )
    .select("key,value,updated_at")
    .single<SystemSettingRow>();

  if (error) throw new Error(`Email template settings write failed: ${error.message}`);
  return {
    overrides: sanitizeOverrideMap(data.value),
    updatedAt: data.updated_at,
  };
}

export const dbEmailTemplateSettingsRepo = {
  async getAll() {
    return readOverrides();
  },

  async updateTemplate(
    templateId: EmailTemplateId,
    fields: Partial<EmailTemplateFieldValues>
  ) {
    const current = await readOverrides();
    const next = {
      ...current.overrides,
      [templateId]: sanitizeTemplateFields(fields),
    } satisfies EmailTemplateOverrideMap;

    if (!Object.keys(next[templateId] ?? {}).length) {
      delete next[templateId];
    }

    return writeOverrides(next);
  },

  async restoreTemplate(templateId: EmailTemplateId) {
    const current = await readOverrides();
    const next = { ...current.overrides };
    delete next[templateId];
    return writeOverrides(next);
  },
};
