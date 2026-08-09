/**
 * Exercises the full Forge Loop write path against the live database.
 *
 *   pnpm verify:loop
 *
 * The smoke test proves pages render (GET). This proves the loop actually
 * turns: an answer becomes evidence, evidence moves mastery, a failure opens a
 * weakness with remediation scheduled, review advances the schedule, and new
 * evidence at difficulty resolves it.
 *
 * Runs as a real user with a real JWT, so RLS applies throughout. Creates and
 * removes its own account.
 */

import { createClient } from "@supabase/supabase-js";
import fs from "node:fs";
import path from "node:path";
import pg from "pg";

for (const file of [".env.local", ".env"]) {
  const full = path.resolve(process.cwd(), file);
  if (!fs.existsSync(full)) continue;
  const raw = fs.readFileSync(full, "utf8").replace(/^﻿/, "");
  for (const line of raw.split(/\r?\n/)) {
    const m = line.match(/^\s*([A-Za-z0-9_]+)\s*=\s*(.*)$/);
    if (m && !process.env[m[1]]) process.env[m[1]] = m[2].trim();
  }
}

const url = process.env.NEXT_PUBLIC_SUPABASE_URL;
const anonKey = process.env.NEXT_PUBLIC_SUPABASE_ANON_KEY;
const serviceKey = process.env.SUPABASE_SERVICE_ROLE_KEY;

const admin = createClient(url, serviceKey, { auth: { persistSession: false } });

let failures = 0;
const ok = (m) => console.log(`  ok    ${m}`);
const bad = (m) => {
  failures++;
  console.log(`  FAIL  ${m}`);
};

const email = `loop-${Date.now()}@example.com`;
const PASSWORD = "Loop-1234-aA!";
let uid = null;

