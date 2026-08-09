import "server-only";

import { generateRoadmap } from "@/features/roadmap/domain/generator";
import { composeDailyPlan, missionTitle } from "@/features/roadmap/domain/daily-plan";
import type { ContentItem, SkillNode, TrackWeight } from "@/features/roadmap/domain/types";
import { createClient } from "@/lib/supabase/server";

/**
 * Bridges the pure roadmap engine to the database: load inputs, run the
 * deterministic generator, persist the result. All the decision-making lives in
 * `domain/`, so this file has no scoring logic to get wrong.
 */

export interface GenerateRoadmapParams {
  userId: string;
  roleTrackId: string;
  startDate: string;
  weeks: number;
  dailyMinutes: number;
  studyDays: number[];
}

export async function generateAndPersistRoadmap(params: GenerateRoadmapParams) {
  const supabase = await createClient();

  const [{ data: trackSkills }, { data: skills }, { data: prereqs }, { data: userSkills }] =
    await Promise.all([
      supabase
        .from("role_track_skills")
        .select("skill_id, weight, target_mastery, is_critical")
        .eq("role_track_id", params.roleTrackId),
      supabase.from("skills").select("id, slug, name, domain_id, difficulty").eq("status", "published"),
      supabase.from("skill_prerequisites").select("skill_id, prereq_skill_id"),
      supabase.from("user_skills").select("skill_id, mastery").eq("user_id", params.userId),
    ]);

  if (!trackSkills?.length || !skills?.length) {
    throw new Error("Cannot generate a roadmap: the skill library is empty. Seed it first.");
  }

  const { data: domains } = await supabase.from("domains").select("id, slug");
  const domainSlugById = new Map((domains ?? []).map((d) => [d.id, d.slug]));

  const prereqBySkill = new Map<string, string[]>();
  for (const p of prereqs ?? []) {
    prereqBySkill.set(p.skill_id, [...(prereqBySkill.get(p.skill_id) ?? []), p.prereq_skill_id]);
  }

  const skillNodes: SkillNode[] = skills.map((s) => ({
    id: s.id,
    slug: s.slug,
    name: s.name,
    domainSlug: domainSlugById.get(s.domain_id) ?? "general",
    difficulty: s.difficulty,
    prerequisites: prereqBySkill.get(s.id) ?? [],
  }));

  const trackWeights: TrackWeight[] = trackSkills.map((t) => ({
    skillId: t.skill_id,
    weight: Number(t.weight),
    targetMastery: t.target_mastery,
    isCritical: t.is_critical,
  }));

  const masteryBySkill = Object.fromEntries(
    (userSkills ?? []).map((u) => [u.skill_id, Number(u.mastery)]),
  );

  const contentBySkill = await loadContentBySkill(
    trackWeights.map((t) => t.skillId),
  );

  const generated = generateRoadmap({
    skills: skillNodes,
    trackWeights,
    masteryBySkill,
    contentBySkill,
    weeks: params.weeks,
    dailyMinutes: params.dailyMinutes,
    studyDays: params.studyDays,
  });

  // Supersede any previous roadmap first — the partial unique index allows only
  // one active roadmap per user, and history is never rewritten.
  await supabase
    .from("roadmaps")
    .update({ status: "superseded" })
    .eq("user_id", params.userId)
    .eq("status", "active");

  const { data: roadmap, error } = await supabase
    .from("roadmaps")
    .insert({
      user_id: params.userId,
      role_track_id: params.roleTrackId,
      status: "active",
      start_date: params.startDate,
      weeks: params.weeks,
      daily_minutes: params.dailyMinutes,
      study_days: params.studyDays,
      generator_version: generated.generatorVersion,
      params: {
        weeklyCapacityMinutes: generated.weeklyCapacityMinutes,
        unscheduledSkillIds: generated.unscheduledSkillIds,
      },
    })
    .select("id")
    .single();

  if (error || !roadmap) throw new Error(`Failed to create roadmap: ${error?.message}`);

  const domainIdBySlug = new Map((domains ?? []).map((d) => [d.slug, d.id]));

  if (generated.weeks.length > 0) {
    await supabase.from("roadmap_weeks").insert(
      generated.weeks.map((w) => ({
        roadmap_id: roadmap.id,
        week_index: w.weekIndex,
        theme: w.theme,
        domain_id: domainIdBySlug.get(w.domainSlug) ?? null,
      })),
    );

    await supabase.from("roadmap_items").insert(
      generated.weeks.flatMap((w) =>
        w.items.map((item) => ({
          roadmap_id: roadmap.id,
          week_index: w.weekIndex,
          skill_id: item.skillId,
          stage: item.stage,
          item_ref_type: item.refType,
          item_ref_id: item.refId,
          planned_minutes: item.minutes,
          sort_order: item.sortOrder,
          reason: item.reason as never,
        })),
      ),
    );
  }

  return { roadmapId: roadmap.id, generated };
}

