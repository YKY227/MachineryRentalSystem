// src/app/admin/assignment/page.tsx
"use client";

import { useState } from "react";
import type {
  AssignmentConfig,
  HardConstraintKey,
  SoftRuleKey,
} from "@/lib/types";
import { defaultAssignmentConfig } from "@/lib/types";

const HARD_LABELS: Record<HardConstraintKey, string> = {
  activeDriver: "Driver must be active",
  workingHours: "Within driver working hours",
  regionMatch: "Region coverage required",
  vehicleMatch: "Vehicle / capability must match",
  slotCapacity: "Respect slot capacity",
};

const SOFT_LABELS: Record<SoftRuleKey, string> = {
  regionScore: "Prefer closer / region-matching drivers",
  loadBalanceScore: "Balance load (fewer jobs today)",
  fairnessScore: "Fairness (who got fewer jobs recently)",
};

export default function AssignmentPolicyPage() {
  const [config, setConfig] = useState<AssignmentConfig>(
    () => defaultAssignmentConfig
  );

  const handleToggleGlobal = (key: "autoAssignScheduled" | "autoAssignExpress") => {
    setConfig((prev) => ({
      ...prev,
      [key]: !prev[key],
    }));
  };

  const handleToggleHard = (key: HardConstraintKey) => {
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

  const handleToggleSoft = (key: SoftRuleKey) => {
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

  const handleSoftWeightChange = (key: SoftRuleKey, weight: number) => {
    setConfig((prev) => ({
      ...prev,
      softRules: {
        ...prev.softRules,
        [key]: {
          ...prev.softRules[key],
          weight,
        },
      },
    }));
  };

  return (
    <div className="min-h-screen bg-slate-50">
      <div className="mx-auto max-w-4xl px-6 py-8">
        <header className="mb-6">
          <h1 className="text-2xl font-semibold text-slate-900">
            Assignment Policy
          </h1>
          <p className="mt-1 text-sm text-slate-600">
            Configure how the system selects drivers for jobs. This is a prototype
            UI and settings are stored in memory only (not persisted yet).
          </p>
        </header>

        {/* Global behaviour */}
        <section className="mb-8 rounded-xl border border-slate-200 bg-white p-4">
          <h2 className="text-sm font-semibold text-slate-800">
            Global behaviour
          </h2>
          <p className="mt-1 text-xs text-slate-500">
            Control when auto-assignment should run vs when jobs go straight into
            manual review.
          </p>

          <div className="mt-4 space-y-3 text-sm">
            <label className="flex items-start gap-2">
              <input
                type="checkbox"
                className="mt-0.5"
                checked={config.autoAssignScheduled}
                onChange={() => handleToggleGlobal("autoAssignScheduled")}
              />
              <span>
                <span className="font-medium text-slate-800">
                  Auto-assign scheduled jobs
                </span>
                <span className="block text-xs text-slate-500">
                  When off, all scheduled jobs will appear in{" "}
                  <span className="font-semibold">Pending Assignment</span> and
                  require manual allocation.
                </span>
              </span>
            </label>

            <label className="flex items-start gap-2">
              <input
                type="checkbox"
                className="mt-0.5"
                checked={config.autoAssignExpress}
                onChange={() => handleToggleGlobal("autoAssignExpress")}
              />
              <span>
                <span className="font-medium text-slate-800">
                  Auto-assign express / 3-hour jobs
                </span>
                <span className="block text-xs text-slate-500">
                  When off, express jobs are still ranked by the scoring engine,
                  but dispatchers must manually confirm the driver.
                </span>
              </span>
            </label>
          </div>
        </section>

        {/* Hard constraints */}
        <section className="mb-8 rounded-xl border border-slate-200 bg-white p-4">
          <h2 className="text-sm font-semibold text-slate-800">
            Hard constraints (must be satisfied)
          </h2>
          <p className="mt-1 text-xs text-slate-500">
            These rules act as filters. If a driver fails any enabled hard
            constraint, they are not considered for the job.
          </p>

          <div className="mt-4 grid gap-3 md:grid-cols-2 text-sm">
            {(Object.keys(config.hardConstraints) as HardConstraintKey[]).map(
              (key) => (
                <label key={key} className="flex items-start gap-2">
                  <input
                    type="checkbox"
                    className="mt-0.5"
                    checked={config.hardConstraints[key].enabled}
                    onChange={() => handleToggleHard(key)}
                  />
                  <span>
                    <span className="font-medium text-slate-800">
                      {HARD_LABELS[key]}
                    </span>
                    <span className="block text-[11px] text-slate-500">
                      Key: <code className="font-mono">{key}</code>
                    </span>
                  </span>
                </label>
              )
            )}
          </div>

          <p className="mt-3 text-[11px] text-slate-500">
            Turning some constraints off will not crash the system – the scoring
            engine will simply skip those checks and treat more drivers as
            eligible. You can safely experiment here.
          </p>
        </section>

        {/* Soft rules */}
        <section className="mb-8 rounded-xl border border-slate-200 bg-white p-4">
          <h2 className="text-sm font-semibold text-slate-800">
            Soft rules (ranking & weights)
          </h2>
          <p className="mt-1 text-xs text-slate-500">
            These rules decide which driver is preferred among all eligible
            candidates. We combine their weighted scores to pick the best match.
          </p>

          <div className="mt-4 space-y-4">
            {(Object.keys(config.softRules) as SoftRuleKey[]).map((key) => {
              const rule = config.softRules[key];
              return (
                <div
                  key={key}
                  className="rounded-lg border border-slate-200 bg-slate-50/60 px-3 py-2"
                >
                  <div className="flex items-center justify-between gap-3">
                    <div>
                      <div className="flex items-center gap-2">
                        <span className="text-sm font-medium text-slate-800">
                          {SOFT_LABELS[key]}
                        </span>
                        <span className="rounded-full bg-slate-100 px-2 py-0.5 text-[10px] font-mono text-slate-500">
                          {key}
                        </span>
                      </div>
                      <p className="mt-0.5 text-[11px] text-slate-500">
                        Weight:{" "}
                        <span className="font-semibold">
                          {rule.weight.toFixed(2)}
                        </span>
                        {"  "} (0 = ignore, higher = more influence)
                      </p>
                    </div>
                    <label className="flex items-center gap-1 text-[11px] text-slate-600">
                      <input
                        type="checkbox"
                        checked={rule.enabled}
                        onChange={() => handleToggleSoft(key)}
                      />
                      Enabled
                    </label>
                  </div>

                  <div className="mt-2 flex items-center gap-2 text-[11px]">
                    <input
                      type="range"
                      min={0}
                      max={1}
                      step={0.05}
                      value={rule.weight}
                      onChange={(e) =>
                        handleSoftWeightChange(
                          key,
                          Number.parseFloat(e.target.value)
                        )
                      }
                      className="flex-1"
                    />
                    <input
                      type="number"
                      min={0}
                      max={1}
                      step={0.05}
                      value={rule.weight}
                      onChange={(e) =>
                        handleSoftWeightChange(
                          key,
                          Number.isNaN(Number(e.target.value))
                            ? 0
                            : Number(e.target.value)
                        )
                      }
                      className="w-16 rounded border border-slate-200 px-1 py-0.5 text-right text-[11px]"
                    />
                  </div>
                </div>
              );
            })}
          </div>

          <p className="mt-3 text-[11px] text-slate-500">
            You don&apos;t have to normalise weights perfectly – the engine treats
            them as relative importance. For example, region = 0.6 and load = 0.3
            means region is roughly twice as important as load balancing.
          </p>
        </section>

        {/* Debug / export */}
        <section className="mb-8 rounded-xl border border-slate-200 bg-white p-4">
          <h2 className="text-sm font-semibold text-slate-800">
            Current config (debug)
          </h2>
          <p className="mt-1 text-xs text-slate-500">
            You can copy this JSON into your backend seed data or use it as part
            of your documentation / Notion page.
          </p>

          <pre className="mt-3 max-h-64 overflow-auto rounded-lg bg-slate-900 p-3 text-[11px] text-slate-100">
            {JSON.stringify(config, null, 2)}
          </pre>
        </section>
      </div>
    </div>
  );
}
