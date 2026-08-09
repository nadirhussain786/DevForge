import type { Metadata } from "next";
import { redirect } from "next/navigation";

import { OnboardingWizard } from "@/features/onboarding/ui/wizard";
import { requireSessionContext } from "@/lib/auth/session";
import { createClient } from "@/lib/supabase/server";

export const metadata: Metadata = { title: "Set up your roadmap · EngForge" };

export default async function OnboardingPage() {
  const ctx = await requireSessionContext();
  if (ctx.career?.onboarding_completed_at) redirect("/today");

  const supabase = await createClient();

  const [{ data: roleTracks }, { data: skills }] = await Promise.all([
    supabase
      .from("role_tracks")
      .select("slug, name, description")
      .eq("status", "published")
      .order("sort_order"),
    // A shortlist for self-report — the full graph is hundreds of skills and
    // asking about all of them would be its own abandonment cliff.
    supabase
      .from("skills")
      .select("slug, name, sort_order")
      .eq("status", "published")
      .order("sort_order")
      .limit(24),
  ]);

  if (!roleTracks?.length) {
    return (
      <div className="mx-auto max-w-xl px-4 py-16">
        <h1 className="text-xl font-semibold">The skill library hasn&apos;t been seeded yet</h1>
        <p className="mt-2 text-[13px] text-[var(--text-muted)]">
          Run the migrations and seed in <code className="metric">supabase/</code>, then reload.
          Onboarding needs at least one published role track to generate a roadmap.
        </p>
      </div>
    );
  }

  return (
    <OnboardingWizard
      roleTracks={roleTracks}
      skills={skills ?? []}
      defaultStartDate={new Date().toISOString().slice(0, 10)}
    />
  );
}
