import "server-only";

import Anthropic from "@anthropic-ai/sdk";

/**
 * Server-only Claude client. The key never reaches the browser — every AI call
 * goes through a server action or route handler.
 */

let client: Anthropic | null = null;

/**
 * AI is an OPTIONAL dependency. EngForge runs without an API key: answers are
 * still saved, still scored (by a capped heuristic), and still produce
 * evidence, XP, and weaknesses. What you lose is grading precision and the
 * Socratic follow-ups — not the product.
 *
 * Every caller must therefore treat AI as a best-effort enhancement, never a
 * hard requirement. Check this before promising the user an AI-graded result.
 */
export function isAiConfigured(): boolean {
  return Boolean(process.env.ANTHROPIC_API_KEY);
}

export function getClient(): Anthropic {
  if (!isAiConfigured()) {
    throw new AiUnavailableError("ANTHROPIC_API_KEY is not set");
  }
  client ??= new Anthropic();
  return client;
}

export const AI_MODEL = process.env.AI_MODEL ?? "claude-opus-5";

/**
 * Effort per task. Grading a short answer against a fixed rubric is a
 * bounded judgement — `medium` is the right trade, and the cost difference at
 * our volume is the difference between a viable product and an expensive one.
 * Interview follow-ups reason about a whole conversation, so they get `high`.
 */
export const EFFORT = {
  grade: "medium",
  coach: "medium",
  interview: "high",
  parse: "low",
} as const;

/**
 * Thinking is on by default on Claude Opus 5, and `max_tokens` caps thinking
 * plus response together — so these leave real headroom above the size of the
 * structured object we expect back.
 */
export const MAX_TOKENS = {
  grade: 8_000,
  coach: 8_000,
  interview: 12_000,
  parse: 16_000,
} as const;

/** Bump when a prompt changes, so stored evaluations stay attributable. */
export const PROMPT_VERSIONS = {
  gradeExplanation: "explain-v1",
  gradeAnswer: "answer-v1",
  engineerSpeak: "speak-v1",
  parseJobDescription: "jd-v1",
} as const;

/**
 * Thrown when the AI layer cannot serve a request. Callers degrade to
 * heuristic scoring rather than failing the user's mission — losing a precise
 * grade is acceptable, losing someone's completed work is not.
 */
export class AiUnavailableError extends Error {
  constructor(message: string) {
    super(message);
    this.name = "AiUnavailableError";
  }
}
