/**
 * Confirms the configured AI provider actually works, end to end.
 *
 *   pnpm ai:check
 *
 * Sends one real rubric-grading request and validates the response against the
 * same schema the app uses, so a pass here means grading will work — not just
 * that the key is syntactically valid.
 *
 * Costs one small request. On Gemini's free flash models that is free.
 */

import fs from "node:fs";
import path from "node:path";

for (const file of [".env.local", ".env"]) {
  const full = path.resolve(process.cwd(), file);
  if (!fs.existsSync(full)) continue;
  const raw = fs.readFileSync(full, "utf8").replace(/^﻿/, "");
  for (const line of raw.split(/\r?\n/)) {
    const m = line.match(/^\s*([A-Za-z0-9_]+)\s*=\s*(.*)$/);
    if (m && !process.env[m[1]]) process.env[m[1]] = m[2].trim();
  }
}

const explicit = process.env.AI_PROVIDER?.toLowerCase();
const geminiKey = process.env.GEMINI_API_KEY || process.env.GOOGLE_API_KEY;
const anthropicKey = process.env.ANTHROPIC_API_KEY;

const provider =
  explicit === "anthropic" || explicit === "gemini"
    ? explicit
    : geminiKey
      ? "gemini"
      : anthropicKey
        ? "anthropic"
        : "gemini";

const key = provider === "gemini" ? geminiKey : anthropicKey;
const fallbackModel = provider === "gemini" ? "gemini-2.5-flash" : "claude-opus-5";

// Mirror the app's guard: a stale AI_MODEL from a previous provider would fail
// as an opaque "model not found", so ignore it and say why.
const configuredModel = process.env.AI_MODEL?.trim();
const modelProvider = /^gemini|^gemma/i.test(configuredModel ?? "")
  ? "gemini"
  : /^claude/i.test(configuredModel ?? "")
    ? "anthropic"
    : null;

let model = configuredModel || fallbackModel;
let modelNote = "";
if (configuredModel && modelProvider && modelProvider !== provider) {
  model = fallbackModel;
  modelNote = `  (ignoring AI_MODEL="${configuredModel}" — that's a ${modelProvider} model)`;
}

console.log(`\nProvider : ${provider}`);
console.log(`Model    : ${model}${modelNote}`);
console.log(`Key      : ${key ? "set" : "MISSING"}\n`);

if (!key) {
  console.log(
    provider === "gemini"
      ? "Set GEMINI_API_KEY in .env. Free keys: https://aistudio.google.com/apikey\n\n" +
          "EngForge runs without one — multiple-choice, coding tests, and every mastery\n" +
          "calculation are unaffected. Written answers fall back to a keyword score capped\n" +
          "at 60% that deliberately cannot resolve a weakness."
      : "Set ANTHROPIC_API_KEY in .env.",
  );
  process.exit(1);
}

const { z } = await import("zod");

// A miniature of the real grading schema — same shape, cheaper to exercise.
const schema = z.object({
  score: z.number().min(0).max(1),
  verdict: z.enum(["hit", "partial", "missed"]),
  feedback: z.string(),
});

const SYSTEM =
  "You grade answers against a rubric. Reply with the weighted score from 0 to 1, " +
  "a verdict, and one sentence of feedback addressed to the learner.";

const USER =
  'Question: "Why is an index not always used by the query planner?"\n' +
  'Rubric: the answer must mention selectivity OR stale statistics.\n' +
  'Learner answer: "Because the planner is cost-based — if the predicate matches most ' +
  'of the table, a sequential scan is cheaper than an index scan."';

const started = Date.now();

try {
  let data;
  let usage = { input: 0, output: 0 };

  if (provider === "gemini") {
    const { GoogleGenAI } = await import("@google/genai");
    const jsonSchema = z.toJSONSchema(schema, { target: "draft-7" });
    delete jsonSchema.$schema;

    const genai = new GoogleGenAI({ apiKey: key });
    const response = await genai.models.generateContent({
      model,
      contents: USER,
      config: {
        systemInstruction: SYSTEM,
        responseMimeType: "application/json",
        responseJsonSchema: jsonSchema,
        maxOutputTokens: 2000,
      },
    });

    if (!response.text) {
      throw new Error(
        `no text returned (finish reason: ${response.candidates?.[0]?.finishReason ?? "unknown"})`,
      );
    }
    data = schema.parse(JSON.parse(response.text));
    usage = {
      input: response.usageMetadata?.promptTokenCount ?? 0,
      output: response.usageMetadata?.candidatesTokenCount ?? 0,
    };
  } else {
    const { default: Anthropic } = await import("@anthropic-ai/sdk");
    const { zodOutputFormat } = await import("@anthropic-ai/sdk/helpers/zod");

    const client = new Anthropic({ apiKey: key });
    const response = await client.messages.parse({
      model,
      max_tokens: 2000,
      output_config: { effort: "low", format: zodOutputFormat(schema) },
      system: SYSTEM,
      messages: [{ role: "user", content: USER }],
    });

    if (response.stop_reason === "refusal") throw new Error("the model declined the request");
    data = response.parsed_output;
    usage = { input: response.usage.input_tokens, output: response.usage.output_tokens };
  }

  console.log(`ok  round trip in ${Date.now() - started}ms`);
  console.log(`ok  response validated against the schema`);
  console.log(`\n    score    ${data.score}`);
  console.log(`    verdict  ${data.verdict}`);
  console.log(`    feedback ${data.feedback}`);
  console.log(`\n    tokens   ${usage.input} in / ${usage.output} out`);

  // The answer given is correct, so a grader that works should score it well.
  // A very low score means the model is not following the rubric.
  if (data.score < 0.5) {
    console.log(
      `\nWarning: that answer is correct, but scored ${data.score}. The model may not be` +
        `\nfollowing the rubric well — consider a stronger model via AI_MODEL.`,
    );
  }

  console.log("\nAI grading is working.");
} catch (error) {
  const message = error instanceof Error ? error.message : String(error);
  console.log(`FAILED  ${message}\n`);

  if (/not found|NOT_FOUND|404/i.test(message)) {
    console.log(
      `The model "${model}" was not found on this key.\n` +
        "Free Gemini models: gemini-2.5-flash, gemini-3.5-flash, gemini-3.6-flash.\n" +
        "Set one with AI_MODEL in .env.",
    );
  } else if (/API key|API_KEY|PERMISSION_DENIED|401|403/i.test(message)) {
    console.log("The key was rejected. Check it, and that the Gemini API is enabled for it.");
  } else if (/quota|RESOURCE_EXHAUSTED|429/i.test(message)) {
    console.log("Rate limit or quota reached. Free tiers are per-minute — wait and retry.");
  }

  console.log(
    "\nEngForge still runs: written answers fall back to a capped keyword score,\n" +
      "and everything else is unaffected.",
  );
  process.exit(1);
}