try {
  const { data: created, error: createError } = await admin.auth.admin.createUser({
    email,
    password: PASSWORD,
    email_confirm: true,
  });
  if (createError) throw new Error(createError.message);
  uid = created.user.id;

  const user = createClient(url, anonKey, { auth: { persistSession: false } });
  await user.auth.signInWithPassword({ email, password: PASSWORD });

  const { data: skill } = await admin
    .from("skills")
    .select("id, name")
    .eq("slug", "idempotency")
    .maybeSingle();
  if (!skill) throw new Error("seed the taxonomy first (pnpm db:seed)");

  // ── 1. A failed answer produces evidence and moves mastery ──────────────
  console.log("\n1. Evidence and mastery");

  const { data: firstEvidence, error: e1 } = await user.rpc("record_evidence", {
    p_skill: skill.id,
    p_source_type: "short_answer",
    p_source_id: null,
    p_difficulty: 4,
    p_correctness: 0.2,
  });
  if (e1) bad(`record_evidence failed: ${e1.message}`);
  else ok("a weak answer writes to the ledger");

  const { data: afterFirst } = await user
    .from("user_skills")
    .select("mastery, confidence, rank, evidence_count")
    .eq("skill_id", skill.id)
    .maybeSingle();

  if (afterFirst?.evidence_count === 1 && Number(afterFirst.mastery) < 15) {
    ok(`mastery recomputed low as expected (${afterFirst.mastery}%, rank ${afterFirst.rank})`);
  } else {
    bad(`unexpected mastery after a weak answer: ${JSON.stringify(afterFirst)}`);
  }

  // ── 2. A weakness with remediation ──────────────────────────────────────
  console.log("\n2. Failure becomes a scheduled plan");

  const { data: weakness, error: wErr } = await user
    .from("weaknesses")
    .insert({
      user_id: uid,
      skill_id: skill.id,
      severity: 2,
      source_type: "short_answer",
      source_id: firstEvidence,
      evidence: { difficulty: 4, reason: "Scored 0.2 on a difficulty-4 question." },
    })
    .select("id, status")
    .single();

  if (wErr) bad(`could not open a weakness: ${wErr.message}`);
  else ok(`weakness opened (severity 2, status ${weakness.status})`);

  const { error: rErr } = await user.from("revision_items").insert([
    { user_id: uid, weakness_id: weakness.id, skill_id: skill.id, item_ref_type: "topic", due_at: new Date().toISOString(), interval_days: 1 },
    { user_id: uid, weakness_id: weakness.id, skill_id: skill.id, item_ref_type: "question_set", due_at: new Date().toISOString(), interval_days: 3 },
  ]);
  rErr ? bad(`revision scheduling failed: ${rErr.message}`) : ok("spaced revision scheduled");

  const { error: tErr } = await user.from("research_tasks").insert({
    user_id: uid,
    weakness_id: weakness.id,
    skill_id: skill.id,
    prompt_md: `Investigate ${skill.name} until you can explain it without notes.`,
  });
  tErr ? bad(`research task failed: ${tErr.message}`) : ok("research task created");

  // A second live weakness on the same skill must be impossible.
  const { error: dupErr } = await user.from("weaknesses").insert({
    user_id: uid,
    skill_id: skill.id,
    severity: 1,
    source_type: "mcq",
    source_id: null,
  });
  dupErr
    ? ok("a duplicate open weakness on the same skill is rejected")
    : bad("DUPLICATE — two live weaknesses opened for one skill");

  // ── 3. Review advances the schedule but does NOT resolve ────────────────
  console.log("\n3. Review advances, it does not resolve");

  const { data: items } = await user.from("revision_items").select("id").eq("weakness_id", weakness.id);
  for (const item of items ?? []) {
    await user
      .from("revision_items")
      .update({ last_result: true, repetitions: 1, interval_days: 3, last_reviewed_at: new Date().toISOString() })
      .eq("id", item.id);
  }

  const { data: stillOpen } = await user
    .from("weaknesses")
    .select("status")
    .eq("id", weakness.id)
    .maybeSingle();

  stillOpen?.status !== "resolved"
    ? ok(`recall alone left it unresolved (status ${stillOpen?.status})`)
    : bad("INVARIANT #5 — recall alone resolved the weakness");

  // ── 4. Weak evidence must not resolve it either ─────────────────────────
  await user.rpc("record_evidence", {
    p_skill: skill.id,
    p_source_type: "mcq",
    p_source_id: null,
    p_difficulty: 1,
    p_correctness: 1,
  });

  const { data: afterEasy } = await user
    .from("weaknesses")
    .select("status")
    .eq("id", weakness.id)
    .maybeSingle();

  afterEasy?.status !== "resolved"
    ? ok("a correct answer on EASIER material did not resolve it")
    : bad("VIOLATION — easier material resolved the weakness");

  // ── 5. Strong evidence at difficulty resolves it ────────────────────────
  console.log("\n4. Real evidence closes the loop");

  await user.rpc("record_evidence", {
    p_skill: skill.id,
    p_source_type: "explanation",
    p_source_id: null,
    p_difficulty: 4,
    p_correctness: 0.9,
  });

  const { data: resolved } = await user
    .from("weaknesses")
    .select("status, resolved_at, resolved_by_evidence_id")
    .eq("id", weakness.id)
    .maybeSingle();

  resolved?.status === "resolved"
    ? ok("strong evidence at equal difficulty resolved it automatically")
    : bad(`weakness still ${resolved?.status} after strong evidence at difficulty 4`);

  if (resolved?.resolved_by_evidence_id && resolved.resolved_by_evidence_id !== firstEvidence) {
    ok("resolved by a DIFFERENT attempt than the one that opened it");
  } else if (resolved?.status === "resolved") {
    bad("resolved by the opening attempt — invariant #5 broken");
  }

  const { data: finalSkill } = await user
    .from("user_skills")
    .select("mastery, confidence, rank, evidence_count")
    .eq("skill_id", skill.id)
    .maybeSingle();
  ok(
    `mastery after 4 pieces of evidence: ${finalSkill?.mastery}% (${finalSkill?.rank}, confidence ${finalSkill?.confidence})`,
  );

  // ── 6. XP is idempotent and level tracks it ─────────────────────────────
  console.log("\n5. XP and levels");

  const sourceId = crypto.randomUUID();
  await user.from("xp_transactions").insert({ user_id: uid, amount: 200, source_type: "weekly_mission_completed", source_id: sourceId });
  const { error: dupXp } = await user.from("xp_transactions").insert({ user_id: uid, amount: 200, source_type: "weekly_mission_completed", source_id: sourceId });
  dupXp ? ok("duplicate XP rejected") : bad("XP awarded twice");

  const { data: progress } = await user.from("user_progress").select("total_xp, level, level_name").maybeSingle();
  progress?.total_xp === 200 && progress.level_name === "Apprentice"
    ? ok(`user_progress synced by trigger (${progress.total_xp} XP, ${progress.level_name})`)
    : bad(`user_progress wrong: ${JSON.stringify(progress)}`);

  // ── 7. Daily plan budget invariant, enforced by the database ────────────
  console.log("\n6. Daily plan budget");

  const { data: plan } = await user
    .from("daily_plans")
    .insert({ user_id: uid, plan_date: new Date().toISOString().slice(0, 10), planned_minutes: 0 })
    .select("id")
    .single();

  await user.from("daily_plan_items").insert({
    daily_plan_id: plan.id,
    stage: "learn",
    item_ref_type: "topic",
    title: "Within budget",
    planned_minutes: 50,
  });

  const { error: overBudget } = await user.from("daily_plan_items").insert({
    daily_plan_id: plan.id,
    stage: "build",
    item_ref_type: "coding_problem",
    title: "Blows the budget",
    planned_minutes: 30,
  });

  /budget/i.test(overBudget?.message ?? "")
    ? ok("INVARIANT #1 — the database refused to overschedule the day")
    : bad(`over-budget insert was allowed: ${overBudget?.message ?? "no error"}`);
} catch (error) {
  failures++;
  console.error(`\nAborted: ${error.message}`);
} finally {
  if (uid && process.env.SUPABASE_DB_URL) {
    const client = new pg.Client({
      connectionString: process.env.SUPABASE_DB_URL,
      ssl: { rejectUnauthorized: false },
    });
    await client.connect();
    await client.query("alter table public.skill_evidence disable trigger skill_evidence_immutable");
    await client.query("delete from public.skill_evidence where user_id = $1", [uid]);
    await client.query("alter table public.skill_evidence enable trigger skill_evidence_immutable");
    await client.query("delete from auth.users where id = $1", [uid]);
    await client.end();
    console.log("\n  cleaned up the test account");
  }
}

console.log(failures === 0 ? "\nThe loop turns end to end." : `\n${failures} check(s) FAILED.`);
process.exit(failures === 0 ? 0 : 1);
