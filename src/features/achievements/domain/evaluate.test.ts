import { describe, expect, it } from "vitest";

import {
  emptyStats,
  evaluateAchievement,
  evaluateAll,
  evaluateCriteria,
  newlyUnlocked,
  type AchievementStats,
} from "./evaluate";

const stats = (over: Partial<AchievementStats> = {}): AchievementStats => ({
  ...emptyStats(),
  ...over,
});

describe("evaluateCriteria", () => {
  it("counts events", () => {
    const r = evaluateCriteria(
      { type: "count", event: "coding_problem_solved", target: 5 },
      stats({ counts: { coding_problem_solved: 3 } }),
    );
    expect(r).toEqual({ current: 3, target: 5 });
  });

  it("uses the longest streak, so losing one never revokes a badge", () => {
    const r = evaluateCriteria(
      { type: "streak", target: 7 },
      stats({ currentStreak: 0, longestStreak: 30 }),
    );
    expect(r.current).toBe(30);
  });

  it("counts skills at a rank", () => {
    const r = evaluateCriteria(
      { type: "skill_rank", rank: "expert", target: 1 },
      stats({ skillsAtRank: { expert: 2 } }),
    );
    expect(r).toEqual({ current: 2, target: 1 });
  });

  it("treats phase completion as binary", () => {
    expect(evaluateCriteria({ type: "phase", phase: "phase1_complete" }, stats())).toEqual({
      current: 0,
      target: 1,
    });
    expect(
      evaluateCriteria({ type: "phase", phase: "phase1_complete" }, stats({ phaseComplete: true })),
    ).toEqual({ current: 1, target: 1 });
  });

  it("counts applications by status", () => {
    const r = evaluateCriteria(
      { type: "application_status", status: "offer", target: 1 },
      stats({ applicationsByStatus: { offer: 1 } }),
    );
    expect(r.current).toBe(1);
  });

  it("returns zero progress for an unknown criterion rather than throwing", () => {
    // A typo in authored criteria should leave the achievement locked, not
    // break everyone's profile page.
    expect(evaluateCriteria({ type: "nonsense" } as never, stats())).toEqual({
      current: 0,
      target: 1,
    });
    expect(evaluateCriteria({} as never, stats())).toEqual({ current: 0, target: 1 });
  });

  it("never allows a zero target to divide by zero", () => {
    const r = evaluateAchievement(
      { slug: "x", criteria: { type: "count", event: "question_answered", target: 0 } },
      stats(),
    );
    expect(r.target).toBe(1);
    expect(Number.isFinite(r.ratio)).toBe(true);
  });
});

describe("evaluateAchievement", () => {
  it("unlocks at the threshold, not after it", () => {
    const criteria = { type: "count", event: "question_answered", target: 100 } as const;
    expect(
      evaluateAchievement({ slug: "a", criteria }, stats({ counts: { question_answered: 99 } }))
        .unlocked,
    ).toBe(false);
    expect(
      evaluateAchievement({ slug: "a", criteria }, stats({ counts: { question_answered: 100 } }))
        .unlocked,
    ).toBe(true);
  });

  it("caps the ratio at 1 when overshooting", () => {
    const r = evaluateAchievement(
      { slug: "a", criteria: { type: "count", event: "question_answered", target: 10 } },
      stats({ counts: { question_answered: 500 } }),
    );
    expect(r.ratio).toBe(1);
  });

  it("reports partial progress for the UI", () => {
    const r = evaluateAchievement(
      { slug: "a", criteria: { type: "count", event: "research_completed", target: 20 } },
      stats({ counts: { research_completed: 5 } }),
    );
    expect(r.ratio).toBeCloseTo(0.25, 5);
  });
});

describe("newlyUnlocked", () => {
  const progress = evaluateAll(
    [
      { slug: "first-commit", criteria: { type: "count", event: "coding_problem_solved", target: 1 } },
      { slug: "week-one", criteria: { type: "streak", target: 7 } },
      { slug: "architect", criteria: { type: "count", event: "system_design_completed", target: 10 } },
    ],
    stats({ counts: { coding_problem_solved: 3 }, longestStreak: 9 }),
  );

  it("returns only achievements that just crossed the line", () => {
    const fresh = newlyUnlocked(progress, new Set(["first-commit"]));
    expect(fresh.map((p) => p.slug)).toEqual(["week-one"]);
  });

  it("returns nothing when everything unlocked is already known", () => {
    expect(newlyUnlocked(progress, new Set(["first-commit", "week-one"]))).toEqual([]);
  });

  it("never returns a locked achievement", () => {
    expect(newlyUnlocked(progress, new Set()).some((p) => p.slug === "architect")).toBe(false);
  });
});
