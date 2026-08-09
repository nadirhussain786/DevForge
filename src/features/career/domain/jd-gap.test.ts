import { describe, expect, it } from "vitest";

import {
  buildGapReport,
  classifyGap,
  mapToSkill,
  marketSignalFromJds,
  normalizeLabel,
  type ParsedRequirement,
  type SkillMatch,
} from "./jd-gap";

const ALIASES = new Map<string, string>([
  ["react", "react-rendering"],
  ["react.js", "react-rendering"],
  ["typescript", "typescript"],
  ["postgresql", "postgres-indexing"],
  ["postgres", "postgres-indexing"],
  ["system design", "system-design"],
  ["aws", "aws-fundamentals"],
]);

const match = (over: Partial<SkillMatch> & { skillId: string }): SkillMatch => ({
  slug: over.skillId,
  name: over.skillId,
  mastery: 50,
  confidence: 0.7,
  targetMastery: 70,
  isCritical: false,
  ...over,
});

const SKILLS = new Map<string, SkillMatch>([
  ["react-rendering", match({ skillId: "react-rendering", name: "React", mastery: 82 })],
  ["typescript", match({ skillId: "typescript", name: "TypeScript", mastery: 78 })],
  ["postgres-indexing", match({ skillId: "postgres-indexing", name: "PostgreSQL", mastery: 45 })],
  [
    "system-design",
    match({ skillId: "system-design", name: "System Design", mastery: 12, isCritical: true }),
  ],
  ["aws-fundamentals", match({ skillId: "aws-fundamentals", name: "AWS", mastery: 28 })],
]);

const req = (rawLabel: string, kind: ParsedRequirement["kind"] = "required"): ParsedRequirement => ({
  rawLabel,
  kind,
});

describe("normalizeLabel", () => {
  it("collapses punctuation and case so aliases match reliably", () => {
    expect(normalizeLabel("  React.JS  ")).toBe("react.js");
    expect(normalizeLabel("Node/Express")).toBe("node express");
    expect(normalizeLabel("C++")).toBe("c++");
  });
});

describe("mapToSkill", () => {
  it("maps known aliases", () => {
    expect(mapToSkill("React", ALIASES)).toBe("react-rendering");
    expect(mapToSkill("PostgreSQL", ALIASES)).toBe("postgres-indexing");
  });

  it("returns null rather than guessing", () => {
    // A wrong mapping silently corrupts a roadmap; admin reviews these instead.
    expect(mapToSkill("Kubernetes", ALIASES)).toBeNull();
  });
});

describe("classifyGap", () => {
  const target = { targetMastery: 70 };

  it("requires confidence as well as mastery for a strong match", () => {
    expect(classifyGap({ ...target, mastery: 80, confidence: 0.8 }, "required")).toBe("strong");
    // Same mastery, thin evidence — not yet a strong match.
    expect(classifyGap({ ...target, mastery: 80, confidence: 0.2 }, "required")).toBe("partial");
  });

  it("grades the middle bands by proportion of target", () => {
    expect(classifyGap({ ...target, mastery: 45, confidence: 0.7 }, "required")).toBe("partial");
    expect(classifyGap({ ...target, mastery: 20, confidence: 0.7 }, "required")).toBe("gap");
  });

  it("only calls it critical when the skill is actually required", () => {
    expect(classifyGap({ ...target, mastery: 3, confidence: 0.1 }, "required")).toBe("critical");
    expect(classifyGap({ ...target, mastery: 3, confidence: 0.1 }, "preferred")).toBe("gap");
  });
});

