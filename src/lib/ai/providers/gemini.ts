import "server-only";

import { GoogleGenAI } from "@google/genai";
import { z } from "zod";

import {
  AiUnavailableError,
  MAX_TOKENS,
  activeModel,
  type StructuredRequest,
  type StructuredResult,
} from "../provider";

/**
 * Gemini provider.
 *
 * Structured output goes through `config.responseJsonSchema` with an
 * `application/json` MIME type, which constrains generation to the schema
 * rather than asking politely for JSON in the prompt. The result is still
 * parsed and validated with zod — a schema the model was given is a strong
 * hint, not a guarantee, and the domain model must never receive a shape it
 * did not agree to.
 */

let client: GoogleGenAI | null = null;

function getClient(apiKey: string): GoogleGenAI {
  client ??= new GoogleGenAI({ apiKey });
  return client;
}

export async function generateWithGemini<T extends z.ZodType>(
  request: StructuredRequest<T>,
  apiKey: string,
): Promise<StructuredResult<z.infer<T>>> {
  const model = activeModel("gemini");
  const genai = getClient(apiKey);

  // Gemini rejects the `$schema` dialect marker zod emits by default.
  const jsonSchema = z.toJSONSchema(request.schema, { target: "draft-7" }) as Record<
    string,
    unknown
  >;
  delete jsonSchema.$schema;

  let response;
  try {
    response = await genai.models.generateContent({
      model,
      contents: request.user,
      config: {
        systemInstruction: request.system,
        responseMimeType: "application/json",
        responseJsonSchema: jsonSchema,
        maxOutputTokens: MAX_TOKENS[request.feature],
      },
    });
  } catch (error) {
    const message = error instanceof Error ? error.message : String(error);
    // A wrong model id is the most likely first-run failure, and the raw error
    // does not make that obvious.
    if (/not found|NOT_FOUND|404/i.test(message)) {
      throw new AiUnavailableError(
        `Gemini model "${model}" was not found. Set AI_MODEL to a model available on your key — gemini-2.5-flash, gemini-3.5-flash, and gemini-3.6-flash are on the free tier.`,
      );
    }
    if (/API key|API_KEY|PERMISSION_DENIED|401|403/i.test(message)) {
      throw new AiUnavailableError(`Gemini rejected the API key: ${message}`);
    }
    if (/quota|RESOURCE_EXHAUSTED|429/i.test(message)) {
      throw new AiUnavailableError(`Gemini rate limit or quota reached: ${message}`);
    }
    throw new AiUnavailableError(`Gemini request failed: ${message}`);
  }

  const text = response.text;
  if (!text) {
    // Usually a safety block or a truncated response; either way there is no
    // object to validate, and the caller should fall back.
    throw new AiUnavailableError(
      `Gemini returned no text (finish reason: ${response.candidates?.[0]?.finishReason ?? "unknown"})`,
    );
  }

  let parsed: unknown;
  try {
    parsed = JSON.parse(text);
  } catch {
    throw new AiUnavailableError("Gemini returned text that was not valid JSON");
  }

  const validated = request.schema.safeParse(parsed);
  if (!validated.success) {
    throw new AiUnavailableError(
      `Gemini returned JSON that did not match the schema: ${validated.error.issues[0]?.message ?? "unknown"}`,
    );
  }

  const usage = response.usageMetadata;

  return {
    data: validated.data as z.infer<T>,
    model,
    inputTokens: usage?.promptTokenCount ?? 0,
    outputTokens: usage?.candidatesTokenCount ?? 0,
  };
}
