// src/app/admin/settings/assignment/page.tsx
"use client";

import { useEffect, useState } from "react";
import type { AssignmentConfig, HardConstraintKey, SoftRuleKey } from "@/lib/types";
import { defaultAssignmentConfig } from "@/lib/types";

const STORAGE_KEY = "assignmentConfig.v1";

export default function AssignmentSettingsPage() {
  const [config, setConfig] = useState<AssignmentConfig>(() => defaultAssignmentConfig);
  const [loadedFromStorage, setLoadedFromStorage] = useState(false);
  const [saving, setSaving] = useState(false);

  // Load from localStorage on mount
  useEffect(() => {
    try {
      const raw = typeof window !== "undefined"
        ? window.localStorage.getItem(STORAGE_KEY)
        : null;
      if (!raw) {
        setLoadedFromStorage(true);
        return;
      }

      const parsed = JSON.parse(raw) as Partial<AssignmentConfig>;

      // Merge safely with defaults to avoid missing keys
      setConfig((prev) => ({
        ...prev,
        ...parsed,
        hardConstraints: {
          ...prev.hardConstraints,
          ...(parsed.hardConstraints ?? {}),
        },
        softRules: {
          ...prev.softRules,
          ...(parsed.softRules ?? {}),
        },
      }));
    } catch (err) {
      console.warn("Failed to load assignment config from localStorage", err);
    } finally {
      setLoadedFromStorage(true);
    }
  }, []);

  const handleToggleAuto = (key: "autoAssignScheduled" | "autoAssignExpress") => {
    setConfig((prev) => ({
      ...prev,
      [key]: !prev[key],
    }));
  };

  const handleToggleHardConstraint = (key: HardConstraintKey) => {
    setConfig((prev) => ({
      ...prev,
      hardConstraints: {
        ...prev.hardConstraints,
        [key]: {
          ...prev.hardConstraints[key],
          enabled: !prev.hardConstraints[key].enabled,
        },
      },
    }));
  };

  const handleToggleSoftRule = (key: SoftRuleKey) => {
    setConfig((prev) => ({
      ...prev,
      softRules: {
        ...prev.softRules,
        [key]: {
          ...prev.softRules[key],
          enabled: !prev.softRules[key].enabled,
        },
      },
    }));
  };

  const handleSoftRuleWeightChange = (key: SoftRuleKey, newWeight: number) => {
    setConfig((prev) => ({
      ...prev,
      softRules: {
        ...prev.softRules,
        [key]: {
          ...prev.softRules[key],
          weight: newWeight,
        },
      },
    }));
  };

  const handleSave = () => {
    try {
      setSaving(true);
      if (typeof window !== "undefined") {
        window.localStorage.setItem(STORAGE_KEY, JSON.stringify(config));
      }
      alert("Assignment policy saved (prototype – stored in browser only).");
    } catch (err) {
      console.error("Failed to save assignment config", err);
      alert("Failed to save policy. Check console for details.");
    } finally {
      setSaving(false);
    }
  };

  const handleReset = () => {
    setConfig(defaultAssignmentConfig);
    if (typeof window !== "undefined") {
      window.localStorage.removeItem(STORAGE_KEY);
    }
    alert("Assignment policy reset to defaults.");
  };

  if (!loadedFromStorage) {
    return (
      <div className="min-h-screen bg-slate-50">
        <div className="mx-auto max-w-4xl px-6 py-8 text-sm text-slate-600">
          Loading assignment settings…
        </div>
      </div>
    );
  }

  return (
    <div className="min-h-screen bg-slate-50">
      <div className="mx-auto max-w-4xl px-6 py-8 space-y-8">
        {/* Header */}
        <header className="flex items-center justify-between gap-3">
          <div>
            <h1 className="text-2xl font-semibold text-slate-900">
              Assignment Policy
            </h1>
            <p className="mt-1 text-sm text-slate-600">
              Configure how jobs are auto-assigned to drivers. Changes here will
              inform the scoring engine and admin recommendation UI.
            </p>
          </div>
          <div className="flex gap-2">
            <button
              type="button"
              onClick={handleReset}
              className="rounded-lg border border-slate-300 px-3 py-2 text-xs font-medium text-slate-700 hover:bg-slate-100"
            >
              Reset to defaults
            </button>
            <button
              type="button"
              onClick={handleSave}
              disabled={saving}
              className="rounded-lg bg-sky-600 px-4 py-2 text-xs font-medium text-white hover:bg-sky-700 disabled:opacity-60"
            >
              {saving ? "Saving…" : "Save policy"}
            </button>
          </div>
        </header>

        {/* Auto-assign toggles */}
        <section className="rounded-xl border border-slate-200 bg-white p-4">
          <h2 className="text-sm font-semibold text-slate-900">
            Auto-assignment behaviour
          </h2>
          <p className="mt-1 text-xs text-slate-600">
            Control when the system should auto-assign drivers vs send jobs to
            the manual “Pending Assignment” queue.
          </p>

          <div className="mt-4 space-y-3 text-sm">
            <label className="flex items-start gap-3">
              <input
                type="checkbox"
                checked={config.autoAssignScheduled}
                onChange={() => handleToggleAuto("autoAssignScheduled")}
                className="mt-0.5 h-4 w-4 rounded border-slate-300 text-sky-600"
              />
              <div>
                <div className="font-medium text-slate-900">
                  Auto-assign scheduled jobs
                </div>
                <p className="text-xs text-slate-500">
                  When enabled, jobs with a booked time window will be assigned
                  automatically if drivers meet constraints.
                </p>
              </div>
            </label>

            <label className="flex items-start gap-3">
              <input
                type="checkbox"
                checked={config.autoAssignExpress}
                onChange={() => handleToggleAuto("autoAssignExpress")}
                className="mt-0.5 h-4 w-4 rounded border-slate-300 text-sky-600"
              />
              <div>
                <div className="font-medium text-slate-900">
                  Auto-assign express / 3-hour jobs
                </div>
                <p className="text-xs text-slate-500">
                  When disabled, express jobs will be highlighted in the
                  “Ad-hoc/Urgent” lane and require manual assignment.
                </p>
              </div>
            </label>
          </div>
        </section>

        {/* Hard constraints */}
        <section className="rounded-xl border border-slate-200 bg-white p-4">
          <h2 className="text-sm font-semibold text-slate-900">
            Hard constraints (filter layer)
          </h2>
          <p className="mt-1 text-xs text-slate-600">
            These rules determine which drivers are <span className="font-semibold">eligible</span>.
            If a constraint is disabled, the engine will no longer filter by it.
          </p>

          <div className="mt-4 grid gap-3 md:grid-cols-2 text-sm">
            <ConstraintToggle
              label="Driver must be active"
              description="Ignore drivers marked as inactive."
              checked={config.hardConstraints.activeDriver.enabled}
              onChange={() => handleToggleHardConstraint("activeDriver")}
            />
            <ConstraintToggle
              label="Within working hours"
              description="Only consider drivers whose shift covers the pickup window."
              checked={config.hardConstraints.workingHours.enabled}
              onChange={() => handleToggleHardConstraint("workingHours")}
            />
            <ConstraintToggle
              label="Region coverage"
              description="Pickup region must fall inside driver’s primary/secondary regions."
              checked={config.hardConstraints.regionMatch.enabled}
              onChange={() => handleToggleHardConstraint("regionMatch")}
            />
            <ConstraintToggle
              label="Vehicle suitability"
              description="Filter out drivers whose vehicle type is not suitable for the job."
              checked={config.hardConstraints.vehicleMatch.enabled}
              onChange={() => handleToggleHardConstraint("vehicleMatch")}
            />
            <ConstraintToggle
              label="Slot capacity"
              description="Respect max jobs per time slot / per day."
              checked={config.hardConstraints.slotCapacity.enabled}
              onChange={() => handleToggleHardConstraint("slotCapacity")}
            />
          </div>
        </section>

        {/* Soft rules */}
        <section className="rounded-xl border border-slate-200 bg-white p-4">
          <h2 className="text-sm font-semibold text-slate-900">
            Soft rules (scoring layer)
          </h2>
          <p className="mt-1 text-xs text-slate-600">
            These rules influence <span className="font-semibold">which eligible driver</span> is
            preferred. Weights are relative; they don&apos;t need to sum to 1.
          </p>

          <div className="mt-4 space-y-4 text-sm">
            <SoftRuleControl
              label="Region score"
              description="Prefer drivers whose regions match the pickup area."
              enabled={config.softRules.regionScore.enabled}
              weight={config.softRules.regionScore.weight}
              onToggle={() => handleToggleSoftRule("regionScore")}
              onWeightChange={(w) => handleSoftRuleWeightChange("regionScore", w)}
            />

            <SoftRuleControl
              label="Load balance score"
              description="Prefer drivers with fewer jobs today (spread workload fairly)."
              enabled={config.softRules.loadBalanceScore.enabled}
              weight={config.softRules.loadBalanceScore.weight}
              onToggle={() => handleToggleSoftRule("loadBalanceScore")}
              onWeightChange={(w) => handleSoftRuleWeightChange("loadBalanceScore", w)}
            />

            <SoftRuleControl
              label="Fairness score"
              description="Prefer drivers who have received fewer recent assignments (round-robin style)."
              enabled={config.softRules.fairnessScore.enabled}
              weight={config.softRules.fairnessScore.weight}
              onToggle={() => handleToggleSoftRule("fairnessScore")}
              onWeightChange={(w) => handleSoftRuleWeightChange("fairnessScore", w)}
            />
          </div>
        </section>

        {/* Small hint footer */}
        <footer className="border-t border-slate-200 pt-4 text-xs text-slate-500">
          These settings are currently stored in your browser only (prototype).
          Later, they can be persisted in your NestJS backend and applied to the
          real assignment engine and auto-assign runner.
        </footer>
      </div>
    </div>
  );
}

