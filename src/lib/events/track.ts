import "server-only";

import { createClient } from "@/lib/supabase/server";

/**
 * Product analytics events (§40). Append-only, and the *only* source admin
 * dashboards read — which is what keeps private notebooks out of analytics by
 * construction rather than by discipline.
 */
export const EVENT_NAMES = [
  "onboarding_started",
  "onboarding_completed",
  "calibration_completed",
  "roadmap_generated",
  "daily_plan_generated",
  "study_session_started",
  "study_session_completed",
  "topic_completed",
  "explanation_submitted",
  "question_answered",
  "coding_problem_solved",
  "research_started",
  "research_completed",
  "revision_reviewed",
  "weakness_opened",
  "weakness_resolved",
  "mock_interview_completed",
  "interview_logged",
  "job_description_analyzed",
  "application_created",
  "boss_battle_completed",
  "achievement_unlocked",
  "level_up",
] as const;

export type EventName = (typeof EVENT_NAMES)[number];

/**
 * Never let analytics break a user action: a failed insert is logged and
 * swallowed. Losing an event is acceptable; losing someone's completed mission
 * because the events table was busy is not.
 */
export async function track(
  name: EventName,
  payload: Record<string, unknown> = {},
): Promise<void> {
  try {
    const supabase = await createClient();
    const {
      data: { user },
    } = await supabase.auth.getUser();
    if (!user) return;

    await supabase.from("user_events").insert({
      user_id: user.id,
      name,
      payload: payload as never,
    });
  } catch (error) {
    console.error(`[events] failed to record ${name}`, error);
  }
}
