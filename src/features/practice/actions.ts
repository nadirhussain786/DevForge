"use server";

import { revalidatePath } from "next/cache";
import { z } from "zod";

import { recordScoredAttempt } from "@/features/practice/data/record";
import { gradeAnswer, type RubricCriterion } from "@/lib/ai/grade";
import { requireUser } from "@/lib/auth/session";
import { track } from "@/lib/events/track";
import { createClient } from "@/lib/supabase/server";

/** The TEST step of the Forge Loop — interview questions, scored into evidence. */

const answerSchema = z.object({
  questionId: z.uuid(),
  response: z.string().trim().max(8000).default(""),
  selected: z.array(z.string()).default([]),
  seconds: z.coerce.number().int().min(0).max(3600).default(0),
});

export interface AnswerState {
  error?: string;
  result?: {
    questionId: string;
    score: number;
    correct: boolean;
    feedback: string;
    followUp: string;
    missingConcepts: string[];
    xpAwarded: number;
    weaknessOpened: boolean;
    degraded: boolean;
    /** MCQ only — revealed after answering, never before. */
    explanation?: string;
  };
}

export async function submitAnswer(
  _prev: AnswerState,
  formData: FormData,
): Promise<AnswerState> {
  const user = await requireUser();

  const parsed = answerSchema.safeParse({
    questionId: formData.get("questionId"),
    response: formData.get("response") ?? "",
    selected: formData.getAll("selected"),
    seconds: formData.get("seconds") ?? 0,
  });

  if (!parsed.success) {
    return { error: parsed.error.issues[0]?.message ?? "Check your answer" };
  }

  const { questionId, response, selected, seconds } = parsed.data;
  const supabase = await createClient();

  const { data: question } = await supabase
    .from("questions")
    .select("id, kind, prompt_md, difficulty, skill_id, answer_key, rubric, expected_points")
    .eq("id", questionId)
    .eq("status", "published")
    .maybeSingle();

  if (!question) return { error: "That question no longer exists." };

  if (question.kind !== "mcq" && response.length < 10) {
    return { error: "Write at least a sentence — a fragment can't be graded." };
  }

  const priorCount = await countPriorAttempts(user.id, questionId);

  const graded =
    question.kind === "mcq"
      ? gradeMcq(question.answer_key, selected)
      : await gradeFreeText(user.id, question, response);

  const { data: attempt, error: insertError } = await supabase
    .from("question_attempts")
    .insert({
      user_id: user.id,
      question_id: questionId,
      response_text: question.kind === "mcq" ? null : response,
      selected: selected as never,
      score: graded.score,
      seconds,
      attempt_no: priorCount + 1,
      ai_eval: graded.evalPayload as never,
      prompt_version: graded.promptVersion,
    })
    .select("id")
    .single();

  if (insertError || !attempt) {
    return { error: "Your answer could not be saved. Please try again." };
  }

  const recorded = await recordScoredAttempt({
    userId: user.id,
    skillId: question.skill_id,
    sourceId: attempt.id,
    sourceType: question.kind === "mcq" ? "mcq" : "short_answer",
    xpSource: "question_answered",
    score: graded.score,
    difficulty: question.difficulty,
    attemptNo: priorCount + 1,
  });

  await track("question_answered", {
    questionId,
    skillId: question.skill_id,
    score: graded.score,
    kind: question.kind,
    degraded: graded.degraded,
  });

  revalidatePath("/today");

  return {
    result: {
      questionId,
      score: graded.score,
      correct: graded.score >= 0.6,
      feedback: graded.feedback,
      followUp: graded.followUp,
      missingConcepts: graded.missingConcepts,
      xpAwarded: recorded.xpAwarded,
      weaknessOpened: recorded.weaknessOpened,
      degraded: graded.degraded,
      explanation: graded.explanation,
    },
  };
}

async function countPriorAttempts(userId: string, questionId: string): Promise<number> {
  const supabase = await createClient();
  const { count } = await supabase
    .from("question_attempts")
    .select("id", { count: "exact", head: true })
    .eq("user_id", userId)
    .eq("question_id", questionId);
  return count ?? 0;
}

interface GradedAnswer {
  score: number;
  feedback: string;
  followUp: string;
  missingConcepts: string[];
  explanation?: string;
  degraded: boolean;
  promptVersion: string | null;
  evalPayload: Record<string, unknown>;
}

/**
 * MCQ is graded locally against the stored key — no AI call, no latency, and
 * it works with no API key configured. Partial credit is deliberate: on a
 * multi-select, naming two of three correct options is not the same as
 * guessing.
 */
function gradeMcq(answerKey: unknown, selected: string[]): GradedAnswer {
  const key = (answerKey ?? {}) as { correct?: string[]; explanation?: string };
  const correct = new Set(key.correct ?? []);
  const chosen = new Set(selected);

  const hits = [...chosen].filter((c) => correct.has(c)).length;
  const wrong = [...chosen].filter((c) => !correct.has(c)).length;

  const score =
    correct.size === 0
      ? 0
      : Math.max(0, Math.min(1, (hits - wrong) / correct.size));

  return {
    score: Math.round(score * 1000) / 1000,
    feedback: score >= 1 ? "Correct." : score > 0 ? "Partly right." : "Not quite.",
    followUp: "",
    missingConcepts: [],
    explanation: key.explanation,
    degraded: false,
    promptVersion: null,
    evalPayload: { correct: [...correct], selected },
  };
}

async function gradeFreeText(
  userId: string,
  question: {
    prompt_md: string;
    difficulty: number;
    rubric: unknown;
    expected_points: unknown;
  },
  response: string,
): Promise<GradedAnswer> {
  const rubric = (question.rubric ?? {}) as { criteria?: RubricCriterion[] };
  const criteria = rubric.criteria ?? [
    { id: "correct", label: "Answers the question correctly", weight: 0.6 },
    { id: "depth", label: "Explains the mechanism, not just the conclusion", weight: 0.4 },
  ];
  const expectedPoints = Array.isArray(question.expected_points)
    ? (question.expected_points as string[])
    : [];

  const grade = await gradeAnswer({
    userId,
    prompt: question.prompt_md,
    answer: response,
    criteria,
    expectedPoints,
    difficulty: question.difficulty,
    kind: "short_answer",
  });

  return {
    score: grade.score,
    feedback: grade.feedback,
    followUp: grade.followUp,
    missingConcepts: grade.missingConcepts,
    degraded: grade.degraded,
    promptVersion: grade.promptVersion,
    evalPayload: {
      criteria: grade.criteria,
      communication: grade.communication,
      degraded: grade.degraded,
    },
  };
}
