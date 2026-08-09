/**
 * Daily plan composer — docs/02-domain-engines.md §7
 *
 * Two invariants this file exists to guarantee:
 *   #1  the plan never exceeds the user's daily_minutes
 *   #2  due revision is scheduled before any new material
 *
 * Both are unit-tested. The database enforces #1 again in a trigger, because a
 * bug that silently overloads someone is the fastest way to lose them.
 */

import { clamp } from "@/lib/utils";

import type { ContentItem, ItemReason, LoopStage, PlannedItem, RefType } from "./types";

/**
 * Revision can expand past its slot when debt builds up, but never past half
 * the day — otherwise a bad week turns into weeks of nothing but review, and
 * forward progress stops entirely.
 */
export const MAX_REVISION_SHARE = 0.5;

export interface DueRevision {
  id: string;
  skillId: string;
  refType: RefType;
  refId: string;
  title: string;
  minutes: number;
  difficulty: number;
  dueAt: Date;
}

export interface DailyPlanInput {
  date: string;
  dailyMinutes: number;
  dueRevision: readonly DueRevision[];
  /** Remaining, uncompleted items for the current roadmap week. */
  availableItems: readonly ContentItem[];
  now: Date;
}

export interface DailyPlan {
  date: string;
  budgetMinutes: number;
  plannedMinutes: number;
  items: PlannedItem[];
  /** Revision that was due but did not fit — carried to tomorrow, not dropped. */
  deferredRevisionIds: string[];
}

type StageShare = Partial<Record<LoopStage, number>>;

/**
 * Composition scales with available time rather than cramming. Below 30
 * minutes the plan deliberately shrinks to review plus recall: the streak
 * stays alive and the plan stays honest.
 */
export function stageShares(dailyMinutes: number): StageShare {
  if (dailyMinutes < 30) {
    return { review: 0.3, test: 0.4, learn: 0.3 };
  }
  if (dailyMinutes < 46) {
    return { review: 0.15, learn: 0.3, build: 0.25, explain: 0.15, test: 0.15 };
  }
  if (dailyMinutes < 90) {
    return { review: 0.15, learn: 0.25, build: 0.25, explain: 0.12, test: 0.13, research: 0.1 };
  }
  return { review: 0.15, learn: 0.22, build: 0.28, explain: 0.1, test: 0.12, research: 0.08, apply: 0.05 };
}

const FILL_ORDER: LoopStage[] = ["learn", "build", "explain", "test", "research", "apply", "interview"];

