/**
 * XP and platform levels — docs/02-domain-engines.md §4
 *
 * XP is EFFORT currency. It is never an input to mastery or readiness, and it
 * is never awarded for navigation.
 */

export const XP_AWARDS = {
  topic_completed: 20,
  question_answered: 25,
  coding_problem_solved: 40,
  research_completed: 50,
  explanation_accepted: 20,
  system_design_completed: 100,
  boss_battle_completed: 120,
  mock_interview_completed: 150,
  weekly_mission_completed: 200,
  interview_logged: 80,
  incident_completed: 90,
  calibration_completed: 30,
} as const;

export type XpSource = keyof typeof XP_AWARDS;

/** A genuine attempt that fell short still pays — the weakness it opens is worth more. */
export const FAILURE_MULTIPLIER = 0.3;
/** Practice is encouraged; farming is not. */
export const REPEAT_MULTIPLIERS = [1, 0.25, 0] as const;
export const PASS_THRESHOLD = 0.6;

export interface XpAwardInput {
  source: XpSource;
  /** 1-based. The 3rd attempt onward earns nothing. */
  attemptNo?: number;
  /** Score 0–1 where applicable. Omit for sources that are pass/fail by completion. */
  score?: number;
  /** Each hint shaves 10% off, floored at 50%. */
  hintsUsed?: number;
}

export function repeatMultiplier(attemptNo = 1): number {
  const idx = Math.max(0, attemptNo - 1);
  return REPEAT_MULTIPLIERS[Math.min(idx, REPEAT_MULTIPLIERS.length - 1)];
}

export function hintMultiplier(hintsUsed = 0): number {
  return Math.max(0.5, 1 - 0.1 * Math.max(0, hintsUsed));
}

export function computeXpAward(input: XpAwardInput): number {
  const base = XP_AWARDS[input.source];
  const passed = input.score === undefined || input.score >= PASS_THRESHOLD;

  const multiplier =
    repeatMultiplier(input.attemptNo) *
    hintMultiplier(input.hintsUsed) *
    (passed ? 1 : FAILURE_MULTIPLIER);

  return Math.round(base * multiplier);
}

/**
 * Idempotency key. The database has a unique index on
 * (user_id, source_type, source_id) — this builds the pair that fills it, so
 * re-submitting the same attempt can never re-award (invariant #3).
 */
export function xpIdempotencyKey(source: XpSource, sourceId: string): string {
  return `${source}:${sourceId}`;
}

/**
 * Platform ranks — NOT job titles. Every surface that renders a level must say
 * so; readiness is what the career surfaces use.
 */
export const LEVELS = [
  { level: 1, name: "Apprentice", threshold: 0 },
  { level: 2, name: "Builder", threshold: 500 },
  { level: 3, name: "Engineer", threshold: 1_500 },
  { level: 4, name: "Production Engineer", threshold: 3_500 },
  { level: 5, name: "Senior Engineer", threshold: 7_000 },
  { level: 6, name: "Staff Engineer", threshold: 12_000 },
  { level: 7, name: "Principal Engineer", threshold: 20_000 },
] as const;

export interface LevelProgress {
  level: number;
  name: string;
  totalXp: number;
  currentThreshold: number;
  nextThreshold: number | null;
  xpIntoLevel: number;
  xpToNextLevel: number | null;
  progress: number;
}

export function levelForXp(totalXp: number): LevelProgress {
  const xp = Math.max(0, totalXp);
  let idx = 0;
  for (let i = LEVELS.length - 1; i >= 0; i--) {
    if (xp >= LEVELS[i].threshold) {
      idx = i;
      break;
    }
  }

  const current = LEVELS[idx];
  const next = LEVELS[idx + 1] ?? null;
  const xpIntoLevel = xp - current.threshold;
  const span = next ? next.threshold - current.threshold : 0;

  return {
    level: current.level,
    name: current.name,
    totalXp: xp,
    currentThreshold: current.threshold,
    nextThreshold: next?.threshold ?? null,
    xpIntoLevel,
    xpToNextLevel: next ? next.threshold - xp : null,
    progress: next ? Math.min(1, xpIntoLevel / span) : 1,
  };
}
