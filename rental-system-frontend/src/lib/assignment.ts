// src/lib/assignment.ts
"use client";

import type {
  AssignmentConfig,
  AssignmentFailureReason,
  Driver,
  JobSummary,
  RegionCode,
  HardConstraintKey,
} from "@/lib/types";

export interface AssignmentContext {
  /**
   * Optional: how many jobs each driver already has today.
   * Used for load balancing & fairness.
   */
  driverJobCounts?: Record<string, number>;

  /**
   * Optional: current time, for working-hours checks later.
   */
  now?: Date;
}

/**
 * Result for each driver candidate when we run the scoring engine.
 * Mirrors the debug structure we planned in Job.assignmentScoreDebug.
 */
export interface AssignmentCandidateScore {
  driverId: string;

  // Weighted final score (0–1 or any numeric range)
  totalScore: number;

  // Soft scoring components (already weighted OR raw values)
  components: {
    regionScore: number;
    loadBalanceScore: number;
    fairnessScore: number;
  };

  // Hard constraints (true = passed)
  hardConstraints: Record<HardConstraintKey, boolean>;

  // Diagnostic info
  rejected?: boolean;
  rejectionReason?: AssignmentFailureReason;
}

/**
 * Helper: check if a region is allowed for a driver
 */
function driverCoversRegion(driver: Driver, region: RegionCode): boolean {
  if (driver.primaryRegion === region) return true;
  if (driver.secondaryRegions?.includes(region)) return true;
  if (driver.primaryRegion === "island-wide") return true;
  return false;
}

/**
 * Run hard constraints + soft scoring for a given job & driver list.
 * Currently implements:
 * - activeDriver (hard)
 * - regionMatch (hard + soft)
 * - loadBalanceScore (soft)
 * - fairnessScore (soft)
 *
 * TODO (later): workingHours, vehicleMatch, slotCapacity.
 */
export function scoreDriversForJob(
  job: JobSummary,
  drivers: Driver[],
  config: AssignmentConfig,
  ctx: AssignmentContext = {}
): AssignmentCandidateScore[] {
  const { driverJobCounts = {} } = ctx;

  const results: AssignmentCandidateScore[] = [];

  for (const d of drivers) {
    let rejected = false;
    let rejectionReason: AssignmentFailureReason | undefined;

    // ---------- HARD CONSTRAINT FLAGS ----------
    const hardFlags: Record<HardConstraintKey, boolean> = {
      activeDriver: true,
      workingHours: true,
      regionMatch: true,
      vehicleMatch: true,
      slotCapacity: true,
    };

    const hard = config.hardConstraints;

    // Active driver
    if (hard.activeDriver?.enabled && !d.isActive) {
      hardFlags.activeDriver = false;
      rejected = true;
      rejectionReason = "NO_ELIGIBLE_DRIVER";
    }

    // Region match
    if (!rejected && hard.regionMatch?.enabled) {
      if (!driverCoversRegion(d, job.pickupRegion)) {
        hardFlags.regionMatch = false;
        rejected = true;
        rejectionReason = "NO_REGION_COVERAGE";
      }
    }

    // NOTE: For now we do not implement workingHours, vehicleMatch, slotCapacity.
    // You can set these based on driver + job schedule later.

    // If rejected by any hard constraint, record and continue.
    if (rejected) {
      results.push({
        driverId: d.id,
        totalScore: 0,
        components: {
          regionScore: 0,
          loadBalanceScore: 0,
          fairnessScore: 0,
        },
        hardConstraints: hardFlags,
        rejected: true,
        rejectionReason,
      });
      continue;
    }

    // ---------- SOFT RULES (scoring layer) ----------
    const soft = config.softRules;

    let regionComponent = 0;
    let loadComponent = 0;
    let fairnessComponent = 0;

    // Region score: prefer primary region, then secondary, then island-wide.
    if (soft.regionScore?.enabled) {
      let regionRaw = 0;
      if (d.primaryRegion === job.pickupRegion) {
        regionRaw = 1.0;
      } else if (d.secondaryRegions?.includes(job.pickupRegion)) {
        regionRaw = 0.7;
      } else if (d.primaryRegion === "island-wide") {
        regionRaw = 0.8;
      } else {
        regionRaw = 0.2; // still possible but less ideal
      }
      const w = soft.regionScore.weight ?? 0;
      regionComponent = regionRaw * w;
    }

    // Load-balance score: prefer fewer jobs today.
    if (soft.loadBalanceScore?.enabled) {
      const jobsToday = driverJobCounts[d.id] ?? 0;
      const max = d.maxJobsPerDay || 1;
      const usedFraction = Math.min(1, jobsToday / max);
      const freeFraction = 1 - usedFraction; // 1 = completely free, 0 = fully loaded
      const w = soft.loadBalanceScore.weight ?? 0;
      loadComponent = freeFraction * w;
    }

    // Fairness score: simple inverse of jobsToday for now.
    if (soft.fairnessScore?.enabled) {
      const jobsToday = driverJobCounts[d.id] ?? 0;
      const fairnessBase = 1 / (1 + jobsToday); // 1.0, 0.5, 0.33, ...
      const w = soft.fairnessScore.weight ?? 0;
      fairnessComponent = fairnessBase * w;
    }

    const totalScore = regionComponent + loadComponent + fairnessComponent;

    results.push({
      driverId: d.id,
      totalScore,
      components: {
        regionScore: regionComponent,
        loadBalanceScore: loadComponent,
        fairnessScore: fairnessComponent,
      },
      hardConstraints: hardFlags,
    });
  }

  return results;
}

/**
 * Pick the best candidate from the scoring results.
 * Returns `undefined` if everyone is rejected or there are no candidates.
 */
export function pickBestDriver(
  scores: AssignmentCandidateScore[]
): AssignmentCandidateScore | undefined {
  let best: AssignmentCandidateScore | undefined;
  let bestScore = Number.NEGATIVE_INFINITY;

  for (const s of scores) {
    if (s.rejected) continue;
    if (s.totalScore > bestScore) {
      bestScore = s.totalScore;
      best = s;
    }
  }

  return best;
}
