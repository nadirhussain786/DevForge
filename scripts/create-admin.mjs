/**
 * Creates (or promotes) an EngForge admin account.
 *
 *   node scripts/create-admin.mjs <email> [password] [--role super_admin|admin]
 *   pnpm db:admin you@example.com
 *
 * Roles are deliberately NOT self-assignable — the RLS policy on `profiles`
 * blocks a user from changing their own `role`, so the first admin has to be
 * created out-of-band with the service-role key. That's this script.
 *
 * If the account already exists it is promoted in place and its password is
 * left alone (pass a password explicitly to reset it).
 */

import { createClient } from "@supabase/supabase-js";
import crypto from "node:crypto";
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
const serviceKey = process.env.SUPABASE_SERVICE_ROLE_KEY;

if (!url || !serviceKey) {
  console.error("NEXT_PUBLIC_SUPABASE_URL and SUPABASE_SERVICE_ROLE_KEY must be set in .env");
  process.exit(1);
}

const args = process.argv.slice(2).filter((a) => !a.startsWith("--"));
const roleFlag = process.argv.indexOf("--role");
const role = roleFlag > -1 ? process.argv[roleFlag + 1] : "super_admin";

const email = args[0];
if (!email || !email.includes("@")) {
  console.error("Usage: node scripts/create-admin.mjs <email> [password] [--role super_admin|admin]");
  process.exit(1);
}

if (!["admin", "super_admin"].includes(role)) {
  console.error(`Invalid role "${role}". Use admin or super_admin.`);
  process.exit(1);
}

/** Strong by default so nobody ships a guessable owner account. */
function generatePassword() {
  const alphabet = "ABCDEFGHJKLMNPQRSTUVWXYZabcdefghijkmnopqrstuvwxyz23456789";
  const symbols = "!@#$%^&*-_=+";
  const pick = (set, n) =>
    Array.from({ length: n }, () => set[crypto.randomInt(0, set.length)]).join("");
  // Shuffle so the symbol block isn't always in the same position.
  return pick(alphabet + symbols, 24)
    .split("")
    .sort(() => crypto.randomInt(0, 2) - 0.5)
    .join("");
}

const providedPassword = args[1];
const password = providedPassword ?? generatePassword();

const admin = createClient(url, serviceKey, { auth: { persistSession: false } });

// The Admin API has no get-by-email, so page through until we find it.
async function findByEmail(target) {
  for (let page = 1; page <= 20; page++) {
    const { data, error } = await admin.auth.admin.listUsers({ page, perPage: 200 });
    if (error) throw new Error(error.message);
    const hit = data.users.find((u) => u.email?.toLowerCase() === target.toLowerCase());
    if (hit) return hit;
    if (data.users.length < 200) return null;
  }
  return null;
}

try {
  let user = await findByEmail(email);
  let created = false;

  if (user) {
    if (providedPassword) {
      const { error } = await admin.auth.admin.updateUserById(user.id, { password });
      if (error) throw new Error(`could not reset password: ${error.message}`);
    }
  } else {
    const { data, error } = await admin.auth.admin.createUser({
      email,
      password,
      email_confirm: true,
    });
    if (error) throw new Error(`could not create user: ${error.message}`);
    user = data.user;
    created = true;
  }

  // The signup trigger creates the profile row; wait for it rather than
  // assuming, since createUser returns before the trigger is visible via
  // PostgREST on a cold connection.
  let profile = null;
  for (let i = 0; i < 10 && !profile; i++) {
    const { data } = await admin.from("profiles").select("id").eq("id", user.id).maybeSingle();
    profile = data;
    if (!profile) await new Promise((r) => setTimeout(r, 300));
  }
  if (!profile) throw new Error("profile row was never created — is migration 0002 applied?");

  const { error: roleError } = await admin.from("profiles").update({ role }).eq("id", user.id);
  if (roleError) throw new Error(`could not set role: ${roleError.message}`);

  const { data: check } = await admin
    .from("profiles")
    .select("role, display_name")
    .eq("id", user.id)
    .maybeSingle();

  console.log(`\n${created ? "Created" : "Promoted existing"} account\n`);
  console.log(`  email     ${email}`);
  if (created || providedPassword) console.log(`  password  ${password}`);
  else console.log(`  password  (unchanged — pass one as the 2nd argument to reset)`);
  console.log(`  role      ${check?.role}`);
  console.log(`  user id   ${user.id}`);

  if (created && !providedPassword) {
    console.log(
      "\nThis password is shown once and is not stored anywhere. Save it now,\n" +
        "then change it from the app once you can sign in.",
    );
  }
  // Verify the account actually works, and that being an admin still does not
  // grant access to owner_only content. A promotion that silently broke the
  // privacy boundary would be the worst possible outcome of this script.
  if (created || providedPassword) {
    const anonKey = process.env.NEXT_PUBLIC_SUPABASE_ANON_KEY;
    if (anonKey) {
      console.log("\nVerifying…");
      const asUser = createClient(url, anonKey, { auth: { persistSession: false } });
      const { error: signInError } = await asUser.auth.signInWithPassword({ email, password });

      if (signInError) {
        console.log(`  FAIL  could not sign in: ${signInError.message}`);
      } else {
        console.log("  ok    signs in with these credentials");

        const { data: visible } = await asUser.from("profiles").select("id");
        console.log(`  ok    is_admin() grants profile access (${visible?.length ?? 0} visible)`);

        const { data: notes } = await asUser.from("research_notes").select("id");
        if ((notes?.length ?? 0) === 0) {
          console.log("  ok    still reads 0 research_notes — invariant #7 holds");
        } else {
          console.log(`  FAIL  PRIVACY VIOLATION — admin read ${notes.length} research_notes`);
        }
        await asUser.auth.signOut();
      }
    }
  }

  console.log(`\nSign in at ${process.env.NEXT_PUBLIC_SITE_URL ?? "http://localhost:3000"}/sign-in`);
} catch (error) {
  console.error(`\nFailed: ${error.message}`);
  process.exit(1);
}
