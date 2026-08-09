import "server-only";

import type { z } from "zod";

/**
 * Provider-agnostic AI layer.
 *
 * EngForge grades against stored rubrics and returns schema-validated objects.
 * Nothing in the domain model cares which model produced them, so the provider
 * is a swappable detail behind `generateStructured`.
 *
 * Gemini is the default because its free tier makes running this platform
 * cost nothing at a single-user scale — and the whole design assumes AI is an
 * enhancement, not a dependency.
 */

export type ProviderName = "gemini" | "anthropic";

export class AiUnavailableError extends Error {
  constructor(message: string) {
    super(message);
    this.name = "AiUnavailableError";
  }
}

export function activeProvider(): ProviderName {
  const configured = process.env.AI_PROVIDER?.toLowerCase();
  if (configured === "anthropic") return "anthropic";
  if (configured === "gemini") return "gemini";

  // No explicit choice: use whichever key is present, preferring the free one.
  if (process.env.GEMINI_API_KEY || process.env.GOOGLE_API_KEY) return "gemini";
  if (process.env.ANTHROPIC_API_KEY) return "anthropic";
  return "gemini";
}

export function apiKeyFor(provider: ProviderName): string | undefined {
  return provider === "gemini"
    ? (process.env.GEMINI_API_KEY ?? process.env.GOOGLE_API_KEY)
    : process.env.ANTHROPIC_API_KEY;
}

/**
 * AI is an OPTIONAL dependency. Without a key, answers are still saved, still
 * scored (by a capped heuristic), and still produce evidence, XP, and
 * weaknesses. What you lose is grading precision and Socratic follow-ups —
 * not the product.
 */
export function isAiConfigured(): boolean {
  return Boolean(apiKeyFor(activeProvider()));
}

/**
 * Default models, chosen for cost first. Both providers' cheap tiers follow
 * rubric instructions well, and grading a short answer against fixed criteria
 * is a bounded judgement rather than an open-ended one.
 *
 * Override with AI_MODEL. Free Gemini alternatives at time of writing:
 * gemini-3.6-flash, gemini-3.5-flash, gemini-3.5-flash-lite, gemini-2.5-flash.
 */
const DEFAULT_MODEL: Record<ProviderName, string> = {
  gemini: "gemini-2.5-flash",
  anthropic: "claude-opus-5",
};

/** Which provider a model id obviously belongs to, or null if unrecognised. */
function providerOfModel(model: string): ProviderName | null {
  if (/^gemini|^gemma/i.test(model)) return "gemini";
  if (/^claude/i.test(model)) return "anthropic";
  return null;
}

export function activeModel(provider: ProviderName = activeProvider()): string {
  const configured = process.env.AI_MODEL?.trim();
  if (!configured) return DEFAULT_MODEL[provider];

  // A stale AI_MODEL left over from a provider switch would otherwise be sent
  // to the wrong API and fail as an opaque "model not found". Ignore it and
  // say so, rather than inheriting a setting that cannot work.
  const belongsTo = providerOfModel(configured);
  if (belongsTo && belongsTo !== provider) {
    console.warn(
      `[ai] AI_MODEL="${configured}" is a ${belongsTo} model but the active provider is ${provider}. ` +
        `Using ${DEFAULT_MODEL[provider]} instead — unset AI_MODEL or set one that matches.`,
    );
    return DEFAULT_MODEL[provider];
  }

  return configured;
}

export type AiFeature = "grade" | "coach" | "interview" | "parse";

/** Generous enough for a day's missions, tight enough to bound a runaway. */
export const MAX_TOKENS: Record<AiFeature, number> = {
  grade: 8_000,
  coach: 8_000,
  interview: 12_000,
  parse: 16_000,
};

/** Bump when a prompt changes, so stored evaluations stay attributable. */
export const PROMPT_VERSIONS = {
  gradeExplanation: "explain-v1",
  gradeAnswer: "answer-v1",
  engineerSpeak: "speak-v1",
  parseJobDescription: "jd-v1",
} as const;

export interface StructuredRequest<T extends z.ZodType> {
  feature: AiFeature;
  schema: T;
  /** Stable across calls, so providers that support caching can reuse it. */
  system: string;
  user: string;
}

export interface StructuredResult<T> {
  data: T;
  model: string;
  inputTokens: number;
  outputTokens: number;
}

/**
 * The single entry point every AI feature uses. Returns a schema-validated
 * object or throws — callers degrade rather than surfacing a failure.
 */
export async function generateStructured<T extends z.ZodType>(
  request: StructuredRequest<T>,
): Promise<StructuredResult<z.infer<T>>> {
  const provider = activeProvider();
  const key = apiKeyFor(provider);

  if (!key) {
    throw new AiUnavailableError(
      provider === "gemini"
        ? "GEMINI_API_KEY is not set"
        : "ANTHROPIC_API_KEY is not set",
    );
  }

  // Imported lazily so the unused provider's SDK never enters the bundle.
  if (provider === "gemini") {
    const { generateWithGemini } = await import("./providers/gemini");
    return generateWithGemini(request, key);
  }

  const { generateWithAnthropic } = await import("./providers/anthropic");
  return generateWithAnthropic(request, key);
}
