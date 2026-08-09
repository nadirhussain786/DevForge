import { describe, expect, it } from "vitest";

import { addDays, BASE_INTERVALS, isDue, newRevision, reviewRevision, sortByUrgency } from "./sm2";
import {
  canResolve,
  evaluateTrigger,
  generateRemediation,
  nextStatus,
  type AttemptSignal,
} from "./weakness";

const NOW = new Date("2026-08-20T09:00:00Z");

const signal = (over: Partial<AttemptSignal> = {}): AttemptSignal => ({
  skillId: "postgres-transactions",
  sourceType: "short_answer",
  sourceId: "a1",
  score: 0.2,
  difficulty: 3,
  occurredAt: NOW,
  ...over,
});

// ── SM-2 ────────────────────────────────────────────────────────────────────

describe("reviewRevision", () => {
  it("walks the interval ladder on repeated success", () => {
    let state = newRevision();
    const seen: number[] = [];
    for (let i = 0; i < 4; i++) {
      const r = reviewRevision(state, true, NOW);
      seen.push(r.intervalDays);
      state = r;
    }
    expect(seen).toEqual([...BASE_INTERVALS.slice(1)]);
  });

  it("resets to tomorrow and lowers ease on a wrong answer", () => {
    const state = { intervalDays: 16, ease: 2.5, repetitions: 3 };
    const r = reviewRevision(state, false, NOW);
    expect(r.intervalDays).toBe(1);
    expect(r.ease).toBe(2.3);
    expect(r.repetitions).toBe(0);
    expect(r.dueAt).toEqual(addDays(NOW, 1));
  });

  it("keeps ease inside its bounds however long the streak", () => {
    let state = newRevision();
    for (let i = 0; i < 50; i++) state = reviewRevision(state, true, NOW);
    expect(state.ease).toBeLessThanOrEqual(2.8);

    let bad = newRevision();
    for (let i = 0; i < 50; i++) bad = reviewRevision(bad, false, NOW);
    expect(bad.ease).toBeGreaterThanOrEqual(1.3);
  });

  it("retires an item once it has genuinely stuck", () => {
    let state = newRevision();
    let retired = false;
    for (let i = 0; i < 5; i++) {
      const r = reviewRevision(state, true, NOW);
      retired = r.retired;
      state = r;
    }
    expect(retired).toBe(true);
  });

  it("multiplies by ease once past the fixed ladder", () => {
    const late = { intervalDays: 35, ease: 2.6, repetitions: 5 };
    const r = reviewRevision(late, true, NOW);
    expect(r.intervalDays).toBe(Math.round(35 * 2.7));
  });
});

describe("due handling", () => {
  it("treats an item due exactly now as due", () => {
    expect(isDue(NOW, NOW)).toBe(true);
    expect(isDue(addDays(NOW, 1), NOW)).toBe(false);
  });

  it("sorts the most overdue first", () => {
    const items = [
      { id: "b", dueAt: addDays(NOW, -1) },
      { id: "a", dueAt: addDays(NOW, -5) },
      { id: "c", dueAt: addDays(NOW, 3) },
    ];
    expect(sortByUrgency(items, NOW).map((i) => i.id)).toEqual(["a", "b"]);
  });
});

// ── Triggers ────────────────────────────────────────────────────────────────

