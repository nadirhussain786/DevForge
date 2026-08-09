"use server";

import { revalidatePath } from "next/cache";
import { redirect } from "next/navigation";
import { z } from "zod";

import { recordScoredAttempt } from "@/features/practice/data/record";
import { requireUser } from "@/lib/auth/session";
import { track } from "@/lib/events/track";
import { createClient } from "@/lib/supabase/server";

/**
 * Engineering Notebook and R&D Lab (§13, §14).
 *
 * One table, discriminated by `kind` — the two surfaces are the same shape
 * with different emphasis. Every row is owner_only: no admin policy exists,
 * and that is verified by `pnpm db:verify`.
 */

const SECTIONS = [
  "question_md",
  "hypothesis_md",
  "research_md",
  "experiment_md",
  "code_md",
  "result_md",
  "evidence_md",
  "conclusion_md",
  "interview_explanation_md",
  "open_questions_md",
] as const;

const sectionField = z.string().max(20_000).optional();

const noteSchema = z.object({
  id: z.uuid().optional(),
  kind: z.enum(["notebook", "experiment"]).default("notebook"),
  title: z.string().trim().min(3, "Give it a title you'll recognise later").max(200),
  skillId: z.uuid().optional().or(z.literal("")),
  tags: z.string().optional(),
  confidence: z.coerce.number().int().min(1).max(5).optional(),
  // Written out rather than spread from SECTIONS: a computed object literal
  // gives zod (and therefore TypeScript) no key information, so every later
  // `input[section]` access degrades to an implicit any.
  question_md: sectionField,
  hypothesis_md: sectionField,
  research_md: sectionField,
  experiment_md: sectionField,
  code_md: sectionField,
  result_md: sectionField,
  evidence_md: sectionField,
  conclusion_md: sectionField,
  interview_explanation_md: sectionField,
  open_questions_md: sectionField,
});

export interface NoteState {
  error?: string;
  saved?: boolean;
  completed?: boolean;
  xpAwarded?: number;
}

export async function createNote(formData: FormData): Promise<void> {
  const user = await requireUser();
  const kind = formData.get("kind") === "experiment" ? "experiment" : "notebook";
  const supabase = await createClient();

  const { data, error } = await supabase
    .from("research_notes")
    .insert({
      user_id: user.id,
      kind,
      title: kind === "experiment" ? "New experiment" : "New note",
    })
    .select("id")
    .single();

  if (error || !data) throw new Error("Could not create the note.");

  await track("research_started", { kind });
  revalidatePath("/notebook");
  redirect(`/notebook/${data.id}`);
}

export async function saveNote(_prev: NoteState, formData: FormData): Promise<NoteState> {
  const user = await requireUser();

  const raw: Record<string, unknown> = { id: formData.get("id") ?? undefined };
  for (const key of ["kind", "title", "skillId", "tags", "confidence", ...SECTIONS]) {
    const value = formData.get(key);
    if (value !== null) raw[key] = value;
  }

  const parsed = noteSchema.safeParse(raw);
  if (!parsed.success) {
    return { error: parsed.error.issues[0]?.message ?? "Check your note" };
  }

  const input = parsed.data;
  if (!input.id) return { error: "Missing note id." };

  const supabase = await createClient();

  // An explicit literal, not a dynamically-keyed Record: supabase-js checks
  // the update shape against the table's row type and rejects an index
  // signature outright.
  const { error } = await supabase
    .from("research_notes")
    .update({
      title: input.title,
      kind: input.kind,
      skill_id: input.skillId || null,
      confidence: input.confidence ?? null,
      tags: (input.tags ?? "")
        .split(",")
        .map((t) => t.trim())
        .filter(Boolean),
      question_md: input.question_md ?? null,
      hypothesis_md: input.hypothesis_md ?? null,
      research_md: input.research_md ?? null,
      experiment_md: input.experiment_md ?? null,
      code_md: input.code_md ?? null,
      result_md: input.result_md ?? null,
      evidence_md: input.evidence_md ?? null,
      conclusion_md: input.conclusion_md ?? null,
      interview_explanation_md: input.interview_explanation_md ?? null,
      open_questions_md: input.open_questions_md ?? null,
    })
    .eq("id", input.id)
    .eq("user_id", user.id);

  if (error) return { error: "Could not save. Your text is still in the form." };

  revalidatePath(`/notebook/${input.id}`);
  return { saved: true };
}

const completeSchema = z.object({ id: z.uuid() });

/**
 * Completing a note is what converts research into evidence — and only when
 * the Interview Explanation section is filled in. Research counts once you can
 * explain it, not once you have read about it.
 *
 * Weight 0.6 in the mastery model: a real effort signal, a weak capability
 * signal, because nothing here was independently scored.
 */
export async function completeNote(_prev: NoteState, formData: FormData): Promise<NoteState> {
  const user = await requireUser();
  const parsed = completeSchema.safeParse({ id: formData.get("id") });
  if (!parsed.success) return { error: "Invalid note." };

  const supabase = await createClient();

  const { data: note } = await supabase
    .from("research_notes")
    .select("id, skill_id, interview_explanation_md, conclusion_md, status, confidence")
    .eq("id", parsed.data.id)
    .eq("user_id", user.id)
    .maybeSingle();

  if (!note) return { error: "That note no longer exists." };

  if (!note.interview_explanation_md || note.interview_explanation_md.trim().length < 60) {
    return {
      error:
        "Write the Interview Explanation first — a few sentences you could say out loud. That section is what turns research into evidence.",
    };
  }

  if (note.status === "completed") return { saved: true, completed: true, xpAwarded: 0 };

  await supabase
    .from("research_notes")
    .update({ status: "completed", completed_at: new Date().toISOString() })
    .eq("id", note.id);

  let xpAwarded = 0;
  if (note.skill_id) {
    // Self-reported confidence sets the correctness signal, floored so an
    // honest low-confidence note still counts for something.
    const confidence = note.confidence ?? 3;
    const recorded = await recordScoredAttempt({
      userId: user.id,
      skillId: note.skill_id,
      sourceId: note.id,
      sourceType: "research_note",
      xpSource: "research_completed",
      score: Math.max(0.4, Math.min(1, confidence / 5)),
      difficulty: 3,
    });
    xpAwarded = recorded.xpAwarded;
  }

  // Close any research task this note was answering.
  await supabase
    .from("research_tasks")
    .update({ status: "completed", note_id: note.id, completed_at: new Date().toISOString() })
    .eq("user_id", user.id)
    .eq("skill_id", note.skill_id ?? "")
    .neq("status", "completed");

  await track("research_completed", { skillId: note.skill_id });

  revalidatePath("/notebook");
  revalidatePath("/review");
  revalidatePath("/today");

  return { saved: true, completed: true, xpAwarded };
}

export async function deleteNote(formData: FormData): Promise<void> {
  const user = await requireUser();
  const id = formData.get("id");
  if (typeof id !== "string") return;

  const supabase = await createClient();
  await supabase.from("research_notes").delete().eq("id", id).eq("user_id", user.id);

  revalidatePath("/notebook");
  redirect("/notebook");
}