describe("buildGapReport", () => {
  const requirements = [
    req("React"),
    req("TypeScript"),
    req("PostgreSQL"),
    req("System Design"),
    req("AWS", "preferred"),
    req("Kubernetes"),
  ];

  const report = buildGapReport(requirements, ALIASES, SKILLS);

  it("classifies each mapped requirement", () => {
    const byName = Object.fromEntries(report.requirements.map((r) => [r.rawLabel, r.gap]));
    expect(byName.React).toBe("strong");
    expect(byName.TypeScript).toBe("strong");
    expect(byName.PostgreSQL).toBe("partial");
    expect(byName["System Design"]).toBe("critical");
  });

  it("surfaces unmapped requirements instead of silently ignoring them", () => {
    expect(report.unmapped).toContain("kubernetes");
    expect(report.requirements.find((r) => r.rawLabel === "Kubernetes")?.gap).toBeNull();
  });

  it("does not penalise the user for our own mapping blind spots", () => {
    const withUnknown = buildGapReport([...requirements, req("Terraform")], ALIASES, SKILLS);
    expect(withUnknown.matchScore).toBe(report.matchScore);
  });

  it("ranks preparation by urgency, criticals first", () => {
    expect(report.recommendedSkillIds[0]).toBe("system-design");
    expect(report.recommendedSkillIds).not.toContain("react-rendering");
  });

  it("counts each gap class", () => {
    expect(report.counts.strong).toBe(2);
    expect(report.counts.critical).toBe(1);
  });

  it("lets a weak skill hurt less when it is only preferred", () => {
    // Same two skills, same mastery — only the requirement kind differs.
    const weakIsRequired = buildGapReport([req("React"), req("AWS")], ALIASES, SKILLS);
    const weakIsPreferred = buildGapReport(
      [req("React"), req("AWS", "preferred")],
      ALIASES,
      SKILLS,
    );

    expect(weakIsRequired.matchScore).toBe(62.5);
    expect(weakIsPreferred.matchScore).toBe(75);
  });

  it("scores a lone requirement by its gap class alone, regardless of kind", () => {
    // With one requirement the kind weight appears in both numerator and
    // denominator and cancels — the fit is simply "how well do you match it".
    expect(buildGapReport([req("AWS")], ALIASES, SKILLS).matchScore).toBe(
      buildGapReport([req("AWS", "preferred")], ALIASES, SKILLS).matchScore,
    );
  });

  it("still ranks a required weakness above an identical preferred one", () => {
    const [required] = buildGapReport([req("AWS")], ALIASES, SKILLS).requirements;
    const [preferred] = buildGapReport([req("AWS", "preferred")], ALIASES, SKILLS).requirements;
    expect(required.urgency).toBeGreaterThan(preferred.urgency);
  });

  it("returns a zero score rather than NaN for an unmappable posting", () => {
    const r = buildGapReport([req("Kubernetes"), req("Terraform")], ALIASES, SKILLS);
    expect(r.matchScore).toBe(0);
    expect(r.unmapped).toHaveLength(2);
  });
});

describe("marketSignalFromJds", () => {
  it("boosts skills that appear across the user's target roles", () => {
    const a = buildGapReport([req("React"), req("System Design")], ALIASES, SKILLS);
    const b = buildGapReport([req("System Design")], ALIASES, SKILLS);
    const signal = marketSignalFromJds([a, b]);

    expect(signal["system-design"]).toBe(1.5); // in every posting
    expect(signal["react-rendering"]).toBe(1.25); // in half
  });

  it("caps the boost so one unusual posting cannot hijack a roadmap", () => {
    const reports = Array.from({ length: 20 }, () =>
      buildGapReport([req("System Design")], ALIASES, SKILLS),
    );
    expect(marketSignalFromJds(reports)["system-design"]).toBeLessThanOrEqual(1.5);
  });

  it("returns an empty signal when there are no job descriptions", () => {
    expect(marketSignalFromJds([])).toEqual({});
  });

  it("counts a skill once per posting even if mentioned repeatedly", () => {
    const dup = buildGapReport([req("React"), req("React.js")], ALIASES, SKILLS);
    expect(marketSignalFromJds([dup])["react-rendering"]).toBe(1.5);
  });
});
