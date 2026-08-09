/**
 * Roadmap generator — docs/02-domain-engines.md §7
 *
 * Fully deterministic: the same inputs always produce the same plan. The LLM
 * writes framing prose around this; it never decides the syllabus. That is what
 * makes the roadmap explainable, reproducible, and free to compute.
 */

import { clamp, round } from "@/lib/utils";

import type {
  ContentItem,
  ItemReason,
  PlannedItem,
  SkillNode,
  TrackWeight,
} from "./types";

export const GENERATOR_VERSION = "1.0.0";

/** A skill is not schedulable until its prerequisites reach this mastery. */
export const PREREQ_MASTERY_FLOOR = 40;
/** Share of each week held back for due revision. */
export const REVISION_RESERVE = 0.15;
/** Stop packing a week once it is this full, so a long item can still land. */
export const WEEK_FILL_TARGET = 0.95;

export interface GeneratorInput {
  skills: readonly SkillNode[];
  trackWeights: readonly TrackWeight[];
  /** skillId → 0–100. Missing means zero. */
  masteryBySkill: Readonly<Record<string, number>>;
  /** skillId → available content, any order. */
  contentBySkill: Readonly<Record<string, readonly ContentItem[]>>;
  weeks: number;
  dailyMinutes: number;
  studyDays: readonly number[];
  /** skillId → multiplier, >1 when the skill is frequent in target job descriptions. */
  marketSignal?: Readonly<Record<string, number>>;
}

export interface SkillPriority {
  skillId: string;
  priority: number;
  weight: number;
  gap: number;
  prereqsMet: boolean;
  marketSignal: number;
}

export interface GeneratedWeek {
  weekIndex: number;
  theme: string;
  domainSlug: string;
  skillIds: string[];
  items: PlannedItem[];
  plannedMinutes: number;
}

export interface GeneratedRoadmap {
  generatorVersion: string;
  weeks: GeneratedWeek[];
  /** Skills the horizon could not accommodate — surfaced, never silently dropped. */
  unscheduledSkillIds: string[];
  weeklyCapacityMinutes: number;
}

/**
 * Priority for one skill.
 *
 *   p = weight · gap · prereqReady · marketSignal
 *
 * `gap` is what stops the plan re-teaching what the user already knows — the
 * fastest way to lose someone in week 1.
 */
export function skillPriority(
  tw: TrackWeight,
  skill: SkillNode | undefined,
  masteryBySkill: Readonly<Record<string, number>>,
  scheduledSkillIds: ReadonlySet<string>,
  marketSignal = 1,
): SkillPriority {
  const mastery = masteryBySkill[tw.skillId] ?? 0;
  const gap = clamp((tw.targetMastery - mastery) / 100, 0, 1);

  const prereqsMet =
    !skill ||
    skill.prerequisites.every(
      (p) => (masteryBySkill[p] ?? 0) >= PREREQ_MASTERY_FLOOR || scheduledSkillIds.has(p),
    );

  return {
    skillId: tw.skillId,
    priority: round(tw.weight * gap * (prereqsMet ? 1 : 0) * marketSignal, 6),
    weight: tw.weight,
    gap: round(gap, 4),
    prereqsMet,
    marketSignal,
  };
}

/** Deterministic ordering: priority desc, then slug, so ties never shuffle. */
function comparePriority(
  a: SkillPriority,
  b: SkillPriority,
  slugOf: (id: string) => string,
): number {
  if (b.priority !== a.priority) return b.priority - a.priority;
  return slugOf(a.skillId).localeCompare(slugOf(b.skillId));
}

/**
 * Order content within a skill so the Forge Loop is respected: understand it,
 * build with it, explain it, be tested on it, then go deeper.
 */
const STAGE_ORDER: Record<string, number> = {
  learn: 0,
  build: 1,
  explain: 2,
  test: 3,
  research: 4,
  apply: 5,
  interview: 6,
  review: 7,
};

