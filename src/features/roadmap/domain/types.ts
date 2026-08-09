/** Shared types for the roadmap and daily-plan engines. */

export const LOOP_STAGES = [
  "learn",
  "build",
  "explain",
  "test",
  "research",
  "apply",
  "interview",
  "review",
] as const;

export type LoopStage = (typeof LOOP_STAGES)[number];

export type RefType =
  | "topic"
  | "question"
  | "question_set"
  | "coding_problem"
  | "system_design_case"
  | "boss_battle"
  | "incident_scenario"
  | "project_milestone"
  | "research_task"
  | "weekly_mission";

export interface SkillNode {
  id: string;
  slug: string;
  name: string;
  domainSlug: string;
  difficulty: number;
  /** Skill ids this skill depends on. */
  prerequisites: readonly string[];
}

export interface TrackWeight {
  skillId: string;
  /** 0–1. Zero means "not part of this role" and is excluded outright. */
  weight: number;
  targetMastery: number;
  isCritical: boolean;
}

export interface ContentItem {
  id: string;
  skillId: string;
  refType: RefType;
  stage: LoopStage;
  minutes: number;
  difficulty: number;
  title: string;
}

/**
 * Why an item is in the plan — rendered verbatim in the UI (§21 explainability).
 *
 * `source` covers both levels of provenance:
 *   role_track / jd_gap / weakness  — why the *skill* entered the roadmap
 *   roadmap / revision              — why the *item* landed in today's plan
 */
export type ItemSource = "role_track" | "jd_gap" | "weakness" | "roadmap" | "revision";

export interface ItemReason {
  weight: number;
  gap: number;
  prereqsMet: boolean;
  source: ItemSource;
  priority: number;
}

export interface PlannedItem {
  skillId: string;
  stage: LoopStage;
  refType: RefType;
  refId: string;
  title: string;
  minutes: number;
  difficulty: number;
  sortOrder: number;
  reason: ItemReason;
}
