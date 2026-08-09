/**
 * Drafts learning content for every skill that doesn't have any yet.
 *
 *   pnpm content:generate                 # draft everything missing
 *   pnpm content:generate --limit 5       # a few, to check quality first
 *   pnpm content:generate --skill idempotency
 *   pnpm content:generate --domain databases
 *   pnpm content:publish                  # publish reviewed drafts
 *
 * Everything is written as `draft`. Nothing reaches a learner until it is
 * published, and the database refuses to publish a topic missing any of the
 * four explanation levels — so an incomplete draft cannot slip through.
 *
 * Each topic is also written to supabase/generated/<slug>.md so it can be read
 * and edited as prose rather than SQL.
 */

import { createClient } from "@supabase/supabase-js";
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

const args = process.argv.slice(2);
const flag = (name) => {
  const i = args.indexOf(`--${name}`);
  return i > -1 ? (args[i + 1] ?? true) : undefined;
};

const PUBLISH_MODE = args.includes("--publish");
const LIMIT = Number(flag("limit") ?? 0) || null;
const ONLY_SKILL = flag("skill");
const ONLY_DOMAIN = flag("domain");
const DRY_RUN = args.includes("--dry-run");

const url = process.env.NEXT_PUBLIC_SUPABASE_URL;
const serviceKey = process.env.SUPABASE_SERVICE_ROLE_KEY;
const geminiKey = process.env.GEMINI_API_KEY || process.env.GOOGLE_API_KEY;
const model = process.env.AI_MODEL?.startsWith("gemini")
  ? process.env.AI_MODEL
  : "gemini-2.5-flash";

if (!url || !serviceKey) {
  console.error("NEXT_PUBLIC_SUPABASE_URL and SUPABASE_SERVICE_ROLE_KEY must be set.");
  process.exit(1);
}

const db = createClient(url, serviceKey, { auth: { persistSession: false } });
const OUT_DIR = path.resolve(process.cwd(), "supabase/generated");

// ── Publish mode ────────────────────────────────────────────────────────────

if (PUBLISH_MODE) {
  const { data: drafts } = await db
    .from("topics")
    .select("id, slug, title")
    .eq("status", "draft");

  if (!drafts?.length) {
    console.log("No drafts to publish.");
    process.exit(0);
  }

  let published = 0;
  const failed = [];

  for (const topic of drafts) {
    // The publish trigger enforces all four explanation levels; a rejection
    // here means the draft is genuinely incomplete, not that publishing broke.
    const { error } = await db.from("topics").update({ status: "published" }).eq("id", topic.id);
    if (error) {
      failed.push(`${topic.slug}: ${error.message}`);
    } else {
      await db.from("questions").update({ status: "published" }).eq("topic_id", topic.id);
      published++;
    }
  }

  console.log(`Published ${published} topic(s).`);
  if (failed.length) {
    console.log(`\n${failed.length} could not be published:`);
    for (const f of failed) console.log(`  ${f}`);
  }
  process.exit(0);
}

// ── Generation mode ─────────────────────────────────────────────────────────

if (!geminiKey) {
  console.error(
    [
      "GEMINI_API_KEY is not set — content generation needs it.",
      "",
      "Free key: https://aistudio.google.com/apikey",
      "Then: pnpm content:generate --limit 3   (check quality before running the lot)",
    ].join("\n"),
  );
  process.exit(1);
}

const { GoogleGenAI } = await import("@google/genai");
const genai = new GoogleGenAI({ apiKey: geminiKey });

const TOPIC_SCHEMA = {
  type: "object",
  properties: {
    title: { type: "string" },
    summary: { type: "string" },
    estimatedMinutes: { type: "integer" },
    difficulty: { type: "integer" },
    beginner: { type: "string" },
    engineer: { type: "string" },
    enterprise: { type: "string" },
    interview: { type: "string" },
    mistakes: { type: "string" },
    tradeoffs: { type: "string" },
    diagram: {
      type: "object",
      properties: {
        mermaid: { type: "string" },
        caption: { type: "string" },
        explanation: { type: "string" },
      },
      required: ["mermaid", "caption", "explanation"],
    },
    questions: {
      type: "array",
      items: {
        type: "object",
        properties: {
          kind: { type: "string", enum: ["mcq", "short_answer"] },
          prompt: { type: "string" },
          difficulty: { type: "integer" },
          choices: {
            type: "array",
            items: {
              type: "object",
              properties: { id: { type: "string" }, text: { type: "string" } },
              required: ["id", "text"],
            },
          },
          correct: { type: "array", items: { type: "string" } },
          explanation: { type: "string" },
          criteria: {
            type: "array",
            items: {
              type: "object",
              properties: {
                id: { type: "string" },
                label: { type: "string" },
                weight: { type: "number" },
              },
              required: ["id", "label", "weight"],
            },
          },
          expectedPoints: { type: "array", items: { type: "string" } },
        },
        required: ["kind", "prompt", "difficulty"],
      },
    },
  },
  required: [
    "title", "summary", "estimatedMinutes", "difficulty",
    "beginner", "engineer", "enterprise", "interview",
    "mistakes", "tradeoffs", "diagram", "questions",
  ],
};

