export const RENTAL_DAMAGE_ASSESSMENT_RESULTS = [
  "clear",
  "wear_and_tear",
  "issues_found",
  "further_review",
] as const;

export const RENTAL_DAMAGE_ASSESSMENT_ISSUE_CATEGORIES = [
  "cleaning",
  "cosmetic_damage",
  "functional_damage",
  "missing_parts",
  "safety_issue",
  "other",
] as const;

export const RENTAL_DAMAGE_ASSESSMENT_RECOMMENDED_DEPOSIT_ACTIONS = [
  "none",
  "release",
  "partial_retain",
  "full_retain",
  "manual_review",
] as const;

export const RENTAL_DAMAGE_ASSESSMENT_STATUSES = ["draft", "finalized"] as const;

export type RentalDamageAssessmentResult =
  (typeof RENTAL_DAMAGE_ASSESSMENT_RESULTS)[number];
export type RentalDamageAssessmentIssueCategory =
  (typeof RENTAL_DAMAGE_ASSESSMENT_ISSUE_CATEGORIES)[number];
export type RentalDamageAssessmentRecommendedDepositAction =
  (typeof RENTAL_DAMAGE_ASSESSMENT_RECOMMENDED_DEPOSIT_ACTIONS)[number];
export type RentalDamageAssessmentStatus =
  (typeof RENTAL_DAMAGE_ASSESSMENT_STATUSES)[number];

export type RentalDamageAssessment = {
  id: string;
  orderId: string;
  assessmentResult: RentalDamageAssessmentResult;
  issueCategories: RentalDamageAssessmentIssueCategory[];
  notes?: string;
  estimatedRetentionCents: number;
  recommendedDepositAction: RentalDamageAssessmentRecommendedDepositAction;
  status: RentalDamageAssessmentStatus;
  createdBy?: string;
  finalizedBy?: string;
  finalizedAt?: string;
  createdAt: string;
  updatedAt: string;
};

export type RentalDamageAssessmentSummary = {
  orderId: string;
  exists: boolean;
  assessmentId?: string;
  status?: RentalDamageAssessmentStatus;
  assessmentResult?: RentalDamageAssessmentResult;
  issueCategories: RentalDamageAssessmentIssueCategory[];
  estimatedRetentionCents: number;
  recommendedDepositAction?: RentalDamageAssessmentRecommendedDepositAction;
  finalizedAt?: string;
  updatedAt?: string;
};

export type RentalCustomerDamageReviewStatus =
  | "issues_under_review"
  | "assessment_completed";
