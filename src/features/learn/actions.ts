"use server";

import { revalidatePath } from "next/cache";
import { z } from "zod";

import { recordScoredAttempt } from "@/features/practice/data/record";
import { gradeAnswer, type RubricCriterion } from "@/lib/ai/grade";
import { requireUser } from "@/lib/auth/session";
import { track } from "@/lib/events/track";
import { createClient } from "@/lib/supabase/server";

/**
 * The EXPLAIN step of the Forge Loop.
 *
 * Reading a topic produces no evidence — explaining it does. This action is
 * what closes a Learn block, and it is deliberately the only way to.
 */

const explainSchema = z.object({
  topicId: z.uuid(),
  body: z.string().trim().min(40, "Write a few sentences — a phrase isn't an explanation"),
  level: z.enum(["beginner", "engineer", "enterprise", "interview"]).default("engineer"),
});

export interface ExplainState {
  error?: string;
  result?: {
    score: number;
    feedback: string;
    followUp: string;
    missingConcepts: string[];
    impreciseTerms: string[];
    xpAwarded: number;
    weaknessOpened: boolean;
    degraded: boolean;
  };
}

export async function submitExplanation(
  _prev: ExplainState,
  formData: FormData,
): Promise<ExplainState> {
  const user = await requireUser();

  const parsed = explainSchema.safeParse({
    topicId: formData.get("topicId"),
    body: formData.get("body"),
    level: formData.get("level") ?? "engineer",
  });

  if (!parsed.success) {
    return { error: parsed.error.issues[0]?.message ?? "Check your explanation" };
  }

  const { topicId, body, level } = parsed.data;
  const supabase = await createClient();

  const { data: topic } = await supabase
    .from("topics")
    .select("id, slug, title, skill_id, difficulty")
    .eq("id", topicId)
    .maybeSingle();

  if (!topic) return { error: "That topic no longer exists." };

  // Grade against the topic's own interview framing — the level the learner is
  // actually working toward — rather than a generic rubric.
  const criteria: RubricCriterion[] = [
    { id: "mechanism", label: "Explains the underlying mechanism, not just the name", weight: 0.35 },
    { id: "why", label: "Says why it matters or when it applies", weight: 0.25 },
    { id: "tradeoff", label: "Names at least one cost or trade-off", weight: 0.2 },
    { id: "precision", label: "Uses precise technical language correctly", weight: 0.2 },
  ];

  const grade = await gradeAnswer({
    userId: user.id,
    prompt: `Explain "${topic.title}" at the level of a ${level} engineer.`,
    answer: body,
    criteria,
    expectedPoints: [],
    difficulty: topic.difficulty,
    kind: "explanation",
  });

  const { data: explanation, error: insertError } = await supabase
    .from("explanations")
    .insert({
      user_id: user.id,
      topic_id: topic.id,
      skill_id: topic.skill_id,
      body_md: body,
      level_claimed: level,
      score: grade.score,
      ai_eval: {
        criteria: grade.criteria,
        missingConcepts: grade.missingConcepts,
        communication: grade.communication,
        promptVersion: grade.promptVersion,
        degraded: grade.degraded,
      } as never,
    })
    .select("id")
    .single();

  if (insertError || !explanation) {
    return { error: "Your explanation could not be saved. Please try again." };
  }

  const recorded = await recordScoredAttempt({
    userId: user.id,
    skillId: topic.skill_id,
    sourceId: explanation.id,
    sourceType: "explanation",
    xpSource: "explanation_accepted",
    score: grade.score,
    difficulty: topic.difficulty,
  });

  await track("explanation_submitted", {
    topicId: topic.id,
    skillId: topic.skill_id,
    score: grade.score,
    degraded: grade.degraded,
  });

  revalidatePath("/today");
  revalidatePath(`/learn/${topic.slug}`);

  return {
    result: {
      score: grade.score,
      feedback: grade.feedback,
      followUp: grade.followUp,
      missingConcepts: grade.missingConcepts,
      impreciseTerms: grade.communication.usedImpreciseTerms,
      xpAwarded: recorded.xpAwarded,
      weaknessOpened: recorded.weaknessOpened,
      degraded: grade.degraded,
    },
  };
}
