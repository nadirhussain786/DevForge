/**
 * Applies EngForge migrations (and optionally seeds) over a direct Postgres
 * connection — the path to use when the Supabase CLI isn't linked.
 *
 *   node scripts/db-migrate.mjs           # migrations only
 *   node scripts/db-migrate.mjs --seed    # migrations, then seeds
 *   node scripts/db-migrate.mjs --dry-run # list what would run
 *
 * Requires SUPABASE_DB_URL in .env — Supabase dashboard → Project Settings →
 * Database → Connection string → URI (the "Session pooler" string works, and
 * is the right one from most networks because it resolves over IPv4).
 *
 * Each file runs inside a transaction and is recorded in
 * `public.schema_migrations`, so re-running is a no-op for anything already
 * applied and a partial failure never leaves half a migration behind.
 */

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

const connectionString = process.env.SUPABASE_DB_URL ?? process.env.DATABASE_URL;
if (!connectionString) {
  console.error(
    [
      "SUPABASE_DB_URL is not set.",
      "",
      "Supabase dashboard → Project Settings → Database → Connection string → URI,",
      "then add it to .env as:",
      "",
      "  SUPABASE_DB_URL=postgresql://postgres.<ref>:<password>@aws-0-<region>.pooler.supabase.com:5432/postgres",
      "",
      "This is a different credential from the service-role key — that one speaks",
      "PostgREST and cannot run DDL.",
    ].join("\n"),
  );
  process.exit(1);
}

const seed = process.argv.includes("--seed");
const dryRun = process.argv.includes("--dry-run");

function filesIn(dir) {
  const full = path.resolve(process.cwd(), dir);
  if (!fs.existsSync(full)) return [];
  return fs
    .readdirSync(full)
    .filter((f) => f.endsWith(".sql"))
    .sort()
    .map((f) => ({ name: `${dir}/${f}`, sql: fs.readFileSync(path.join(full, f), "utf8") }));
}

const planned = [...filesIn("supabase/migrations"), ...(seed ? filesIn("supabase/seed") : [])];

if (planned.length === 0) {
  console.error("No .sql files found under supabase/.");
  process.exit(1);
}

if (dryRun) {
  console.log("Would run, in order:");
  for (const f of planned) console.log(`  ${f.name}`);
  process.exit(0);
}

const client = new pg.Client({
  connectionString,
  ssl: { rejectUnauthorized: false },
  // Migrations create ~60 tables and a dozen functions; the default statement
  // timeout on a pooled connection is far too short for that.
  statement_timeout: 300_000,
});

await client.connect();
console.log(`Connected. Applying ${planned.length} file(s).\n`);

await client.query(`
  create table if not exists public.schema_migrations (
    name text primary key,
    applied_at timestamptz not null default now()
  );
`);

const { rows: done } = await client.query("select name from public.schema_migrations");
const applied = new Set(done.map((r) => r.name));

let ran = 0;
let failed = null;

for (const file of planned) {
  // Seeds are idempotent by design and may legitimately need re-running when
  // content changes; migrations run exactly once.
  const isSeed = file.name.includes("/seed/");
  if (applied.has(file.name) && !isSeed) {
    console.log(`  skip   ${file.name} (already applied)`);
    continue;
  }

  process.stdout.write(`  apply  ${file.name} … `);
  try {
    await client.query("begin");
    await client.query(file.sql);
    await client.query(
      `insert into public.schema_migrations (name) values ($1)
       on conflict (name) do update set applied_at = now()`,
      [file.name],
    );
    await client.query("commit");
    console.log("ok");
    ran++;
  } catch (error) {
    await client.query("rollback").catch(() => {});
    console.log("FAILED");
    console.error(`\n${file.name}\n  ${error.message}`);
    if (error.position) {
      const upto = file.sql.slice(0, Number(error.position));
      console.error(`  at line ${upto.split("\n").length}`);
    }
    failed = file.name;
    break;
  }
}

await client.end();

if (failed) {
  console.error(`\nStopped at ${failed}. Nothing from that file was applied.`);
  process.exit(1);
}

console.log(`\n${ran} file(s) applied.`);
if (!seed) console.log("Run again with --seed to load the taxonomy and sample content.");