export function generateRoadmap(input: GeneratorInput): GeneratedRoadmap {
  const {
    skills,
    trackWeights,
    masteryBySkill,
    contentBySkill,
    weeks,
    dailyMinutes,
    studyDays,
    marketSignal = {},
  } = input;

  const skillById = new Map(skills.map((s) => [s.id, s]));
  const slugOf = (id: string) => skillById.get(id)?.slug ?? id;

  const weeklyCapacityMinutes = Math.floor(
    studyDays.length * dailyMinutes * (1 - REVISION_RESERVE),
  );

  const candidates = trackWeights.filter((t) => t.weight > 0);
  const scheduled = new Set<string>();
  const generatedWeeks: GeneratedWeek[] = [];

  for (let weekIndex = 1; weekIndex <= weeks; weekIndex++) {
    const remaining = candidates.filter((t) => !scheduled.has(t.skillId));
    if (remaining.length === 0) break;

    const priorities = remaining
      .map((t) =>
        skillPriority(t, skillById.get(t.skillId), masteryBySkill, scheduled, marketSignal[t.skillId] ?? 1),
      )
      .filter((p) => p.priority > 0)
      .sort((a, b) => comparePriority(a, b, slugOf));

    // Everything left is either mastered or blocked behind an unscheduled
    // prerequisite. Stop rather than emitting filler weeks.
    if (priorities.length === 0) break;

    // The week's theme is the domain of the highest-priority schedulable skill;
    // the rest of the week is filled from that domain first so a week has a
    // coherent identity rather than being a grab bag.
    const lead = priorities[0];
    const domainSlug = skillById.get(lead.skillId)?.domainSlug ?? "general";

    const ordered = [
      ...priorities.filter((p) => skillById.get(p.skillId)?.domainSlug === domainSlug),
      ...priorities.filter((p) => skillById.get(p.skillId)?.domainSlug !== domainSlug),
    ];

    const items: PlannedItem[] = [];
    const weekSkillIds: string[] = [];
    let used = 0;
    let sortOrder = 0;

    for (const p of ordered) {
      if (used >= weeklyCapacityMinutes * WEEK_FILL_TARGET) break;

      const content = [...(contentBySkill[p.skillId] ?? [])].sort(
        (a, b) =>
          (STAGE_ORDER[a.stage] ?? 99) - (STAGE_ORDER[b.stage] ?? 99) ||
          a.difficulty - b.difficulty ||
          a.id.localeCompare(b.id),
      );
      if (content.length === 0) continue;

      const reason: ItemReason = {
        weight: p.weight,
        gap: p.gap,
        prereqsMet: p.prereqsMet,
        source: (marketSignal[p.skillId] ?? 1) > 1 ? "jd_gap" : "role_track",
        priority: p.priority,
      };

      let addedForSkill = 0;
      for (const c of content) {
        if (used + c.minutes > weeklyCapacityMinutes) continue;
        items.push({
          skillId: p.skillId,
          stage: c.stage,
          refType: c.refType,
          refId: c.id,
          title: c.title,
          minutes: c.minutes,
          difficulty: c.difficulty,
          sortOrder: sortOrder++,
          reason,
        });
        used += c.minutes;
        addedForSkill++;
      }

      if (addedForSkill > 0) {
        weekSkillIds.push(p.skillId);
        scheduled.add(p.skillId);
      }
    }

    // No content fit at all — the library is too thin to build another week.
    if (items.length === 0) break;

    generatedWeeks.push({
      weekIndex,
      theme: themeFor(domainSlug, weekSkillIds, skillById),
      domainSlug,
      skillIds: weekSkillIds,
      items,
      plannedMinutes: used,
    });
  }

  return {
    generatorVersion: GENERATOR_VERSION,
    weeks: generatedWeeks,
    unscheduledSkillIds: candidates
      .filter((t) => !scheduled.has(t.skillId))
      .map((t) => t.skillId),
    weeklyCapacityMinutes,
  };
}

function themeFor(
  domainSlug: string,
  skillIds: readonly string[],
  skillById: ReadonlyMap<string, SkillNode>,
): string {
  const names = skillIds.map((id) => skillById.get(id)?.name).filter(Boolean) as string[];
  if (names.length === 0) return domainSlug;
  if (names.length <= 2) return names.join(" & ");
  return `${names[0]}, ${names[1]} +${names.length - 2} more`;
}
