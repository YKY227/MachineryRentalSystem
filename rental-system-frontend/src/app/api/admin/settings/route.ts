import { NextResponse } from "next/server";

import {
  adminUnauthorizedResponse,
  assertAdmin,
  isAdminUnauthorized,
} from "@/lib/auth/admin";
import {
  dbAdminSettingsRepo,
  DEFAULT_OPERATIONS_POLICY_SETTINGS,
  DEFAULT_REMINDER_POLICY_SETTINGS,
  type AdminSettings,
} from "@/lib/settings/db-admin-settings-repo";

export const runtime = "nodejs";
export const dynamic = "force-dynamic";
export const revalidate = 0;

type SettingsBody = {
  orgName?: string;
  supportEmail?: string;
  whatsappNumber?: string | null;
  companyUen?: string | null;
  companyGstRegNo?: string | null;
  companyAddress?: string | null;
  companyPhone?: string | null;
  bankName?: string | null;
  bankAccountName?: string | null;
  bankAccountNumber?: string | null;
  adminNotificationEmails?: string[];
  bccTesterEnabled?: boolean;
  testerEmails?: string[];
  bookingPaidRecipients?: string[];
  overdueRecipients?: string[];
  operationsPolicy?: {
    defaultMaintenanceBufferDays?: number | string;
    enableDeveloperDeleteTools?: boolean;
  };
  reminderPolicy?: {
    remindersEnabled?: boolean;
    firstReminderDays?: number | string;
    secondReminderDays?: number | string;
    finalReminderDays?: number | string;
    reminderGuardWindowHours?: number | string;
    reminderBatchLimit?: number | string;
  };
};

function sanitizeString(value: unknown) {
  return typeof value === "string" ? value.trim() : "";
}

function sanitizeOptionalString(value: unknown) {
  const trimmed = sanitizeString(value);
  return trimmed || null;
}

function sanitizeEmailArray(value: unknown, field: string) {
  if (!Array.isArray(value)) return [];

  const seen = new Set<string>();
  return value.reduce<string[]>((acc, item) => {
    const email = sanitizeString(item).toLowerCase();
    if (!email) return acc;
    if (!/^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(email)) {
      throw new Error(`${field} contains an invalid email address`);
    }
    if (seen.has(email)) return acc;
    seen.add(email);
    acc.push(email);
    return acc;
  }, []);
}

function parseInteger(value: number | string | undefined, field: string, minimum: number) {
  const parsed = typeof value === "number" ? value : typeof value === "string" ? Number(value.trim()) : Number.NaN;
  if (!Number.isFinite(parsed)) throw new Error(`${field} must be a valid integer`);
  if (parsed < minimum) throw new Error(`${field} must be at least ${minimum}`);
  return Math.floor(parsed);
}

