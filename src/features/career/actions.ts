"use server";

import { revalidatePath } from "next/cache";
import { z } from "zod";

import { requireUser } from "@/lib/auth/session";
import { track } from "@/lib/events/track";
import { createClient } from "@/lib/supabase/server";

/** Career Mode (§11, §47, §48) — the application pipeline and Interview Memory. */

const APPLICATION_STATUSES = [
  "saved", "preparing", "applied", "recruiter_screen", "technical_screen",
  "technical_interview", "system_design", "behavioral", "final",
  "offer", "rejected", "withdrawn",
] as const;

async function resolveCompany(name: string | null, userId: string): Promise<string | null> {
  if (!name?.trim()) return null;
  const supabase = await createClient();
  const clean = name.trim();
  const slug = clean.toLowerCase().replace(/[^a-z0-9]+/g, "-").replace(/(^-|-$)/g, "");
  if (!slug) return null;

  const { data: existing } = await supabase
    .from("companies")
    .select("id")
    .eq("slug", slug)
    .maybeSingle();
  if (existing) return existing.id;

  const { data: created } = await supabase
    .from("companies")
    .insert({ slug, name: clean, created_by: userId, is_public: false })
    .select("id")
    .single();
  return created?.id ?? null;
}

// ── Applications ────────────────────────────────────────────────────────────

const applicationSchema = z.object({
  roleTitle: z.string().trim().min(2, "Add the role title").max(200),
  company: z.string().trim().max(120).optional(),
  status: z.enum(APPLICATION_STATUSES).default("saved"),
  nextEventAt: z.string().optional(),
});

export interface ApplicationState {
  error?: string;
  created?: boolean;
}

export async function createApplication(
  _prev: ApplicationState,
  formData: FormData,
): Promise<ApplicationState> {
  const user = await requireUser();

  const parsed = applicationSchema.safeParse({
    roleTitle: formData.get("roleTitle"),
    company: formData.get("company") ?? undefined,
    status: formData.get("status") ?? "saved",
    nextEventAt: formData.get("nextEventAt") || undefined,
  });

  if (!parsed.success) return { error: parsed.error.issues[0]?.message ?? "Check the details" };

  const supabase = await createClient();
  const companyId = await resolveCompany(parsed.data.company ?? null, user.id);

  const { error } = await supabase.from("applications").insert({
    user_id: user.id,
    company_id: companyId,
    role_title: parsed.data.roleTitle,
    status: parsed.data.status,
    applied_at: parsed.data.status === "applied" ? new Date().toISOString().slice(0, 10) : null,
    next_event_at: parsed.data.nextEventAt ? new Date(parsed.data.nextEventAt).toISOString() : null,
  });

  if (error) return { error: "Could not save that application." };

  await track("application_created", { status: parsed.data.status });
  revalidatePath("/career");
  return { created: true };
}

/** Status changes are journalled by a database trigger, so the funnel is derivable. */
export async function advanceApplication(formData: FormData): Promise<void> {
  const user = await requireUser();
  const id = formData.get("id");
  const status = formData.get("status");
  if (typeof id !== "string" || typeof status !== "string") return;
  if (!APPLICATION_STATUSES.includes(status as (typeof APPLICATION_STATUSES)[number])) return;

  const supabase = await createClient();
  await supabase
    .from("applications")
    .update({
      status: status as (typeof APPLICATION_STATUSES)[number],
      applied_at: status === "applied" ? new Date().toISOString().slice(0, 10) : undefined,
    })
    .eq("id", id)
    .eq("user_id", user.id);

  revalidatePath("/career");
}

// ── Interview Memory ────────────────────────────────────────────────────────

const interviewSchema = z.object({
  roleTitle: z.string().trim().min(2, "Add the role title").max(200),
  company: z.string().trim().max(120).optional(),
  stage: z.enum([
    "recruiter", "technical_screen", "technical", "system_design",
    "behavioral", "final", "take_home",
  ]),
  occurredAt: z.string().regex(/^\d{4}-\d{2}-\d{2}$/, "Pick a date"),
  outcome: z.enum(["passed", "failed", "pending", "withdrawn"]).optional(),
  confidence: z.coerce.number().int().min(1).max(5).optional(),
  notes: z.string().max(10_000).optional(),
});

