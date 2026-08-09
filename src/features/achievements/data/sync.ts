import "server-only";

import {
  emptyStats,
  evaluateAll,
  newlyUnlocked,
  type AchievementStats,
  type Criteria,
} from "@/features/achievements/domain/evaluate";
import { track } from "@/lib/events/track";
import { createClient } from "@/lib/supabase/server";

/**
 * Recomputes achievement progress for the signed-in user and unlocks anything
 * that has crossed its threshold.
 *
 * Recomputed from source rather than incremented on each action: an increment
 * that fails once is wrong forever, while a recompute is self-healing and
 * makes a newly authored achievement retroactive without a backfill.
 */

export interface SyncResult {
  unlocked: Array<{ slug: string; name: string; xp: number }>;
  totalUnlocked: number;
}

async function gatherStats(userId: string): Promise<AchievementStats> {
  const supabase = await createClient();

  const [
    { data: streak },
    { data: userSkills },
    { data: career },
    { data: applications },
    { data: coding },
    { count: questionsAnswered },
    { count: researchCompleted },
    { count: designsCompleted },
    { count: interviewsLogged },
    { count: weaknessesResolved },
    { count: mockInterviews },
    { count: bossBattles },
  ] = await Promise.all([
    supabase.from("streaks").select("current_streak, longest_streak").eq("user_id", userId).maybeSingle(),
    supabase.from("user_skills").select("rank, skill_id").eq("user_id", userId),
    supabase.from("career_profiles").select("phase, start_date, weeks").eq("user_id", userId).maybeSingle(),
    supabase.from("applications").select("status").eq("user_id", userId),
    supabase.from("coding_attempts").select("problem_id, status").eq("user_id", userId).eq("status", "passed"),
    supabase.from("question_attempts").select("id", { count: "exact", head: true }).eq("user_id", userId),
    supabase.from("research_notes").select("id", { count: "exact", head: true }).eq("user_id", userId).eq("status", "completed"),
    supabase.from("system_design_attempts").select("id", { count: "exact", head: true }).eq("user_id", userId).not("submitted_at", "is", null),
    supabase.from("interview_records").select("id", { count: "exact", head: true }).eq("user_id", userId),
    supabase.from("weaknesses").select("id", { count: "exact", head: true }).eq("user_id", userId).eq("status", "resolved"),
    supabase.from("mock_interviews").select("id", { count: "exact", head: true }).eq("user_id", userId).eq("status", "completed"),
    supabase.from("boss_battle_attempts").select("id", { count: "exact", head: true }).eq("user_id", userId).not("completed_at", "is", null),
  ]);

  const skillsAtRank: Record<string, number> = {};
  for (const s of userSkills ?? []) {
    skillsAtRank[s.rank] = (skillsAtRank[s.rank] ?? 0) + 1;
  }

  const applicationsByStatus: Record<string, number> = {};
  for (const a of applications ?? []) {
    applicationsByStatus[a.status] = (applicationsByStatus[a.status] ?? 0) + 1;
  }

  // Phase 1 is complete once the planned horizon has elapsed.
  let phaseComplete = false;
  if (career?.start_date && career.weeks) {
    const end = new Date(career.start_date).getTime() + career.weeks * 7 * 86_400_000;
    phaseComplete = Date.now() >= end;
  }

  return {
    ...emptyStats(),
    counts: {
      coding_problem_solved: coding?.length ?? 0,
      question_answered: questionsAnswered ?? 0,
      research_completed: researchCompleted ?? 0,
      system_design_completed: designsCompleted ?? 0,
      interview_logged: interviewsLogged ?? 0,
      weakness_resolved: weaknessesResolved ?? 0,
      mock_interview_completed: mockInterviews ?? 0,
      boss_battle_completed: bossBattles ?? 0,
      application_created: applications?.length ?? 0,
    },
    distinct: {
      skill: new Set((userSkills ?? []).map((s) => s.skill_id)).size,
      coding_pattern: new Set((coding ?? []).map((c) => c.problem_id)).size,
    },
    currentStreak: streak?.current_streak ?? 0,
    longestStreak: streak?.longest_streak ?? 0,
    skillsAtRank,
    phase: career?.phase ?? "phase1",
    phaseComplete,
    applicationsByStatus,
  };
}

export async function syncAchievements(userId: string): Promise<SyncResult> {
  const supabase = await createClient();

  const [{ data: achievements }, { data: existing }] = await Promise.all([
    supabase.from("achievements").select("id, slug, name, xp, criteria"),
    supabase.from("user_achievements").select("achievement_id, unlocked_at").eq("user_id", userId),
  ]);

  if (!achievements?.length) return { unlocked: [], totalUnlocked: 0 };

  const stats = await gatherStats(userId);
  const byId = new Map(achievements.map((a) => [a.id, a]));

  const alreadyUnlocked = new Set(
    (existing ?? [])
      .filter((e) => e.unlocked_at)
      .map((e) => byId.get(e.achievement_id)?.slug)
      .filter(Boolean) as string[],
  );

  const progress = evaluateAll(
    achievements.map((a) => ({ slug: a.slug, criteria: a.criteria as Criteria })),
    stats,
  );
  const fresh = newlyUnlocked(progress, alreadyUnlocked);
  const bySlug = new Map(achievements.map((a) => [a.slug, a]));
  const now = new Date().toISOString();

  // Persist progress for every achievement so the profile can show rings.
  await supabase.from("user_achievements").upsert(
    progress.map((p) => {
      const achievement = bySlug.get(p.slug)!;
      const wasUnlocked = alreadyUnlocked.has(p.slug);
      return {
        user_id: userId,
        achievement_id: achievement.id,
        progress: { current: p.current, target: p.target, ratio: p.ratio } as never,
        unlocked_at: wasUnlocked ? undefined : p.unlocked ? now : null,
      };
    }),
    { onConflict: "user_id,achievement_id" },
  );

  const unlocked: SyncResult["unlocked"] = [];

  for (const p of fresh) {
    const achievement = bySlug.get(p.slug);
    if (!achievement) continue;

    if (achievement.xp > 0) {
      // Idempotent by the same unique index that protects every other award.
      await supabase.from("xp_transactions").insert({
        user_id: userId,
        amount: achievement.xp,
        source_type: "achievement",
        source_id: achievement.id,
      });
    }

    await track("achievement_unlocked", { slug: p.slug, xp: achievement.xp });
    unlocked.push({ slug: p.slug, name: achievement.name, xp: achievement.xp });
  }

  return {
    unlocked,
    totalUnlocked: progress.filter((p) => p.unlocked).length,
  };
}
