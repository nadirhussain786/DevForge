import { describe, expect, it } from "vitest";

import {
  computeMastery,
  confidenceFor,
  decayFactor,
  difficultyMultiplier,
  explainMastery,
  masteryRank,
  MASTERY_HALF_LIFE_DAYS,
  type Evidence,
} from "./mastery";

const NOW = new Date("2026-08-09T12:00:00Z");
const daysAgo = (d: number) => new Date(NOW.getTime() - d * 86_400_000);

const ev = (over: Partial<Evidence> = {}): Evidence => ({
  source: "short_answer",
  difficulty: 3,
  correctness: 1,
  occurredAt: NOW,
  ...over,
});

describe("difficultyMultiplier", () => {
  it("spans 0.75 to 1.75 across the difficulty range", () => {
    expect(difficultyMultiplier(1)).toBe(0.75);
    expect(difficultyMultiplier(3)).toBe(1.25);
    expect(difficultyMultiplier(5)).toBe(1.75);
  });

  it("clamps out-of-range difficulty rather than extrapolating", () => {
    expect(difficultyMultiplier(0)).toBe(0.75);
    expect(difficultyMultiplier(99)).toBe(1.75);
  });
});

describe("decayFactor", () => {
  it("halves at exactly one half-life", () => {
    expect(decayFactor(MASTERY_HALF_LIFE_DAYS)).toBeCloseTo(0.5, 10);
    expect(decayFactor(2 * MASTERY_HALF_LIFE_DAYS)).toBeCloseTo(0.25, 10);
  });

  it("is 1 for fresh evidence and never exceeds it", () => {
    expect(decayFactor(0)).toBe(1);
    expect(decayFactor(-5)).toBe(1);
  });
});

describe("confidenceFor", () => {
  it("rises with evidence and stays short of certainty at realistic volumes", () => {
    expect(confidenceFor(0)).toBe(0);
    expect(confidenceFor(6)).toBeCloseTo(0.632, 3);
    expect(confidenceFor(18)).toBeCloseTo(0.95, 2);
    // Even a heavily practised skill leaves headroom, so mastery keeps some
    // shrinkage toward the prior. (It does saturate to exactly 1 in float
    // beyond ~750 weight units, which no real user reaches for one skill.)
    expect(confidenceFor(40)).toBeLessThan(1);
  });
});