export interface InterviewState {
  error?: string;
  result?: { questionsLogged: number; weaknessesOpened: number };
}

/**
 * Logging a real interview is the highest-leverage thing a user can do here.
 *
 * A real interview question carries weight 2.5 in the mastery model — more
 * than anything the platform can generate — and every `shaky` or `failed`
 * answer opens a weakness at severity 2 or 3. All of that is done by the
 * `ingest_interview_question` trigger, atomically with the insert, so it
 * cannot be skipped by a caller or half-applied on a partial failure.
 */
export async function logInterview(
  _prev: InterviewState,
  formData: FormData,
): Promise<InterviewState> {
  const user = await requireUser();

  const parsed = interviewSchema.safeParse({
    roleTitle: formData.get("roleTitle"),
    company: formData.get("company") ?? undefined,
    stage: formData.get("stage"),
    occurredAt: formData.get("occurredAt"),
    outcome: formData.get("outcome") || undefined,
    confidence: formData.get("confidence") || undefined,
    notes: formData.get("notes") || undefined,
  });

  if (!parsed.success) return { error: parsed.error.issues[0]?.message ?? "Check the details" };

  const supabase = await createClient();
  const companyId = await resolveCompany(parsed.data.company ?? null, user.id);

  const { data: record, error } = await supabase
    .from("interview_records")
    .insert({
      user_id: user.id,
      company_id: companyId,
      role_title: parsed.data.roleTitle,
      stage: parsed.data.stage,
      occurred_at: parsed.data.occurredAt,
      outcome: parsed.data.outcome ?? "pending",
      confidence: parsed.data.confidence ?? null,
      notes_md: parsed.data.notes ?? null,
    })
    .select("id")
    .single();

  if (error || !record) return { error: "Could not save that interview." };

  // Questions arrive as parallel arrays from the repeatable form rows.
  const texts = formData.getAll("questionText").map(String);
  const qualities = formData.getAll("questionQuality").map(String);
  const skillIds = formData.getAll("questionSkill").map(String);
  const difficulties = formData.getAll("questionDifficulty").map(String);

  const rows = texts
    .map((text, i) => ({
      record_id: record.id,
      user_id: user.id,
      question_text: text.trim(),
      quality: (qualities[i] ?? "shaky") as "strong" | "shaky" | "failed" | "unanswered",
      skill_id: skillIds[i] || null,
      difficulty: Number(difficulties[i] ?? 3),
      unexpected: false,
    }))
    .filter((r) => r.question_text.length > 3);

  let weaknessesOpened = 0;
  if (rows.length > 0) {
    const before = await supabase
      .from("weaknesses")
      .select("id", { count: "exact", head: true })
      .eq("user_id", user.id)
      .in("status", ["open", "researching", "retesting"]);

    await supabase.from("interview_record_questions").insert(rows);

    const after = await supabase
      .from("weaknesses")
      .select("id", { count: "exact", head: true })
      .eq("user_id", user.id)
      .in("status", ["open", "researching", "retesting"]);

    weaknessesOpened = Math.max(0, (after.count ?? 0) - (before.count ?? 0));
  }

  // XP for the reflection itself — recording an interview honestly is work.
  await supabase
    .from("xp_transactions")
    .insert({
      user_id: user.id,
      amount: 80,
      source_type: "interview_logged",
      source_id: record.id,
    })
    .then(() => undefined);

  await track("interview_logged", {
    stage: parsed.data.stage,
    questions: rows.length,
    weaknessesOpened,
  });

  revalidatePath("/career");
  revalidatePath("/review");
  revalidatePath("/today");

  return { result: { questionsLogged: rows.length, weaknessesOpened } };
}
