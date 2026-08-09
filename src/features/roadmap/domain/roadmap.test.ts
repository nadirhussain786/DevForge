import { describe, expect, it } from "vitest";

import { composeDailyPlan, missionTitle, stageShares, type DueRevision } from "./daily-plan";
import { generateRoadmap, skillPriority, type GeneratorInput } from "./generator";
import type { ContentItem, SkillNode, TrackWeight } from "./types";

// ── Fixtures ────────────────────────────────────────────────────────────────

const skill = (id: string, domainSlug: string, prerequisites: string[] = []): SkillNode => ({
  id,
  slug: id,
  name: id.replace(/-/g, " "),
  domainSlug,
  difficulty: 3,
  prerequisites,
});

const SKILLS: SkillNode[] = [
  skill("js-fundamentals", "frontend"),
  skill("react-rendering", "frontend", ["js-fundamentals"]),
  skill("http-caching", "backend"),
  skill("postgres-indexing", "databases"),
  skill("db-sharding", "databases", ["postgres-indexing"]),
];

const weight = (skillId: string, w: number, over: Partial<TrackWeight> = {}): TrackWeight => ({
  skillId,
  weight: w,
  targetMastery: 70,
  isCritical: false,
  ...over,
});

const content = (skillId: string, n = 4): ContentItem[] =>
  [
    { stage: "learn" as const, refType: "topic" as const, minutes: 15 },
    { stage: "build" as const, refType: "coding_problem" as const, minutes: 15 },
    { stage: "explain" as const, refType: "topic" as const, minutes: 7 },
    { stage: "test" as const, refType: "question_set" as const, minutes: 8 },
    { stage: "research" as const, refType: "research_task" as const, minutes: 6 },
  ]
    .slice(0, n)
    .map((c) => ({
      id: `${skillId}-${c.stage}`,
      skillId,
      refType: c.refType,
      stage: c.stage,
      minutes: c.minutes,
      difficulty: 3,
      title: `${skillId} ${c.stage}`,
    }));

const baseInput = (over: Partial<GeneratorInput> = {}): GeneratorInput => ({
  skills: SKILLS,
  trackWeights: [
    weight("js-fundamentals", 1),
    weight("react-rendering", 0.9),
    weight("http-caching", 0.7),
    weight("postgres-indexing", 0.8),
    weight("db-sharding", 0.2),
  ],
  masteryBySkill: {},
  contentBySkill: Object.fromEntries(SKILLS.map((s) => [s.id, content(s.id, 5)])),
  weeks: 8,
  dailyMinutes: 60,
  studyDays: [1, 2, 3, 4, 5],
  ...over,
});

// ── Priority ────────────────────────────────────────────────────────────────

describe("skillPriority", () => {
  it("drops to zero once the target mastery is reached", () => {
    const p = skillPriority(weight("http-caching", 1), SKILLS[2], { "http-caching": 80 }, new Set());
    expect(p.gap).toBe(0);
    expect(p.priority).toBe(0);
  });

  it("blocks a skill whose prerequisite is neither learned nor scheduled", () => {
    const p = skillPriority(weight("react-rendering", 1), SKILLS[1], {}, new Set());
    expect(p.prereqsMet).toBe(false);
    expect(p.priority).toBe(0);
  });

  it("unblocks once the prerequisite is scheduled earlier in the plan", () => {
    const p = skillPriority(
      weight("react-rendering", 1),
      SKILLS[1],
      {},
      new Set(["js-fundamentals"]),
    );
    expect(p.prereqsMet).toBe(true);
    expect(p.priority).toBeGreaterThan(0);
  });

  it("unblocks once the prerequisite is independently mastered", () => {
    const p = skillPriority(
      weight("react-rendering", 1),
      SKILLS[1],
      { "js-fundamentals": 55 },
      new Set(),
    );
    expect(p.prereqsMet).toBe(true);
  });

  it("boosts skills that target job descriptions ask for", () => {
    const plain = skillPriority(weight("http-caching", 0.5), SKILLS[2], {}, new Set(), 1);
    const hot = skillPriority(weight("http-caching", 0.5), SKILLS[2], {}, new Set(), 1.5);
    expect(hot.priority).toBeGreaterThan(plain.priority);
  });
});

// ── Generator ───────────────────────────────────────────────────────────────

