import "server-only";

import { createClient } from "@/lib/supabase/server";
import type { MissionItem } from "@/features/roadmap/ui/mission-card";
import type { LoopStage } from "@/features/roadmap/domain/types";

export interface TodaySnapshot {
  planDate: string;
  missionTitle: string | null;
  weekIndex: number | null;
  plannedMinutes: number;
  completedMinutes: number;
  items: MissionItem[];
  streak: { current: number; longest: number; shields: number };
  momentum: { score: number; band: string } | null;
  readiness: { overall: number; delta: number } | null;
  openWeaknesses: Array<{ id: string; skillName: string; severity: number }>;
  dueRevisionCount: number;
}

/** Local calendar date — plans are per user-day, not per UTC-day. */
export function todayIso(timezone = "UTC"): string {
  return new Intl.DateTimeFormat("en-CA", { timeZone: timezone }).format(new Date());
}

export async function getTodaySnapshot(
  userId: string,
  timezone = "UTC",
): Promise<TodaySnapshot> {
  const supabase = await createClient();
  const planDate = todayIso(timezone);

  const { data: plan } = await supabase
    .from("daily_plans")
    .select("id, plan_date, mission_title, week_index, planned_minutes, completed_minutes")
    .eq("user_id", userId)
    .eq("plan_date", planDate)
    .maybeSingle();

  const [{ data: planItems }, { data: streak }, { data: momentum }, { data: snapshots }, { data: weaknesses }, { count: dueCount }] =
    await Promise.all([
      plan
        ? supabase
            .from("daily_plan_items")
            .select("id, stage, title, planned_minutes, xp_available, status, sort_order")
            .eq("daily_plan_id", plan.id)
            .order("sort_order")
        : Promise.resolve({ data: [] as never[] }),
      supabase
        .from("streaks")
        .select("current_streak, longest_streak, shields")
        .eq("user_id", userId)
        .maybeSingle(),
      supabase
        .from("momentum_snapshots")
        .select("score, components")
        .eq("user_id", userId)
        .order("snapshot_date", { ascending: false })
        .limit(1)
        .maybeSingle(),
      supabase
        .from("readiness_snapshots")
        .select("overall, snapshot_date")
        .eq("user_id", userId)
        .order("snapshot_date", { ascending: false })
        .limit(8),
      // Two queries rather than a PostgREST join: the hand-authored Database
      // type carries no relationship metadata, so embedded selects come back
      // as `never`. Swap this for `skills(name)` once `pnpm db:types` has run.
      supabase
        .from("weaknesses")
        .select("id, severity, skill_id")
        .eq("user_id", userId)
        .in("status", ["open", "researching", "retesting"])
        .order("severity", { ascending: false })
        .limit(5),
      supabase
        .from("revision_items")
        .select("id", { count: "exact", head: true })
        .eq("user_id", userId)
        .is("retired_at", null)
        .lte("due_at", new Date().toISOString()),
    ]);

  const skillIds = (weaknesses ?? []).map((w) => w.skill_id);
  const { data: weakSkills } = skillIds.length
    ? await supabase.from("skills").select("id, name").in("id", skillIds)
    : { data: [] as Array<{ id: string; name: string }> };
  const skillNameById = new Map((weakSkills ?? []).map((s) => [s.id, s.name]));

  const items: MissionItem[] = (planItems ?? []).map((i) => ({
    id: i.id,
    stage: i.stage as LoopStage,
    title: i.title,
    minutes: i.planned_minutes,
    xp: i.xp_available,
    status: i.status,
  }));

  // Week-over-week readiness movement powers "your score improved 12% this week".
  const latest = snapshots?.[0];
  const weekAgo = snapshots?.find(
    (s) => new Date(s.snapshot_date) <= new Date(Date.now() - 7 * 86_400_000),
  );

  return {
    planDate,
    missionTitle: plan?.mission_title ?? null,
    weekIndex: plan?.week_index ?? null,
    plannedMinutes: plan?.planned_minutes ?? 0,
    completedMinutes: plan?.completed_minutes ?? 0,
    items,
    streak: {
      current: streak?.current_streak ?? 0,
      longest: streak?.longest_streak ?? 0,
      shields: streak?.shields ?? 0,
    },
    momentum: momentum
      ? { score: Number(momentum.score), band: bandFor(Number(momentum.score)) }
      : null,
    readiness: latest
      ? {
          overall: Number(latest.overall),
          delta: weekAgo ? Number(latest.overall) - Number(weekAgo.overall) : 0,
        }
      : null,
    openWeaknesses: (weaknesses ?? []).map((w) => ({
      id: w.id,
      severity: w.severity,
      skillName: skillNameById.get(w.skill_id) ?? "Unknown skill",
    })),
    dueRevisionCount: dueCount ?? 0,
  };
}

function bandFor(score: number): string {
  if (score >= 80) return "White Hot";
  if (score >= 60) return "Forging";
  if (score >= 35) return "Warming";
  return "Cooling";
}