function normalizeSettingsBody(body: SettingsBody): Omit<AdminSettings, "updatedAt"> {
  const operationsPolicy = body.operationsPolicy ?? {};
  const reminderPolicy = body.reminderPolicy ?? {};
  const firstReminderDays =
    reminderPolicy.firstReminderDays === undefined
      ? DEFAULT_REMINDER_POLICY_SETTINGS.firstReminderDays
      : parseInteger(reminderPolicy.firstReminderDays, "firstReminderDays", 0);
  const secondReminderDays =
    reminderPolicy.secondReminderDays === undefined
      ? DEFAULT_REMINDER_POLICY_SETTINGS.secondReminderDays
      : parseInteger(reminderPolicy.secondReminderDays, "secondReminderDays", 0);
  const finalReminderDays =
    reminderPolicy.finalReminderDays === undefined
      ? DEFAULT_REMINDER_POLICY_SETTINGS.finalReminderDays
      : parseInteger(reminderPolicy.finalReminderDays, "finalReminderDays", 0);

  if (firstReminderDays > secondReminderDays) {
    throw new Error("firstReminderDays must be less than or equal to secondReminderDays");
  }
  if (secondReminderDays > finalReminderDays) {
    throw new Error("secondReminderDays must be less than or equal to finalReminderDays");
  }

  return {
    orgName: sanitizeString(body.orgName),
    supportEmail: sanitizeString(body.supportEmail),
    whatsappNumber: sanitizeOptionalString(body.whatsappNumber),
    companyUen: sanitizeOptionalString(body.companyUen),
    companyGstRegNo: sanitizeOptionalString(body.companyGstRegNo),
    companyAddress: sanitizeOptionalString(body.companyAddress),
    companyPhone: sanitizeOptionalString(body.companyPhone),
    bankName: sanitizeOptionalString(body.bankName),
    bankAccountName: sanitizeOptionalString(body.bankAccountName),
    bankAccountNumber: sanitizeOptionalString(body.bankAccountNumber),
    adminNotificationEmails: sanitizeEmailArray(
      body.adminNotificationEmails,
      "adminNotificationEmails"
    ),
    bccTesterEnabled: Boolean(body.bccTesterEnabled),
    testerEmails: sanitizeEmailArray(body.testerEmails, "testerEmails"),
    bookingPaidRecipients: sanitizeEmailArray(
      body.bookingPaidRecipients,
      "bookingPaidRecipients"
    ),
    overdueRecipients: sanitizeEmailArray(body.overdueRecipients, "overdueRecipients"),
    operationsPolicy: {
      defaultMaintenanceBufferDays:
        operationsPolicy.defaultMaintenanceBufferDays === undefined
          ? DEFAULT_OPERATIONS_POLICY_SETTINGS.defaultMaintenanceBufferDays
          : parseInteger(
              operationsPolicy.defaultMaintenanceBufferDays,
              "defaultMaintenanceBufferDays",
              0
            ),
      enableDeveloperDeleteTools:
        typeof operationsPolicy.enableDeveloperDeleteTools === "boolean"
          ? operationsPolicy.enableDeveloperDeleteTools
          : DEFAULT_OPERATIONS_POLICY_SETTINGS.enableDeveloperDeleteTools,
    },
    reminderPolicy: {
      remindersEnabled:
        typeof reminderPolicy.remindersEnabled === "boolean"
          ? reminderPolicy.remindersEnabled
          : DEFAULT_REMINDER_POLICY_SETTINGS.remindersEnabled,
      firstReminderDays,
      secondReminderDays,
      finalReminderDays,
      reminderGuardWindowHours:
        reminderPolicy.reminderGuardWindowHours === undefined
          ? DEFAULT_REMINDER_POLICY_SETTINGS.reminderGuardWindowHours
          : parseInteger(
              reminderPolicy.reminderGuardWindowHours,
              "reminderGuardWindowHours",
              1
            ),
      reminderBatchLimit:
        reminderPolicy.reminderBatchLimit === undefined
          ? DEFAULT_REMINDER_POLICY_SETTINGS.reminderBatchLimit
          : parseInteger(reminderPolicy.reminderBatchLimit, "reminderBatchLimit", 1),
    },
  };
}

export async function GET(req: Request) {
  try {
    assertAdmin(req);
    const settings = await dbAdminSettingsRepo.get();
    return NextResponse.json(settings);
  } catch (error) {
    if (isAdminUnauthorized(error)) return adminUnauthorizedResponse();
    const message = error instanceof Error ? error.message : "Settings load failed";
    return NextResponse.json({ error: message }, { status: 400 });
  }
}

export async function PUT(req: Request) {
  try {
    assertAdmin(req);
    const body = (await req.json()) as SettingsBody;
    const settings = await dbAdminSettingsRepo.update(normalizeSettingsBody(body));
    return NextResponse.json(settings);
  } catch (error) {
    if (isAdminUnauthorized(error)) return adminUnauthorizedResponse();
    const message = error instanceof Error ? error.message : "Settings save failed";
    return NextResponse.json({ error: message }, { status: 400 });
  }
}