async function loadContentBySkill(
  skillIds: readonly string[],
): Promise<Record<string, ContentItem[]>> {
  const supabase = await createClient();
  if (skillIds.length === 0) return {};

  const [{ data: topics }, { data: problemLinks }, { data: questions }] = await Promise.all([
    supabase
      .from("topics")
      .select("id, skill_id, title, estimated_minutes, difficulty")
      .in("skill_id", skillIds)
      .eq("status", "published"),
    supabase.from("coding_problem_skills").select("problem_id, skill_id").in("skill_id", skillIds),
    supabase
      .from("questions")
      .select("id, skill_id, difficulty, estimated_seconds")
      .in("skill_id", skillIds)
      .eq("status", "published"),
  ]);

  const problemIds = (problemLinks ?? []).map((p) => p.problem_id);
  const { data: problems } = problemIds.length
    ? await supabase
        .from("coding_problems")
        .select("id, title, difficulty, estimated_minutes")
        .in("id", problemIds)
        .eq("status", "published")
    : { data: [] as Array<{ id: string; title: string; difficulty: number; estimated_minutes: number }> };

  const problemById = new Map((problems ?? []).map((p) => [p.id, p]));
  const out: Record<string, ContentItem[]> = {};
  const push = (skillId: string, item: ContentItem) => {
    (out[skillId] ??= []).push(item);
  };

  for (const t of topics ?? []) {
    push(t.skill_id, {
      id: t.id,
      skillId: t.skill_id,
      refType: "topic",
      stage: "learn",
      minutes: t.estimated_minutes,
      difficulty: t.difficulty,
      title: t.title,
    });
    // Reading alone cannot close a topic — the Explain block is what produces
    // real evidence, so it is scheduled alongside every topic.
    push(t.skill_id, {
      id: `${t.id}:explain`,
      skillId: t.skill_id,
      refType: "topic",
      stage: "explain",
      minutes: 7,
      difficulty: t.difficulty,
      title: `Explain: ${t.title}`,
    });
  }

  for (const link of problemLinks ?? []) {
    const p = problemById.get(link.problem_id);
    if (!p) continue;
    push(link.skill_id, {
      id: p.id,
      skillId: link.skill_id,
      refType: "coding_problem",
      stage: "build",
      minutes: p.estimated_minutes,
      difficulty: p.difficulty,
      title: p.title,
    });
  }

  // Questions are batched into one Test block per skill rather than scheduled
  // individually — three 2-minute items would fragment the day.
  const questionsBySkill = new Map<string, typeof questions>();
  for (const q of questions ?? []) {
    questionsBySkill.set(q.skill_id, [...(questionsBySkill.get(q.skill_id) ?? []), q] as never);
  }
  for (const [skillId, qs] of questionsBySkill) {
    if (!qs?.length) continue;
    const batch = qs.slice(0, 3);
    push(skillId, {
      id: `${skillId}:questions`,
      skillId,
      refType: "question_set",
      stage: "test",
      minutes: Math.max(5, Math.round(batch.reduce((a, q) => a + q.estimated_seconds, 0) / 60)),
      difficulty: Math.round(batch.reduce((a, q) => a + q.difficulty, 0) / batch.length),
      title: `${batch.length} interview questions`,
    });
  }

  return out;
}

