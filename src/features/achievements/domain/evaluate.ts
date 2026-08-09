/**
 * Achievement evaluation — docs/00 §16, §46.
 *
 * Pure: takes a snapshot of what a user has done and decides what is unlocked.
 * Criteria are stored as JSON on the `achievements` row so new achievements are
 * data, not a deploy.
 */

export type Criteria =
  | { type: "count"; event: CountableEvent; target: number }
  | { type: "distinct"; field: DistinctField; target: number }
  | { type: "streak"; target: number }
  | { type: "skill_rank"; rank: string; target: number }
  | { type: "phase"; phase: string }
  | { type: "application_status"; status: string; target: number };

export type CountableEvent =
  | "coding_problem_solved"
  | "question_answered"
  | "research_completed"
  | "system_design_completed"
  | "incident_completed"
  | "mock_interview_completed"
  | "boss_battle_completed"
  | "interview_logged"
  | "application_created"
  | "weakness_resolved";

export type DistinctField = "coding_pattern" | "skill" | "domain";

/** Everything the evaluator is allowed to look at. */
export interface AchievementStats {
  counts: Partial<Record<CountableEvent, number>>;
  distinct: Partial<Record<DistinctField, number>>;
  currentStreak: number;
  longestStreak: number;
  skillsAtRank: Partial<Record<string, number>>;
  phase: string;
  phaseComplete: boolean;
  applicationsByStatus: Partial<Record<string, number>>;
}

export interface AchievementProgress {
  slug: string;
  unlocked: boolean;
  current: number;
  target: number;
  /** 0–1, for a progress ring. */
  ratio: number;
}

export const emptyStats = (): AchievementStats => ({
  counts: {},
  distinct: {},
  currentStreak: 0,
  longestStreak: 0,
  skillsAtRank: {},
  phase: "phase1",
  phaseComplete: false,
  applicationsByStatus: {},
});

/**
 * Returns current/target for a criterion. Unknown criteria types return zero
 * progress rather than throwing — an achievement authored with a typo should
 * stay locked, not break everyone's profile page.
 */
export function evaluateCriteria(
  criteria: Criteria | Record<string, unknown>,
  stats: AchievementStats,
): { current: number; target: number } {
  const c = criteria as Criteria;

  switch (c?.type) {
    case "count":
      return { current: stats.counts[c.event] ?? 0, target: Math.max(1, c.target) };

    case "distinct":
      return { current: stats.distinct[c.field] ?? 0, target: Math.max(1, c.target) };

    case "streak":
      // Longest, not current — losing a streak should not revoke a badge you
      // already earned.
      return {
        current: Math.max(stats.currentStreak, stats.longestStreak),
        target: Math.max(1, c.target),
      };

    case "skill_rank":
      return { current: stats.skillsAtRank[c.rank] ?? 0, target: Math.max(1, c.target) };

    case "phase":
      return { current: stats.phaseComplete ? 1 : 0, target: 1 };

    case "application_status":
      return {
        current: stats.applicationsByStatus[c.status] ?? 0,
        target: Math.max(1, c.target),
      };

    default:
      return { current: 0, target: 1 };
  }
}

export function evaluateAchievement(
  achievement: { slug: string; criteria: Criteria | Record<string, unknown> },
  stats: AchievementStats,
): AchievementProgress {
  const { current, target } = evaluateCriteria(achievement.criteria, stats);
  return {
    slug: achievement.slug,
    unlocked: current >= target,
    current,
    target,
    ratio: target === 0 ? 0 : Math.min(1, current / target),
  };
}

export function evaluateAll(
  achievements: readonly { slug: string; criteria: Criteria | Record<string, unknown> }[],
  stats: AchievementStats,
): AchievementProgress[] {
  return achievements.map((a) => evaluateAchievement(a, stats));
}

/**
 * Achievements that just crossed their threshold — the ones worth telling the
 * user about. Anything already unlocked is not re-announced.
 */
export function newlyUnlocked(
  progress: readonly AchievementProgress[],
  alreadyUnlocked: ReadonlySet<string>,
): AchievementProgress[] {
  return progress.filter((p) => p.unlocked && !alreadyUnlocked.has(p.slug));
}
