import { createBrowserClient } from "@supabase/ssr";

import type { Database } from "./database.types";

/**
 * Browser-side Supabase client. Runs as the signed-in user against the anon
 * key, so every read is filtered by RLS. There is no code path that lets the
 * browser see another user's rows.
 */
export function createClient() {
  return createBrowserClient<Database>(
    process.env.NEXT_PUBLIC_SUPABASE_URL!,
    process.env.NEXT_PUBLIC_SUPABASE_ANON_KEY!,
  );
}