/** Build (or rebuild) the plan for one day from the active roadmap. */
export async function generateDailyPlan(userId: string, planDate: string) {
  const supabase = await createClient();

  const { data: career } = await supabase
    .from("career_profiles")
    .select("daily_minutes")
    .eq("user_id", userId)
    .maybeSingle();

  const { data: roadmap } = await supabase
    .from("roadmaps")
    .select("id, start_date, weeks")
    .eq("user_id", userId)
    .eq("status", "active")
    .maybeSingle();

  if (!career || !roadmap) return null;

  const weekIndex = weekIndexFor(roadmap.start_date, planDate, roadmap.weeks);

  const [{ data: weekItems }, { data: due }, { data: doneItems }] = await Promise.all([
    supabase
      .from("roadmap_items")
      .select("id, skill_id, stage, item_ref_type, item_ref_id, planned_minutes, sort_order, status")
      .eq("roadmap_id", roadmap.id)
      .eq("week_index", weekIndex)
      .neq("status", "completed")
      .order("sort_order"),
    supabase
      .from("revision_items")
      .select("id, skill_id, item_ref_type, item_ref_id, due_at, interval_days")
      .eq("user_id", userId)
      .is("retired_at", null)
      .lte("due_at", new Date().toISOString())
      .order("due_at"),
    supabase
      .from("daily_plan_items")
      .select("item_ref_id")
      .eq("status", "completed"),
  ]);

  const completed = new Set((doneItems ?? []).map((d) => d.item_ref_id).filter(Boolean) as string[]);

  const available: ContentItem[] = (weekItems ?? [])
    .filter((i) => !completed.has(i.item_ref_id ?? ""))
    .map((i) => ({
      id: i.item_ref_id ?? i.id,
      skillId: i.skill_id ?? "",
      refType: i.item_ref_type as ContentItem["refType"],
      stage: i.stage,
      minutes: i.planned_minutes,
      difficulty: 3,
      title: i.item_ref_type,
    }));

  const plan = composeDailyPlan({
    date: planDate,
    dailyMinutes: career.daily_minutes,
    dueRevision: (due ?? []).map((r) => ({
      id: r.id,
      skillId: r.skill_id,
      refType: r.item_ref_type as ContentItem["refType"],
      refId: r.item_ref_id ?? r.id,
      title: "Revision",
      minutes: 5,
      difficulty: 3,
      dueAt: new Date(r.due_at),
    })),
    availableItems: available,
    now: new Date(),
  });

  const { data: skillRows } = await supabase
    .from("skills")
    .select("id, name")
    .in("id", [...new Set(plan.items.map((i) => i.skillId).filter(Boolean))]);
  const skillNames = Object.fromEntries((skillRows ?? []).map((s) => [s.id, s.name]));

  const { data: dailyPlan, error } = await supabase
    .from("daily_plans")
    .upsert(
      {
        user_id: userId,
        plan_date: planDate,
        roadmap_id: roadmap.id,
        week_index: weekIndex,
        mission_title: missionTitle(plan, skillNames),
        planned_minutes: plan.plannedMinutes,
      },
      { onConflict: "user_id,plan_date" },
    )
    .select("id")
    .single();

  if (error || !dailyPlan) throw new Error(`Failed to create daily plan: ${error?.message}`);

  await supabase.from("daily_plan_items").delete().eq("daily_plan_id", dailyPlan.id);

  if (plan.items.length > 0) {
    await supabase.from("daily_plan_items").insert(
      plan.items.map((item) => ({
        daily_plan_id: dailyPlan.id,
        stage: item.stage,
        item_ref_type: item.refType,
        item_ref_id: item.refId,
        skill_id: item.skillId || null,
        title: item.title,
        planned_minutes: item.minutes,
        xp_available: xpForStage(item.stage),
        source: item.reason.source === "revision" ? ("revision" as const) : ("roadmap" as const),
        sort_order: item.sortOrder,
      })),
    );
  }

  return { dailyPlanId: dailyPlan.id, plan };
}

function xpForStage(stage: string): number {
  switch (stage) {
    case "learn":
      return 20;
    case "explain":
      return 20;
    case "test":
      return 25;
    case "build":
      return 40;
    case "research":
      return 50;
    case "review":
      return 10;
    default:
      return 15;
  }
}

export function weekIndexFor(startDate: string, planDate: string, maxWeeks: number): number {
  const start = new Date(`${startDate}T00:00:00Z`).getTime();
  const day = new Date(`${planDate}T00:00:00Z`).getTime();
  const elapsedWeeks = Math.floor((day - start) / (7 * 86_400_000));
  return Math.min(Math.max(1, elapsedWeeks + 1), maxWeeks);
}
