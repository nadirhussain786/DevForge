import "server-only";

import { createClient } from "@/lib/supabase/server";

/**
 * Per-model list prices, USD per million tokens.
 *
 * The Gemini flash models are on a free tier, so they cost nothing at the
 * volumes a single learner generates — they are listed at zero deliberately,
 * and the metering still records token counts so usage stays visible even
 * when the bill is zero.
 */
const PRICES: Record<string, { input: number; output: number }> = {
  "gemini-2.5-flash": { input: 0, output: 0 },
  "gemini-2.5-flash-lite": { input: 0, output: 0 },
  "gemini-3.5-flash": { input: 0, output: 0 },
  "gemini-3.5-flash-lite": { input: 0, output: 0 },
  "gemini-3.6-flash": { input: 0, output: 0 },
  "gemini-2.5-pro": { input: 1.25, output: 10 },
  "claude-opus-5": { input: 5, output: 25 },
  "claude-sonnet-5": { input: 3, output: 15 },
  "claude-haiku-4-5": { input: 1, output: 5 },
};

export interface UsageRecord {
  userId: string;
  feature: string;
  model: string;
  inputTokens: number;
  outputTokens: number;
}

export function estimateCostUsd(
  model: string,
  inputTokens: number,
  outputTokens: number,
): number {
  const price = PRICES[model];
  if (!price) return 0;
  return (inputTokens * price.input + outputTokens * price.output) / 1_000_000;
}

/**
 * Records spend per user so the admin console can see AI cost per learner and
 * so a runaway feature is visible before the invoice is. Never throws — a
 * metering failure must not lose the user's graded work.
 */
export async function recordUsage(usage: UsageRecord): Promise<void> {
  try {
    const supabase = await createClient();
    await supabase.from("ai_usage").insert({
      user_id: usage.userId,
      feature: usage.feature,
      model: usage.model,
      input_tokens: usage.inputTokens,
      output_tokens: usage.outputTokens,
      cost_usd: estimateCostUsd(usage.model, usage.inputTokens, usage.outputTokens),
    });
  } catch (error) {
    console.error("[ai/meter] failed to record usage", error);
  }
}
