"use server";

import { redirect } from "next/navigation";

import { MAX_PRIOR_MASTERY } from "@/features/mastery/domain/mastery";
import { generateAndPersistRoadmap, generateDailyPlan } from "@/features/roadmap/data/generate";
import { todayIso } from "@/features/roadmap/data/today";
import { requireUser } from "@/lib/auth/session";
import { track } from "@/lib/events/track";
import { createClient } from "@/lib/supabase/server";

import { onboardingSchema } from "./schema";

export interface OnboardingState {
  error?: string;
}

export async function completeOnboarding(
  _prev: OnboardingState,
  formData: FormData,
): Promise<OnboardingState> {
  const user = await requireUser();

  const parsed = onboardingSchema.safeParse({
    roleTrackSlug: formData.get("roleTrackSlug"),
    experienceLevel: formData.get("experienceLevel"),
    targetMarkets: formData.getAll("targetMarkets"),
    companies: formData.getAll("companies"),
    dailyMinutes: formData.get("dailyMinutes"),
    studyDays: formData.getAll("studyDays"),
    knownSkillSlugs: formData.getAll("knownSkillSlugs"),
    startDate: formData.get("startDate"),
    weeks: formData.get("weeks") ?? 8,
  });

  if (!parsed.success) {
    return { error: parsed.error.issues[0]?.message ?? "Please check your answers" };
  }

  const input = parsed.data;
  const supabase = await createClient();

  const { data: track_ } = await supabase
    .from("role_tracks")
    .select("id")
    .eq("slug", input.roleTrackSlug)
    .maybeSingle();

  if (!track_) return { error: "That role track no longer exists." };

  const { error: profileError } = await supabase
    .from("career_profiles")
    .update({
      role_track_id: track_.id,
      experience_level: input.experienceLevel,
      target_markets: input.targetMarkets,
      daily_minutes: input.dailyMinutes,
      study_days: input.studyDays,
      start_date: input.startDate,
      weeks: input.weeks,
      phase: "phase1",
      phase_started_at: new Date().toISOString(),
      onboarding_completed_at: new Date().toISOString(),
    })
    .eq("user_id", user.id);

  if (profileError) return { error: profileError.message };

  // Self-reported skills become mastery *priors*, capped at 35 — claiming you
  // know React starts you at "Familiar" and no higher. Evidence moves you up.
  if (input.knownSkillSlugs.length > 0) {
    const { data: known } = await supabase
      .from("skills")
      .select("id")
      .in("slug", input.knownSkillSlugs);

    if (known?.length) {
      await supabase.from("user_skills").upsert(
        known.map((s) => ({
          user_id: user.id,
          skill_id: s.id,
          prior_mastery: MAX_PRIOR_MASTERY,
          mastery: MAX_PRIOR_MASTERY,
          rank: "familiar" as const,
        })),
        { onConflict: "user_id,skill_id" },
      );
    }
  }

  if (input.companies.length > 0) {
    await upsertTargetCompanies(user.id, input.companies);
  }

  await supabase.from("streaks").upsert({ user_id: user.id }, { onConflict: "user_id" });

  await track("onboarding_completed", {
    roleTrack: input.roleTrackSlug,
    dailyMinutes: input.dailyMinutes,
    weeks: input.weeks,
  });

  try {
    await generateAndPersistRoadmap({
      userId: user.id,
      roleTrackId: track_.id,
      startDate: input.startDate,
      weeks: input.weeks,
      dailyMinutes: input.dailyMinutes,
      studyDays: input.studyDays,
    });
    await track("roadmap_generated", { roleTrack: input.roleTrackSlug });

    await generateDailyPlan(user.id, todayIso());
    await track("daily_plan_generated", { source: "onboarding" });
  } catch (error) {
    // Onboarding itself succeeded — don't strand the user on a form because
    // the content library is thin. /today explains the empty state instead.
    console.error("[onboarding] roadmap generation failed", error);
  }

  redirect("/today");
}

async function upsertTargetCompanies(userId: string, names: string[]) {
  const supabase = await createClient();

  for (const name of names.slice(0, 20)) {
    const slug = name.toLowerCase().replace(/[^a-z0-9]+/g, "-").replace(/(^-|-$)/g, "");
    if (!slug) continue;

    const { data: existing } = await supabase
      .from("companies")
      .select("id")
      .eq("slug", slug)
      .maybeSingle();

    let companyId = existing?.id;

    if (!companyId) {
      const { data: created } = await supabase
        .from("companies")
        .insert({ slug, name, created_by: userId, is_public: false })
        .select("id")
        .single();
      companyId = created?.id;
    }

    if (companyId) {
      await supabase
        .from("target_companies")
        .upsert({ user_id: userId, company_id: companyId }, { onConflict: "user_id,company_id" });
    }
  }
}
