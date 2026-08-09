"use server";

import { revalidatePath } from "next/cache";
import { z } from "zod";

import { complexityMatches as compareComplexity } from "@/features/code/domain/complexity";
import { recordScoredAttempt } from "@/features/practice/data/record";
import { requireUser } from "@/lib/auth/session";
import { track } from "@/lib/events/track";
import { createClient } from "@/lib/supabase/server";

/** The BUILD step of the Forge Loop. */

const submitSchema = z.object({
  problemId: z.uuid(),
  code: z.string().max(50_000),
  language: z.string().max(40).default("typescript"),
  testsPassed: z.coerce.number().int().min(0),
  testsTotal: z.coerce.number().int().min(0),
  seconds: z.coerce.number().int().min(0).max(24 * 3600),
  hintsUsed: z.coerce.number().int().min(0).max(10),
  complexityClaim: z.string().max(120).optional(),
});

export interface SubmitState {
  error?: string;
  result?: {
    passed: boolean;
    score: number;
    xpAwarded: number;
    weaknessOpened: boolean;
    complexityMatches: boolean | null;
    targetComplexity: string | null;
  };
}

export async function submitSolution(
  _prev: SubmitState,
  formData: FormData,
): Promise<SubmitState> {
  const user = await requireUser();

  const parsed = submitSchema.safeParse({
    problemId: formData.get("problemId"),
    code: formData.get("code") ?? "",
    language: formData.get("language") ?? "typescript",
    testsPassed: formData.get("testsPassed") ?? 0,
    testsTotal: formData.get("testsTotal") ?? 0,
    seconds: formData.get("seconds") ?? 0,
    hintsUsed: formData.get("hintsUsed") ?? 0,
    complexityClaim: formData.get("complexityClaim") || undefined,
  });

  if (!parsed.success) return { error: "Invalid submission." };

  const input = parsed.data;
  const supabase = await createClient();

  const { data: problem } = await supabase
    .from("coding_problems")
    .select("id, difficulty, target_complexity")
    .eq("id", input.problemId)
    .eq("status", "published")
    .maybeSingle();

  if (!problem) return { error: "That problem no longer exists." };

  const { data: links } = await supabase
    .from("coding_problem_skills")
    .select("skill_id, weight")
    .eq("problem_id", problem.id)
    .order("weight", { ascending: false });

  const allPassed = input.testsTotal > 0 && input.testsPassed === input.testsTotal;

  // Partial credit on tests, then a penalty for claiming the wrong complexity.
  // Getting the code right while misreading its cost is a real, separable gap —
  // and it's the part an interviewer probes.
  const testRatio = input.testsTotal === 0 ? 0 : input.testsPassed / input.testsTotal;
  const complexityMatches = compareComplexity(input.complexityClaim, problem.target_complexity);
  const score = Math.max(
    0,
    Math.min(1, testRatio - (allPassed && complexityMatches === false ? 0.15 : 0)),
  );

  const { data: prior } = await supabase
    .from("coding_attempts")
    .select("id", { count: "exact", head: true })
    .eq("user_id", user.id)
    .eq("problem_id", problem.id);

  const { data: attempt, error: insertError } = await supabase
    .from("coding_attempts")
    .insert({
      user_id: user.id,
      problem_id: problem.id,
      language: input.language,
      code: input.code,
      status: allPassed ? "passed" : "failed",
      tests_passed: input.testsPassed,
      tests_total: input.testsTotal,
      seconds: input.seconds,
      hints_used: input.hintsUsed,
      complexity_claim: input.complexityClaim ?? null,
    })
    .select("id")
    .single();

  if (insertError || !attempt) return { error: "Your attempt could not be saved." };

  let xpAwarded = 0;
  let weaknessOpened = false;

  // Evidence lands against the problem's primary skill. Secondary skills get
  // no evidence — solving one problem is not proof across every tag on it.
  const primarySkill = links?.[0]?.skill_id;
  if (primarySkill) {
    const recorded = await recordScoredAttempt({
      userId: user.id,
      skillId: primarySkill,
      sourceId: attempt.id,
      sourceType: "coding_attempt",
      xpSource: "coding_problem_solved",
      score,
      difficulty: problem.difficulty,
      attemptNo: (prior as unknown as { length?: number })?.length ?? 1,
      hintsUsed: input.hintsUsed,
    });
    xpAwarded = recorded.xpAwarded;
    weaknessOpened = recorded.weaknessOpened;
  }

  await track("coding_problem_solved", {
    problemId: problem.id,
    passed: allPassed,
    testsPassed: input.testsPassed,
    testsTotal: input.testsTotal,
    complexityMatches,
  });

  revalidatePath("/today");
  revalidatePath("/code");

  return {
    result: {
      passed: allPassed,
      score,
      xpAwarded,
      weaknessOpened,
      complexityMatches,
      targetComplexity: problem.target_complexity,
    },
  };
}

