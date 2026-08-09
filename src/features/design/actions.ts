"use server";

import { revalidatePath } from "next/cache";
import { z } from "zod";

import { recordScoredAttempt } from "@/features/practice/data/record";
import { requireUser } from "@/lib/auth/session";
import { track } from "@/lib/events/track";
import { createClient } from "@/lib/supabase/server";

/**
 * System Design Arena (§24, §59).
 *
 * The reference architecture is withheld until a submission exists — reading
 * a model answer before attempting one teaches nothing, and the whole value of
 * this exercise is the gap between what you wrote and what you didn't think of.
 *
 * Scoring is self-assessment against the stored rubric. That sounds weak, but
 * a design has no test suite, and a learner who has just written their own
 * answer and then read a reference is unusually well placed to judge which
 * criteria they actually hit. Honest self-assessment against explicit criteria
 * beats a confident automated score on something this open-ended.
 */

const submitSchema = z.object({
  caseId: z.uuid(),
  submissionMd: z.string().trim().min(120, "A design needs more than a few lines"),
  diagramMermaid: z.string().max(10_000).optional(),
});

export interface DesignState {
  error?: string;
  submitted?: boolean;
  attemptId?: string;
}

export async function submitDesign(_prev: DesignState, formData: FormData): Promise<DesignState> {
  const user = await requireUser();

  const parsed = submitSchema.safeParse({
    caseId: formData.get("caseId"),
    submissionMd: formData.get("submissionMd"),
    diagramMermaid: formData.get("diagramMermaid") || undefined,
  });

  if (!parsed.success) return { error: parsed.error.issues[0]?.message ?? "Check your design" };

  const supabase = await createClient();

  const { data: attempt, error } = await supabase
    .from("system_design_attempts")
    .insert({
      user_id: user.id,
      case_id: parsed.data.caseId,
      submission_md: parsed.data.submissionMd,
      diagram_mermaid: parsed.data.diagramMermaid ?? null,
      submitted_at: new Date().toISOString(),
    })
    .select("id")
    .single();

  if (error || !attempt) return { error: "Your design could not be saved." };

  await track("system_design_completed", { caseId: parsed.data.caseId });
  revalidatePath(`/arena/design`);

  return { submitted: true, attemptId: attempt.id };
}

const scoreSchema = z.object({
  attemptId: z.uuid(),
  caseId: z.uuid(),
});

export interface ScoreState {
  error?: string;
  result?: { overall: number; xpAwarded: number; weaknessOpened: boolean };
}

/**
 * Self-scoring after reading the reference. Each rubric criterion is marked
 * hit / partial / missed, and the weighted result becomes evidence at
 * weight 2.0 — one of the strongest signals the model accepts, because
 * synthesising a whole system is a much harder claim than answering a question.
 */
export async function scoreDesign(_prev: ScoreState, formData: FormData): Promise<ScoreState> {
  const user = await requireUser();

  const parsed = scoreSchema.safeParse({
    attemptId: formData.get("attemptId"),
    caseId: formData.get("caseId"),
  });
  if (!parsed.success) return { error: "Invalid submission." };

  const supabase = await createClient();

  const { data: designCase } = await supabase
    .from("system_design_cases")
    .select("id, rubric, difficulty")
    .eq("id", parsed.data.caseId)
    .maybeSingle();

  if (!designCase) return { error: "That case no longer exists." };

  const rubric = (designCase.rubric ?? {}) as {
    criteria?: Array<{ id: string; label: string; weight: number }>;
  };
  const criteria = rubric.criteria ?? [];
  if (criteria.length === 0) return { error: "This case has no rubric to score against." };

  const scores: Record<string, string> = {};
  let weighted = 0;
  let totalWeight = 0;

  for (const criterion of criteria) {
    const value = String(formData.get(`criterion_${criterion.id}`) ?? "missed");
    scores[criterion.id] = value;
    totalWeight += criterion.weight;
    weighted += criterion.weight * (value === "hit" ? 1 : value === "partial" ? 0.5 : 0);
  }

  const overall = totalWeight === 0 ? 0 : weighted / totalWeight;

  await supabase
    .from("system_design_attempts")
    .update({ scores: scores as never, overall_score: Math.round(overall * 10000) / 100 })
    .eq("id", parsed.data.attemptId)
    .eq("user_id", user.id);

  // A design case maps to the system-design skill family; use the case's own
  // dominant skill if one is linked, else fall back to architecture trade-offs.
  const { data: skill } = await supabase
    .from("skills")
    .select("id")
    .eq("slug", "architecture-tradeoffs")
    .maybeSingle();

  let xpAwarded = 0;
  let weaknessOpened = false;

  if (skill) {
    const recorded = await recordScoredAttempt({
      userId: user.id,
      skillId: skill.id,
      sourceId: parsed.data.attemptId,
      sourceType: "system_design_attempt",
      xpSource: "system_design_completed",
      score: overall,
      difficulty: designCase.difficulty,
    });
    xpAwarded = recorded.xpAwarded;
    weaknessOpened = recorded.weaknessOpened;
  }

  revalidatePath("/arena/design");
  revalidatePath("/today");

  return {
    result: { overall: Math.round(overall * 100), xpAwarded, weaknessOpened },
  };
}
