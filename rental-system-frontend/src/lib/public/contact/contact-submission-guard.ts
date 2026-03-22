import "server-only";

import {
  dbContactSubmissionAttemptRepo,
  hashContactSubmissionIdentifier,
} from "@/lib/public/contact/db-contact-submission-attempt-repo";

const CONTACT_SOURCE = "website_contact_form";
const RATE_LIMIT_WINDOW_MS = 15 * 60 * 1000;
const RATE_LIMIT_MAX_ATTEMPTS = 5;
const MIN_FORM_AGE_MS = 2500;
const MAX_FORM_AGE_MS = 24 * 60 * 60 * 1000;

export type ContactSubmissionGuardResult =
  | { allowed: true }
  | { allowed: false; status: number; publicMessage: string };

function extractClientIp(req: Request) {
  const forwarded = req.headers.get("x-forwarded-for");
  if (forwarded) {
    const first = forwarded.split(",")[0]?.trim();
    if (first) return first;
  }

  const realIp = req.headers.get("x-real-ip")?.trim();
  if (realIp) return realIp;

  const cfIp = req.headers.get("cf-connecting-ip")?.trim();
  if (cfIp) return cfIp;

  return "unknown";
}

function normalizeSubmissionAge(value: unknown) {
  const parsed =
    typeof value === "number"
      ? value
      : typeof value === "string"
        ? Number(value.trim())
        : Number.NaN;

  return Number.isFinite(parsed) ? Math.floor(parsed) : Number.NaN;
}

export async function guardContactSubmission(input: {
  req: Request;
  honeypot?: string | null;
  formStartedAt?: string | number | null;
}): Promise<ContactSubmissionGuardResult> {
  const ip = extractClientIp(input.req);
  const userAgent = input.req.headers.get("user-agent")?.trim() || "unknown";
  const identifierHash = hashContactSubmissionIdentifier(`${ip}|${userAgent}`);
  const now = Date.now();
  const sinceIso = new Date(now - RATE_LIMIT_WINDOW_MS).toISOString();

  const recentAttempts = await dbContactSubmissionAttemptRepo.countRecentByIdentifier({
    identifierHash,
    source: CONTACT_SOURCE,
    sinceIso,
  });

  if (recentAttempts >= RATE_LIMIT_MAX_ATTEMPTS) {
    await dbContactSubmissionAttemptRepo.create({
      identifierHash,
      source: CONTACT_SOURCE,
      outcome: "rate_limited",
      blockedReason: "too_many_recent_attempts",
    });
    return {
      allowed: false,
      status: 429,
      publicMessage: "Too many submissions right now. Please wait a few minutes and try again.",
    };
  }

  if ((input.honeypot ?? "").trim()) {
    await dbContactSubmissionAttemptRepo.create({
      identifierHash,
      source: CONTACT_SOURCE,
      outcome: "spam_blocked",
      blockedReason: "honeypot_filled",
    });
    return {
      allowed: false,
      status: 400,
      publicMessage: "We could not process your enquiry. Please review your details and try again.",
    };
  }

  const formStartedAt = normalizeSubmissionAge(input.formStartedAt);
  if (!Number.isFinite(formStartedAt)) {
    await dbContactSubmissionAttemptRepo.create({
      identifierHash,
      source: CONTACT_SOURCE,
      outcome: "spam_blocked",
      blockedReason: "missing_form_started_at",
    });
    return {
      allowed: false,
      status: 400,
      publicMessage: "We could not process your enquiry. Please refresh the page and try again.",
    };
  }

  const ageMs = now - formStartedAt;
  if (ageMs < MIN_FORM_AGE_MS || ageMs > MAX_FORM_AGE_MS) {
    await dbContactSubmissionAttemptRepo.create({
      identifierHash,
      source: CONTACT_SOURCE,
      outcome: "spam_blocked",
      blockedReason: ageMs < MIN_FORM_AGE_MS ? "submitted_too_quickly" : "stale_form_submission",
    });
    return {
      allowed: false,
      status: 400,
      publicMessage:
        ageMs < MIN_FORM_AGE_MS
          ? "Please take a moment to complete the form before submitting."
          : "Your session expired. Please refresh the page and try again.",
    };
  }

  await dbContactSubmissionAttemptRepo.create({
    identifierHash,
    source: CONTACT_SOURCE,
    outcome: "allowed",
  });
  return { allowed: true };
}