export function composeDailyPlan(input: DailyPlanInput): DailyPlan {
  const budget = Math.max(0, Math.floor(input.dailyMinutes));
  const shares = stageShares(budget);
  const items: PlannedItem[] = [];

  let used = 0;
  let sortOrder = 0;

  // ── 1. Revision first. Always. ──────────────────────────────────────────
  const revisionCap = Math.floor(budget * MAX_REVISION_SHARE);
  const revisionSlot = Math.max(
    Math.floor(budget * (shares.review ?? 0)),
    0,
  );

  const due = [...input.dueRevision]
    .filter((r) => r.dueAt <= input.now)
    .sort((a, b) => a.dueAt.getTime() - b.dueAt.getTime() || a.id.localeCompare(b.id));

  const deferredRevisionIds: string[] = [];
  let revisionUsed = 0;

  for (const r of due) {
    // Expand past the nominal slot up to the hard cap when debt has built up.
    const ceiling = revisionUsed < revisionSlot ? revisionSlot : revisionCap;
    if (revisionUsed + r.minutes > ceiling || used + r.minutes > budget) {
      deferredRevisionIds.push(r.id);
      continue;
    }

    items.push({
      skillId: r.skillId,
      stage: "review",
      refType: r.refType,
      refId: r.refId,
      title: r.title,
      minutes: r.minutes,
      difficulty: r.difficulty,
      sortOrder: sortOrder++,
      reason: {
        weight: 1,
        gap: 0,
        prereqsMet: true,
        source: "revision",
        priority: 1,
      },
    });
    revisionUsed += r.minutes;
    used += r.minutes;
  }

  // ── 2. New material fills what remains, stage by stage. ─────────────────
  const remainingBudget = budget - used;
  const byStage = new Map<LoopStage, ContentItem[]>();
  for (const item of input.availableItems) {
    const list = byStage.get(item.stage) ?? [];
    list.push(item);
    byStage.set(item.stage, list);
  }
  for (const list of byStage.values()) {
    list.sort((a, b) => a.difficulty - b.difficulty || a.id.localeCompare(b.id));
  }

  const stageBudget = new Map<LoopStage, number>();
  for (const stage of FILL_ORDER) {
    const share = shares[stage] ?? 0;
    stageBudget.set(stage, Math.floor(remainingBudget * share));
  }

  const taken = new Set<string>();

  const tryTake = (stage: LoopStage, ceiling: number) => {
    const list = byStage.get(stage);
    if (!list) return 0;
    let spent = 0;
    for (const c of list) {
      if (taken.has(c.id)) continue;
      if (spent + c.minutes > ceiling) continue;
      if (used + c.minutes > budget) break;

      items.push({
        skillId: c.skillId,
        stage: c.stage,
        refType: c.refType,
        refId: c.id,
        title: c.title,
        minutes: c.minutes,
        difficulty: c.difficulty,
        sortOrder: sortOrder++,
        reason: {
          weight: 1,
          gap: 0,
          prereqsMet: true,
          source: "roadmap",
          priority: 1,
        } satisfies ItemReason,
      });
      taken.add(c.id);
      spent += c.minutes;
      used += c.minutes;
    }
    return spent;
  };

  for (const stage of FILL_ORDER) {
    tryTake(stage, stageBudget.get(stage) ?? 0);
  }

  // ── 3. Second pass: spend leftover minutes rather than waste them. ───────
  // Rounding down every stage budget can leave a usable gap; a user who
  // budgeted 60 minutes should not be handed a 44-minute day.
  let leftover = budget - used;
  if (leftover > 0) {
    for (const stage of FILL_ORDER) {
      if (leftover <= 0) break;
      const spent = tryTake(stage, leftover);
      leftover -= spent;
    }
  }

  return {
    date: input.date,
    budgetMinutes: budget,
    plannedMinutes: used,
    items,
    deferredRevisionIds,
  };
}

/**
 * "Master PostgreSQL indexing" — the one-line objective at the top of the
 * Command Center. Derived from the day's dominant skill, not a stored string.
 */
export function missionTitle(
  plan: DailyPlan,
  skillNames: Readonly<Record<string, string>>,
): string {
  const minutesBySkill = new Map<string, number>();
  for (const item of plan.items) {
    if (item.stage === "review") continue;
    minutesBySkill.set(item.skillId, (minutesBySkill.get(item.skillId) ?? 0) + item.minutes);
  }

  let bestSkill: string | null = null;
  let bestMinutes = -1;
  for (const [skillId, minutes] of minutesBySkill) {
    if (minutes > bestMinutes || (minutes === bestMinutes && bestSkill && skillId < bestSkill)) {
      bestMinutes = minutes;
      bestSkill = skillId;
    }
  }

  if (!bestSkill) return "Review and consolidate";
  return `Master ${skillNames[bestSkill] ?? bestSkill}`;
}

export function planCompletion(
  plan: DailyPlan,
  completedRefIds: ReadonlySet<string>,
): { completedItems: number; completedMinutes: number; ratio: number } {
  let completedItems = 0;
  let completedMinutes = 0;
  for (const item of plan.items) {
    if (completedRefIds.has(item.refId)) {
      completedItems++;
      completedMinutes += item.minutes;
    }
  }
  return {
    completedItems,
    completedMinutes,
    ratio: plan.plannedMinutes === 0 ? 0 : clamp(completedMinutes / plan.plannedMinutes, 0, 1),
  };
}
