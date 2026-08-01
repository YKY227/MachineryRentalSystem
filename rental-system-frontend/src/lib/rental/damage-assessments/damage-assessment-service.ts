import "server-only";

import {
  dbRentalDamageAssessmentRepo,
  type FinalizeRentalDamageAssessmentInput,
  type UpdateRentalDamageAssessmentDraftInput,
} from "@/lib/rental/damage-assessments/db-rental-damage-assessment-repo";
import type {
  RentalDamageAssessment,
  RentalDamageAssessmentIssueCategory,
  RentalDamageAssessmentRecommendedDepositAction,
  RentalDamageAssessmentResult,
  RentalDamageAssessmentSummary,
} from "@/lib/rental/damage-assessments/types";
import { dbOrderRepo } from "@/lib/rental/orders/db-order-repo";

const VALID_RESULTS = new Set<RentalDamageAssessmentResult>([
  "clear",
  "wear_and_tear",
  "issues_found",
  "further_review",
]);
const VALID_ISSUE_CATEGORIES = new Set<RentalDamageAssessmentIssueCategory>([
  "cleaning",
  "cosmetic_damage",
  "functional_damage",
  "missing_parts",
  "safety_issue",
  "other",
]);
const VALID_RECOMMENDED_ACTIONS = new Set<RentalDamageAssessmentRecommendedDepositAction>([
  "none",
  "release",
  "partial_retain",
  "full_retain",
  "manual_review",
]);

export type RentalDamageAssessmentMutationInput = {
  assessmentResult?: string;
  issueCategories?: string[];
  notes?: string | null;
  estimatedRetentionCents?: number;
  recommendedDepositAction?: string;
};

function normalizeDraftInput(
  input: RentalDamageAssessmentMutationInput
): UpdateRentalDamageAssessmentDraftInput {
  const normalized: UpdateRentalDamageAssessmentDraftInput = {};

  if (input.assessmentResult !== undefined) {
    if (!VALID_RESULTS.has(input.assessmentResult as RentalDamageAssessmentResult)) {
      throw new Error("Invalid assessment result");
    }
    normalized.assessmentResult =
      input.assessmentResult as RentalDamageAssessmentResult;
  }

  if (input.issueCategories !== undefined) {
    const categories = input.issueCategories.map((value) => String(value));
    for (const category of categories) {
      if (!VALID_ISSUE_CATEGORIES.has(category as RentalDamageAssessmentIssueCategory)) {
        throw new Error("Invalid issue category");
      }
    }
    normalized.issueCategories = categories as RentalDamageAssessmentIssueCategory[];
  }

  if (input.notes !== undefined) {
    normalized.notes = input.notes;
  }

  if (input.estimatedRetentionCents !== undefined) {
    const parsed = Math.round(Number(input.estimatedRetentionCents));
    if (!Number.isFinite(parsed) || parsed < 0) {
      throw new Error("Estimated retention must be a non-negative amount");
    }
    normalized.estimatedRetentionCents = parsed;
  }

  if (input.recommendedDepositAction !== undefined) {
    if (
      !VALID_RECOMMENDED_ACTIONS.has(
        input.recommendedDepositAction as RentalDamageAssessmentRecommendedDepositAction
      )
    ) {
      throw new Error("Invalid recommended deposit action");
    }
    normalized.recommendedDepositAction =
      input.recommendedDepositAction as RentalDamageAssessmentRecommendedDepositAction;
  }

  return normalized;
}

async function requireAssessableOrder(orderId: string) {
  const order = await dbOrderRepo.get(orderId);
  if (!order) throw new Error("Order not found");
  if (order.returnStatus === "out") {
    throw new Error("Damage assessments can only be recorded after return is in progress");
  }
  return order;
}

export const rentalDamageAssessmentService = {
  async getByOrderId(orderId: string): Promise<RentalDamageAssessment | null> {
    return dbRentalDamageAssessmentRepo.getByOrderId(orderId);
  },

  async getSummaryByOrderId(orderId: string): Promise<RentalDamageAssessmentSummary> {
    return dbRentalDamageAssessmentRepo.getSummaryByOrderId(orderId);
  },

  async saveDraft(input: {
    orderId: string;
    createdBy?: string;
    data: RentalDamageAssessmentMutationInput;
  }): Promise<RentalDamageAssessment> {
    await requireAssessableOrder(input.orderId);
    const normalized = normalizeDraftInput(input.data);
    await dbRentalDamageAssessmentRepo.ensureDraft({
      orderId: input.orderId,
      createdBy: input.createdBy,
    });
    return dbRentalDamageAssessmentRepo.updateDraft(input.orderId, normalized);
  },

  async finalize(input: {
    orderId: string;
    finalizedBy?: string;
    data: RentalDamageAssessmentMutationInput;
  }): Promise<RentalDamageAssessment> {
    await requireAssessableOrder(input.orderId);
    const normalized = normalizeDraftInput(input.data);
    const existing = await dbRentalDamageAssessmentRepo.getByOrderId(input.orderId);
    if (!existing) {
      await dbRentalDamageAssessmentRepo.ensureDraft({
        orderId: input.orderId,
      });
    }
    return dbRentalDamageAssessmentRepo.finalize(
      input.orderId,
      {
        ...(normalized as FinalizeRentalDamageAssessmentInput),
        finalizedBy: input.finalizedBy,
      }
    );
  },
};
