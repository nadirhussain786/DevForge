import { cookies } from "next/headers";
import { createServerClient } from "@supabase/ssr";

import type { Database } from "./database.types";

/**
 * Server-side Supabase client bound to the request's cookie session.
 *
 * Still the anon key — RLS remains the security boundary on the server exactly
 * as it is in the browser. Use `createAdminClient` only for cron and admin
 * jobs that must bypass RLS deliberately.
 */
export async function createClient() {
  const cookieStore = await cookies();

  return createServerClient<Database>(
    process.env.NEXT_PUBLIC_SUPABASE_URL!,
    process.env.NEXT_PUBLIC_SUPABASE_ANON_KEY!,
    {
      cookies: {
        getAll() {
          return cookieStore.getAll();
        },
        setAll(cookiesToSet) {
          try {
            for (const { name, value, options } of cookiesToSet) {
              cookieStore.set(name, value, options);
            }
          } catch {
            // Called from a Server Component, where cookies are read-only.
            // Session refresh is handled in proxy.ts, so this is safe to skip.
          }
        },
      },
    },
  );
}
