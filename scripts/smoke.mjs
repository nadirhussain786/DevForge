/**
 * Signs in for real and fetches every authenticated page, failing on any 5xx
 * or on error text in the HTML.
 *
 *   pnpm dev            # in one shell
 *   pnpm smoke          # in another
 *   BASE_URL=http://localhost:3001 pnpm smoke
 *
 * Type-checking proves a page compiles. This proves it renders against the
 * real database — a different and much more useful claim.
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

const BASE = process.env.BASE_URL ?? "http://localhost:3000";
const url = process.env.NEXT_PUBLIC_SUPABASE_URL;
const anonKey = process.env.NEXT_PUBLIC_SUPABASE_ANON_KEY;
const serviceKey = process.env.SUPABASE_SERVICE_ROLE_KEY;

const email = process.argv[2] ?? `smoke-${Date.now()}@example.com`;
const password = process.argv[3] ?? `Smoke-${Date.now()}-aA1!`;
const ephemeral = !process.argv[2];

const admin = createClient(url, serviceKey, { auth: { persistSession: false } });
let createdId = null;

if (ephemeral) {
  const { data, error } = await admin.auth.admin.createUser({
    email,
    password,
    email_confirm: true,
  });
  if (error) {
    console.error(`Could not create the smoke user: ${error.message}`);
    process.exit(1);
  }
  createdId = data.user.id;
}

const client = createClient(url, anonKey, { auth: { persistSession: false } });
const { data: signIn, error: signInError } = await client.auth.signInWithPassword({
  email,
  password,
});

if (signInError) {
  console.error(`Sign-in failed: ${signInError.message}`);
  process.exit(1);
}

/**
 * @supabase/ssr stores the session as `base64-<base64 json>` under
 * `sb-<project-ref>-auth-token`, splitting into `.0`, `.1`, … chunks once the
 * value grows past ~3180 chars. Reproduce that exactly, or the server reads a
 * malformed cookie and treats the request as signed out.
 */
function sessionCookies(session) {
  const ref = new URL(url).hostname.split(".")[0];
  const name = `sb-${ref}-auth-token`;
  const value = `base64-${Buffer.from(JSON.stringify(session)).toString("base64")}`;
  const CHUNK = 3180;

  if (value.length <= CHUNK) return [`${name}=${value}`];

  const chunks = [];
  for (let i = 0; i * CHUNK < value.length; i++) {
    chunks.push(`${name}.${i}=${value.slice(i * CHUNK, (i + 1) * CHUNK)}`);
  }
  return chunks;
}

const cookie = sessionCookies(signIn.session).join("; ");

const ROUTES = [
  "/",
  "/today",
  "/roadmap",
  "/learn",
  "/arena",
  "/review",
  "/notebook",
  "/skills",
  "/career",
  "/onboarding",
];

const ADMIN_ROUTES = ["/admin", "/admin/users", "/admin/insights"];

let failures = 0;

async function check(route, { expectAuthed = true } = {}) {
  let response;
  try {
    response = await fetch(`${BASE}${route}`, { headers: { cookie }, redirect: "manual" });
  } catch (error) {
    console.log(`  FAIL  ${route.padEnd(18)} ${error.message}`);
    failures++;
    return;
  }

  const status = response.status;

  if (status >= 500) {
    const body = await response.text();
    const hint = body.match(/<h2[^>]*>([^<]{0,120})/)?.[1] ?? body.slice(0, 120);
    console.log(`  FAIL  ${route.padEnd(18)} ${status} — ${hint.trim()}`);
    failures++;
    return;
  }

  if (expectAuthed && (status === 307 || status === 302)) {
    const to = response.headers.get("location") ?? "?";

    // Two redirects are correct rather than broken, and which one you get
    // depends on where the account is: an un-onboarded user is sent to
    // /onboarding from everywhere, and an onboarded one is sent away from
    // /onboarding to /today.
    if (to.includes("/onboarding") || (route === "/onboarding" && to.includes("/today"))) {
      console.log(`  ok    ${route.padEnd(18)} ${status} -> ${to} (expected)`);
      return;
    }
    console.log(`  FAIL  ${route.padEnd(18)} ${status} -> ${to} (session not recognised)`);
    failures++;
    return;
  }

  const body = await response.text();
  if (/Application error|Internal Server Error|Unhandled Runtime Error/i.test(body)) {
    console.log(`  FAIL  ${route.padEnd(18)} ${status} but rendered an error page`);
    failures++;
    return;
  }

  console.log(`  ok    ${route.padEnd(18)} ${status} (${(body.length / 1024).toFixed(0)}kb)`);
}

console.log(`\nSmoke testing ${BASE} as ${email}\n`);
for (const route of ROUTES) await check(route);

console.log("\nAdmin routes (expect a redirect for a non-admin):");
for (const route of ADMIN_ROUTES) await check(route, { expectAuthed: false });

if (createdId) {
  await admin.auth.admin.deleteUser(createdId).catch(() => {});
  console.log("\n  cleaned up the smoke user");
}

console.log(failures === 0 ? "\nAll pages rendered." : `\n${failures} route(s) FAILED.`);
process.exit(failures === 0 ? 0 : 1);
