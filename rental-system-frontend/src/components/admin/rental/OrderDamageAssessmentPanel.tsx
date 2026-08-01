"use client";

import { useEffect, useState } from "react";

import type {
  RentalDamageAssessment,
  RentalDamageAssessmentIssueCategory,
  RentalDamageAssessmentRecommendedDepositAction,
  RentalDamageAssessmentResult,
  RentalDamageAssessmentSummary,
} from "@/lib/rental/damage-assessments/types";
import type { RentalOrder } from "@/lib/rental/orders/types";

const ISSUE_CATEGORIES: Array<{
  value: RentalDamageAssessmentIssueCategory;
  label: string;
}> = [
  { value: "cleaning", label: "Cleaning" },
  { value: "cosmetic_damage", label: "Cosmetic damage" },
  { value: "functional_damage", label: "Functional damage" },
  { value: "missing_parts", label: "Missing parts" },
  { value: "safety_issue", label: "Safety issue" },
  { value: "other", label: "Other" },
];

type Props = {
  order: RentalOrder;
  summary?: RentalDamageAssessmentSummary;
  onSummaryChange: (summary: RentalDamageAssessmentSummary) => void;
};

function formatMoney(cents: number) {
  return new Intl.NumberFormat("en-SG", {
    style: "currency",
    currency: "SGD",
    minimumFractionDigits: 2,
    maximumFractionDigits: 2,
  }).format((Number.isFinite(cents) ? cents : 0) / 100);
}

function formatDateTime(iso?: string | null) {
  if (!iso) return "-";
  const d = new Date(iso);
  if (Number.isNaN(d.getTime())) return iso;
  return d.toLocaleString("en-SG", { hour12: true });
}

function assessmentStatusLabel(status?: RentalDamageAssessmentSummary["status"]) {
  switch (status) {
    case "draft":
      return "Draft";
    case "finalized":
      return "Finalized";
    default:
      return "Not started";
  }
}

function assessmentResultLabel(result?: RentalDamageAssessmentResult) {
  switch (result) {
    case "clear":
      return "Clear";
    case "wear_and_tear":
      return "Wear and tear only";
    case "issues_found":
      return "Issues found";
    case "further_review":
      return "Further review needed";
    default:
      return "-";
  }
}

function recommendedActionLabel(action?: RentalDamageAssessmentRecommendedDepositAction) {
  switch (action) {
    case "none":
      return "No deposit follow-up recommended";
    case "release":
      return "Release deposit";
    case "partial_retain":
      return "Partial retain recommended";
    case "full_retain":
      return "Full retain recommended";
    case "manual_review":
      return "Manual financial review";
    default:
      return "-";
  }
}