describe("evaluateTrigger", () => {
  it("ignores a passing score", () => {
    expect(evaluateTrigger(signal({ score: 0.8 }), [])).toBeNull();
  });

  it("does not open a weakness on a single bad question", () => {
    // One bad answer is noise.
    expect(evaluateTrigger(signal(), [])).toBeNull();
  });

  it("opens one on the second failure within the window", () => {
    const prior = [signal({ sourceId: "a0", occurredAt: addDays(NOW, -3) })];
    const t = evaluateTrigger(signal(), prior);
    expect(t).not.toBeNull();
    expect(t!.severity).toBe(1);
  });

  it("ignores a prior failure that has aged out of the window", () => {
    const prior = [signal({ sourceId: "a0", occurredAt: addDays(NOW, -30) })];
    expect(evaluateTrigger(signal(), prior)).toBeNull();
  });

  it("never counts the same attempt as its own repeat", () => {
    const prior = [signal({ sourceId: "a1" })];
    expect(evaluateTrigger(signal({ sourceId: "a1" }), prior)).toBeNull();
  });

  it("opens immediately on a failed real interview question at severity 3", () => {
    const t = evaluateTrigger(
      signal({ sourceType: "real_interview_question", score: 0.1 }),
      [],
    );
    expect(t!.severity).toBe(3);
  });

  it("opens at severity 2 for a shaky real interview answer", () => {
    const t = evaluateTrigger(
      signal({ sourceType: "real_interview_question", score: 0.45 }),
      [],
    );
    expect(t!.severity).toBe(2);
  });

  it("does not open on a strong real interview answer", () => {
    expect(
      evaluateTrigger(signal({ sourceType: "real_interview_question", score: 0.9 }), []),
    ).toBeNull();
  });

  it("opens immediately on a weak system design or mock interview turn", () => {
    expect(evaluateTrigger(signal({ sourceType: "system_design_attempt" }), [])!.severity).toBe(2);
    expect(evaluateTrigger(signal({ sourceType: "mock_interview_turn" }), [])!.severity).toBe(2);
  });

  it("opens immediately on a failed coding attempt", () => {
    expect(evaluateTrigger(signal({ sourceType: "coding_attempt" }), [])!.severity).toBe(1);
  });
});

// ── Remediation ─────────────────────────────────────────────────────────────

describe("generateRemediation", () => {
  it("schedules research and spaced revision without the user deciding anything", () => {
    const trigger = evaluateTrigger(signal({ sourceType: "coding_attempt" }), [])!;
    const r = generateRemediation(trigger, "PostgreSQL transactions", NOW);

    expect(r.researchPrompt).toContain("PostgreSQL transactions");
    expect(r.revisionItems.map((i) => i.intervalDays)).toEqual([1, 3]);
    expect(r.flagForInterview).toBe(false);
  });

  it("adds a third review and an interview flag for serious weaknesses", () => {
    const trigger = evaluateTrigger(
      signal({ sourceType: "real_interview_question", score: 0.1 }),
      [],
    )!;
    const r = generateRemediation(trigger, "Idempotency", NOW);

    expect(r.revisionItems).toHaveLength(3);
    expect(r.flagForInterview).toBe(true);
  });
});

// ── Resolution ──────────────────────────────────────────────────────────────

describe("canResolve", () => {
  const weakness = { sourceId: "a1", difficulty: 3, status: "retesting" as const };

  it("INVARIANT #5: refuses the very attempt that opened it", () => {
    const r = canResolve(weakness, { sourceId: "a1", score: 1, difficulty: 5 });
    expect(r.resolved).toBe(false);
    expect(r.reason).toContain("proves nothing");
  });

  it("refuses a score below the resolution threshold", () => {
    expect(canResolve(weakness, { sourceId: "a2", score: 0.7, difficulty: 3 }).resolved).toBe(false);
  });

  it("refuses a correct answer on easier material", () => {
    const r = canResolve(weakness, { sourceId: "a2", score: 0.95, difficulty: 1 });
    expect(r.resolved).toBe(false);
    expect(r.reason).toContain("easier material");
  });

  it("resolves on new, strong evidence at equal or higher difficulty", () => {
    expect(canResolve(weakness, { sourceId: "a2", score: 0.8, difficulty: 3 }).resolved).toBe(true);
    expect(canResolve(weakness, { sourceId: "a3", score: 0.9, difficulty: 5 }).resolved).toBe(true);
  });

  it("does not reopen something already closed", () => {
    expect(
      canResolve({ ...weakness, status: "resolved" }, { sourceId: "a9", score: 1, difficulty: 5 })
        .resolved,
    ).toBe(false);
  });
});

describe("nextStatus", () => {
  it("advances through the remediation states", () => {
    expect(nextStatus("open", "research_started")).toBe("researching");
    expect(nextStatus("researching", "revision_all_correct")).toBe("retesting");
    expect(nextStatus("retesting", "retest_passed")).toBe("resolved");
  });

  it("is terminal once closed", () => {
    expect(nextStatus("resolved", "research_started")).toBe("resolved");
    expect(nextStatus("dismissed", "retest_passed")).toBe("dismissed");
  });
});
