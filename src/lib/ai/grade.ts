import "server-only";

import { zodOutputFormat } from "@anthropic-ai/sdk/helpers/zod";

import { AI_MODEL, EFFORT, MAX_TOKENS, PROMPT_VERSIONS, getClient, isAiConfigured } from "./provider";
import { consumeRateLimit, fence } from "./guard";
import { recordUsage } from "./meter";
import { gradeSchema, type Grade } from "./schemas";

/**
 * Rubric grading — docs/01-technical-architecture.md §4.
 *
 * The rubric lives in the database with the question; the model applies it and
 * returns a validated object. It never invents criteria, and it never sees the
 * user's mastery, so a strong learner and a weak one are graded identically.
 */

export interface RubricCriterion {
  id: string;
  label: string;
  weight: number;
}

export interface GradeRequest {
  userId: string;
  /** What was asked. */
  prompt: string;
  /** What the learner wrote. Untrusted. */
  answer: string;
  criteria: RubricCriterion[];
  expectedPoints: string[];
  difficulty: number;
  kind: "explanation" | "short_answer";
}

export interface GradeResult extends Grade {
  promptVersion: string;
  /** True when the AI path was unavailable and this is a keyword fallback. */
  degraded: boolean;
}

/**
 * Stable across every grading call, so it caches. Volatile content (the
 * rubric, the question, the answer) goes in the user turn — see
 * docs/01 and the "shared prefix, varying suffix" caching pattern.
 */
const SYSTEM_PROMPT = `You grade engineering interview answers against a fixed rubric.

You are grading a learner preparing for senior engineering interviews at international enterprise companies. Your judgement should match what a thoughtful staff engineer would conclude in a real interview loop.

How to grade:
- Apply only the rubric criteria you are given. Do not invent additional criteria, and do not reward material the rubric does not ask for.
- Mark a criterion "hit" when the answer demonstrates the idea, even in the learner's own words. Mark "partial" when the idea is gestured at but not established. Mark "missed" when it is absent or wrong.
- Score is the weighted sum of hits, with partials counting half.
- Judge understanding, not vocabulary. An answer that explains the mechanism plainly beats one that names the term without the mechanism.
- Do not reward length. A short, correct, complete answer scores full marks.
- Be honest. Inflated scores corrupt the learner's readiness model and cost them a real interview later.

Feedback:
- Address the learner directly and quote what they actually wrote.
- Name what was missing, not what was merely phrased differently.
- End with one follow-up question that probes the weakest part of their answer. The follow-up must NOT contain the answer — it should make them think, the way an interviewer's next question would.

Communication is scored separately from correctness. Flag imprecise terms ("it's slow", "it breaks", "a lot of traffic") where a precise one exists.`;

function buildUserPrompt(req: GradeRequest): string {
  return [
    `Question asked:\n${req.prompt}`,
    "",
    "Rubric criteria (apply exactly these):",
    ...req.criteria.map((c) => `- [${c.id}] (weight ${c.weight}) ${c.label}`),
    "",
    req.expectedPoints.length > 0
      ? `Concepts a strong answer covers: ${req.expectedPoints.join(", ")}`
      : "",
    "",
    fence(`the learner's ${req.kind === "explanation" ? "explanation" : "answer"}`, req.answer),
  ]
    .filter(Boolean)
    .join("\n");
}

export async function gradeAnswer(req: GradeRequest): Promise<GradeResult> {
  const promptVersion =
    req.kind === "explanation"
      ? PROMPT_VERSIONS.gradeExplanation
      : PROMPT_VERSIONS.gradeAnswer;

  const trimmed = req.answer.trim();
  if (trimmed.length === 0) {
    return { ...emptyAnswerGrade(), promptVersion, degraded: false };
  }

  // No key configured is a supported deployment, not an error — skip straight
  // to the heuristic without logging noise on every submission.
  if (!isAiConfigured()) {
    return { ...heuristicGrade(req), promptVersion, degraded: true };
  }

  const allowed = await consumeRateLimit(req.userId, "grade");
  if (!allowed) {
    return { ...heuristicGrade(req), promptVersion, degraded: true };
  }

  try {
    const client = getClient();

    const response = await client.messages.parse({
      model: AI_MODEL,
      max_tokens: MAX_TOKENS.grade,
      output_config: {
        effort: EFFORT.grade,
        format: zodOutputFormat(gradeSchema),
      },
      system: [
        { type: "text", text: SYSTEM_PROMPT, cache_control: { type: "ephemeral" } },
      ],
      messages: [{ role: "user", content: buildUserPrompt(req) }],
    });

    await recordUsage({
      userId: req.userId,
      feature: "grade",
      model: response.model,
      inputTokens: response.usage.input_tokens,
      outputTokens: response.usage.output_tokens,
    });

    // A refusal returns HTTP 200 with no usable content — read stop_reason
    // before touching the parsed output.
    if (response.stop_reason === "refusal") {
      console.warn("[ai/grade] refused", response.stop_details);
      return { ...heuristicGrade(req), promptVersion, degraded: true };
    }

    const parsed = response.parsed_output;
    if (!parsed) {
      console.warn("[ai/grade] no parsed output", response.stop_reason);
      return { ...heuristicGrade(req), promptVersion, degraded: true };
    }

    return { ...parsed, promptVersion, degraded: false };
  } catch (error) {
    // Never fail the learner's submission because the grader is down. Their
    // answer is already saved; a heuristic score keeps the day moving.
    console.error("[ai/grade] falling back to heuristic scoring", error);
    return { ...heuristicGrade(req), promptVersion, degraded: true };
  }
}

function emptyAnswerGrade(): Grade {
  return {
    score: 0,
    criteria: [],
    missingConcepts: [],
    feedback: "No answer was submitted.",
    followUp: "",
    communication: { clarity: 0, precision: 0, usedImpreciseTerms: [] },
  };
}

/**
 * Keyword fallback used when the AI path is unavailable.
 *
 * Deliberately conservative: it caps at 0.6 so a degraded grade can never
 * resolve a weakness or push a skill into a higher rank on evidence we did not
 * actually verify.
 */
export function heuristicGrade(req: GradeRequest): Grade {
  const haystack = req.answer.toLowerCase();
  const points = req.expectedPoints.length > 0 ? req.expectedPoints : req.criteria.map((c) => c.label);

  const hits = points.filter((p) =>
    p
      .toLowerCase()
      .split(/\s+/)
      .filter((w) => w.length > 3)
      .some((w) => haystack.includes(w)),
  );

  const ratio = points.length === 0 ? 0 : hits.length / points.length;

  return {
    score: Math.min(0.6, Math.round(ratio * 100) / 100),
    criteria: req.criteria.map((c) => ({
      id: c.id,
      status: "partial" as const,
      note: "Graded offline — the AI grader was unavailable.",
    })),
    missingConcepts: points.filter((p) => !hits.includes(p)),
    feedback:
      "Your answer is saved, but the grader was unavailable so this score is provisional and capped. It will not resolve a weakness on its own.",
    followUp: "",
    communication: { clarity: 0.5, precision: 0.5, usedImpreciseTerms: [] },
  };
}
