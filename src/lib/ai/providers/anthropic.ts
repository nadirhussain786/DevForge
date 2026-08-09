import "server-only";

import Anthropic from "@anthropic-ai/sdk";
import { zodOutputFormat } from "@anthropic-ai/sdk/helpers/zod";
import type { z } from "zod";

import {
  AiUnavailableError,
  MAX_TOKENS,
  activeModel,
  type AiFeature,
  type StructuredRequest,
  type StructuredResult,
} from "../provider";

/**
 * Anthropic provider. Retained as an alternative — set AI_PROVIDER=anthropic.
 *
 * Uses `messages.parse` with a zod output format, so the response is validated
 * at the SDK layer and the model retries on a shape mismatch.
 */

let client: Anthropic | null = null;

function getClient(apiKey: string): Anthropic {
  client ??= new Anthropic({ apiKey });
  return client;
}

/**
 * Grading a short answer against a fixed rubric is a bounded judgement;
 * reasoning across a whole interview transcript is not.
 */
const EFFORT: Record<AiFeature, "low" | "medium" | "high"> = {
  grade: "medium",
  coach: "medium",
  interview: "high",
  parse: "low",
};

export async function generateWithAnthropic<T extends z.ZodType>(
  request: StructuredRequest<T>,
  apiKey: string,
): Promise<StructuredResult<z.infer<T>>> {
  const model = activeModel("anthropic");

  const response = await getClient(apiKey).messages.parse({
    model,
    max_tokens: MAX_TOKENS[request.feature],
    output_config: {
      effort: EFFORT[request.feature],
      format: zodOutputFormat(request.schema),
    },
    system: [
      // Stable across calls, so it caches.
      { type: "text", text: request.system, cache_control: { type: "ephemeral" } },
    ],
    messages: [{ role: "user", content: request.user }],
  });

  // A refusal returns HTTP 200 with no usable content — check before reading it.
  if (response.stop_reason === "refusal") {
    throw new AiUnavailableError(
      `Claude declined the request (${response.stop_details?.category ?? "unspecified"})`,
    );
  }

  if (!response.parsed_output) {
    throw new AiUnavailableError(
      `Claude returned no parsed output (stop reason: ${response.stop_reason})`,
    );
  }

  return {
    data: response.parsed_output as z.infer<T>,
    model: response.model,
    inputTokens: response.usage.input_tokens,
    outputTokens: response.usage.output_tokens,
  };
}