export function OrderDamageAssessmentPanel({ order, summary, onSummaryChange }: Props) {
  const [assessment, setAssessment] = useState<RentalDamageAssessment | null>(null);
  const [loading, setLoading] = useState(true);
  const [saving, setSaving] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [banner, setBanner] = useState<string | null>(null);
  const [assessmentResult, setAssessmentResult] = useState<RentalDamageAssessmentResult>("further_review");
  const [issueCategories, setIssueCategories] = useState<RentalDamageAssessmentIssueCategory[]>([]);
  const [notes, setNotes] = useState("");
  const [estimatedRetention, setEstimatedRetention] = useState("0.00");
  const [recommendedDepositAction, setRecommendedDepositAction] =
    useState<RentalDamageAssessmentRecommendedDepositAction>("manual_review");

  useEffect(() => {
    let cancelled = false;

    async function loadAssessment() {
      setLoading(true);
      setError(null);
      setBanner(null);
      try {
        const res = await fetch(`/api/admin/rental/orders/${order.id}/assessment`, {
          cache: "no-store",
          credentials: "include",
        });
        const data = await res.json().catch(() => ({}));
        if (!res.ok) {
          throw new Error(data?.error ?? "Failed to load damage assessment");
        }
        if (cancelled) return;
        const nextAssessment = (data?.assessment ?? null) as RentalDamageAssessment | null;
        const nextSummary = (data?.summary ?? {
          orderId: order.id,
          exists: false,
          issueCategories: [],
          estimatedRetentionCents: 0,
        }) as RentalDamageAssessmentSummary;
        setAssessment(nextAssessment);
        onSummaryChange(nextSummary);
        setAssessmentResult(nextAssessment?.assessmentResult ?? "further_review");
        setIssueCategories(nextAssessment?.issueCategories ?? []);
        setNotes(nextAssessment?.notes ?? "");
        setEstimatedRetention(((nextAssessment?.estimatedRetentionCents ?? 0) / 100).toFixed(2));
        setRecommendedDepositAction(nextAssessment?.recommendedDepositAction ?? "manual_review");
      } catch (loadError) {
        if (cancelled) return;
        setAssessment(null);
        setError(loadError instanceof Error ? loadError.message : "Failed to load damage assessment");
      } finally {
        if (!cancelled) setLoading(false);
      }
    }

    loadAssessment();
    return () => {
      cancelled = true;
    };
  }, [order.id, onSummaryChange]);

  const isLocked = assessment?.status === "finalized";
  const canAssess = order.returnStatus !== "out";

  function toggleCategory(value: RentalDamageAssessmentIssueCategory) {
    setIssueCategories((current) =>
      current.includes(value) ? current.filter((entry) => entry !== value) : [...current, value]
    );
  }

  async function submit(mode: "draft" | "finalize") {
    setSaving(true);
    setError(null);
    setBanner(null);

    try {
      const parsedRetention = Math.round(Number(estimatedRetention || 0) * 100);
      if (!Number.isFinite(parsedRetention) || parsedRetention < 0) {
        throw new Error("Estimated retention must be a valid non-negative amount");
      }

      const endpoint =
        mode === "finalize"
          ? `/api/admin/rental/orders/${order.id}/assessment/finalize`
          : `/api/admin/rental/orders/${order.id}/assessment`;
      const res = await fetch(endpoint, {
        method: "POST",
        credentials: "include",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          assessmentResult,
          issueCategories,
          notes,
          estimatedRetentionCents: parsedRetention,
          recommendedDepositAction,
        }),
      });
      const data = await res.json().catch(() => ({}));
      if (!res.ok) {
        throw new Error(data?.error ?? "Failed to save damage assessment");
      }

      const nextAssessment = (data?.assessment ?? null) as RentalDamageAssessment | null;
      const nextSummary = (data?.summary ?? summary ?? {
        orderId: order.id,
        exists: false,
        issueCategories: [],
        estimatedRetentionCents: 0,
      }) as RentalDamageAssessmentSummary;
      setAssessment(nextAssessment);
      onSummaryChange(nextSummary);
      setBanner(
        mode === "finalize"
          ? "Damage assessment finalized. Deposit and credit remain unchanged until a separate financial action is recorded."
          : "Damage assessment draft saved."
      );
    } catch (submitError) {
      setError(submitError instanceof Error ? submitError.message : "Failed to save damage assessment");
    } finally {
      setSaving(false);
    }
  }

  return (
    <div className="rounded-2xl border border-slate-200 bg-white p-5">
      <div className="flex items-center justify-between gap-3">
        <div>
          <div className="text-sm font-semibold text-slate-900">Damage assessment</div>
          <div className="mt-1 text-xs text-slate-500">
            Evidence and review record only. This does not release, retain, invoice, or change credit automatically.
          </div>
        </div>
        <span className="rounded-full border border-slate-200 bg-slate-50 px-2.5 py-1 text-[11px] font-semibold uppercase text-slate-700">
          {assessmentStatusLabel(assessment?.status ?? summary?.status)}
        </span>
      </div>

      {!canAssess && (
        <div className="mt-4 rounded-lg border border-amber-200 bg-amber-50 p-3 text-sm text-amber-800">
          Record the rental as returned before starting a damage assessment.
        </div>
      )}
      {banner && (
        <div className="mt-4 rounded-lg border border-emerald-200 bg-emerald-50 p-3 text-sm text-emerald-700">
          {banner}
        </div>
      )}
      {error && (
        <div className="mt-4 rounded-lg border border-rose-200 bg-rose-50 p-3 text-sm text-rose-700">
          {error}
        </div>
      )}

      {loading ? (
        <div className="mt-4 text-sm text-slate-500">Loading damage assessment...</div>
      ) : (
        <div className="mt-4 space-y-4">
          <div className="rounded-xl border border-slate-200 bg-slate-50 p-4">
            <div className="text-xs font-semibold uppercase tracking-wide text-slate-500">Assessment setup</div>
            <div className="mt-3 grid gap-3 sm:grid-cols-2">
              <label className="grid gap-1 text-sm">
                <span className="text-slate-700">Condition result</span>
                <select
                  value={assessmentResult}
                  onChange={(e) => setAssessmentResult(e.target.value as RentalDamageAssessmentResult)}
                  disabled={!canAssess || isLocked}
                  className="rounded-lg border border-slate-200 bg-white px-3 py-2 text-sm"
                >
                  <option value="clear">Clear</option>
                  <option value="wear_and_tear">Wear and tear only</option>
                  <option value="issues_found">Issues found</option>
                  <option value="further_review">Further review needed</option>
                </select>
              </label>
              <label className="grid gap-1 text-sm">
                <span className="text-slate-700">Recommended deposit action</span>
                <select
                  value={recommendedDepositAction}
                  onChange={(e) =>
                    setRecommendedDepositAction(e.target.value as RentalDamageAssessmentRecommendedDepositAction)
                  }
                  disabled={!canAssess || isLocked}
                  className="rounded-lg border border-slate-200 bg-white px-3 py-2 text-sm"
                >
                  <option value="manual_review">Manual financial review</option>
                  <option value="none">No follow-up recommended</option>
                  <option value="release">Release deposit</option>
                  <option value="partial_retain">Partial retain</option>
                  <option value="full_retain">Full retain</option>
                </select>
              </label>
            </div>
          </div>

          <div className="rounded-xl border border-slate-200 bg-slate-50 p-4">
            <div className="text-xs font-semibold uppercase tracking-wide text-slate-500">Issue categories</div>
            <div className="mt-3 grid gap-2 sm:grid-cols-2">
              {ISSUE_CATEGORIES.map((category) => (
                <label
                  key={category.value}
                  className="flex items-center gap-2 rounded-lg border border-slate-200 bg-white px-3 py-2 text-sm text-slate-700"
                >
                  <input
                    type="checkbox"
                    checked={issueCategories.includes(category.value)}
                    onChange={() => toggleCategory(category.value)}
                    disabled={!canAssess || isLocked}
                  />
                  {category.label}
                </label>
              ))}
            </div>
          </div>

          <div className="rounded-xl border border-slate-200 bg-slate-50 p-4">
            <div className="text-xs font-semibold uppercase tracking-wide text-slate-500">Notes and estimate</div>
            <label className="mt-3 grid gap-1 text-sm">
              <span className="text-slate-700">Notes</span>
              <textarea
                value={notes}
                onChange={(e) => setNotes(e.target.value)}
                disabled={!canAssess || isLocked}
                className="min-h-28 rounded-lg border border-slate-200 bg-white px-3 py-2 text-sm"
              />
            </label>

            <label className="mt-4 grid gap-1 text-sm sm:max-w-xs">
              <span className="text-slate-700">Estimated retention amount (SGD)</span>
              <input
                type="number"
                min="0"
                step="0.01"
                value={estimatedRetention}
                onChange={(e) => setEstimatedRetention(e.target.value)}
                disabled={!canAssess || isLocked}
                className="rounded-lg border border-slate-200 bg-white px-3 py-2 text-sm"
              />
            </label>

            {assessment && (
              <div className="mt-4 rounded-xl border border-slate-200 bg-white p-3 text-xs text-slate-600">
                <div>Status: {assessmentStatusLabel(assessment.status)}</div>
                <div className="mt-1">Result: {assessmentResultLabel(assessment.assessmentResult)}</div>
                <div className="mt-1">Estimated retention: {formatMoney(assessment.estimatedRetentionCents)}</div>
                <div className="mt-1">Recommendation: {recommendedActionLabel(assessment.recommendedDepositAction)}</div>
                <div className="mt-1">Last updated: {formatDateTime(assessment.updatedAt)}</div>
                {assessment.finalizedAt && <div className="mt-1">Finalized: {formatDateTime(assessment.finalizedAt)}</div>}
              </div>
            )}

            {!isLocked && (
              <div className="mt-4 flex flex-wrap gap-2">
                <button
                  type="button"
                  onClick={() => submit("draft")}
                  disabled={saving || !canAssess}
                  className="rounded-lg border border-slate-200 bg-white px-4 py-2 text-sm font-semibold text-slate-700 hover:bg-slate-50 disabled:bg-slate-100 disabled:text-slate-400"
                >
                  {saving ? "Saving..." : "Save draft"}
                </button>
                <button
                  type="button"
                  onClick={() => submit("finalize")}
                  disabled={saving || !canAssess}
                  className="rounded-lg bg-[#D24338] px-4 py-2 text-sm font-semibold text-white hover:bg-[#B9382E] disabled:bg-slate-300"
                >
                  {saving ? "Saving..." : "Finalize assessment"}
                </button>
              </div>
            )}
          </div>
        </div>
      )}
    </div>
  );
}