/* ---------- Small presentational helpers ---------- */

function ConstraintToggle(props: {
  label: string;
  description: string;
  checked: boolean;
  onChange: () => void;
}) {
  const { label, description, checked, onChange } = props;
  return (
    <label className="flex items-start gap-3">
      <input
        type="checkbox"
        checked={checked}
        onChange={onChange}
        className="mt-0.5 h-4 w-4 rounded border-slate-300 text-sky-600"
      />
      <div>
        <div className="font-medium text-slate-900">{label}</div>
        <p className="text-xs text-slate-500">{description}</p>
      </div>
    </label>
  );
}

function SoftRuleControl(props: {
  label: string;
  description: string;
  enabled: boolean;
  weight: number;
  onToggle: () => void;
  onWeightChange: (w: number) => void;
}) {
  const { label, description, enabled, weight, onToggle, onWeightChange } = props;

  return (
    <div className="rounded-lg border border-slate-200 bg-slate-50 px-3 py-3">
      <div className="flex items-start justify-between gap-3">
        <div>
          <div className="flex items-center gap-2">
            <label className="flex items-center gap-2">
              <input
                type="checkbox"
                checked={enabled}
                onChange={onToggle}
                className="h-4 w-4 rounded border-slate-300 text-sky-600"
              />
              <span className="text-sm font-medium text-slate-900">{label}</span>
            </label>
          </div>
          <p className="mt-1 text-xs text-slate-600">{description}</p>
        </div>

        <div className="w-40 text-right text-xs text-slate-600">
          <label className="mb-1 block text-[11px] font-medium text-slate-700">
            Weight ({weight.toFixed(2)})
          </label>
          <input
            type="range"
            min={0}
            max={1}
            step={0.05}
            value={weight}
            onChange={(e) => onWeightChange(parseFloat(e.target.value))}
            className="w-full accent-sky-600"
          />
        </div>
      </div>
    </div>
  );
}
