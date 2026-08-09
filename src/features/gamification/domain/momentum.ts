/**
 * Momentum — docs/02-domain-engines.md §6
 *
 * The "am I actually progressing" number. Rolling 7 days, separate from both
 * XP and mastery. Breadth is weighted deliberately: a week of only reading
 * topics scores badly even at 100% completion, because the loop never closed.
 */

import { clamp, round } from "@/lib/utils";

export const MOMENTUM_WEIGHTS = {
  consistency: 0.3,
  completion: 0.2,
  difficulty: 0.2,
  recall: 0.15,
  breadth: 0.15,
} as const;

/** The five stages a day's work can span. Applying and interviewing count as build/test. */
export const BREADTH_STAGES = ["learn", "build", "explain", "test", "research"] as const;
export type BreadthStage = (typeof BREADTH_STAGES)[number];

export const MOMENTUM_BANDS = [
  { min: 80, label: "White Hot" },
  { min: 60, label: "Forging" },
  { min: 35, label: "Warming" },
  { min: 0, label: "Cooling" },
] as const;

export interface MomentumInput {
  qualifyingDays: number;
  expectedDays: number;
  itemsCompleted: number;
  itemsPlanned: number;
  /** Mean difficulty (1–5) of completed items. */
  averageDifficulty: number;
  revisionCorrect: number;
  revisionDue: number;
  stagesUsed: readonly BreadthStage[];
}

export interface MomentumResult {
  score: number;
  band: string;
  components: Record<keyof typeof MOMENTUM_WEIGHTS, number>;
}

const ratio = (n: number, d: number) => (d <= 0 ? 0 : clamp(n / d, 0, 1));

export function momentumBand(score: number): string {
  return MOMENTUM_BANDS.find((b) => score >= b.min)?.label ?? "Cooling";
}

export function computeMomentum(input: MomentumInput): MomentumResult {
  const components = {
    consistency: ratio(input.qualifyingDays, input.expectedDays),
    completion: ratio(input.itemsCompleted, input.itemsPlanned),
    difficulty: clamp(input.averageDifficulty / 5, 0, 1),
    // No revision due is not a failure — it means nothing has decayed yet.
    recall: input.revisionDue === 0 ? 1 : ratio(input.revisionCorrect, input.revisionDue),
    breadth: ratio(new Set(input.stagesUsed).size, BREADTH_STAGES.length),
  };

  const score =
    100 *
    (Object.keys(MOMENTUM_WEIGHTS) as (keyof typeof MOMENTUM_WEIGHTS)[]).reduce(
      (a, k) => a + MOMENTUM_WEIGHTS[k] * components[k],
      0,
    );

  const rounded = round(clamp(score, 0, 100), 2);

  return {
    score: rounded,
    band: momentumBand(rounded),
    components: {
      consistency: round(components.consistency, 3),
      completion: round(components.completion, 3),
      difficulty: round(components.difficulty, 3),
      recall: round(components.recall, 3),
      breadth: round(components.breadth, 3),
    },
  };
}
