"use server";

import { revalidatePath } from "next/cache";
import { z } from "zod";

import { recordScoredAttempt } from "@/features/practice/data/record";
import { requireUser } from "@/lib/auth/session";
import { track } from "@/lib/events/track";
import { createClient } from "@/lib/supabase/server";

/**
 * Boss Battles (§22) — a realistic production scenario, analysed under the
 * same self-assessment model as system design.
 *
 * These score at weight 2.0 as `boss_battle` evidence: reasoning about a live
 * incident is a synthesis task, not recall.
 */

const submitSchema = z.object({
  battleId: z.uuid(),
  analysisMd: z.string().trim().min(120, "Work through it properly — a few lines isn't an analysis"),
});

export interface BossState {
  error?: string;
  attemptId?: string;
}

export async function submitBossBattle(_prev: BossState, formData: FormData): Promise<BossState> {
  const user = await requireUser();

  const parsed = submitSchema.safeParse({
    battleId: formData.get("battleId"),
    analysisMd: formData.get("analysisMd"),
  });
  if (!parsed.success) return { error: parsed.error.issues[0]?.message ?? "Check your analysis" };

  const supabase = await createClient();
  const { data: attempt, error } = await supabase
    .from("boss_battle_attempts")
    .insert({
      user_id: user.id,
      battle_id: parsed.data.battleId,
      analysis_md: parsed.data.analysisMd,
    })
    .select("id")
    .single();

  if (error || !attempt) return { error: "Your analysis could not be saved." };

  revalidatePath("/arena/battles");
  return { attemptId: attempt.id };
}

const scoreSchema = z.object({ attemptId: z.uuid(), battleId: z.uuid() });

export interface BossScoreState {
  error?: string;
  result?: { overall: number; xpAwarded: number };
}

export async function scoreBossBattle(
  _prev: BossScoreState,
  formData: FormData,
): Promise<BossScoreState> {
  const user = await requireUser();
  const parsed = scoreSchema.safeParse({
    attemptId: formData.get("attemptId"),
    battleId: formData.get("battleId"),
  });
  if (!parsed.success) return { error: "Invalid submission." };

  const supabase = await createClient();
  const { data: battle } = await supabase
    .from("boss_battles")
    .select("id, rubric, difficulty, skill_id, xp")
    .eq("id", parsed.data.battleId)
    .maybeSingle();

  if (!battle) return { error: "That battle no longer exists." };

  const rubric = (battle.rubric ?? {}) as {
    criteria?: Array<{ id: string; label: string; weight: number }>;
  };
  const criteria = rubric.criteria ?? [];
  if (criteria.length === 0) return { error: "This battle has no rubric." };

  const scores: Record<string, string> = {};
  let weighted = 0;
  let total = 0;

  for (const c of criteria) {
    const value = String(formData.get(`criterion_${c.id}`) ?? "missed");
    scores[c.id] = value;
    total += c.weight;
    weighted += c.weight * (value === "hit" ? 1 : value === "partial" ? 0.5 : 0);
  }

  const overall = total === 0 ? 0 : weighted / total;

  await supabase
    .from("boss_battle_attempts")
    .update({
      scores: scores as never,
      overall_score: Math.round(overall * 10000) / 100,
      completed_at: new Date().toISOString(),
    })
    .eq("id", parsed.data.attemptId)
    .eq("user_id", user.id);

  let xpAwarded = 0;
  if (battle.skill_id) {
    const recorded = await recordScoredAttempt({
      userId: user.id,
      skillId: battle.skill_id,
      sourceId: parsed.data.attemptId,
      sourceType: "boss_battle",
      xpSource: "boss_battle_completed",
      score: overall,
      difficulty: battle.difficulty,
    });
    xpAwarded = recorded.xpAwarded;
  }

  await track("boss_battle_completed", { battleId: battle.id, score: overall });
  revalidatePath("/arena/battles");
  revalidatePath("/today");

  return { result: { overall: Math.round(overall * 100), xpAwarded } };
}
