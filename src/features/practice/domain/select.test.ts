import { describe, expect, it } from "vitest";

import {
  isEligible,
  orderForSession,
  selectQuestions,
  type Candidate,
  type Pool,
} from "./select";

const NOW = new Date("2026-08-20T09:00:00Z");
const daysAgo = (d: number) => new Date(NOW.getTime() - d * 86_400_000);

const cand = (id: string, over: Partial<Candidate> = {}): Candidate => ({
  questionId: id,
  skillId: `skill-${id}`,
  difficulty: 3,
  priority: 1,
  lastSeenAt: null,
  ...over,
});

const pool = (prefix: string, n: number, over: Partial<Candidate> = {}) =>
  Array.from({ length: n }, (_, i) => cand(`${prefix}${i}`, over));

describe("isEligible", () => {
  it("allows a question never seen", () => {
    expect(isEligible(cand("a"), NOW)).toBe(true);
  });

  it("blocks a question seen inside the cooldown", () => {
    expect(isEligible(cand("a", { lastSeenAt: daysAgo(5) }), NOW)).toBe(false);
    expect(isEligible(cand("a", { lastSeenAt: daysAgo(21) }), NOW)).toBe(true);
  });

  it("lets due revision bypass the cooldown — being re-asked is the point", () => {
    const justSeen = cand("a", { lastSeenAt: daysAgo(1), isDueRevision: true });
    expect(isEligible(justSeen, NOW)).toBe(true);
  });
});

describe("selectQuestions", () => {
  const fullPools: Partial<Record<Pool, Candidate[]>> = {
    weakness: pool("w", 10),
    lowConfidence: pool("l", 10),
    jd: pool("j", 10),
    breadth: pool("b", 10),
  };

  it("is deterministic", () => {
    const a = selectQuestions({ pools: fullPools, count: 10, now: NOW });
    const b = selectQuestions({ pools: fullPools, count: 10, now: NOW });
    expect(a.map((q) => q.questionId)).toEqual(b.map((q) => q.questionId));
  });

  it("does not depend on input array order", () => {
    const shuffled = {
      ...fullPools,
      weakness: [...fullPools.weakness!].reverse(),
    };
    const a = selectQuestions({ pools: fullPools, count: 10, now: NOW });
    const b = selectQuestions({ pools: shuffled, count: 10, now: NOW });
    expect(a.map((q) => q.questionId)).toEqual(b.map((q) => q.questionId));
  });

  it("weights weaknesses at half the session", () => {
    const picked = selectQuestions({ pools: fullPools, count: 10, now: NOW });
    expect(picked).toHaveLength(10);
    expect(picked.filter((q) => q.pool === "weakness")).toHaveLength(5);
    expect(picked.filter((q) => q.pool === "lowConfidence")).toHaveLength(3);
  });

  it("fills the session for a new user with no weaknesses or job descriptions", () => {
    // The case that would otherwise produce a 1-question drill.
    const picked = selectQuestions({
      pools: { breadth: pool("b", 20) },
      count: 10,
      now: NOW,
    });
    expect(picked).toHaveLength(10);
    expect(picked.every((q) => q.pool === "breadth")).toBe(true);
  });

  it("never exceeds the requested count", () => {
    const picked = selectQuestions({ pools: fullPools, count: 3, now: NOW });
    expect(picked).toHaveLength(3);
  });

  it("returns what it can when the library is thin", () => {
    const picked = selectQuestions({ pools: { weakness: pool("w", 2) }, count: 10, now: NOW });
    expect(picked).toHaveLength(2);
  });

  it("never repeats a question inside one session", () => {
    const shared = pool("s", 5);
    const picked = selectQuestions({
      pools: { weakness: shared, lowConfidence: shared, breadth: shared },
      count: 10,
      now: NOW,
    });
    expect(new Set(picked.map((q) => q.questionId)).size).toBe(picked.length);
  });

  it("excludes recently seen questions", () => {
    const picked = selectQuestions({
      pools: { breadth: pool("b", 10, { lastSeenAt: daysAgo(2) }) },
      count: 5,
      now: NOW,
    });
    expect(picked).toHaveLength(0);
  });

  it("prefers higher priority within a pool", () => {
    const picked = selectQuestions({
      pools: {
        weakness: [
          cand("low", { priority: 1 }),
          cand("high", { priority: 9 }),
          cand("mid", { priority: 5 }),
        ],
      },
      count: 2,
      now: NOW,
    });
    expect(picked.map((q) => q.questionId)).toEqual(["high", "mid"]);
  });

  it("attaches a reason to every question so the drill can explain itself", () => {
    const picked = selectQuestions({ pools: fullPools, count: 4, now: NOW });
    expect(picked.every((q) => q.reason.length > 0)).toBe(true);
  });

  it("returns nothing for a zero-length session", () => {
    expect(selectQuestions({ pools: fullPools, count: 0, now: NOW })).toEqual([]);
  });
});

describe("orderForSession", () => {
  it("leads with the easiest question rather than the hardest", () => {
    const picked = selectQuestions({
      pools: {
        weakness: [
          cand("hard", { difficulty: 5 }),
          cand("easy", { difficulty: 1 }),
          cand("mid", { difficulty: 3 }),
        ],
      },
      count: 3,
      now: NOW,
    });
    expect(orderForSession(picked).map((q) => q.questionId)).toEqual(["easy", "mid", "hard"]);
  });
});
