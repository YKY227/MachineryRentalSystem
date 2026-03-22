import "server-only";

import { supabaseAdmin } from "@/lib/supabase/server";
import type {
  RentalDamageAssessment,
  RentalDamageAssessmentIssueCategory,
  RentalDamageAssessmentRecommendedDepositAction,
  RentalDamageAssessmentResult,
  RentalDamageAssessmentSummary,
} from "@/lib/rental/damage-assessments/types";

const DAMAGE_ASSESSMENTS_TABLE =
  process.env.SUPABASE_RENTAL_DAMAGE_ASSESSMENTS_TABLE ??
  "rental_order_damage_assessments";

export type CreateRentalDamageAssessmentInput = {
  orderId: string;
  assessmentResult?: RentalDamageAssessmentResult;
  issueCategories?: RentalDamageAssessmentIssueCategory[];
  notes?: string;
  estimatedRetentionCents?: number;
  recommendedDepositAction?: RentalDamageAssessmentRecommendedDepositAction;
  createdBy?: string;
};

export type UpdateRentalDamageAssessmentDraftInput = {
  assessmentResult?: RentalDamageAssessmentResult;
  issueCategories?: RentalDamageAssessmentIssueCategory[];
  notes?: string | null;
  estimatedRetentionCents?: number;
  recommendedDepositAction?: RentalDamageAssessmentRecommendedDepositAction;
};

export type FinalizeRentalDamageAssessmentInput =
  UpdateRentalDamageAssessmentDraftInput & {
    finalizedBy?: string;
  };

type DamageAssessmentRow = {
  id: string;
  rental_order_id: string;
  assessment_result: RentalDamageAssessmentResult;
  issue_categories: RentalDamageAssessmentIssueCategory[] | null;
  notes: string | null;
  estimated_retention_cents: number;
  recommended_deposit_action: RentalDamageAssessmentRecommendedDepositAction;
  status: "draft" | "finalized";
  created_by: string | null;
  finalized_by: string | null;
  finalized_at: string | null;
  created_at: string;
  updated_at: string;
};

const DAMAGE_ASSESSMENT_COLUMNS = [
  "id",
  "rental_order_id",
  "assessment_result",
  "issue_categories",
  "notes",
  "estimated_retention_cents",
  "recommended_deposit_action",
  "status",
  "created_by",
  "finalized_by",
  "finalized_at",
  "created_at",
  "updated_at",
].join(",");

function nowIso() {
  return new Date().toISOString();
}

function clampNonNegativeInt(value: number | undefined | null) {
  const parsed = Math.round(Number(value ?? 0));
  if (!Number.isFinite(parsed)) return 0;
  return Math.max(0, parsed);
}

function normalizeCategories(
  categories: RentalDamageAssessmentIssueCategory[] | undefined | null
): RentalDamageAssessmentIssueCategory[] {
  if (!categories?.length) return [];
  return [...new Set(categories)].sort() as RentalDamageAssessmentIssueCategory[];
}

function toDamageAssessment(row: DamageAssessmentRow): RentalDamageAssessment {
  return {
    id: row.id,
    orderId: row.rental_order_id,
    assessmentResult: row.assessment_result,
    issueCategories: normalizeCategories(row.issue_categories ?? []),
    notes: row.notes ?? undefined,
    estimatedRetentionCents: clampNonNegativeInt(row.estimated_retention_cents),
    recommendedDepositAction: row.recommended_deposit_action,
    status: row.status,
    createdBy: row.created_by ?? undefined,
    finalizedBy: row.finalized_by ?? undefined,
    finalizedAt: row.finalized_at ?? undefined,
    createdAt: row.created_at,
    updatedAt: row.updated_at,
  };
}

function toSummary(
  assessment: RentalDamageAssessment | null,
  orderId: string
): RentalDamageAssessmentSummary {
  if (!assessment) {
    return {
      orderId,
      exists: false,
      issueCategories: [],
      estimatedRetentionCents: 0,
    };
  }

  return {
    orderId,
    exists: true,
    assessmentId: assessment.id,
    status: assessment.status,
    assessmentResult: assessment.assessmentResult,
    issueCategories: assessment.issueCategories,
    estimatedRetentionCents: assessment.estimatedRetentionCents,
    recommendedDepositAction: assessment.recommendedDepositAction,
    finalizedAt: assessment.finalizedAt,
    updatedAt: assessment.updatedAt,
  };
}

