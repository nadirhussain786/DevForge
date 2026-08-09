/**
 * Spaced repetition — docs/02-domain-engines.md §8
 *
 * SM-2 lite. Deliberately simple: the value is in *what* gets scheduled (items
 * derived from real failures) rather than in a clever interval curve.
 */

import { clamp, round } from "@/lib/utils";

export const BASE_INTERVALS = [1, 3, 7, 16, 35] as const;
export const MIN_EASE = 1.3;
export const MAX_EASE = 2.8;
export const START_EASE = 2.5;
/** Retire an item once it has survived this many correct reviews in a row. */
export const RETIREMENT_REPETITIONS = 5;

export interface RevisionState {
  intervalDays: number;
  ease: number;
  repetitions: number;
}

export interface RevisionUpdate extends RevisionState {
  dueAt: Date;
  retired: boolean;
}

export const newRevision = (): RevisionState => ({
  intervalDays: BASE_INTERVALS[0],
  ease: START_EASE,
  repetitions: 0,
});

export function reviewRevision(
  state: RevisionState,
  correct: boolean,
  now: Date,
): RevisionUpdate {
  if (!correct) {
    // Back to tomorrow. Getting it wrong means the schedule was too optimistic,
    // so the interval resets rather than merely shrinking.
    const ease = clamp(state.ease - 0.2, MIN_EASE, MAX_EASE);
    return {
      intervalDays: 1,
      ease: round(ease, 2),
      repetitions: 0,
      dueAt: addDays(now, 1),
      retired: false,
    };
  }

  const repetitions = state.repetitions + 1;
  const ease = clamp(state.ease + 0.1, MIN_EASE, MAX_EASE);

  // Early reviews follow the fixed ladder; after that the ease multiplier takes
  // over, so a well-known item drifts out of the way on its own.
  const intervalDays =
    repetitions < BASE_INTERVALS.length
      ? BASE_INTERVALS[repetitions]
      : Math.round(state.intervalDays * ease);

  return {
    intervalDays,
    ease: round(ease, 2),
    repetitions,
    dueAt: addDays(now, intervalDays),
    retired: repetitions >= RETIREMENT_REPETITIONS,
  };
}

export function addDays(date: Date, days: number): Date {
  return new Date(date.getTime() + days * 86_400_000);
}

export function isDue(dueAt: Date, now: Date): boolean {
  return dueAt.getTime() <= now.getTime();
}

/** Most overdue first — the things decaying fastest get seen first. */
export function sortByUrgency<T extends { dueAt: Date }>(items: readonly T[], now: Date): T[] {
  return [...items]
    .filter((i) => isDue(i.dueAt, now))
    .sort((a, b) => a.dueAt.getTime() - b.dueAt.getTime());
}
