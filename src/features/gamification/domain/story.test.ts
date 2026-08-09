import { describe, expect, it } from "vitest";

import {
  breadthBeat,
  buildStory,
  decayBeat,
  fastestMover,
  openingBeat,
  recallBeat,
  streakBeat,
  trajectoryBeat,
  weaknessBeat,
  type StoryInput,
} from "./story";

const base: StoryInput = {
  daysActive: 30,
  currentStreak: 4,
  longestStreak: 9,
  missedThisWeek: 0,
  totalXp: 4200,
  xpThisWeek: 600,
  xpLastWeek: 550,
  momentum: 58,
  momentumLastWeek: 55,
  skills: [],
  readiness: 42,
  readinessBefore: 41,
  reviewsDue: 0,
  reviewsOverdue: 0,
  recallRate: 0.75,
  weaknessesOpen: 1,
  weaknessesResolvedThisWeek: 0,
  stagesUsedThisWeek: 3,
};

const on = (over: Partial<StoryInput>): StoryInput => ({ ...base, ...over });

// ── Opening ─────────────────────────────────────────────────────────────────

describe("openingBeat", () => {
  it("explains why the numbers are low on day one instead of hiding it", () => {
    const beat = openingBeat(on({ daysActive: 0 }));
    expect(beat.id).toBe("opening-day-one");
    expect(beat.detail).toMatch(/evidence/i);
  });

  it("names confidence shrinkage during the first week", () => {
    const beat = openingBeat(on({ daysActive: 3 }));
    expect(beat.text).toContain("Day 4");
    expect(beat.detail).toMatch(/confidence/i);
  });

  it("switches to a plain summary once established", () => {
    const beat = openingBeat(on({ daysActive: 21, totalXp: 9000 }));
    expect(beat.text).toBe("3 weeks in, 9,000 XP earned.");
  });

  it("does not pluralise a single week", () => {
    expect(openingBeat(on({ daysActive: 8 })).text).toContain("1 week in");
  });
});

// ── Honesty under bad news ──────────────────────────────────────────────────

describe("recallBeat", () => {
  it("warns on weak recall rather than finding a positive framing", () => {
    const beat = recallBeat(on({ recallRate: 0.4 }));
    expect(beat?.tone).toBe("warn");
    expect(beat?.text).toContain("40%");
  });

  it("outranks every other beat, because it is the load-bearing signal", () => {
    const beat = recallBeat(on({ recallRate: 0.4 }));
    const rival = weaknessBeat(on({ weaknessesOpen: 9 }));
    expect(beat!.priority).toBeGreaterThan(rival!.priority);
  });

  it("stays silent in the unremarkable middle", () => {
    expect(recallBeat(on({ recallRate: 0.72 }))).toBeNull();
  });

  it("says nothing at all when nothing was due", () => {
    expect(recallBeat(on({ recallRate: null }))).toBeNull();
  });
});

describe("decayBeat", () => {
  it("surfaces silent drift and frames it as staleness, not punishment", () => {
    const beat = decayBeat(
      on({ skills: [{ skillId: "s1", name: "Indexing", mastery: 30, masteryBefore: 44 }] }),
    );
    expect(beat?.text).toContain("Indexing");
    expect(beat?.detail).toMatch(/half-life/);
  });

  it("ignores movement small enough to be estimator noise", () => {
    expect(
      decayBeat(on({ skills: [{ skillId: "s1", name: "X", mastery: 40, masteryBefore: 42 }] })),
    ).toBeNull();
  });

  it("names the worst offender when several are slipping", () => {
    const beat = decayBeat(
      on({
        skills: [
          { skillId: "a", name: "Small", mastery: 30, masteryBefore: 36 },
          { skillId: "b", name: "Big", mastery: 20, masteryBefore: 45 },
        ],
      }),
    );
    expect(beat?.text).toContain("2 skills");
    expect(beat?.text).toContain("Big");
  });
});

// ── Good news, still earned ─────────────────────────────────────────────────

describe("fastestMover", () => {
  it("names the single biggest genuine gain", () => {
    const beat = fastestMover(
      on({
        skills: [
          { skillId: "a", name: "Caching", mastery: 20, masteryBefore: 12 },
          { skillId: "b", name: "Databases", mastery: 31, masteryBefore: 12 },
        ],
      }),
    );
    expect(beat?.text).toBe("Databases moved from 12 to 31.");
  });

  it("stays quiet when nothing moved meaningfully", () => {
    expect(
      fastestMover(on({ skills: [{ skillId: "a", name: "X", mastery: 14, masteryBefore: 12 }] })),
    ).toBeNull();
  });
});

