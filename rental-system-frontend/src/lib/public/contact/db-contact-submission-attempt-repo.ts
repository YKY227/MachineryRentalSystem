import "server-only";

import { createHash, randomUUID } from "crypto";

import { supabaseAdmin } from "@/lib/supabase/server";

const CONTACT_SUBMISSION_ATTEMPTS_TABLE =
  process.env.SUPABASE_RENTAL_CONTACT_SUBMISSION_ATTEMPTS_TABLE ?? "rental_contact_submission_attempts";

type ContactSubmissionAttemptOutcome = "allowed" | "rate_limited" | "spam_blocked";

type ContactSubmissionAttemptRow = {
  id: string;
  identifier_hash: string;
  source: string;
  outcome: ContactSubmissionAttemptOutcome;
  blocked_reason: string | null;
  created_at: string;
};

function nowIso() {
  return new Date().toISOString();
}

export function hashContactSubmissionIdentifier(value: string) {
  return createHash("sha256").update(value).digest("hex");
}

export const dbContactSubmissionAttemptRepo = {
  async countRecentByIdentifier(input: {
    identifierHash: string;
    source: string;
    sinceIso: string;
  }): Promise<number> {
    const supabase = supabaseAdmin();
    const { count, error } = await supabase
      .from(CONTACT_SUBMISSION_ATTEMPTS_TABLE)
      .select("id", { count: "exact", head: true })
      .eq("identifier_hash", input.identifierHash)
      .eq("source", input.source)
      .gte("created_at", input.sinceIso);

    if (error) throw new Error(`Contact submission attempt count failed: ${error.message}`);
    return Number(count ?? 0);
  },

  async create(input: {
    identifierHash: string;
    source: string;
    outcome: ContactSubmissionAttemptOutcome;
    blockedReason?: string | null;
  }): Promise<ContactSubmissionAttemptRow> {
    const supabase = supabaseAdmin();
    const { data, error } = await supabase
      .from(CONTACT_SUBMISSION_ATTEMPTS_TABLE)
      .insert({
        id: randomUUID(),
        identifier_hash: input.identifierHash,
        source: input.source,
        outcome: input.outcome,
        blocked_reason: input.blockedReason?.trim() || null,
        created_at: nowIso(),
      })
      .select("id,identifier_hash,source,outcome,blocked_reason,created_at")
      .single<ContactSubmissionAttemptRow>();

    if (error) throw new Error(`Contact submission attempt create failed: ${error.message}`);
    return data;
  },
};