describe("computeMastery", () => {
  it("returns zero for a user with no evidence and no prior", () => {
    const r = computeMastery([], { now: NOW });
    expect(r.mastery).toBe(0);
    expect(r.confidence).toBe(0);
    expect(r.rank).toBe("novice");
    expect(r.lastPracticedAt).toBeNull();
  });

  it("does not read one lucky MCQ as expertise", () => {
    // A single perfect easy MCQ: raw is 100, but confidence is ~0.06.
    const r = computeMastery([ev({ source: "mcq", difficulty: 1 })], { now: NOW });
    expect(r.rawMastery).toBe(100);
    expect(r.confidence).toBeLessThan(0.1);
    expect(r.mastery).toBeLessThan(10);
    expect(r.rank).toBe("novice");
  });

  it("converges toward raw mastery as evidence accumulates", () => {
    const many = Array.from({ length: 25 }, () =>
      ev({ source: "coding_attempt", difficulty: 4, correctness: 0.9 }),
    );
    const r = computeMastery(many, { now: NOW });

    expect(r.confidence).toBeGreaterThan(0.99);
    expect(r.rawMastery).toBe(90);
    expect(r.mastery).toBeCloseTo(90, 0);
    // With no prior, shrinkage is always toward 0, so mastery approaches raw
    // from below and never quite reaches it. 89.x ranks "strong", not "expert"
    // — reaching Expert requires being right about *harder* material.
    expect(r.mastery).toBeLessThan(r.rawMastery);
    expect(r.rank).toBe("strong");
  });

  it("shrinks toward the self-reported prior while confidence is low", () => {
    const withPrior = computeMastery([], { prior: 35, now: NOW });
    expect(withPrior.mastery).toBe(35);

    // A single failed answer with a prior should pull the score down, not sit at 35.
    const afterFailure = computeMastery([ev({ correctness: 0 })], { prior: 35, now: NOW });
    expect(afterFailure.mastery).toBeLessThan(35);
  });

  it("caps the prior at 35 — claiming a skill never grants more than 'familiar'", () => {
    const r = computeMastery([], { prior: 100, now: NOW });
    expect(r.mastery).toBe(35);
    expect(r.rank).toBe("familiar");
  });

  it("fades untouched skills — decay is what drives revision", () => {
    const evidence = Array.from({ length: 12 }, () =>
      ev({ source: "explanation", difficulty: 3, correctness: 1 }),
    );
    const fresh = computeMastery(evidence, { now: NOW });

    const stale = computeMastery(
      evidence.map((e) => ({ ...e, occurredAt: daysAgo(180) })),
      { now: NOW },
    );

    // Raw accuracy is identical — every answer was correct. Only confidence
    // decays, so the reported mastery drops.
    expect(stale.rawMastery).toBeCloseTo(fresh.rawMastery, 5);
    expect(stale.confidence).toBeLessThan(fresh.confidence);
    expect(stale.mastery).toBeLessThan(fresh.mastery);
  });

  it("weights a real interview answer far above an MCQ", () => {
    const mcq = computeMastery(
      [ev({ source: "mcq", difficulty: 3, correctness: 1 })],
      { now: NOW },
    );
    const real = computeMastery(
      [ev({ source: "real_interview_question", difficulty: 3, correctness: 1 })],
      { now: NOW },
    );
    expect(real.confidence).toBeGreaterThan(mcq.confidence * 4);
    expect(real.mastery).toBeGreaterThan(mcq.mastery);
  });

  it("tracks the most recent practice date", () => {
    const r = computeMastery(
      [ev({ occurredAt: daysAgo(10) }), ev({ occurredAt: daysAgo(2) }), ev({ occurredAt: daysAgo(40) })],
      { now: NOW },
    );
    expect(r.lastPracticedAt).toEqual(daysAgo(2));
  });

  it("clamps correctness into range instead of trusting callers", () => {
    const r = computeMastery([ev({ correctness: 5 })], { now: NOW });
    expect(r.rawMastery).toBe(100);
  });
});

describe("masteryRank", () => {
  it("maps band boundaries exactly as documented", () => {
    expect(masteryRank(0)).toBe("novice");
    expect(masteryRank(19.99)).toBe("novice");
    expect(masteryRank(20)).toBe("familiar");
    expect(masteryRank(40)).toBe("working");
    expect(masteryRank(60)).toBe("proficient");
    expect(masteryRank(75)).toBe("strong");
    expect(masteryRank(90)).toBe("expert");
    expect(masteryRank(100)).toBe("expert");
  });
});

describe("explainMastery", () => {
  it("accounts for the full score — shares sum to 1", () => {
    const evidence = [
      ev({ source: "mcq", difficulty: 1, occurredAt: daysAgo(30) }),
      ev({ source: "coding_attempt", difficulty: 5 }),
      ev({ source: "explanation", difficulty: 3, correctness: 0.5, occurredAt: daysAgo(10) }),
    ];
    const rows = explainMastery(evidence, NOW);

    expect(rows).toHaveLength(3);
    expect(rows.reduce((a, r) => a + r.share, 0)).toBeCloseTo(1, 3);
  });

  it("orders by influence so the UI leads with what mattered most", () => {
    const rows = explainMastery(
      [
        ev({ source: "mcq", difficulty: 1, occurredAt: daysAgo(90) }),
        ev({ source: "real_interview_question", difficulty: 5 }),
      ],
      NOW,
    );
    expect(rows[0].evidence.source).toBe("real_interview_question");
  });

  it("reconstructs raw mastery from the contributions it reports", () => {
    const evidence = [
      ev({ source: "coding_attempt", difficulty: 4, correctness: 1 }),
      ev({ source: "mcq", difficulty: 2, correctness: 0 }),
      ev({ source: "explanation", difficulty: 3, correctness: 0.75, occurredAt: daysAgo(20) }),
    ];
    const rows = explainMastery(evidence, NOW);
    const rebuilt = rows.reduce((a, r) => a + r.contribution, 0);

    expect(rebuilt).toBeCloseTo(computeMastery(evidence, { now: NOW }).rawMastery, 1);
  });
});
