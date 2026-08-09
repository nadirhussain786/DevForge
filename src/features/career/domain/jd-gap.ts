/**
 * Job Description Intelligence — docs/02-domain-engines.md §10
 *
 * The LLM's job is parsing prose into structured requirements. Everything
 * below — mapping to skills, classifying gaps, ranking prep — is deterministic,
 * so the same JD always produces the same plan.
 */

import { clamp, round } from "@/lib/utils";

export type GapClass = "strong" | "partial" | "gap" | "critical";
export type RequirementKind = "required" | "preferred";

export interface ParsedRequirement {
  rawLabel: string;
  kind: RequirementKind;
}

export interface SkillMatch {
  skillId: string;
  slug: string;
  name: string;
  mastery: number;
  confidence: number;
  targetMastery: number;
  isCritical: boolean;
}

export interface ClassifiedRequirement extends ParsedRequirement {
  skillId: string | null;
  skillName: string | null;
  mastery: number | null;
  gap: GapClass | null;
  /** Ranking weight for the prep plan. Higher means fix this sooner. */
  urgency: number;
}

export interface GapReport {
  requirements: ClassifiedRequirement[];
  counts: Record<GapClass, number>;
  /** Requirements we could not map — the curriculum growth signal (§35). */
  unmapped: string[];
  /** Rough 0–100 fit, honest about criticals. */
  matchScore: number;
  recommendedSkillIds: string[];
}

/** Normalise a label for alias lookup: lowercase, collapse punctuation. */
export function normalizeLabel(label: string): string {
  return label
    .toLowerCase()
    .replace(/[^a-z0-9+#.\s-]/g, " ")
    .replace(/\s+/g, " ")
    .trim();
}

/**
 * Map a requirement label to a skill via the curated alias table. Anything
 * unmatched is surfaced to admin rather than guessed at — a wrong mapping
 * silently corrupts someone's roadmap.
 */
export function mapToSkill(
  label: string,
  aliasIndex: ReadonlyMap<string, string>,
): string | null {
  return aliasIndex.get(normalizeLabel(label)) ?? null;
}

export function classifyGap(
  match: Pick<SkillMatch, "mastery" | "confidence" | "targetMastery">,
  kind: RequirementKind,
): GapClass {
  const { mastery, confidence, targetMastery } = match;

  if (mastery >= targetMastery && confidence >= 0.5) return "strong";
  if (mastery >= 0.6 * targetMastery) return "partial";
  if (mastery >= 0.25 * targetMastery) return "gap";
  // Only a *required* skill you're near-absent on is critical. The same
  // absence on a "nice to have" is a gap, not a blocker.
  return kind === "required" ? "critical" : "gap";
}

const GAP_URGENCY: Record<GapClass, number> = {
  critical: 1,
  gap: 0.6,
  partial: 0.3,
  strong: 0,
};

const GAP_SCORE: Record<GapClass, number> = {
  strong: 1,
  partial: 0.6,
  gap: 0.25,
  critical: 0,
};

export function buildGapReport(
  requirements: readonly ParsedRequirement[],
  aliasIndex: ReadonlyMap<string, string>,
  skillsById: ReadonlyMap<string, SkillMatch>,
): GapReport {
  const classified: ClassifiedRequirement[] = [];
  const unmapped: string[] = [];

  for (const req of requirements) {
    const skillId = mapToSkill(req.rawLabel, aliasIndex);
    const skill = skillId ? skillsById.get(skillId) : undefined;

    if (!skill) {
      unmapped.push(normalizeLabel(req.rawLabel));
      classified.push({
        ...req,
        skillId: null,
        skillName: null,
        mastery: null,
        gap: null,
        urgency: 0,
      });
      continue;
    }

    const gap = classifyGap(skill, req.kind);
    const kindWeight = req.kind === "required" ? 1 : 0.5;

    classified.push({
      ...req,
      skillId: skill.skillId,
      skillName: skill.name,
      mastery: round(skill.mastery, 2),
      gap,
      urgency: round(GAP_URGENCY[gap] * kindWeight * (skill.isCritical ? 1.25 : 1), 4),
    });
  }

  const counts: Record<GapClass, number> = { strong: 0, partial: 0, gap: 0, critical: 0 };
  for (const c of classified) if (c.gap) counts[c.gap]++;

  // Score only what we could map — an unmapped requirement is our blind spot,
  // not the user's failing, and shouldn't drag their fit score down.
  const scored = classified.filter((c) => c.gap !== null);
  const weightSum = scored.reduce((a, c) => a + (c.kind === "required" ? 1 : 0.5), 0);
  const scoreSum = scored.reduce(
    (a, c) => a + GAP_SCORE[c.gap!] * (c.kind === "required" ? 1 : 0.5),
    0,
  );

  const matchScore = weightSum > 0 ? round(clamp((100 * scoreSum) / weightSum, 0, 100), 1) : 0;

  const recommendedSkillIds = [...classified]
    .filter((c) => c.skillId && c.urgency > 0)
    .sort((a, b) => b.urgency - a.urgency || (a.skillName ?? "").localeCompare(b.skillName ?? ""))
    .map((c) => c.skillId!)
    .filter((id, i, arr) => arr.indexOf(id) === i);

  return { requirements: classified, counts, unmapped, matchScore, recommendedSkillIds };
}

/**
 * Market signal for the roadmap generator: skills appearing across the user's
 * target job descriptions get a priority boost, capped so one unusual posting
 * cannot hijack an entire roadmap.
 */
export function marketSignalFromJds(
  reports: readonly GapReport[],
  maxBoost = 1.5,
): Record<string, number> {
  if (reports.length === 0) return {};

  const mentions = new Map<string, number>();
  for (const report of reports) {
    const seen = new Set<string>();
    for (const req of report.requirements) {
      if (!req.skillId || seen.has(req.skillId)) continue;
      seen.add(req.skillId);
      mentions.set(req.skillId, (mentions.get(req.skillId) ?? 0) + 1);
    }
  }

  const signal: Record<string, number> = {};
  for (const [skillId, count] of mentions) {
    const frequency = count / reports.length;
    signal[skillId] = round(1 + (maxBoost - 1) * clamp(frequency, 0, 1), 4);
  }
  return signal;
}
