import "server-only";

import { createClient as createSupabaseClient } from "@supabase/supabase-js";

import type { Database } from "./database.types";

/**
 * Service-role client. **Bypasses RLS entirely.**
 *
 * Permitted callers, and nothing else:
 *   - /api/cron/*        nightly readiness + momentum snapshots, view refresh
 *   - admin server actions that have already verified `is_admin()`
 *
 * It must never be imported into a Client Component. The `server-only` import
 * above turns a mistake into a build error rather than a data leak.
 *
 * Note this client can read `owner_only` tables at the SQL level, so admin
 * features must not query them — the privacy boundary documented in
 * docs/01-technical-architecture.md §6 is a policy this module cannot enforce.
 */
export function createAdminClient() {
  const key = process.env.SUPABASE_SERVICE_ROLE_KEY;
  if (!key) throw new Error("SUPABASE_SERVICE_ROLE_KEY is not set");

  return createSupabaseClient<Database>(
    process.env.NEXT_PUBLIC_SUPABASE_URL!,
    key,
    { auth: { persistSession: false, autoRefreshToken: false } },
  );
}