describe("streakBeat", () => {
  it("celebrates only a genuine record", () => {
    expect(streakBeat(on({ currentStreak: 11, longestStreak: 11 }))?.tone).toBe("celebrate");
    expect(streakBeat(on({ currentStreak: 11, longestStreak: 20 }))?.tone).toBe("steady");
  });

  it("separates consistency from capability when a streak breaks", () => {
    const beat = streakBeat(on({ currentStreak: 0, longestStreak: 12 }));
    expect(beat?.tone).toBe("encourage");
    expect(beat?.detail).toMatch(/Nothing you've learned was lost/);
  });
});

describe("breadthBeat", () => {
  it("calls out a week spent entirely on the weakest evidence source", () => {
    const beat = breadthBeat(on({ stagesUsedThisWeek: 1, xpThisWeek: 300 }));
    expect(beat?.tone).toBe("nudge");
    expect(beat?.detail).toMatch(/weakest evidence/);
  });

  it("does not scold a learner who did nothing at all — there is no narrow week to name", () => {
    expect(breadthBeat(on({ stagesUsedThisWeek: 1, xpThisWeek: 0 }))).toBeNull();
  });

  it("holds off entirely in the first week, when one stage is normal", () => {
    expect(breadthBeat(on({ daysActive: 3, stagesUsedThisWeek: 1, xpThisWeek: 300 }))).toBeNull();
  });
});

describe("trajectoryBeat", () => {
  it("needs two weeks of history before claiming a trend", () => {
    expect(trajectoryBeat(on({ daysActive: 9, readiness: 50, readinessBefore: 40 }))).toBeNull();
  });

  it("leads with readiness, the number that actually matters externally", () => {
    const beat = trajectoryBeat(on({ readiness: 48, readinessBefore: 41 }));
    expect(beat?.id).toBe("trajectory-up");
    expect(beat?.text).toContain("48");
  });

  it("frames cooling momentum by how fast the window recovers", () => {
    const beat = trajectoryBeat(on({ momentum: 28, momentumLastWeek: 52 }));
    expect(beat?.detail).toMatch(/7-day window/);
  });

  it("does not divide by a zero baseline when claiming acceleration", () => {
    expect(trajectoryBeat(on({ xpThisWeek: 900, xpLastWeek: 0 }))?.id).not.toBe(
      "trajectory-accelerating",
    );
  });
});

describe("weaknessBeat", () => {
  it("agrees with itself on singular and plural", () => {
    expect(weaknessBeat(on({ weaknessesResolvedThisWeek: 1 }))?.text).toContain("1 open weakness ");
    expect(weaknessBeat(on({ weaknessesResolvedThisWeek: 3 }))?.text).toContain("3 open weaknesses");
  });
});

// ── Assembly ────────────────────────────────────────────────────────────────

describe("buildStory", () => {
  it("always opens with the framing beat, even when a warning outranks it", () => {
    const story = buildStory(on({ recallRate: 0.3, reviewsOverdue: 40 }));
    expect(story[0].id).toBe("opening-established");
    expect(story[1].id).toBe("recall-low");
  });

  it("never renders empty, so the page has no hole where progress should be", () => {
    // A genuinely fresh account: no streak, no history, nothing measured yet.
    const story = buildStory(
      on({
        daysActive: 0,
        currentStreak: 0,
        longestStreak: 0,
        totalXp: 0,
        xpThisWeek: 0,
        xpLastWeek: 0,
        recallRate: null,
        skills: [],
        weaknessesOpen: 0,
        stagesUsedThisWeek: 0,
      }),
    );
    expect(story).toHaveLength(1);
    expect(story[0].id).toBe("opening-day-one");
  });

  it("respects the limit and drops the lowest-priority beats first", () => {
    const story = buildStory(
      on({
        recallRate: 0.9,
        reviewsDue: 5,
        currentStreak: 6,
        stagesUsedThisWeek: 5,
        weaknessesResolvedThisWeek: 2,
        skills: [{ skillId: "a", name: "Databases", mastery: 40, masteryBefore: 20 }],
      }),
      3,
    );
    expect(story).toHaveLength(3);
    expect(story.map((b) => b.id)).not.toContain("review-current"); // priority 20, lowest
  });

  it("emits stable unique ids so the UI can key on them", () => {
    const story = buildStory(
      on({
        recallRate: 0.3,
        reviewsOverdue: 12,
        skills: [
          { skillId: "a", name: "Up", mastery: 40, masteryBefore: 20 },
          { skillId: "b", name: "Down", mastery: 10, masteryBefore: 30 },
        ],
      }),
      8,
    );
    expect(new Set(story.map((b) => b.id)).size).toBe(story.length);
  });
});
