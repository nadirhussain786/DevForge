/**
 * Mastery model — docs/02-domain-engines.md §2
 *
 * Pure. No I/O, no implicit clock: `now` is always an argument so tests are
 * deterministic and the same code can score a historical replay.
 *
 * This mirrors `public.recompute_user_skill` in supabase/migrations/0006. The
 * SQL is authoritative at write time (atomic with the evidence insert); this is
 * used for previews, explanations, and the "what if" calculations in the UI.
 * The two must stay in step — `mastery.test.ts` pins the formula.
 */

import { clamp, round } from "@/lib/utils";

/** Evidence quality: how much a signal actually tells us about capability. */
export const EVIDENCE_WEIGHTS = {
  mcq: 0.5,
  short_answer: 0.8,
  research_note: 0.6,
  calibration: 0.7,
  explanation: 1.2,
  coding_attempt: 1.5,
  mock_interview_turn: 1.8,
  system_design_attempt: 2.0,
  boss_battle: 2.0,
  incident_run: 2.0,
  real_interview_question: 2.5,
} as const;

export type EvidenceSource = keyof typeof EVIDENCE_WEIGHTS;

export const MASTERY_HALF_LIFE_DAYS = 45;
export const CONFIDENCE_SCALE = 6;
/** Self-reported skill can never start you above "Familiar". */
export const MAX_PRIOR_MASTERY = 35;

export const SKILL_RANKS = ["novice", "familiar", "working", "proficient", "strong", "expert"] as const;
export type SkillRank = (typeof SKILL_RANKS)[number];

export interface Evidence {
  source: EvidenceSource;
  /** 1–5 */
  difficulty: number;
  /** 0–1 */
  correctness: number;
  occurredAt: Date;
}

export interface MasteryResult {
  mastery: number;
  rawMastery: number;
  confidence: number;
  rank: SkillRank;
  evidenceCount: number;
  totalWeight: number;
  lastPracticedAt: Date | null;
}

/** Harder questions say more about capability than easy ones. 0.75 … 1.75 */
export function difficultyMultiplier(difficulty: number): number {
  return 0.5 + 0.25 * clamp(difficulty, 1, 5);
}

/**
 * Knowledge fades. A 45-day half-life means a skill untouched for six weeks
 * reads at half strength — which is the signal that drives revision.
 */
export function decayFactor(ageDays: number): number {
  return 0.5 ** (Math.max(0, ageDays) / MASTERY_HALF_LIFE_DAYS);
}

export function ageInDays(occurredAt: Date, now: Date): number {
  return (now.getTime() - occurredAt.getTime()) / 86_400_000;
}

export function effectiveWeight(e: Evidence, now: Date): number {
  return (
    EVIDENCE_WEIGHTS[e.source] *
    difficultyMultiplier(e.difficulty) *
    decayFactor(ageInDays(e.occurredAt, now))
  );
}

export function masteryRank(mastery: number): SkillRank {
  if (mastery < 20) return "novice";
  if (mastery < 40) return "familiar";
  if (mastery < 60) return "working";
  if (mastery < 75) return "proficient";
  if (mastery < 90) return "strong";
  return "expert";
}

/**
 * Confidence rises with accumulated evidence weight and never reaches 1.
 * ~0.63 at 6 units, ~0.95 at 18.
 */
export function confidenceFor(totalWeight: number): number {
  return 1 - Math.exp(-totalWeight / CONFIDENCE_SCALE);
}

export function computeMastery(
  evidence: readonly Evidence[],
  options: { prior?: number; now: Date },
): MasteryResult {
  const { now } = options;
  const prior = clamp(options.prior ?? 0, 0, MAX_PRIOR_MASTERY);

  let totalWeight = 0;
  let weightedCorrect = 0;
  let lastPracticedAt: Date | null = null;

  for (const e of evidence) {
    const w = effectiveWeight(e, now);
    totalWeight += w;
    weightedCorrect += w * clamp(e.correctness, 0, 1);
    if (!lastPracticedAt || e.occurredAt > lastPracticedAt) lastPracticedAt = e.occurredAt;
  }

  const confidence = confidenceFor(totalWeight);
  const rawMastery = totalWeight > 0 ? (100 * weightedCorrect) / totalWeight : 0;

  // Shrink toward the prior while evidence is thin, so one lucky MCQ never
  // reads as expertise. The UI shows the confidence band alongside.
  const mastery = rawMastery * confidence + prior * (1 - confidence);

  return {
    mastery: round(clamp(mastery, 0, 100), 2),
    rawMastery: round(clamp(rawMastery, 0, 100), 2),
    confidence: round(confidence, 3),
    rank: masteryRank(mastery),
    evidenceCount: evidence.length,
    totalWeight: round(totalWeight, 3),
    lastPracticedAt,
  };
}

export interface EvidenceContribution {
  evidence: Evidence;
  ageDays: number;
  decay: number;
  effectiveWeight: number;
  /** Share of the raw mastery this row accounts for, in points. */
  contribution: number;
  /** Share of total evidence weight, 0–1. */
  share: number;
}

/**
 * The §21 "why does this score exist" breakdown. Rendered as a table on the
 * skill page — the number is never a black box.
 */
export function explainMastery(
  evidence: readonly Evidence[],
  now: Date,
): EvidenceContribution[] {
  const weights = evidence.map((e) => effectiveWeight(e, now));
  const total = weights.reduce((a, b) => a + b, 0);

  return evidence
    .map((e, i) => {
      const share = total > 0 ? weights[i] / total : 0;
      return {
        evidence: e,
        ageDays: round(ageInDays(e.occurredAt, now), 1),
        decay: round(decayFactor(ageInDays(e.occurredAt, now)), 3),
        effectiveWeight: round(weights[i], 3),
        contribution: round(100 * share * clamp(e.correctness, 0, 1), 2),
        share: round(share, 4),
      };
    })
    .sort((a, b) => b.effectiveWeight - a.effectiveWeight);
}
