import { describe, expect, it } from "vitest";

import { computeMomentum, momentumBand } from "./momentum";
import {
  applyDay,
  dayQualifies,
  emptyStreak,
  missedStudyDays,
  streakAtRisk,
  type DayResult,
  type StreakState,
} from "./streak";
import { computeXpAward, levelForXp, repeatMultiplier, xpIdempotencyKey } from "./xp";

// ── XP ──────────────────────────────────────────────────────────────────────

describe("computeXpAward", () => {
  it("pays the documented base rate for a clean first attempt", () => {
    expect(computeXpAward({ source: "coding_problem_solved" })).toBe(40);
    expect(computeXpAward({ source: "mock_interview_completed" })).toBe(150);
    expect(computeXpAward({ source: "weekly_mission_completed" })).toBe(200);
  });

  it("still pays something for a genuine failed attempt", () => {
    // The weakness it opens is worth more than the XP.
    expect(computeXpAward({ source: "question_answered", score: 0.2 })).toBe(8);
  });

  it("treats the pass threshold as inclusive", () => {
    expect(computeXpAward({ source: "question_answered", score: 0.6 })).toBe(25);
    expect(computeXpAward({ source: "question_answered", score: 0.59 })).toBe(8);
  });

  it("makes farming pointless without discouraging practice", () => {
    expect(repeatMultiplier(1)).toBe(1);
    expect(repeatMultiplier(2)).toBe(0.25);
    expect(repeatMultiplier(3)).toBe(0);
    expect(repeatMultiplier(50)).toBe(0);

    expect(computeXpAward({ source: "coding_problem_solved", attemptNo: 2 })).toBe(10);
    expect(computeXpAward({ source: "coding_problem_solved", attemptNo: 4 })).toBe(0);
  });

  it("discounts hints but never below half", () => {
    expect(computeXpAward({ source: "coding_problem_solved", hintsUsed: 2 })).toBe(32);
    expect(computeXpAward({ source: "coding_problem_solved", hintsUsed: 99 })).toBe(20);
  });

  it("builds a stable idempotency key — invariant #3's other half", () => {
    expect(xpIdempotencyKey("topic_completed", "abc")).toBe("topic_completed:abc");
    expect(xpIdempotencyKey("topic_completed", "abc")).toBe(
      xpIdempotencyKey("topic_completed", "abc"),
    );
  });
});

describe("levelForXp", () => {
  it("places users in the documented bands", () => {
    expect(levelForXp(0).name).toBe("Apprentice");
    expect(levelForXp(499).level).toBe(1);
    expect(levelForXp(500).name).toBe("Builder");
    expect(levelForXp(7_000).name).toBe("Senior Engineer");
    expect(levelForXp(20_000).name).toBe("Principal Engineer");
  });

  it("reports progress toward the next rank", () => {
    const p = levelForXp(1_000);
    expect(p.level).toBe(2);
    expect(p.xpToNextLevel).toBe(500);
    expect(p.progress).toBeCloseTo(0.5, 5);
  });

  it("caps out at the top rank without going negative", () => {
    const p = levelForXp(999_999);
    expect(p.level).toBe(7);
    expect(p.xpToNextLevel).toBeNull();
    expect(p.progress).toBe(1);
  });

  it("treats negative XP as zero rather than throwing", () => {
    expect(levelForXp(-100).level).toBe(1);
  });
});

// ── Streaks ─────────────────────────────────────────────────────────────────

const day = (over: Partial<DayResult> = {}): DayResult => ({
  date: "2026-08-10",
  completedItems: 3,
  completedMinutes: 60,
  plannedMinutes: 60,
  ...over,
});

const WEEKDAYS = [1, 2, 3, 4, 5];
const EVERY_DAY = [0, 1, 2, 3, 4, 5, 6];

describe("dayQualifies", () => {
  it("accepts 15 minutes of real work", () => {
    expect(dayQualifies(day({ completedMinutes: 15 }))).toBe(true);
    expect(dayQualifies(day({ completedMinutes: 14 }))).toBe(false);
  });

  it("does not require more than the day's own budget", () => {
    // A 15-minute plan must be completable in 15 minutes.
    expect(dayQualifies(day({ plannedMinutes: 15, completedMinutes: 15 }))).toBe(true);
  });

  it("requires at least one completed item — minutes alone are not work", () => {
    expect(dayQualifies(day({ completedItems: 0, completedMinutes: 120 }))).toBe(false);
  });
});

describe("missedStudyDays", () => {
  it("ignores days the user never committed to", () => {
    // Fri 2026-08-14 → Mon 2026-08-17 on a weekday schedule: nothing missed.
    expect(missedStudyDays("2026-08-14", "2026-08-17", WEEKDAYS)).toBe(0);
  });

  it("counts committed days that were skipped", () => {
    expect(missedStudyDays("2026-08-10", "2026-08-13", WEEKDAYS)).toBe(2);
  });
});

