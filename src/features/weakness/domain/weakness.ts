/**
 * Failure → Skill engine — docs/02-domain-engines.md §8
 *
 * The signature loop. The user never has to decide what to do about a failure;
 * the system has already scheduled it.
 */

import type { EvidenceSource } from "@/features/mastery/domain/mastery";
import type { RefType } from "@/features/roadmap/domain/types";

import { addDays, newRevision } from "./sm2";

export const FAILURE_THRESHOLD = 0.5;
export const RESOLUTION_THRESHOLD = 0.75;
/** Two low scores inside this window on the same skill opens a weakness. */
export const REPEAT_WINDOW_DAYS = 14;

export type WeaknessStatus = "open" | "researching" | "retesting" | "resolved" | "dismissed";

export interface AttemptSignal {
  skillId: string;
  sourceType: EvidenceSource;
  sourceId: string;
  score: number;
  difficulty: number;
  occurredAt: Date;
}

export interface WeaknessTrigger {
  skillId: string;
  severity: 1 | 2 | 3;
  sourceType: EvidenceSource;
  sourceId: string;
  reason: string;
  difficulty: number;
}

/**
 * Severity by how much the signal costs to ignore. A real interview failure is
 * a 3 immediately; a single bad MCQ is not a weakness at all until it repeats.
 */
export function evaluateTrigger(
  signal: AttemptSignal,
  priorLowScores: readonly AttemptSignal[],
): WeaknessTrigger | null {
  const { sourceType, score, skillId, sourceId, difficulty } = signal;

  if (sourceType === "real_interview_question") {
    if (score >= RESOLUTION_THRESHOLD) return null;
    return {
      skillId,
      sourceId,
      sourceType,
      difficulty,
      severity: score < 0.25 ? 3 : 2,
      reason: "Missed in a real interview — the strongest signal we get.",
    };
  }

  if (score >= FAILURE_THRESHOLD) return null;

  if (sourceType === "system_design_attempt" || sourceType === "mock_interview_turn") {
    return {
      skillId,
      sourceId,
      sourceType,
      difficulty,
      severity: 2,
      reason:
        sourceType === "system_design_attempt"
          ? "A design dimension scored below 50."
          : "A mock interview answer was missing key concepts.",
    };
  }

  if (sourceType === "coding_attempt") {
    return {
      skillId,
      sourceId,
      sourceType,
      difficulty,
      severity: 1,
      reason: "Coding attempt failed or was abandoned.",
    };
  }

  // Question-shaped evidence needs a second failure before it counts — one bad
  // answer is noise, two inside a fortnight is a pattern.
  const cutoff = addDays(signal.occurredAt, -REPEAT_WINDOW_DAYS);
  const repeats = priorLowScores.filter(
    (p) =>
      p.skillId === skillId &&
      p.sourceId !== sourceId &&
      p.score < FAILURE_THRESHOLD &&
      p.occurredAt >= cutoff,
  );

  if (repeats.length === 0) return null;

  return {
    skillId,
    sourceId,
    sourceType,
    difficulty,
    severity: 1,
    reason: `Scored below ${FAILURE_THRESHOLD} twice on this skill within ${REPEAT_WINDOW_DAYS} days.`,
  };
}

export interface GeneratedRemediation {
  researchPrompt: string;
  revisionItems: Array<{
    refType: RefType;
    dueAt: Date;
    intervalDays: number;
    ease: number;
  }>;
  flagForInterview: boolean;
}

/**
 * What opening a weakness actually creates: something to read, something to
 * try, something to be re-asked, and a flag so the next mock interview probes
 * it deliberately.
 */
export function generateRemediation(
  trigger: WeaknessTrigger,
  skillName: string,
  now: Date,
): GeneratedRemediation {
  const base = newRevision();

  const revisionItems: GeneratedRemediation["revisionItems"] = [
    { refType: "topic" as RefType, dueAt: addDays(now, 1), intervalDays: 1, ease: base.ease },
    { refType: "question_set" as RefType, dueAt: addDays(now, 3), intervalDays: 3, ease: base.ease },
  ];

  if (trigger.severity >= 2) {
    revisionItems.push({
      refType: "question_set" as RefType,
      dueAt: addDays(now, 7),
      intervalDays: 7,
      ease: base.ease,
    });
  }

  return {
    researchPrompt: `Investigate ${skillName} until you can explain it to an interviewer without notes. Start from what you got wrong: ${trigger.reason}`,
    revisionItems,
    flagForInterview: trigger.severity >= 2,
  };
}

export interface ResolutionCheck {
  resolved: boolean;
  reason: string;
}

/**
 * Invariant #5: a weakness can never be closed by the attempt that opened it,
 * and never by easier material than the one that exposed it.
 */
export function canResolve(
  weakness: { sourceId: string; difficulty: number; status: WeaknessStatus },
  newEvidence: { sourceId: string; score: number; difficulty: number },
): ResolutionCheck {
  if (weakness.status === "resolved" || weakness.status === "dismissed") {
    return { resolved: false, reason: "Already closed." };
  }
  if (newEvidence.sourceId === weakness.sourceId) {
    return {
      resolved: false,
      reason: "Re-answering the item that opened this proves nothing.",
    };
  }
  if (newEvidence.score < RESOLUTION_THRESHOLD) {
    return { resolved: false, reason: `Needs a score of at least ${RESOLUTION_THRESHOLD}.` };
  }
  if (newEvidence.difficulty < weakness.difficulty) {
    return {
      resolved: false,
      reason: "Answered correctly, but on easier material than the one you missed.",
    };
  }
  return { resolved: true, reason: "Re-tested successfully at equal or higher difficulty." };
}

/** Advance the status machine as remediation progresses. */
export function nextStatus(
  current: WeaknessStatus,
  event: "research_started" | "revision_all_correct" | "retest_passed",
): WeaknessStatus {
  if (current === "resolved" || current === "dismissed") return current;
  if (event === "research_started" && current === "open") return "researching";
  if (event === "revision_all_correct" && (current === "open" || current === "researching")) {
    return "retesting";
  }
  if (event === "retest_passed") return "resolved";
  return current;
}
