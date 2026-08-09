import "server-only";

import { redirect } from "next/navigation";

import { createClient } from "@/lib/supabase/server";
import type { Database } from "@/lib/supabase/database.types";

type Profile = Database["public"]["Tables"]["profiles"]["Row"];
type CareerProfile = Database["public"]["Tables"]["career_profiles"]["Row"];

export async function getUser() {
  const supabase = await createClient();
  const {
    data: { user },
  } = await supabase.auth.getUser();
  return user;
}

/**
 * Every authenticated page starts here. `proxy.ts` already redirects signed-out
 * users, but this makes the guarantee local to the page rather than relying on
 * a matcher pattern staying correct forever.
 */
export async function requireUser() {
  const user = await getUser();
  if (!user) redirect("/sign-in");
  return user;
}

export interface SessionContext {
  userId: string;
  email: string | null;
  profile: Profile | null;
  career: CareerProfile | null;
}

export async function getSessionContext(): Promise<SessionContext | null> {
  const supabase = await createClient();
  const {
    data: { user },
  } = await supabase.auth.getUser();
  if (!user) return null;

  const [{ data: profile }, { data: career }] = await Promise.all([
    supabase.from("profiles").select("*").eq("id", user.id).maybeSingle(),
    supabase.from("career_profiles").select("*").eq("user_id", user.id).maybeSingle(),
  ]);

  return {
    userId: user.id,
    email: user.email ?? null,
    profile: profile ?? null,
    career: career ?? null,
  };
}

export async function requireSessionContext(): Promise<SessionContext> {
  const ctx = await getSessionContext();
  if (!ctx) redirect("/sign-in");
  return ctx;
}

/**
 * Send anyone who hasn't finished onboarding back to it — a user with no role
 * track has no roadmap, and every product surface would be empty.
 */
export async function requireOnboarded(): Promise<SessionContext> {
  const ctx = await requireSessionContext();
  if (!ctx.career?.onboarding_completed_at) redirect("/onboarding");
  return ctx;
}

/**
 * Admin gate. RLS is the real boundary — this only decides what to render, so
 * a bypass here leaks nothing.
 */
export async function requireAdmin(): Promise<SessionContext> {
  const ctx = await requireSessionContext();
  if (ctx.profile?.role !== "admin" && ctx.profile?.role !== "super_admin") {
    redirect("/today");
  }
  return ctx;
}