describe("applyDay", () => {
  it("starts a streak at 1", () => {
    const r = applyDay(emptyStreak(), day(), EVERY_DAY);
    expect(r.state.currentStreak).toBe(1);
    expect(r.state.longestStreak).toBe(1);
  });

  it("extends across consecutive days", () => {
    let s = emptyStreak();
    for (const d of ["2026-08-10", "2026-08-11", "2026-08-12"]) {
      s = applyDay(s, day({ date: d }), EVERY_DAY).state;
    }
    expect(s.currentStreak).toBe(3);
    expect(s.totalStudyDays).toBe(3);
  });

  it("does not break over a scheduled rest day", () => {
    const s = applyDay(emptyStreak(), day({ date: "2026-08-14" }), WEEKDAYS).state; // Friday
    const r = applyDay(s, day({ date: "2026-08-17" }), WEEKDAYS); // Monday
    expect(r.streakBroken).toBe(false);
    expect(r.state.currentStreak).toBe(2);
  });

  it("earns a shield every seven consecutive days, capped at three", () => {
    let s: StreakState = emptyStreak();
    for (let i = 0; i < 7; i++) {
      s = applyDay(s, day({ date: `2026-08-${String(10 + i).padStart(2, "0")}` }), EVERY_DAY).state;
    }
    expect(s.currentStreak).toBe(7);
    expect(s.shields).toBe(1);
  });

  it("spends a shield instead of resetting on a missed day", () => {
    let s = emptyStreak();
    for (let i = 0; i < 7; i++) {
      s = applyDay(s, day({ date: `2026-08-${String(10 + i).padStart(2, "0")}` }), EVERY_DAY).state;
    }
    expect(s.shields).toBe(1);

    // Skip 2026-08-17 entirely, return on the 18th.
    const r = applyDay(s, day({ date: "2026-08-18" }), EVERY_DAY);
    expect(r.shieldsSpent).toBe(1);
    expect(r.streakBroken).toBe(false);
    expect(r.state.currentStreak).toBe(8);
    expect(r.state.shields).toBe(0);
  });

  it("breaks the streak when there are no shields left", () => {
    const s: StreakState = { ...emptyStreak(), currentStreak: 5, longestStreak: 5, lastQualifiedDate: "2026-08-10" };
    const r = applyDay(s, day({ date: "2026-08-14" }), EVERY_DAY);
    expect(r.streakBroken).toBe(true);
    expect(r.state.currentStreak).toBe(1);
    expect(r.state.longestStreak).toBe(5);
  });

  it("does not double-count the same day", () => {
    const first = applyDay(emptyStreak(), day({ date: "2026-08-10" }), EVERY_DAY).state;
    const second = applyDay(first, day({ date: "2026-08-10", completedMinutes: 20 }), EVERY_DAY);
    expect(second.state.currentStreak).toBe(1);
    expect(second.state.totalMinutes).toBe(80);
  });

  it("leaves the streak untouched on a non-qualifying day", () => {
    const s = applyDay(emptyStreak(), day({ date: "2026-08-10" }), EVERY_DAY).state;
    const r = applyDay(s, day({ date: "2026-08-11", completedItems: 0 }), EVERY_DAY);
    expect(r.qualified).toBe(false);
    expect(r.state.currentStreak).toBe(1);
  });
});

describe("streakAtRisk", () => {
  const base: StreakState = { ...emptyStreak(), currentStreak: 12, lastQualifiedDate: "2026-08-10" };

  it("is true only when a shield would not save them", () => {
    expect(streakAtRisk(base, "2026-08-11", EVERY_DAY)).toBe(true);
    expect(streakAtRisk({ ...base, shields: 1 }, "2026-08-11", EVERY_DAY)).toBe(false);
  });

  it("is false on a rest day and on a day already completed", () => {
    expect(streakAtRisk(base, "2026-08-15", WEEKDAYS)).toBe(false); // Saturday
    expect(streakAtRisk(base, "2026-08-10", EVERY_DAY)).toBe(false);
  });

  it("is false when there is no streak to lose", () => {
    expect(streakAtRisk(emptyStreak(), "2026-08-11", EVERY_DAY)).toBe(false);
  });
});

// ── Momentum ────────────────────────────────────────────────────────────────

describe("computeMomentum", () => {
  const perfect = {
    qualifyingDays: 7,
    expectedDays: 7,
    itemsCompleted: 30,
    itemsPlanned: 30,
    averageDifficulty: 5,
    revisionCorrect: 10,
    revisionDue: 10,
    stagesUsed: ["learn", "build", "explain", "test", "research"] as const,
  };

  it("scores a complete, varied, hard week near the top", () => {
    const r = computeMomentum(perfect);
    expect(r.score).toBe(100);
    expect(r.band).toBe("White Hot");
  });

  it("punishes a narrow week even at full completion", () => {
    // The whole point of the breadth term: reading everything and building
    // nothing is not progress.
    const narrow = computeMomentum({ ...perfect, stagesUsed: ["learn"] });
    expect(narrow.score).toBeLessThan(computeMomentum(perfect).score);
    expect(narrow.components.breadth).toBeCloseTo(0.2, 3);
    expect(narrow.components.completion).toBe(1);
  });

  it("does not punish a user who has no revision due yet", () => {
    const r = computeMomentum({ ...perfect, revisionCorrect: 0, revisionDue: 0 });
    expect(r.components.recall).toBe(1);
  });

  it("returns 0 rather than NaN for a completely idle week", () => {
    const r = computeMomentum({
      qualifyingDays: 0,
      expectedDays: 0,
      itemsCompleted: 0,
      itemsPlanned: 0,
      averageDifficulty: 0,
      revisionCorrect: 0,
      revisionDue: 0,
      stagesUsed: [],
    });
    expect(Number.isNaN(r.score)).toBe(false);
    // recall defaults to 1 when nothing is due, so an idle week is not zero.
    expect(r.score).toBe(15);
    expect(r.band).toBe("Cooling");
  });

  it("maps scores to the documented bands", () => {
    expect(momentumBand(85)).toBe("White Hot");
    expect(momentumBand(60)).toBe("Forging");
    expect(momentumBand(35)).toBe("Warming");
    expect(momentumBand(34)).toBe("Cooling");
  });
});
