import { describe, expect, it } from "vitest";

import {
  computeReadiness,
  domainReadiness,
  readinessDelta,
  type SkillReadinessInput,
} from "./readiness";

const skill = (over: Partial<SkillReadinessInput> = {}): SkillReadinessInput => ({
  skillId: "s1",
  domainSlug: "frontend",
  mastery: 70,
  weight: 1,
  isCritical: false,
  ...over,
});

describe("domainReadiness", () => {
  it("weights skills by their role-track importance", () => {
    const score = domainReadiness([
      skill({ mastery: 100, weight: 1 }),
      skill({ mastery: 0, weight: 0.25 }),
    ]);
    expect(score).toBe(80);
  });

  it("excludes zero-weight skills entirely", () => {
    // A frontend engineer is not marked down for not knowing sharding.
    const withIrrelevant = domainReadiness([
      skill({ mastery: 80, weight: 1 }),
      skill({ mastery: 0, weight: 0, skillId: "db-sharding" }),
    ]);
    expect(withIrrelevant).toBe(80);
  });

  it("returns 0 rather than NaN when nothing is relevant", () => {
    expect(domainReadiness([])).toBe(0);
    expect(domainReadiness([skill({ weight: 0 })])).toBe(0);
  });
});

describe("computeReadiness", () => {
  const strongEverywhere = [
    skill({ domainSlug: "frontend", mastery: 85, isCritical: true }),
    skill({ domainSlug: "backend", mastery: 80, isCritical: true }),
    skill({ domainSlug: "system-design", mastery: 78, isCritical: true }),
  ];

  it("produces a domain breakdown alongside the overall", () => {
    const r = computeReadiness({
      skills: strongEverywhere,
      dimensions: { knowledge: 80, coding: 75 },
      consistency: 80,
    });

    expect(r.byDomain).toEqual({ frontend: 85, backend: 80, "system-design": 78 });
    expect(r.overall).toBeGreaterThan(70);
    expect(r.penaltyExplanation).toBeNull();
  });

  it("penalises a weak critical domain instead of averaging it away", () => {
    // The scenario the penalty exists for: excellent frontend, absent system
    // design. This must NOT read as "60% ready".
    const lopsided = computeReadiness({
      skills: [
        skill({ domainSlug: "frontend", mastery: 85, isCritical: true }),
        skill({ domainSlug: "system-design", mastery: 15, isCritical: true }),
      ],
      dimensions: { knowledge: 70, coding: 70 },
      consistency: 70,
    });

    expect(lopsided.components.weakestCriticalDomain).toBe("system-design");
    expect(lopsided.components.penalty).toBeGreaterThan(0.2);
    expect(lopsided.overall).toBeLessThan(lopsided.components.blend);
    expect(lopsided.penaltyExplanation).toContain("system-design");
  });

  it("applies no penalty once every critical domain clears the floor", () => {
    const r = computeReadiness({
      skills: strongEverywhere,
      dimensions: { knowledge: 70 },
      consistency: 70,
    });
    expect(r.components.penalty).toBe(0);
    expect(r.overall).toBe(r.components.blend);
  });

  it("ignores non-critical domains when computing the penalty", () => {
    const r = computeReadiness({
      skills: [
        skill({ domainSlug: "backend", mastery: 80, isCritical: true }),
        skill({ domainSlug: "devops", mastery: 5, isCritical: false }),
      ],
      dimensions: { knowledge: 70 },
      consistency: 70,
    });
    expect(r.components.weakestCriticalDomain).toBe("backend");
    expect(r.components.penalty).toBe(0);
  });

  it("scales the penalty with how far below the floor the weakest domain sits", () => {
    const at30 = computeReadiness({
      skills: [skill({ domainSlug: "system-design", mastery: 30, isCritical: true })],
      dimensions: { knowledge: 60 },
      consistency: 60,
    });
    const at10 = computeReadiness({
      skills: [skill({ domainSlug: "system-design", mastery: 10, isCritical: true })],
      dimensions: { knowledge: 60 },
      consistency: 60,
    });
    expect(at10.components.penalty).toBeGreaterThan(at30.components.penalty);
    expect(at10.components.penalty).toBeLessThanOrEqual(0.3);
  });

  it("never lets readiness be driven by XP — only mastery, modality, consistency", () => {
    const r = computeReadiness({
      skills: [skill({ mastery: 0, isCritical: false })],
      dimensions: {},
      consistency: 0,
    });
    expect(r.overall).toBe(0);
  });

  it("averages only the dimensions that have data", () => {
    // A user who has never done a system design shouldn't be scored 0 on it
    // and dragged down; the dimension is simply absent from the rollup.
    const partial = computeReadiness({
      skills: [skill({ mastery: 60 })],
      dimensions: { knowledge: 80 },
      consistency: 50,
    });
    expect(partial.components.modalityRollup).toBe(80);
  });

  it("reports every dimension in the breakdown even when unmeasured", () => {
    const r = computeReadiness({
      skills: [skill()],
      dimensions: { coding: 55 },
      consistency: 50,
    });
    expect(r.byDimension.coding).toBe(55);
    expect(r.byDimension.systemDesign).toBe(0);
  });

  it("keeps overall inside 0–100 under extreme inputs", () => {
    const r = computeReadiness({
      skills: [skill({ mastery: 1000, weight: 1, isCritical: true })],
      dimensions: { knowledge: 1000 },
      consistency: 1000,
    });
    expect(r.overall).toBeLessThanOrEqual(100);
    expect(r.overall).toBeGreaterThanOrEqual(0);
  });
});

describe("readinessDelta", () => {
  const current = computeReadiness({
    skills: [skill({ domainSlug: "system-design", mastery: 62, isCritical: true })],
    dimensions: { knowledge: 70 },
    consistency: 70,
  });

  it("reports zero movement when there is no prior snapshot", () => {
    expect(readinessDelta(current, null)).toEqual({ overall: 0, byDomain: {} });
  });

  it("reports per-domain improvement against the previous snapshot", () => {
    const delta = readinessDelta(current, {
      overall: current.overall - 5,
      byDomain: { "system-design": 50 },
    });
    expect(delta.overall).toBe(5);
    expect(delta.byDomain["system-design"]).toBe(12);
  });
});
