"use client";

import { useEffect, useState } from "react";
import type {
  AssignmentConfig,
  HardConstraintKey,
  SoftRuleKey,
} from "@/lib/types";
import { defaultAssignmentConfig } from "@/lib/types";

const STORAGE_KEY = "assignment-policy-config-v1";

const HARD_CONSTRAINT_LABELS: Record<
  HardConstraintKey,
  { label: string; description: string }
> = {
  activeDriver: {
    label: "Active driver only",
    description: "Exclude drivers marked as inactive from all assignment.",
  },
  workingHours: {
    label: "Respect working hours",
    description:
      "Only assign jobs whose pickup window is within the driver’s workday.",
  },
  regionMatch: {
    label: "Region coverage required",
    description:
      "Drivers must cover the pickup region (primary or secondary) to be eligible.",
  },
  vehicleMatch: {
    label: "Vehicle capability required",
    description:
      "Only assign drivers whose vehicle type matches the job’s requirements.",
  },
  slotCapacity: {
    label: "Respect slot capacity",
    description:
      "Do not assign jobs if driver has reached max jobs in that time slot.",
  },
};

const SOFT_RULE_LABELS: Record<
  SoftRuleKey,
  { label: string; description: string }
> = {
  regionScore: {
    label: "Region preference",
    description: "Prefer drivers whose primary/secondary region matches pickup.",
  },
  loadBalanceScore: {
    label: "Load balancing",
    description: "Prefer drivers with fewer jobs today (avoid overloading).",
  },
  fairnessScore: {
    label: "Fairness / rotation",
    description:
      "Prefer drivers who have received fewer recent assignments (round-robin feel).",
  },
};

function clampWeight(value: number): number {
  if (Number.isNaN(value)) return 0;
  if (value < 0) return 0;
  if (value > 1) return 1;
  return value;
}