const SYSTEM = `You write learning material for engineers preparing for senior roles at international enterprise companies.

Write ONE topic about the skill you are given. It must work for a complete beginner and still be worth reading for an experienced engineer, because the same page serves both.

The four levels are a ladder, not four versions of the same text:

- beginner: Assume no background. Explain what it is and why anyone cares, in plain language, with a concrete everyday comparison. No jargon without immediately defining it. 150-250 words.
- engineer: The actual mechanism. How it really works, with the specifics that matter in practice. Include a short code or config example where it genuinely helps. 250-400 words.
- enterprise: What changes at scale and under real load. Operational concerns, failure modes, cost, and the trade-offs a staff engineer would raise. 250-400 words.
- interview: A likely interview question in bold, then how to answer it well, then the follow-up questions to expect and what a good answer to each contains. 250-400 words.

Also write:
- mistakes: A markdown bullet list of the specific errors people actually make. Not generic advice.
- tradeoffs: A two-column markdown table with headers "Gain" and "Cost". Trade-offs come in pairs; never a bullet list.
- diagram: Valid Mermaid (flowchart, sequenceDiagram, or stateDiagram-v2) showing the MECHANISM, not a box labelled with the topic name. Plus a caption, and an explanation that says what the diagram reveals — an unexplained diagram teaches nothing.
- questions: Exactly 3. One "mcq" with 4 choices (ids a-d), a "correct" array, and an "explanation". Two "short_answer" with 3-4 rubric "criteria" whose weights sum to 1.0, and "expectedPoints".

Rules that matter:
- Be concrete. Name real numbers, real commands, real failure modes.
- Never pad. If a level needs 200 words, write 200.
- Markdown only in the body fields. No H1 — start at ##.
- Mermaid must parse: no parentheses inside node labels, and quote any label containing punctuation.
- Rubric criteria must be independently checkable, not "shows good understanding".`;

function sleep(ms) {
  return new Promise((r) => setTimeout(r, ms));
}

async function draftTopic(skill, domain, attempt = 1) {
  const user = `Skill: ${skill.name} (${skill.slug})
Domain: ${domain}
Difficulty of the skill itself: ${skill.difficulty}/5
${skill.summary ? `What it covers: ${skill.summary}` : ""}

Write the topic.`;

  try {
    const response = await genai.models.generateContent({
      model,
      contents: user,
      config: {
        systemInstruction: SYSTEM,
        responseMimeType: "application/json",
        responseJsonSchema: TOPIC_SCHEMA,
        maxOutputTokens: 16000,
      },
    });

    if (!response.text) throw new Error("empty response");
    return JSON.parse(response.text);
  } catch (error) {
    const message = error instanceof Error ? error.message : String(error);

    // Free tiers are per-minute; backing off is usually all that's needed.
    if (/quota|RESOURCE_EXHAUSTED|429/i.test(message) && attempt <= 4) {
      const wait = attempt * 20_000;
      console.log(`      rate limited, waiting ${wait / 1000}s…`);
      await sleep(wait);
      return draftTopic(skill, domain, attempt + 1);
    }
    throw error;
  }
}

function toMarkdown(skill, draft) {
  return `# ${draft.title}

> Skill: ${skill.name} (${skill.slug}) · ${draft.estimatedMinutes} min · difficulty ${draft.difficulty}/5
> Generated draft — review before publishing.

${draft.summary}

## Beginner
${draft.beginner}

## Engineer
${draft.engineer}

## Enterprise
${draft.enterprise}

## Interview
${draft.interview}

## Common mistakes
${draft.mistakes}

## Trade-offs
${draft.tradeoffs}

## Diagram — ${draft.diagram.caption}
\`\`\`mermaid
${draft.diagram.mermaid}
\`\`\`
${draft.diagram.explanation}

## Questions
${draft.questions
  .map(
    (q, i) =>
      `### ${i + 1}. [${q.kind}] ${q.prompt}\n` +
      (q.choices?.length
        ? q.choices.map((c) => `- (${c.id}) ${c.text}`).join("\n") +
          `\n\nCorrect: ${(q.correct ?? []).join(", ")}\n${q.explanation ?? ""}`
        : `Criteria: ${(q.criteria ?? []).map((c) => `${c.label} (${c.weight})`).join("; ")}`),
  )
  .join("\n\n")}
