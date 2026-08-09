/**
 * Reports which parts of the EngForge schema are present in the linked
 * Supabase project, and how much content is seeded.
 *
 *   node scripts/db-probe.mjs
 *
 * Read-only. Uses the service-role key, so run it from a trusted shell only.
 */

import { createClient } from "@supabase/supabase-js";
import fs from "node:fs";
import path from "node:path";

function loadEnv() {
  for (const file of [".env.local", ".env"]) {
    const full = path.resolve(process.cwd(), file);
    if (!fs.existsSync(full)) continue;
    // Split on \r?\n, not \n. A trailing \r survives a plain \n split, and
    // JS `.` does not match \r — so `(.*)$` fails on every line of a CRLF
    // file and the whole env silently parses as empty.
    const raw = fs.readFileSync(full, "utf8").replace(/^﻿/, "");
    for (const line of raw.split(/\r?\n/)) {
      const m = line.match(/^\s*([A-Za-z0-9_]+)\s*=\s*(.*)$/);
      if (m && !process.env[m[1]]) process.env[m[1]] = m[2].trim();
    }
  }
}

loadEnv();

const url = process.env.NEXT_PUBLIC_SUPABASE_URL;
const key = process.env.SUPABASE_SERVICE_ROLE_KEY;

if (!url || !key) {
  console.error("NEXT_PUBLIC_SUPABASE_URL and SUPABASE_SERVICE_ROLE_KEY must be set.");
  process.exit(1);
}

const db = createClient(url, key, { auth: { persistSession: false } });

/** Grouped by the migration that creates them, so gaps point at a migration. */
const GROUPS = {
  "0002 identity": ["profiles", "user_settings", "career_profiles", "companies"],
  "0003 taxonomy": ["domains", "skills", "skill_prerequisites", "role_tracks", "role_track_skills"],
  "0004 content": ["topics", "topic_contents", "questions", "coding_problems"],
  "0005 roadmap": ["roadmaps", "roadmap_weeks", "roadmap_items", "daily_plans", "daily_plan_items"],
  "0006 evidence": ["skill_evidence", "user_skills", "question_attempts", "explanations"],
  "0007 gamification": ["xp_transactions", "user_progress", "streaks", "achievements"],
  "0008 weakness": ["weaknesses", "revision_items", "research_tasks"],
  "0009 notebook": ["research_notes", "note_links"],
  "0010 interviews": ["mock_interviews", "interview_records"],
  "0011 career": ["job_descriptions", "jd_requirements", "applications"],
  "0012 arena": ["system_design_cases", "boss_battles", "incident_scenarios", "projects"],
  "0013 platform": ["user_events", "notifications", "admin_audit_logs", "ai_usage"],
};

let present = 0;
let absent = 0;

for (const [group, tables] of Object.entries(GROUPS)) {
  const results = await Promise.all(
    tables.map(async (t) => {
      // A `head: true` count request returns 204 with a null count and NO
      // error for a table that does not exist — which reads as "present, 0
      // rows". Always issue a real select so a missing table surfaces as
      // PGRST205 instead of a false positive.
      // Select `*`, not `id` — several tables have composite primary keys and
      // no `id` column, and asking for one reports them as absent.
      const { data, error } = await db.from(t).select("*").limit(1);
      if (error) return { t, error };

      const { count } = await db.from(t).select("*", { count: "exact", head: true });
      return { t, count: count ?? data.length, error: null };
    }),
  );

  const missing = results.filter((r) => r.error);
  present += results.length - missing.length;
  absent += missing.length;

  const status = missing.length === 0 ? "ok" : `${missing.length} missing`;
  console.log(`\n${group.padEnd(20)} ${status}`);
  for (const r of results) {
    console.log(`  ${r.t.padEnd(22)} ${r.error ? "— absent" : `${r.count} rows`}`);
  }
}

console.log(
  `\n${present} tables present, ${absent} absent.` +
    (absent > 0 ? "\nRun the migrations in supabase/migrations/ in order — see docs/08-setup.md." : ""),
);
