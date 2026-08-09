import "server-only";

import { computeMastery, type Evidence, type EvidenceSource } from "@/features/mastery/domain/mastery";
import { createClient } from "@/lib/supabase/server";

import { buildStory, type SkillDelta, type StoryBeat, type StoryInput } from "../domain/story";

/**
 * Assembles the inputs for the progress story.
 *
 * The interesting part is `masteryBefore`. There is no mastery history table,
 * and adding one would be a second source of truth that could disagree with the
 * evidence. Instead the value is *recomputed* from the same append-only
 * evidence log, filtered to what existed at the cutoff and evaluated as of that
 * date — so decay is applied from where the learner stood then, not from now.
 *
 * That makes the comparison exact rather than approximate, and it stays correct
 * if the mastery formula ever changes, because both sides go through the same
 * function.
 *
 * Momentum and readiness do have history, in their snapshot tables, so those
 * come from the recorded value rather than being re-derived.
 */

export const STORY_WINDOW_DAYS = 14;

/** Recomputing history is not free, so only the most-practised skills are compared. */
const MAX_TRACKED_SKILLS = 25;

const DAY_MS = 86_400_000;

/** Stages that count toward breadth, keyed by the xp_transactions source_type prefix. */
function stageOf(sourceType: string): string | null {
  if (sourceType.startsWith("topic") || sourceType.startsWith("lesson")) return "learn";
  if (sourceType.startsWith("coding") || sourceType.startsWith("project")) return "build";
  if (sourceType.startsWith("explanation")) return "explain";
  if (sourceType.startsWith("question") || sourceType.startsWith("quiz")) return "test";
  if (sourceType.startsWith("research") || sourceType.startsWith("note")) return "research";
  if (sourceType.startsWith("interview") || sourceType.startsWith("mock")) return "test";
  if (sourceType.startsWith("design") || sourceType.startsWith("boss")) return "build";
  return null;
}

