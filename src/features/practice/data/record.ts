import "server-only";

import { computeXpAward, type XpSource } from "@/features/gamification/domain/xp";
import type { EvidenceSource } from "@/features/mastery/domain/mastery";
import {
  evaluateTrigger,
  generateRemediation,
  type AttemptSignal,
} from "@/features/weakness/domain/weakness";
import { track } from "@/lib/events/track";
import { createClient } from "@/lib/supabase/server";

/**
 * The write path for every scored attempt.
 *
 * One place, so the ordering is always the same and no surface can forget a
 * step: attempt row → evidence (which recomputes mastery in SQL) → XP →
 * weakness triggers → analytics event.
 *
 * Auto-*resolution* of weaknesses is handled by a database trigger on
 * `skill_evidence`, so it happens atomically with the evidence insert and
 * cannot be skipped by a caller. Only *opening* is decided here, because it
 * needs the recent-attempt history the domain engine reasons over.
 */

export interface ScoredAttempt {
  userId: string;
  skillId: string;
  /** Row id of the attempt this evidence came from — the anti-double-award key. */
  sourceId: string;
  sourceType: EvidenceSource;
  xpSource: XpSource;
  score: number;
  difficulty: number;
  attemptNo?: number;
  hintsUsed?: number;
  occurredAt?: Date;
}

export interface RecordResult {
  evidenceId: string | null;
  xpAwarded: number;
  weaknessOpened: boolean;
}

export async function recordScoredAttempt(attempt: ScoredAttempt): Promise<RecordResult> {
  const supabase = await createClient();
  const now = attempt.occurredAt ?? new Date();

  // 1. Evidence. The RPC inserts the ledger row and recomputes user_skills in
  // one transaction, so mastery can never drift from its evidence.
  const { data: evidenceId, error: evidenceError } = await supabase.rpc("record_evidence", {
    p_skill: attempt.skillId,
    p_source_type: attempt.sourceType,
    p_source_id: attempt.sourceId,
    p_difficulty: attempt.difficulty,
    p_correctness: attempt.score,
  });

  if (evidenceError) {
    console.error("[practice] failed to record evidence", evidenceError);
  }

  // 2. XP. The unique index on (user, source_type, source_id) is what actually
  // enforces once-only; a duplicate insert here is expected and ignored.
  const xpAwarded = computeXpAward({
    source: attempt.xpSource,
    attemptNo: attempt.attemptNo,
    score: attempt.score,
    hintsUsed: attempt.hintsUsed,
  });

  if (xpAwarded > 0) {
    const { error: xpError } = await supabase.from("xp_transactions").insert({
      user_id: attempt.userId,
      amount: xpAwarded,
      source_type: attempt.xpSource,
      source_id: attempt.sourceId,
    });
    if (xpError && !isUniqueViolation(xpError)) {
      console.error("[practice] failed to award xp", xpError);
    }
  }

  // 3. Weakness triggers.
  const weaknessOpened = await maybeOpenWeakness(attempt, now);

  return {
    evidenceId: typeof evidenceId === "string" ? evidenceId : null,
    xpAwarded,
    weaknessOpened,
  };
}

async function maybeOpenWeakness(attempt: ScoredAttempt, now: Date): Promise<boolean> {
  const supabase = await createClient();

  const signal: AttemptSignal = {
    skillId: attempt.skillId,
    sourceType: attempt.sourceType,
    sourceId: attempt.sourceId,
    score: attempt.score,
    difficulty: attempt.difficulty,
    occurredAt: now,
  };

  // Question-shaped evidence needs a second failure inside the window before
  // it counts, so fetch the recent low scores the engine compares against.
  const since = new Date(now.getTime() - 14 * 86_400_000).toISOString();
  const { data: recent } = await supabase
    .from("question_attempts")
    .select("id, score, created_at, question_id")
    .eq("user_id", attempt.userId)
    .lt("score", 0.5)
    .gte("created_at", since)
    .order("created_at", { ascending: false })
    .limit(20);

  const priors: AttemptSignal[] = (recent ?? []).map((r) => ({
    skillId: attempt.skillId,
    sourceType: attempt.sourceType,
    sourceId: r.id,
    score: Number(r.score),
    difficulty: attempt.difficulty,
    occurredAt: new Date(r.created_at),
  }));

  const trigger = evaluateTrigger(signal, priors);
  if (!trigger) return false;

  const { data: skill } = await supabase
    .from("skills")
    .select("name")
    .eq("id", attempt.skillId)
    .maybeSingle();

  const { data: weakness, error } = await supabase
    .from("weaknesses")
    .insert({
      user_id: attempt.userId,
      skill_id: trigger.skillId,
      severity: trigger.severity,
      source_type: trigger.sourceType,
      source_id: trigger.sourceId,
      evidence: { difficulty: trigger.difficulty, reason: trigger.reason },
    })
    .select("id")
    .single();

  // A live weakness for this skill already exists — the partial unique index
  // did its job. Nothing to do; the existing remediation still stands.
  if (error) {
    if (!isUniqueViolation(error)) {
      console.error("[practice] failed to open weakness", error);
    }
    return false;
  }

  const remediation = generateRemediation(trigger, skill?.name ?? "this skill", now);

  await Promise.all([
    supabase.from("research_tasks").insert({
      user_id: attempt.userId,
      weakness_id: weakness.id,
      skill_id: trigger.skillId,
      prompt_md: remediation.researchPrompt,
    }),
    supabase.from("revision_items").insert(
      remediation.revisionItems.map((item) => ({
        user_id: attempt.userId,
        weakness_id: weakness.id,
        skill_id: trigger.skillId,
        item_ref_type: item.refType,
        due_at: item.dueAt.toISOString(),
        interval_days: item.intervalDays,
        ease: item.ease,
      })),
    ),
    track("weakness_opened", {
      skillId: trigger.skillId,
      severity: trigger.severity,
      source: trigger.sourceType,
    }),
  ]);

  return true;
}

function isUniqueViolation(error: { code?: string } | null): boolean {
  return error?.code === "23505";
}
