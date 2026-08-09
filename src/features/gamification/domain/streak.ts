/**
 * Streaks — docs/02-domain-engines.md §5
 *
 * The streak measures showing up, not grinding. 15 minutes is enough, rest
 * days are neutral, and shields absorb a missed day rather than resetting.
 */

export const MIN_QUALIFYING_MINUTES = 15;
export const MAX_SHIELDS = 3;
export const DAYS_PER_SHIELD = 7;
export const REPAIR_WINDOW_HOURS = 48;
export const REPAIR_COOLDOWN_DAYS = 30;

export interface StreakState {
  currentStreak: number;
  longestStreak: number;
  lastQualifiedDate: string | null; // ISO yyyy-mm-dd
  shields: number;
  totalStudyDays: number;
  totalMinutes: number;
  repairUsedAt: string | null;
}

export interface DayResult {
  date: string;
  completedItems: number;
  completedMinutes: number;
  plannedMinutes: number;
}

export const emptyStreak = (): StreakState => ({
  currentStreak: 0,
  longestStreak: 0,
  lastQualifiedDate: null,
  shields: 0,
  totalStudyDays: 0,
  totalMinutes: 0,
  repairUsedAt: null,
});

/**
 * A day qualifies on at least one completed item plus the lesser of 15 minutes
 * and the day's own budget — so a 15-minute plan is completable in 15 minutes.
 */
export function dayQualifies(day: DayResult): boolean {
  if (day.completedItems < 1) return false;
  const required = Math.min(MIN_QUALIFYING_MINUTES, Math.max(1, day.plannedMinutes));
  return day.completedMinutes >= required;
}

const toDate = (iso: string) => new Date(`${iso}T00:00:00Z`);
const daysBetween = (a: string, b: string) =>
  Math.round((toDate(b).getTime() - toDate(a).getTime()) / 86_400_000);

/** 0 = Sunday, matching `career_profiles.study_days`. */
export function isStudyDay(iso: string, studyDays: readonly number[]): boolean {
  return studyDays.includes(toDate(iso).getUTCDay());
}

/**
 * Count the days between two dates that the user actually committed to. A
 * weekend off on a weekdays-only schedule is not a missed day.
 */
export function missedStudyDays(
  from: string,
  to: string,
  studyDays: readonly number[],
): number {
  let missed = 0;
  const cursor = toDate(from);
  const end = toDate(to);
  cursor.setUTCDate(cursor.getUTCDate() + 1);

  while (cursor < end) {
    if (studyDays.includes(cursor.getUTCDay())) missed++;
    cursor.setUTCDate(cursor.getUTCDate() + 1);
  }
  return missed;
}

export interface ApplyDayResult {
  state: StreakState;
  qualified: boolean;
  shieldsSpent: number;
  streakBroken: boolean;
  shieldEarned: boolean;
}

export function applyDay(
  state: StreakState,
  day: DayResult,
  studyDays: readonly number[] = [0, 1, 2, 3, 4, 5, 6],
): ApplyDayResult {
  const qualified = dayQualifies(day);

  if (!qualified) {
    return { state, qualified: false, shieldsSpent: 0, streakBroken: false, shieldEarned: false };
  }

  // Same day recorded twice — minutes accumulate, the streak does not.
  if (state.lastQualifiedDate === day.date) {
    return {
      state: { ...state, totalMinutes: state.totalMinutes + day.completedMinutes },
      qualified: true,
      shieldsSpent: 0,
      streakBroken: false,
      shieldEarned: false,
    };
  }

  let shieldsSpent = 0;
  let streakBroken = false;
  let current = state.currentStreak;
  let shields = state.shields;

  if (state.lastQualifiedDate === null) {
    current = 1;
  } else {
    const gap = daysBetween(state.lastQualifiedDate, day.date);

    if (gap <= 0) {
      // Backfilled an older day; leave the streak alone.
      return {
        state: { ...state, totalMinutes: state.totalMinutes + day.completedMinutes },
        qualified: true,
        shieldsSpent: 0,
        streakBroken: false,
        shieldEarned: false,
      };
    }

    const missed = missedStudyDays(state.lastQualifiedDate, day.date, studyDays);

    if (missed === 0) {
      current += 1;
    } else if (missed <= shields) {
      shields -= missed;
      shieldsSpent = missed;
      current += 1;
    } else {
      shieldsSpent = shields;
      shields = 0;
      streakBroken = true;
      current = 1;
    }
  }

  const totalStudyDays = state.totalStudyDays + 1;

  // One shield per 7 consecutive qualifying days, capped at 3.
  const shieldEarned =
    current > 0 && current % DAYS_PER_SHIELD === 0 && shields < MAX_SHIELDS && !streakBroken;
  if (shieldEarned) shields += 1;

  return {
    state: {
      currentStreak: current,
      longestStreak: Math.max(state.longestStreak, current),
      lastQualifiedDate: day.date,
      shields,
      totalStudyDays,
      totalMinutes: state.totalMinutes + day.completedMinutes,
      repairUsedAt: state.repairUsedAt,
    },
    qualified: true,
    shieldsSpent,
    streakBroken,
    shieldEarned,
  };
}

/**
 * Is the streak in genuine danger right now? Drives the only streak
 * notification we send — never "you might lose your streak" spam.
 */
export function streakAtRisk(
  state: StreakState,
  today: string,
  studyDays: readonly number[],
): boolean {
  if (state.currentStreak === 0 || !state.lastQualifiedDate) return false;
  if (state.lastQualifiedDate === today) return false;
  if (!isStudyDay(today, studyDays)) return false;
  return state.shields === 0;
}
