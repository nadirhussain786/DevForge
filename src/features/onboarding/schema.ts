import { z } from "zod";

/** One schema, shared by the wizard form and the server action (§ validation at every boundary). */
export const onboardingSchema = z.object({
  roleTrackSlug: z.string().min(1, "Pick a target role"),
  experienceLevel: z.enum(["beginner", "junior", "mid", "senior", "staff", "transition"]),
  targetMarkets: z.array(z.string()).min(1, "Pick at least one market"),
  companies: z.array(z.string().trim().min(1)).max(20).default([]),
  dailyMinutes: z.coerce.number().int().min(15).max(240),
  studyDays: z.array(z.coerce.number().int().min(0).max(6)).min(1, "Pick at least one study day"),
  /** Self-reported skills → mastery priors, capped at 35 by the domain model. */
  knownSkillSlugs: z.array(z.string()).default([]),
  startDate: z.string().regex(/^\d{4}-\d{2}-\d{2}$/, "Invalid date"),
  weeks: z.coerce.number().int().min(2).max(52).default(8),
});

export type OnboardingInput = z.infer<typeof onboardingSchema>;

export const EXPERIENCE_LEVELS = [
  { value: "beginner", label: "Beginner", hint: "New to engineering" },
  { value: "junior", label: "Junior", hint: "0–2 years" },
  { value: "mid", label: "Mid-level", hint: "2–5 years" },
  { value: "senior", label: "Senior", hint: "5+ years" },
  { value: "staff", label: "Staff+", hint: "Broad technical leadership" },
  { value: "transition", label: "Career transition", hint: "Moving into engineering" },
] as const;

export const MARKETS = [
  { value: "us", label: "United States" },
  { value: "uk", label: "United Kingdom" },
  { value: "eu", label: "European Union" },
  { value: "ca", label: "Canada" },
  { value: "au", label: "Australia" },
  { value: "remote", label: "Remote / International" },
] as const;

export const DAILY_MINUTE_OPTIONS = [15, 30, 45, 60, 90, 120] as const;

export const WEEKDAYS = [
  { value: 1, label: "Mon" },
  { value: 2, label: "Tue" },
  { value: 3, label: "Wed" },
  { value: 4, label: "Thu" },
  { value: 5, label: "Fri" },
  { value: 6, label: "Sat" },
  { value: 0, label: "Sun" },
] as const;