export default function AssignmentPolicyPage() {
  const [config, setConfig] = useState<AssignmentConfig | null>(null);
  const [loading, setLoading] = useState(true);
  const [saving, setSaving] = useState(false);
  const [saveMessage, setSaveMessage] = useState<string | null>(null);

  // Load from localStorage on mount
  useEffect(() => {
    try {
      if (typeof window === "undefined") return;
      const raw = window.localStorage.getItem(STORAGE_KEY);
      if (!raw) {
        setConfig(defaultAssignmentConfig);
        setLoading(false);
        return;
      }

      const parsed = JSON.parse(raw) as AssignmentConfig;
      // Very lightweight sanity check; fall back if missing keys
      if (!parsed.hardConstraints || !parsed.softRules) {
        setConfig(defaultAssignmentConfig);
      } else {
        setConfig(parsed);
      }
    } catch {
      setConfig(defaultAssignmentConfig);
    } finally {
      setLoading(false);
    }
  }, []);

  const handleSave = () => {
    if (!config) return;
    try {
      setSaving(true);
      if (typeof window !== "undefined") {
        window.localStorage.setItem(STORAGE_KEY, JSON.stringify(config));
      }
      setSaveMessage("Assignment policy saved locally.");
      setTimeout(() => setSaveMessage(null), 2500);
    } finally {
      setSaving(false);
    }
  };

  const handleReset = () => {
    setConfig(defaultAssignmentConfig);
    if (typeof window !== "undefined") {
      window.localStorage.setItem(
        STORAGE_KEY,
        JSON.stringify(defaultAssignmentConfig)
      );
    }
    setSaveMessage("Reset to default policy.");
    setTimeout(() => setSaveMessage(null), 2500);
  };

  if (loading || !config) {
    return (
      <div className="min-h-screen bg-slate-50">
        <div className="mx-auto max-w-5xl px-6 py-10">
          <p className="text-sm text-slate-500">Loading assignment policy…</p>
        </div>
      </div>
    );
  }

  const { softRules } = config;

  return (
    <div className="min-h-screen bg-slate-50">
      <div className="mx-auto max-w-5xl px-6 py-8">
        {/* Header */}
        <header className="mb-6 flex flex-col justify-between gap-3 md:flex-row md:items-center">
          <div>
            <h1 className="text-2xl font-semibold text-slate-900">
              Assignment Policy
            </h1>
            <p className="mt-1 text-sm text-slate-600">
              Control how the system selects and ranks drivers for auto-assigned
              jobs. Changes here affect the Jobs board recommendations.
            </p>
          </div>
          <div className="flex flex-col items-start gap-2 text-xs text-slate-500 md:items-end">
            <div className="rounded-lg border border-slate-200 bg-white px-3 py-2">
              <div className="font-medium text-slate-800">
                Current soft-rule weights
              </div>
              <div className="mt-1 space-y-0.5">
                <div>
                  Region:{" "}
                  <span className="font-mono">
                    {softRules.regionScore.weight.toFixed(2)}
                  </span>
                </div>
                <div>
                  Load:{" "}
                  <span className="font-mono">
                    {softRules.loadBalanceScore.weight.toFixed(2)}
                  </span>
                </div>
                <div>
                  Fairness:{" "}
                  <span className="font-mono">
                    {softRules.fairnessScore.weight.toFixed(2)}
                  </span>
                </div>
              </div>
            </div>
            {saveMessage && (
              <span className="text-[11px] text-emerald-700">
                {saveMessage}
              </span>
            )}
          </div>
        </header>

        {/* Main card */}
        <div className="space-y-6 rounded-2xl border border-slate-200 bg-white p-6 shadow-sm">
          {/* Global behaviour */}
          <section className="border-b border-slate-100 pb-5">
            <h2 className="text-sm font-semibold text-slate-900">
              Global behaviour
            </h2>
            <p className="mt-1 text-xs text-slate-500">
              Decide when the system should auto-assign jobs vs. always require
              manual dispatch.
            </p>

            <div className="mt-4 grid gap-4 md:grid-cols-2">
              <label className="flex items-start gap-3 rounded-lg border border-slate-200 bg-slate-50 px-4 py-3 text-xs">
                <input
                  type="checkbox"
                  checked={config.autoAssignScheduled}
                  onChange={(e) =>
                    setConfig((prev) =>
                      prev
                        ? {
                            ...prev,
                            autoAssignScheduled: e.target.checked,
                          }
                        : prev
                    )
                  }
                  className="mt-0.5 h-4 w-4 rounded border-slate-300 text-sky-600 focus:ring-sky-500"
                />
                <span>
                  <span className="block font-medium text-slate-900">
                    Auto-assign scheduled jobs
                  </span>
                  <span className="mt-0.5 block text-slate-600">
                    When enabled, the engine will automatically pick a driver
                    for scheduled jobs that meet all constraints. Otherwise,
                    they go to “Pending assignment”.
                  </span>
                </span>
              </label>

              <label className="flex items-start gap-3 rounded-lg border border-slate-200 bg-slate-50 px-4 py-3 text-xs">
                <input
                  type="checkbox"
                  checked={config.autoAssignExpress}
                  onChange={(e) =>
                    setConfig((prev) =>
                      prev
                        ? {
                            ...prev,
                            autoAssignExpress: e.target.checked,
                          }
                        : prev
                    )
                  }
                  className="mt-0.5 h-4 w-4 rounded border-slate-300 text-sky-600 focus:ring-sky-500"
                />
                <span>
                  <span className="block font-medium text-slate-900">
                    Auto-assign express / 3-hour jobs
                  </span>
                  <span className="mt-0.5 block text-slate-600">
                    When enabled, the engine attempts to immediately assign a
                    driver that can realistically meet the SLA. If disabled,
                    express jobs always require manual review.
                  </span>
                </span>
              </label>
            </div>
          </section>

          {/* Hard constraints */}
          <section className="border-b border-slate-100 pb-5">
            <h2 className="text-sm font-semibold text-slate-900">
              Hard constraints (eligibility filters)
            </h2>
            <p className="mt-1 text-xs text-slate-500">
              These rules decide which drivers are even eligible. If a
              constraint is disabled, that condition is ignored by the engine.
            </p>

            <div className="mt-4 grid gap-3 md:grid-cols-2">
              {(Object.keys(HARD_CONSTRAINT_LABELS) as HardConstraintKey[]).map(
                (key) => {
                  const meta = HARD_CONSTRAINT_LABELS[key];
                  const enabled = config.hardConstraints[key]?.enabled ?? false;

                  return (
                    <label
                      key={key}
                      className="flex items-start gap-3 rounded-lg border border-slate-200 bg-slate-50 px-4 py-3 text-xs"
                    >
                      <input
                        type="checkbox"
                        checked={enabled}
                        onChange={(e) =>
                          setConfig((prev) =>
                            prev
                              ? {
                                  ...prev,
                                  hardConstraints: {
                                    ...prev.hardConstraints,
                                    [key]: { enabled: e.target.checked },
                                  },
                                }
                              : prev
                          )
                        }
                        className="mt-0.5 h-4 w-4 rounded border-slate-300 text-sky-600 focus:ring-sky-500"
                      />
                      <span>
                        <span className="block font-medium text-slate-900">
                          {meta.label}
                        </span>
                        <span className="mt-0.5 block text-slate-600">
                          {meta.description}
                        </span>
                      </span>
                    </label>
                  );
                }
              )}
            </div>
          </section>

          {/* Soft rules */}
          <section>
            <h2 className="text-sm font-semibold text-slate-900">
              Soft rules (scoring weights)
            </h2>
            <p className="mt-1 text-xs text-slate-500">
              These weights control how eligible drivers are ranked. Higher
              weight means that factor has more influence on the recommended
              driver.
            </p>

            <div className="mt-4 space-y-4">
              {(Object.keys(SOFT_RULE_LABELS) as SoftRuleKey[]).map((key) => {
                const meta = SOFT_RULE_LABELS[key];
                const rule = config.softRules[key];
                const enabled = rule?.enabled ?? false;
                const weight = rule?.weight ?? 0;

                return (
                  <div
                    key={key}
                    className="rounded-lg border border-slate-200 bg-slate-50 px-4 py-3"
                  >
                    <div className="flex flex-col justify-between gap-3 md:flex-row md:items-center">
                      <div>
                        <div className="flex items-center gap-2">
                          <span className="text-sm font-medium text-slate-900">
                            {meta.label}
                          </span>
                          <span className="rounded-full bg-slate-200 px-2 py-0.5 text-[10px] font-mono text-slate-700">
                            weight: {weight.toFixed(2)}
                          </span>
                        </div>
                        <p className="mt-1 text-xs text-slate-600">
                          {meta.description}
                        </p>
                      </div>
                      <div className="flex items-center gap-3">
                        <label className="flex items-center gap-2 text-[11px] text-slate-600">
                          <input
                            type="checkbox"
                            checked={enabled}
                            onChange={(e) =>
                              setConfig((prev) =>
                                prev
                                  ? {
                                      ...prev,
                                      softRules: {
                                        ...prev.softRules,
                                        [key]: {
                                          ...prev.softRules[key],
                                          enabled: e.target.checked,
                                        },
                                      },
                                    }
                                  : prev
                              )
                            }
                            className="h-4 w-4 rounded border-slate-300 text-sky-600 focus:ring-sky-500"
                          />
                          Enable
                        </label>
                        <div className="flex items-center gap-2">
                          <input
                            type="range"
                            min={0}
                            max={1}
                            step={0.1}
                            value={weight}
                            onChange={(e) => {
                              const v = clampWeight(parseFloat(e.target.value));
                              setConfig((prev) =>
                                prev
                                  ? {
                                      ...prev,
                                      softRules: {
                                        ...prev.softRules,
                                        [key]: {
                                          ...prev.softRules[key],
                                          enabled: true,
                                          weight: v,
                                        },
                                      },
                                    }
                                  : prev
                              );
                            }}
                            className="h-1 w-28 cursor-pointer accent-sky-600"
                          />
                          <input
                            type="number"
                            min={0}
                            max={1}
                            step={0.05}
                            value={weight}
                            onChange={(e) => {
                              const v = clampWeight(parseFloat(e.target.value));
                              setConfig((prev) =>
                                prev
                                  ? {
                                      ...prev,
                                      softRules: {
                                        ...prev.softRules,
                                        [key]: {
                                          ...prev.softRules[key],
                                          enabled: true,
                                          weight: v,
                                        },
                                      },
                                    }
                                  : prev
                              );
                            }}
                            className="w-16 rounded-md border border-slate-300 px-2 py-1 text-right text-xs font-mono focus:border-sky-500 focus:outline-none focus:ring-1 focus:ring-sky-500"
                          />
                        </div>
                      </div>
                    </div>
                  </div>
                );
              })}
            </div>
          </section>

          {/* Actions */}
          <div className="mt-4 flex flex-col justify-between gap-3 border-t border-slate-100 pt-4 text-xs md:flex-row md:items-center">
            <p className="text-[11px] text-slate-500">
              These settings are stored locally in your browser for now. The
              Jobs dashboard and debug drawer will use this policy to calculate
              recommended drivers.
            </p>
            <div className="flex items-center gap-2">
              <button
                type="button"
                onClick={handleReset}
                className="inline-flex items-center rounded-lg border border-slate-300 px-3 py-1.5 text-xs font-medium text-slate-700 hover:bg-slate-50"
              >
                Reset to defaults
              </button>
              <button
                type="button"
                onClick={handleSave}
                disabled={saving}
                className="inline-flex items-center rounded-lg bg-sky-600 px-4 py-1.5 text-xs font-medium text-white hover:bg-sky-700 disabled:opacity-60"
              >
                {saving ? "Saving…" : "Save policy"}
              </button>
            </div>
          </div>
        </div>
      </div>
    </div>
  );
}
