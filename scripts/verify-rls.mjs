/**
 * Proves INVARIANT #7 against the live database: an admin JWT reads ZERO rows
 * from every `owner_only` table.
 *
 *   node scripts/verify-rls.mjs
 *
 * Creates two throwaway auth users, exercises the policies as each of them
 * with real JWTs (not the service role, which bypasses RLS by design), then
 * deletes them. Safe to re-run.
 *
 * This is the check that turns the privacy boundary from a design claim into
 * a verified property. A failure here is a release blocker.
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

const url = process.env.NEXT_PUBLIC_SUPABASE_URL;
const anonKey = process.env.NEXT_PUBLIC_SUPABASE_ANON_KEY;
const serviceKey = process.env.SUPABASE_SERVICE_ROLE_KEY;

if (!url || !anonKey || !serviceKey) {
  console.error("Set NEXT_PUBLIC_SUPABASE_URL, NEXT_PUBLIC_SUPABASE_ANON_KEY, SUPABASE_SERVICE_ROLE_KEY.");
  process.exit(1);
}

const admin = createClient(url, serviceKey, { auth: { persistSession: false } });
const stamp = Date.now();
const PASSWORD = `Test-${stamp}-aA1!`;
const created = [];

let failures = 0;
const pass = (m) => console.log(`  ok    ${m}`);
const fail = (m) => {
  failures++;
  console.log(`  FAIL  ${m}`);
};

async function makeUser(tag) {
  const email = `engforge-rls-${tag}-${stamp}@example.com`;
  const { data, error } = await admin.auth.admin.createUser({
    email,
    password: PASSWORD,
    email_confirm: true,
  });
  if (error) throw new Error(`could not create ${tag}: ${error.message}`);
  created.push(data.user.id);

  const client = createClient(url, anonKey, { auth: { persistSession: false } });
  const { error: signInError } = await client.auth.signInWithPassword({ email, password: PASSWORD });
  if (signInError) throw new Error(`could not sign in ${tag}: ${signInError.message}`);
  return { id: data.user.id, client };
}

async function cleanup() {
  for (const id of created) {
    await admin.auth.admin.deleteUser(id).catch(() => {});
  }
}

try {
  console.log("Creating throwaway users…");
  const learner = await makeUser("learner");
  const other = await makeUser("other");
  const adminUser = await makeUser("admin");

  const { error: roleError } = await admin
    .from("profiles")
    .update({ role: "admin" })
    .eq("id", adminUser.id);
  if (roleError) throw new Error(`could not promote admin: ${roleError.message}`);

  // ── The trigger should have provisioned every per-user row ──────────────
  console.log("\nProvisioning trigger");
  for (const t of ["profiles", "user_settings", "career_profiles"]) {
    const { count } = await admin
      .from(t)
      .select("*", { count: "exact", head: true })
      .eq(t === "profiles" ? "id" : "user_id", learner.id);
    if (count === 1) pass(`${t} row created on signup`);
    else fail(`${t} expected 1 row, got ${count}`);
  }

  // ── Private content owned by the learner ───────────────────────────────
  console.log("\nowner_only tables");
  const { data: note, error: noteError } = await learner.client
    .from("research_notes")
    .insert({
      user_id: learner.id,
      kind: "notebook",
      title: "Why is this query slow?",
      question_md: "Missing composite index?",
      conclusion_md: "It was a sequential scan.",
    })
    .select("id")
    .single();

  if (noteError) {
    fail(`learner could not create their own note: ${noteError.message}`);
  } else {
    pass("learner can create a private note");

    const { data: own } = await learner.client.from("research_notes").select("id");
    if (own?.length === 1) pass("learner reads their own note");
    else fail("learner cannot read their own note");

    const { data: adminSees } = await adminUser.client.from("research_notes").select("id");
    if ((adminSees?.length ?? 0) === 0) pass("INVARIANT #7 — admin reads 0 research_notes");
    else fail(`PRIVACY VIOLATION — admin read ${adminSees.length} research_notes`);

    const { data: otherSees } = await other.client.from("research_notes").select("id");
    if ((otherSees?.length ?? 0) === 0) pass("another user reads 0 research_notes");
    else fail(`PRIVACY VIOLATION — another user read ${otherSees.length} notes`);

    await learner.client.from("research_notes").delete().eq("id", note.id);
  }

  // ── Append-only evidence ledger ────────────────────────────────────────
  console.log("\nAppend-only evidence");
  const { data: skill } = await admin.from("skills").select("id").limit(1).maybeSingle();
  if (!skill) {
    console.log("  skip  no seeded skills — run the seeds first");
  } else {
    const { data: evidenceId, error: rpcError } = await learner.client.rpc("record_evidence", {
      p_skill: skill.id,
      p_source_type: "mcq",
      p_source_id: null,
      p_difficulty: 3,
      p_correctness: 1,
    });

    if (rpcError) {
      fail(`record_evidence failed: ${rpcError.message}`);
    } else {
      pass("record_evidence writes a ledger row");

      const { data: us } = await learner.client
        .from("user_skills")
        .select("mastery, confidence, evidence_count")
        .eq("skill_id", skill.id)
        .maybeSingle();
      if (us?.evidence_count === 1) pass(`mastery recomputed atomically (mastery ${us.mastery}, confidence ${us.confidence})`);
      else fail("user_skills was not recomputed by record_evidence");

      // Two independent layers protect the ledger, and they fail differently.
      //
      // RLS first: the learner has SELECT and INSERT policies but no UPDATE
      // policy, so their update matches zero rows and returns NO error. An
      // error check alone would mis-read that silence as a violation — assert
      // the value is unchanged instead.
      await learner.client.from("skill_evidence").update({ correctness: 0 }).eq("id", evidenceId);
      const { data: afterRls } = await learner.client
        .from("skill_evidence")
        .select("correctness")
        .eq("id", evidenceId)
        .maybeSingle();
      if (Number(afterRls?.correctness) === 1) pass("RLS blocks a user from updating the ledger (0 rows matched)");
      else fail(`MUTABILITY VIOLATION — correctness is now ${afterRls?.correctness}`);

      // Then the trigger, tested with the service role so RLS is out of the
      // way and the append-only guard is what has to stop it.
      const { error: triggerError } = await admin
        .from("skill_evidence")
        .update({ correctness: 0 })
        .eq("id", evidenceId);
      if (/append-only/i.test(triggerError?.message ?? "")) pass("append-only trigger rejects UPDATE even for the service role");
      else fail(`MUTABILITY VIOLATION — service role UPDATE returned: ${triggerError?.message ?? "no error"}`);
    }
  }

  // ── XP idempotency ─────────────────────────────────────────────────────
  console.log("\nXP idempotency");
  const sourceId = crypto.randomUUID();
  const row = {
    user_id: learner.id,
    amount: 40,
    source_type: "coding_problem_solved",
    source_id: sourceId,
  };
  const first = await learner.client.from("xp_transactions").insert(row);
  const second = await learner.client.from("xp_transactions").insert(row);

  if (first.error) {
    fail(`first XP award failed: ${first.error.message}`);
  } else if (!second.error) {
    fail("IDEMPOTENCY VIOLATION — XP awarded twice for one source");
  } else {
    pass("duplicate XP award rejected by the unique index");
  }

  // ── Role escalation ────────────────────────────────────────────────────
  console.log("\nRole escalation");
  await learner.client.from("profiles").update({ role: "admin" }).eq("id", learner.id);
  const { data: after } = await admin
    .from("profiles")
    .select("role")
    .eq("id", learner.id)
    .maybeSingle();
  if (after?.role === "user") pass("a user cannot promote themselves to admin");
  else fail(`ESCALATION — learner role is now "${after?.role}"`);
} catch (error) {
  failures++;
  console.error(`\nAborted: ${error.message}`);
} finally {
  console.log("\nCleaning up…");
  await cleanup();
}

console.log(failures === 0 ? "\nAll RLS checks passed." : `\n${failures} check(s) FAILED.`);
process.exit(failures === 0 ? 0 : 1);