describe("generateRoadmap", () => {
  it("is deterministic — same inputs, same plan", () => {
    const a = generateRoadmap(baseInput());
    const b = generateRoadmap(baseInput());
    expect(JSON.stringify(a)).toBe(JSON.stringify(b));
  });

  it("never schedules a week beyond its capacity", () => {
    const r = generateRoadmap(baseInput());
    for (const w of r.weeks) {
      expect(w.plannedMinutes).toBeLessThanOrEqual(r.weeklyCapacityMinutes);
    }
  });

  it("reserves part of each week for revision rather than filling it", () => {
    const r = generateRoadmap(baseInput());
    // 5 study days × 60 min = 300; minus the 15% revision reserve = 255.
    expect(r.weeklyCapacityMinutes).toBe(255);
  });

  it("never schedules a skill before its prerequisite", () => {
    const r = generateRoadmap(baseInput());
    const weekOf = new Map<string, number>();
    for (const w of r.weeks) for (const id of w.skillIds) weekOf.set(id, w.weekIndex);

    for (const s of SKILLS) {
      const own = weekOf.get(s.id);
      if (own === undefined) continue;
      for (const p of s.prerequisites) {
        const prereqWeek = weekOf.get(p);
        if (prereqWeek !== undefined) expect(prereqWeek).toBeLessThanOrEqual(own);
      }
    }
  });

  it("gives two role tracks genuinely different plans from the same library", () => {
    const frontend = generateRoadmap(
      baseInput({
        trackWeights: [
          weight("js-fundamentals", 1),
          weight("react-rendering", 1),
          weight("postgres-indexing", 0.1),
          weight("db-sharding", 0),
        ],
      }),
    );
    const backend = generateRoadmap(
      baseInput({
        trackWeights: [
          weight("js-fundamentals", 0.3),
          weight("react-rendering", 0.1),
          weight("postgres-indexing", 1),
          weight("db-sharding", 0.9),
        ],
      }),
    );

    expect(frontend.weeks[0].domainSlug).toBe("frontend");
    expect(backend.weeks[0].domainSlug).toBe("databases");
    // A zero-weight skill is excluded outright, not merely deprioritised.
    expect(frontend.weeks.flatMap((w) => w.skillIds)).not.toContain("db-sharding");
  });

  it("skips material the user has already mastered", () => {
    const r = generateRoadmap(
      baseInput({ masteryBySkill: { "js-fundamentals": 95, "react-rendering": 95 } }),
    );
    const scheduled = r.weeks.flatMap((w) => w.skillIds);
    expect(scheduled).not.toContain("js-fundamentals");
    expect(scheduled).not.toContain("react-rendering");
  });

  it("attaches a reason to every item so the UI can answer 'why is this here?'", () => {
    const r = generateRoadmap(baseInput());
    for (const w of r.weeks) {
      for (const item of w.items) {
        expect(item.reason.source).toBeDefined();
        expect(item.reason.priority).toBeGreaterThan(0);
        expect(typeof item.reason.gap).toBe("number");
      }
    }
  });

  it("reports skills it could not fit instead of dropping them silently", () => {
    const r = generateRoadmap(baseInput({ weeks: 1 }));
    expect(r.weeks).toHaveLength(1);
    expect(r.unscheduledSkillIds.length).toBeGreaterThan(0);
  });

  it("stops early rather than emitting empty filler weeks", () => {
    const r = generateRoadmap(baseInput({ weeks: 52 }));
    expect(r.weeks.length).toBeLessThan(52);
    expect(r.weeks.every((w) => w.items.length > 0)).toBe(true);
  });

  it("produces no weeks when the content library is empty", () => {
    const r = generateRoadmap(baseInput({ contentBySkill: {} }));
    expect(r.weeks).toHaveLength(0);
  });
});

// ── Daily plan ──────────────────────────────────────────────────────────────

const NOW = new Date("2026-08-17T08:00:00Z");

const revision = (id: string, minutes = 5, over: Partial<DueRevision> = {}): DueRevision => ({
  id,
  skillId: "postgres-indexing",
  refType: "question_set",
  refId: `ref-${id}`,
  title: `revise ${id}`,
  minutes,
  difficulty: 3,
  dueAt: new Date("2026-08-16T08:00:00Z"),
  ...over,
});

describe("stageShares", () => {
  it("shrinks the plan honestly on a short day instead of cramming", () => {
    const short = stageShares(15);
    expect(short.research).toBeUndefined();
    expect(short.build).toBeUndefined();
    expect(short.review).toBeGreaterThan(0);
    expect(short.test).toBeGreaterThan(0);
  });

  it("adds an apply block only when there is real time for it", () => {
    expect(stageShares(60).apply).toBeUndefined();
    expect(stageShares(120).apply).toBeGreaterThan(0);
  });
});

