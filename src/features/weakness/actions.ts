"use server";

import { revalidatePath } from "next/cache";
import { z } from "zod";

import { nextStatus } from "@/features/weakness/domain/weakness";
import { reviewRevision } from "@/features/weakness/domain/sm2";
import { requireUser } from "@/lib/auth/session";
import { track } from "@/lib/events/track";
import { createClient } from "@/lib/supabase/server";

/**
 * The REVIEW step of the Forge Loop.
 *
 * Reviewing schedules the next repetition; it does NOT resolve the weakness.
 * Resolution requires new evidence at equal-or-higher difficulty (invariant
 * #5), which arrives through the Test or Build blocks and is applied by a
 * database trigger.
 */

const reviewSchema = z.object({
  revisionItemId: z.uuid(),
  recalled: z.enum(["yes", "no"]),
});

export interface ReviewState {
  error?: string;
  result?: {
    correct: boolean;
    nextDueInDays: number;
    retired: boolean;
    movedToRetesting: boolean;
  };
}

export async function reviewItem(_prev: ReviewState, formData: FormData): Promise<ReviewState> {
  const user = await requireUser();

  const parsed = reviewSchema.safeParse({
    revisionItemId: formData.get("revisionItemId"),
    recalled: formData.get("recalled"),
  });

  if (!parsed.success) return { error: "Invalid review submission." };

  const { revisionItemId, recalled } = parsed.data;
  const correct = recalled === "yes";
  const supabase = await createClient();

  const { data: item } = await supabase
    .from("revision_items")
    .select("id, weakness_id, skill_id, interval_days, ease, repetitions")
    .eq("id", revisionItemId)
    .eq("user_id", user.id)
    .maybeSingle();

  if (!item) return { error: "That revision item no longer exists." };

  const now = new Date();
  const next = reviewRevision(
    { intervalDays: item.interval_days, ease: Number(item.ease), repetitions: item.repetitions },
    correct,
    now,
  );

  const { error: updateError } = await supabase
    .from("revision_items")
    .update({
      interval_days: next.intervalDays,
      ease: next.ease,
      repetitions: next.repetitions,
      due_at: next.dueAt.toISOString(),
      last_result: correct,
      last_reviewed_at: now.toISOString(),
      retired_at: next.retired ? now.toISOString() : null,
    })
    .eq("id", item.id);

  if (updateError) return { error: "Could not save your review." };

  // Once every item for a weakness has been recalled at least once, the
  // weakness moves to `retesting` — it is waiting on real evidence, not on
  // more flashcards.
  let movedToRetesting = false;
  if (correct && item.weakness_id) {
    const { data: siblings } = await supabase
      .from("revision_items")
      .select("last_result")
      .eq("weakness_id", item.weakness_id);

    const allRecalled = (siblings ?? []).every((s) => s.last_result === true);

    if (allRecalled) {
      const { data: weakness } = await supabase
        .from("weaknesses")
        .select("status")
        .eq("id", item.weakness_id)
        .maybeSingle();

      const target = nextStatus(
        (weakness?.status ?? "open") as "open" | "researching" | "retesting",
        "revision_all_correct",
      );

      if (target !== weakness?.status) {
        await supabase.from("weaknesses").update({ status: target }).eq("id", item.weakness_id);
        movedToRetesting = target === "retesting";
      }
    }
  }

  await track("revision_reviewed", {
    skillId: item.skill_id,
    correct,
    repetitions: next.repetitions,
  });

  revalidatePath("/review");
  revalidatePath("/today");

  return {
    result: {
      correct,
      nextDueInDays: next.intervalDays,
      retired: next.retired,
      movedToRetesting,
    },
  };
}

const researchSchema = z.object({ researchTaskId: z.uuid() });

/** Starting research is what moves a weakness from `open` to `researching`. */
export async function startResearch(formData: FormData): Promise<void> {
  const user = await requireUser();
  const parsed = researchSchema.safeParse({ researchTaskId: formData.get("researchTaskId") });
  if (!parsed.success) return;

  const supabase = await createClient();

  const { data: task } = await supabase
    .from("research_tasks")
    .select("id, weakness_id, skill_id, prompt_md, note_id")
    .eq("id", parsed.data.researchTaskId)
    .eq("user_id", user.id)
    .maybeSingle();

  if (!task) return;

  await supabase.from("research_tasks").update({ status: "in_progress" }).eq("id", task.id);

  if (task.weakness_id) {
    const { data: weakness } = await supabase
      .from("weaknesses")
      .select("status")
      .eq("id", task.weakness_id)
      .maybeSingle();

    const target = nextStatus(
      (weakness?.status ?? "open") as "open" | "researching",
      "research_started",
    );
    if (target !== weakness?.status) {
      await supabase.from("weaknesses").update({ status: target }).eq("id", task.weakness_id);
    }
  }

  await track("research_started", { skillId: task.skill_id });
  revalidatePath("/review");
}