export const dbRentalDamageAssessmentRepo = {
  async getByOrderId(orderId: string): Promise<RentalDamageAssessment | null> {
    const supabase = supabaseAdmin();
    const { data, error } = await supabase
      .from(DAMAGE_ASSESSMENTS_TABLE)
      .select(DAMAGE_ASSESSMENT_COLUMNS)
      .eq("rental_order_id", orderId)
      .maybeSingle<DamageAssessmentRow>();

    if (error) throw new Error(`Damage assessment read failed: ${error.message}`);
    return data ? toDamageAssessment(data) : null;
  },

  async getSummaryByOrderId(orderId: string): Promise<RentalDamageAssessmentSummary> {
    return toSummary(await dbRentalDamageAssessmentRepo.getByOrderId(orderId), orderId);
  },

  async listSummariesByOrderIds(
    orderIds: string[]
  ): Promise<Record<string, RentalDamageAssessmentSummary>> {
    if (!orderIds.length) return {};

    const supabase = supabaseAdmin();
    const { data, error } = await supabase
      .from(DAMAGE_ASSESSMENTS_TABLE)
      .select(DAMAGE_ASSESSMENT_COLUMNS)
      .in("rental_order_id", orderIds);

    if (error) {
      throw new Error(`Damage assessment list by orders failed: ${error.message}`);
    }

    const assessments = new Map(
      ((data ?? []) as unknown as DamageAssessmentRow[]).map((row) => {
        const assessment = toDamageAssessment(row);
        return [assessment.orderId, assessment] as const;
      })
    );

    return Object.fromEntries(
      orderIds.map((orderId) => [
        orderId,
        toSummary(assessments.get(orderId) ?? null, orderId),
      ])
    );
  },

  async ensureDraft(
    input: CreateRentalDamageAssessmentInput
  ): Promise<RentalDamageAssessment> {
    const existing = await dbRentalDamageAssessmentRepo.getByOrderId(input.orderId);
    if (existing) return existing;

    const supabase = supabaseAdmin();
    const now = nowIso();
    const { data, error } = await supabase
      .from(DAMAGE_ASSESSMENTS_TABLE)
      .insert({
        rental_order_id: input.orderId,
        assessment_result: input.assessmentResult ?? "further_review",
        issue_categories: normalizeCategories(input.issueCategories ?? []),
        notes: input.notes?.trim() || null,
        estimated_retention_cents: clampNonNegativeInt(
          input.estimatedRetentionCents
        ),
        recommended_deposit_action:
          input.recommendedDepositAction ?? "manual_review",
        status: "draft",
        created_by: input.createdBy ?? null,
        created_at: now,
        updated_at: now,
      })
      .select(DAMAGE_ASSESSMENT_COLUMNS)
      .single<DamageAssessmentRow>();

    if (error) throw new Error(`Damage assessment create failed: ${error.message}`);
    return toDamageAssessment(data);
  },

  async updateDraft(
    orderId: string,
    input: UpdateRentalDamageAssessmentDraftInput
  ): Promise<RentalDamageAssessment> {
    const existing = await dbRentalDamageAssessmentRepo.getByOrderId(orderId);
    if (!existing) throw new Error("Damage assessment record not found");
    if (existing.status === "finalized") {
      throw new Error("Finalized damage assessments cannot be edited");
    }

    const payload: Record<string, unknown> = {
      updated_at: nowIso(),
    };

    if (input.assessmentResult !== undefined) {
      payload.assessment_result = input.assessmentResult;
    }
    if (input.issueCategories !== undefined) {
      payload.issue_categories = normalizeCategories(input.issueCategories);
    }
    if (input.notes !== undefined) {
      payload.notes = input.notes?.trim() || null;
    }
    if (input.estimatedRetentionCents !== undefined) {
      payload.estimated_retention_cents = clampNonNegativeInt(
        input.estimatedRetentionCents
      );
    }
    if (input.recommendedDepositAction !== undefined) {
      payload.recommended_deposit_action = input.recommendedDepositAction;
    }

    const supabase = supabaseAdmin();
    const { data, error } = await supabase
      .from(DAMAGE_ASSESSMENTS_TABLE)
      .update(payload)
      .eq("id", existing.id)
      .select(DAMAGE_ASSESSMENT_COLUMNS)
      .single<DamageAssessmentRow>();

    if (error) throw new Error(`Damage assessment update failed: ${error.message}`);
    return toDamageAssessment(data);
  },

  async finalize(
    orderId: string,
    input: FinalizeRentalDamageAssessmentInput
  ): Promise<RentalDamageAssessment> {
    const existing = await dbRentalDamageAssessmentRepo.getByOrderId(orderId);
    if (!existing) throw new Error("Damage assessment record not found");
    if (existing.status === "finalized") return existing;

    const now = nowIso();
    const payload: Record<string, unknown> = {
      status: "finalized",
      finalized_by: input.finalizedBy ?? null,
      finalized_at: now,
      updated_at: now,
    };

    if (input.assessmentResult !== undefined) {
      payload.assessment_result = input.assessmentResult;
    }
    if (input.issueCategories !== undefined) {
      payload.issue_categories = normalizeCategories(input.issueCategories);
    }
    if (input.notes !== undefined) {
      payload.notes = input.notes?.trim() || null;
    }
    if (input.estimatedRetentionCents !== undefined) {
      payload.estimated_retention_cents = clampNonNegativeInt(
        input.estimatedRetentionCents
      );
    }
    if (input.recommendedDepositAction !== undefined) {
      payload.recommended_deposit_action = input.recommendedDepositAction;
    }

    const supabase = supabaseAdmin();
    const { data, error } = await supabase
      .from(DAMAGE_ASSESSMENTS_TABLE)
      .update(payload)
      .eq("id", existing.id)
      .select(DAMAGE_ASSESSMENT_COLUMNS)
      .single<DamageAssessmentRow>();

    if (error) throw new Error(`Damage assessment finalize failed: ${error.message}`);
    return toDamageAssessment(data);
  },
};