`;
}

async function persist(skill, draft) {
  const slug = `${skill.slug}-primer`;

  // Topics cannot be created already-published — the trigger enforces that the
  // explanation levels exist first. Insert as draft, add content, then publish
  // separately via --publish.
  const { data: topic, error } = await db
    .from("topics")
    .upsert(
      {
        slug,
        skill_id: skill.id,
        title: draft.title,
        summary: draft.summary,
        estimated_minutes: Math.min(120, Math.max(5, draft.estimatedMinutes)),
        difficulty: Math.min(5, Math.max(1, draft.difficulty)),
        status: "draft",
      },
      { onConflict: "slug" },
    )
    .select("id")
    .single();

  if (error) throw new Error(`topic upsert failed: ${error.message}`);

  const sections = [
    ["beginner", draft.beginner],
    ["engineer", draft.engineer],
    ["enterprise", draft.enterprise],
    ["interview", draft.interview],
    ["mistakes", draft.mistakes],
    ["tradeoffs", draft.tradeoffs],
  ];

  await db.from("topic_contents").delete().eq("topic_id", topic.id);
  await db.from("topic_contents").insert(
    sections.map(([kind, body]) => ({
      topic_id: topic.id,
      kind,
      body_md: body,
      sort_order: 0,
    })),
  );

  await db.from("topic_media").delete().eq("topic_id", topic.id);
  await db.from("topic_media").insert({
    topic_id: topic.id,
    kind: "mermaid",
    source: draft.diagram.mermaid,
    caption: draft.diagram.caption,
    explanation_md: draft.diagram.explanation,
    sort_order: 0,
  });

  let questionCount = 0;
  for (const [i, q] of draft.questions.entries()) {
    const isMcq = q.kind === "mcq";
    const { error: qError } = await db.from("questions").upsert(
      {
        slug: `${slug}-q${i + 1}`,
        topic_id: topic.id,
        skill_id: skill.id,
        kind: isMcq ? "mcq" : "short_answer",
        prompt_md: q.prompt,
        difficulty: Math.min(5, Math.max(1, q.difficulty ?? skill.difficulty)),
        choices: isMcq ? q.choices ?? [] : null,
        answer_key: isMcq ? { correct: q.correct ?? [], explanation: q.explanation } : null,
        rubric: isMcq ? null : { criteria: q.criteria ?? [] },
        expected_points: q.expectedPoints ?? [],
        is_interview: !isMcq,
        status: "draft",
      },
      { onConflict: "slug" },
    );
    if (!qError) questionCount++;
  }

  fs.mkdirSync(OUT_DIR, { recursive: true });
  fs.writeFileSync(path.join(OUT_DIR, `${slug}.md`), toMarkdown(skill, draft));

  return { slug, questionCount };
}

// ── Choose what to generate ─────────────────────────────────────────────────

const [{ data: skills }, { data: domains }, { data: existing }] = await Promise.all([
  db.from("skills").select("id, slug, name, summary, difficulty, domain_id").eq("status", "published"),
  db.from("domains").select("id, slug, name"),
  db.from("topics").select("skill_id"),
]);

const domainById = new Map((domains ?? []).map((d) => [d.id, d]));
const covered = new Set((existing ?? []).map((t) => t.skill_id));

let queue = (skills ?? []).filter((s) => !covered.has(s.id));
if (ONLY_SKILL) queue = (skills ?? []).filter((s) => s.slug === ONLY_SKILL);
if (ONLY_DOMAIN) {
  queue = queue.filter((s) => domainById.get(s.domain_id)?.slug === ONLY_DOMAIN);
}
if (LIMIT) queue = queue.slice(0, LIMIT);

console.log(`\nModel   : ${model}`);
console.log(`Skills  : ${skills?.length ?? 0} published, ${covered.size} already have a topic`);
console.log(`Queue   : ${queue.length}\n`);

if (queue.length === 0) {
  console.log("Nothing to generate.");
  process.exit(0);
}

if (DRY_RUN) {
  for (const s of queue) console.log(`  ${s.slug.padEnd(28)} ${domainById.get(s.domain_id)?.name}`);
  process.exit(0);
}

let done = 0;
const failures = [];
const started = Date.now();

for (const [i, skill] of queue.entries()) {
  const domain = domainById.get(skill.domain_id)?.name ?? "General";
  process.stdout.write(`  [${i + 1}/${queue.length}] ${skill.slug.padEnd(28)} `);

  try {
    const draft = await draftTopic(skill, domain);
    const { slug, questionCount } = await persist(skill, draft);
    console.log(`ok  ${slug} (+${questionCount} questions)`);
    done++;
  } catch (error) {
    const message = error instanceof Error ? error.message : String(error);
    console.log(`FAILED  ${message.slice(0, 70)}`);
    failures.push(`${skill.slug}: ${message}`);
  }

  // Stay well inside free-tier per-minute limits.
  if (i < queue.length - 1) await sleep(4000);
}

const minutes = Math.round((Date.now() - started) / 60000);
console.log(`\n${done} drafted in ~${minutes} min. ${failures.length} failed.`);

if (failures.length) {
  console.log("\nFailures:");
  for (const f of failures.slice(0, 10)) console.log(`  ${f}`);
}

console.log(
  [
    "",
    `Drafts are in supabase/generated/ and in the database with status=draft.`,
    "Nothing is visible to a learner yet.",
    "",
    "Review a few, then publish with:  pnpm content:publish",
  ].join("\n"),
);