describe("composeDailyPlan", () => {
  const available = [...content("postgres-indexing", 5), ...content("http-caching", 5)];

  it("INVARIANT #1: never exceeds the daily budget", () => {
    for (const minutes of [15, 30, 45, 60, 90, 120]) {
      const plan = composeDailyPlan({
        date: "2026-08-17",
        dailyMinutes: minutes,
        dueRevision: [revision("r1"), revision("r2"), revision("r3")],
        availableItems: available,
        now: NOW,
      });
      expect(plan.plannedMinutes).toBeLessThanOrEqual(minutes);
      const summed = plan.items.reduce((a, i) => a + i.minutes, 0);
      expect(summed).toBe(plan.plannedMinutes);
    }
  });

  it("INVARIANT #2: schedules due revision before any new material", () => {
    const plan = composeDailyPlan({
      date: "2026-08-17",
      dailyMinutes: 60,
      dueRevision: [revision("r1"), revision("r2")],
      availableItems: available,
      now: NOW,
    });

    const firstNonReview = plan.items.findIndex((i) => i.stage !== "review");
    const lastReview = plan.items.map((i) => i.stage).lastIndexOf("review");
    expect(lastReview).toBeLessThan(firstNonReview);
    expect(plan.items[0].reason.source).toBe("revision");
  });

  it("caps revision at half the day and defers the rest rather than dropping it", () => {
    const heavy = Array.from({ length: 20 }, (_, i) => revision(`r${i}`, 6));
    const plan = composeDailyPlan({
      date: "2026-08-17",
      dailyMinutes: 60,
      dueRevision: heavy,
      availableItems: available,
      now: NOW,
    });

    const reviewMinutes = plan.items
      .filter((i) => i.stage === "review")
      .reduce((a, i) => a + i.minutes, 0);

    expect(reviewMinutes).toBeLessThanOrEqual(30);
    expect(plan.deferredRevisionIds.length).toBeGreaterThan(0);
    // Forward progress does not stop just because debt built up.
    expect(plan.items.some((i) => i.stage !== "review")).toBe(true);
  });

  it("ignores revision that is not due yet", () => {
    const plan = composeDailyPlan({
      date: "2026-08-17",
      dailyMinutes: 60,
      dueRevision: [revision("future", 5, { dueAt: new Date("2026-09-01T00:00:00Z") })],
      availableItems: available,
      now: NOW,
    });
    expect(plan.items.some((i) => i.stage === "review")).toBe(false);
    expect(plan.deferredRevisionIds).toHaveLength(0);
  });

  it("spans multiple loop stages on a normal day", () => {
    const plan = composeDailyPlan({
      date: "2026-08-17",
      dailyMinutes: 60,
      dueRevision: [],
      availableItems: available,
      now: NOW,
    });
    const stages = new Set(plan.items.map((i) => i.stage));
    expect(stages.size).toBeGreaterThanOrEqual(3);
  });

  it("uses most of the budget rather than leaving it idle", () => {
    const plan = composeDailyPlan({
      date: "2026-08-17",
      dailyMinutes: 60,
      dueRevision: [],
      availableItems: available,
      now: NOW,
    });
    expect(plan.plannedMinutes).toBeGreaterThanOrEqual(50);
  });

  it("never schedules the same content item twice", () => {
    const plan = composeDailyPlan({
      date: "2026-08-17",
      dailyMinutes: 120,
      dueRevision: [],
      availableItems: available,
      now: NOW,
    });
    const ids = plan.items.map((i) => i.refId);
    expect(new Set(ids).size).toBe(ids.length);
  });

  it("still produces a usable plan with no content available", () => {
    const plan = composeDailyPlan({
      date: "2026-08-17",
      dailyMinutes: 60,
      dueRevision: [revision("r1")],
      availableItems: [],
      now: NOW,
    });
    expect(plan.items).toHaveLength(1);
    expect(plan.plannedMinutes).toBe(5);
  });
});

describe("missionTitle", () => {
  it("names the skill the day actually spends the most time on", () => {
    const plan = composeDailyPlan({
      date: "2026-08-17",
      dailyMinutes: 60,
      dueRevision: [],
      availableItems: content("postgres-indexing", 5),
      now: NOW,
    });
    expect(missionTitle(plan, { "postgres-indexing": "PostgreSQL indexing" })).toBe(
      "Master PostgreSQL indexing",
    );
  });

  it("falls back sensibly on a pure revision day", () => {
    const plan = composeDailyPlan({
      date: "2026-08-17",
      dailyMinutes: 20,
      dueRevision: [revision("r1")],
      availableItems: [],
      now: NOW,
    });
    expect(missionTitle(plan, {})).toBe("Review and consolidate");
  });
});
