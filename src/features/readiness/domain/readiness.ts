/**
 * Engineering Readiness Score — docs/02-domain-engines.md §3
 *
 * Two axes, deliberately. "How good are you at databases" and "how good are you
 * at coding under pressure" are different questions, and a single average hides
 * both. Readiness is never derived from XP (§20).
 */

import { clamp, round } from "@/lib/utils";

export const READINESS_DIMENSIONS = [
  "knowledge",
  "coding",
  "systemDesign",
  "architecture",
  "problemSolving",
  "aiEngineering",
  "security",
  "communication",
  "interviewPerformance",
  "consistency",
] as const;

export type ReadinessDimension = (typeof READINESS_DIMENSIONS)[number];

/** Below this, a critical domain starts dragging the overall score down. */
export const CRITICAL_DOMAIN_FLOOR = 50;
export const MAX_PENALTY = 0.3;

export interface SkillReadinessInput {
  skillId: string;
  domainSlug: string;
  /** 0–100 */
  mastery: number;
  /** Role-track weight, 0–1. Skills at 0 are excluded entirely. */
  weight: number;
  isCritical: boolean;
}

export interface ReadinessInput {
  skills: readonly SkillReadinessInput[];
  dimensions: Partial<Record<ReadinessDimension, number>>;
  /** 0–100: qualifying study days ÷ expected days over 28 days. */
  consistency: number;
}

export interface ReadinessResult {
  overall: number;
  byDomain: Record<string, number>;
  byDimension: Record<string, number>;
  components: {
    domainRollup: number;
    modalityRollup: number;
    consistency: number;
    blend: number;
    weakestCriticalDomain: string | null;
    weakestCriticalScore: number | null;
    penalty: number;
  };
  /** Plain-English reason the overall was reduced, or null if it wasn't. */
  penaltyExplanation: string | null;
}

/**
 * Weighted mastery rollup across one domain. Skills the role track doesn't
 * care about are already excluded, so a frontend engineer is never marked down
 * for not knowing sharding.
 */
export function domainReadiness(skills: readonly SkillReadinessInput[]): number {
  const relevant = skills.filter((s) => s.weight > 0);
  if (relevant.length === 0) return 0;

  const totalWeight = relevant.reduce((a, s) => a + s.weight, 0);
  if (totalWeight === 0) return 0;

  const weighted = relevant.reduce((a, s) => a + s.weight * clamp(s.mastery, 0, 100), 0);
  return round(weighted / totalWeight, 2);
}

export function groupByDomain(
  skills: readonly SkillReadinessInput[],
): Record<string, SkillReadinessInput[]> {
  const out: Record<string, SkillReadinessInput[]> = {};
  for (const s of skills) {
    if (s.weight <= 0) continue;
    (out[s.domainSlug] ??= []).push(s);
  }
  return out;
}

export function computeReadiness(input: ReadinessInput): ReadinessResult {
  const grouped = groupByDomain(input.skills);

  const byDomain: Record<string, number> = {};
  for (const [domain, skills] of Object.entries(grouped)) {
    byDomain[domain] = domainReadiness(skills);
  }

  // Domain rollup is weighted by how much role-track weight each domain
  // carries, so a domain with one minor skill can't swing the score.
  const domainWeights: Record<string, number> = {};
  for (const [domain, skills] of Object.entries(grouped)) {
    domainWeights[domain] = skills.reduce((a, s) => a + s.weight, 0);
  }
  const totalDomainWeight = Object.values(domainWeights).reduce((a, b) => a + b, 0);
  const domainRollup =
    totalDomainWeight > 0
      ? Object.entries(byDomain).reduce(
          (a, [d, score]) => a + score * (domainWeights[d] / totalDomainWeight),
          0,
        )
      : 0;

  const byDimension: Record<string, number> = {};
  for (const d of READINESS_DIMENSIONS) {
    byDimension[d] = round(clamp(input.dimensions[d] ?? 0, 0, 100), 2);
  }

  const provided = READINESS_DIMENSIONS.filter((d) => input.dimensions[d] !== undefined);
  const modalityRollup =
    provided.length > 0
      ? provided.reduce((a, d) => a + clamp(input.dimensions[d] ?? 0, 0, 100), 0) / provided.length
      : 0;

  const consistency = clamp(input.consistency, 0, 100);
  const blend = 0.45 * domainRollup + 0.4 * modalityRollup + 0.15 * consistency;

  // The honest part. Being excellent at one thing and absent at another that
  // your target role screens on does not average out to "ready".
  const criticalDomains = Object.entries(grouped).filter(([, skills]) =>
    skills.some((s) => s.isCritical),
  );

  let weakestCriticalDomain: string | null = null;
  let weakestCriticalScore: number | null = null;
  for (const [domain] of criticalDomains) {
    const score = byDomain[domain];
    if (weakestCriticalScore === null || score < weakestCriticalScore) {
      weakestCriticalScore = score;
      weakestCriticalDomain = domain;
    }
  }

  const penalty =
    weakestCriticalScore !== null
      ? MAX_PENALTY *
        Math.max(0, (CRITICAL_DOMAIN_FLOOR - weakestCriticalScore) / CRITICAL_DOMAIN_FLOOR)
      : 0;

  const overall = blend * (1 - penalty);

  const penaltyExplanation =
    penalty > 0 && weakestCriticalDomain
      ? `Overall reduced by ${Math.round(penalty * 100)}% — ${weakestCriticalDomain} is at ` +
        `${Math.round(weakestCriticalScore ?? 0)}% and is critical for your target role.`
      : null;

  return {
    overall: round(clamp(overall, 0, 100), 2),
    byDomain,
    byDimension,
    components: {
      domainRollup: round(domainRollup, 2),
      modalityRollup: round(modalityRollup, 2),
      consistency: round(consistency, 2),
      blend: round(blend, 2),
      weakestCriticalDomain,
      weakestCriticalScore: weakestCriticalScore === null ? null : round(weakestCriticalScore, 2),
      penalty: round(penalty, 4),
    },
    penaltyExplanation,
  };
}

/** "Your System Design score improved 12% this week" (§41). */
export function readinessDelta(
  current: ReadinessResult,
  previous: Pick<ReadinessResult, "overall" | "byDomain"> | null,
): { overall: number; byDomain: Record<string, number> } {
  if (!previous) return { overall: 0, byDomain: {} };

  const byDomain: Record<string, number> = {};
  for (const [domain, score] of Object.entries(current.byDomain)) {
    byDomain[domain] = round(score - (previous.byDomain[domain] ?? 0), 2);
  }
  return { overall: round(current.overall - previous.overall, 2), byDomain };
}
