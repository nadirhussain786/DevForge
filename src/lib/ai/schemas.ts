import { z } from "zod";

/**
 * Every AI call that feeds the domain model returns one of these, validated by
 * the SDK's structured-output support. Prose is for the user; structure is for
 * the engine — we never regex an answer out of free text.
 */

export const rubricHitSchema = z.object({
  id: z.string().describe("The rubric criterion id this refers to"),
  status: z.enum(["hit", "partial", "missed"]),
  note: z.string().describe("One short sentence of evidence from the answer"),
});

export const gradeSchema = z.object({
  score: z
    .number()
    .min(0)
    .max(1)
    .describe("Weighted rubric score from 0 to 1"),
  criteria: z.array(rubricHitSchema),
  missingConcepts: z
    .array(z.string())
    .describe("Concepts a strong answer needs that this one did not cover"),
  feedback: z
    .string()
    .describe("Two or three sentences addressed to the learner, specific to what they wrote"),
  followUp: z
    .string()
    .describe(
      "One Socratic follow-up question that probes the weakest part of the answer. Never reveals the answer.",
    ),
  communication: z
    .object({
      clarity: z.number().min(0).max(1),
      precision: z.number().min(0).max(1),
      usedImpreciseTerms: z.array(z.string()),
    })
    .describe("Communication scored separately from correctness"),
});

export type Grade = z.infer<typeof gradeSchema>;

export const engineerSpeakSchema = z.object({
  rewritten: z.string().describe("The same claim, stated the way a senior engineer would"),
  changes: z.array(
    z.object({
      before: z.string(),
      after: z.string(),
      why: z.string().describe("Why the precise phrasing is better — not just that it is"),
    }),
  ),
});

export type EngineerSpeak = z.infer<typeof engineerSpeakSchema>;

export const jdParseSchema = z.object({
  title: z.string(),
  company: z.string().nullable(),
  seniority: z.string().nullable(),
  requirements: z.array(
    z.object({
      label: z.string().describe("The technology or skill, normalised to its common name"),
      kind: z.enum(["required", "preferred"]),
      evidence: z.string().describe("The phrase in the posting this came from"),
    }),
  ),
  responsibilities: z.array(z.string()),
  interviewSignals: z
    .array(z.string())
    .describe("Topics this posting suggests the interview will probe"),
});

export type JdParse = z.infer<typeof jdParseSchema>;