export async function getStoryInput(userId: string, now = new Date()): Promise<StoryInput> {
  const supabase = await createClient();

  const cutoff = new Date(now.getTime() - STORY_WINDOW_DAYS * DAY_MS);
  const weekAgo = new Date(now.getTime() - 7 * DAY_MS);
  const isoDay = (d: Date) => d.toISOString().slice(0, 10);

  const [
    { data: profile },
    { data: streak },
    { data: progress },
    { data: skills },
    { data: xp },
    { data: reviews },
    { data: weaknesses },
    { data: attempts },
    { data: momentum },
    { data: readiness },
  ] = await Promise.all([
    supabase.from("profiles").select("created_at").eq("id", userId).maybeSingle(),
    supabase
      .from("streaks")
      .select("current_streak, longest_streak")
      .eq("user_id", userId)
      .maybeSingle(),
    supabase.from("user_progress").select("total_xp").eq("user_id", userId).maybeSingle(),
    supabase
      .from("user_skills")
      .select("skill_id, mastery, evidence_count, skills(name)")
      .eq("user_id", userId)
      .order("evidence_count", { ascending: false })
      .limit(MAX_TRACKED_SKILLS),
    supabase
      .from("xp_transactions")
      .select("amount, source_type, occurred_at")
      .eq("user_id", userId)
      .gte("occurred_at", cutoff.toISOString()),
    supabase
      .from("revision_items")
      .select("due_at")
      .eq("user_id", userId)
      .is("retired_at", null)
      .lte("due_at", now.toISOString()),
    supabase.from("weaknesses").select("status, resolved_at").eq("user_id", userId),
    supabase
      .from("question_attempts")
      .select("is_correct")
      .eq("user_id", userId)
      .gte("created_at", weekAgo.toISOString()),
    supabase
      .from("momentum_snapshots")
      .select("snapshot_date, score")
      .eq("user_id", userId)
      .gte("snapshot_date", isoDay(cutoff))
      .order("snapshot_date", { ascending: false }),
    supabase
      .from("readiness_snapshots")
      .select("snapshot_date, overall")
      .eq("user_id", userId)
      .gte("snapshot_date", isoDay(cutoff))
      .order("snapshot_date", { ascending: false }),
  ]);

  // ── Mastery, then and now ────────────────────────────────────────────────
  const trackedIds = (skills ?? []).map((s) => s.skill_id);

  const { data: pastEvidence } = trackedIds.length
    ? await supabase
        .from("skill_evidence")
        .select("skill_id, source_type, correctness, difficulty, occurred_at")
        .eq("user_id", userId)
        .in("skill_id", trackedIds)
        .lte("occurred_at", cutoff.toISOString())
    : { data: [] };

  const evidenceBySkill = new Map<string, Evidence[]>();
  for (const e of pastEvidence ?? []) {
    const list = evidenceBySkill.get(e.skill_id) ?? [];
    list.push({
      source: e.source_type as EvidenceSource,
      correctness: Number(e.correctness),
      difficulty: Number(e.difficulty),
      occurredAt: new Date(e.occurred_at),
    });
    evidenceBySkill.set(e.skill_id, list);
  }

  const skillDeltas: SkillDelta[] = (skills ?? []).map((s) => {
    // Evaluated at `cutoff` so decay reflects the learner's position then.
    const before = computeMastery(evidenceBySkill.get(s.skill_id) ?? [], { now: cutoff });
    const joined = s.skills as unknown as { name: string } | { name: string }[] | null;
    const name = Array.isArray(joined) ? joined[0]?.name : joined?.name;

    return {
      skillId: s.skill_id,
      name: name ?? "Unknown skill",
      mastery: Number(s.mastery),
      masteryBefore: before.mastery,
    };
  });

  // ── XP split across the two weeks, and the breadth of what earned it ─────
  const rows = xp ?? [];
  const thisWeekRows = rows.filter((x) => new Date(x.occurred_at) >= weekAgo);

  const xpThisWeek = thisWeekRows.reduce((a, x) => a + x.amount, 0);
  const xpLastWeek = rows
    .filter((x) => new Date(x.occurred_at) < weekAgo)
    .reduce((a, x) => a + x.amount, 0);

  const stages = new Set(
    thisWeekRows.map((x) => stageOf(x.source_type)).filter((s): s is string => s !== null),
  );

  // ── Recall, reviews, and the two snapshot series ─────────────────────────
  const graded = attempts ?? [];
  const recallRate =
    graded.length > 0 ? graded.filter((a) => a.is_correct).length / graded.length : null;

  const overdueCutoff = new Date(now.getTime() - DAY_MS);
  const reviewsOverdue = (reviews ?? []).filter((r) => new Date(r.due_at) < overdueCutoff).length;

  // Ordered newest-first, so [0] is current and the last entry is the baseline.
  const momentumNow = momentum?.[0] ? Number(momentum[0].score) : 0;
  const momentumThen = momentum?.length ? Number(momentum[momentum.length - 1].score) : momentumNow;
  const readinessNow = readiness?.[0] ? Number(readiness[0].overall) : 0;
  const readinessThen = readiness?.length
    ? Number(readiness[readiness.length - 1].overall)
    : readinessNow;

  const createdAt = profile?.created_at ? new Date(profile.created_at) : now;
  const daysActive = Math.max(0, Math.floor((now.getTime() - createdAt.getTime()) / DAY_MS));

  return {
    daysActive,
    currentStreak: streak?.current_streak ?? 0,
    longestStreak: streak?.longest_streak ?? 0,
    missedThisWeek: 0,
    totalXp: progress?.total_xp ?? 0,
    xpThisWeek,
    xpLastWeek,
    momentum: momentumNow,
    momentumLastWeek: momentumThen,
    skills: skillDeltas,
    readiness: readinessNow,
    readinessBefore: readinessThen,
    reviewsDue: reviews?.length ?? 0,
    reviewsOverdue,
    recallRate,
    weaknessesOpen: (weaknesses ?? []).filter((w) => w.status === "open").length,
    weaknessesResolvedThisWeek: (weaknesses ?? []).filter(
      (w) => w.resolved_at && new Date(w.resolved_at) >= weekAgo,
    ).length,
    stagesUsedThisWeek: stages.size,
  };
}

/**
 * The story, ready to render.
 *
 * `overrides` lets a caller that already holds a figure pass it in rather than
 * have it re-fetched — /today has momentum and streak in its snapshot already.
 */
export async function getProgressStory(
  userId: string,
  options: { now?: Date; limit?: number; overrides?: Partial<StoryInput> } = {},
): Promise<StoryBeat[]> {
  const now = options.now ?? new Date();
  const input = await getStoryInput(userId, now);
  return buildStory({ ...input, ...options.overrides }, options.limit ?? 4);
}
