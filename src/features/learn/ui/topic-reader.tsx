"use client";

import { useActionState, useState } from "react";
import { AlertTriangle, Check, Lightbulb } from "lucide-react";

import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
import { cn } from "@/lib/utils";

import { submitExplanation, type ExplainState } from "../actions";
import { Markdown } from "./markdown";

/**
 * The four explanation levels (§28) as progressive-disclosure tabs, plus the
 * Explain gate.
 *
 * Reading is the weakest evidence in the mastery model, so it cannot close a
 * Learn block on its own — the explanation below is what produces a score.
 */

export const LEVELS = [
  { key: "beginner", label: "Beginner", blurb: "The plain-language version" },
  { key: "engineer", label: "Engineer", blurb: "How it actually works" },
  { key: "enterprise", label: "Enterprise", blurb: "At scale, with trade-offs" },
  { key: "interview", label: "Interview", blurb: "How to say it under pressure" },
] as const;

export type LevelKey = (typeof LEVELS)[number]["key"];

/** Supporting blocks shown under a disclosure, below the four main levels. */
const EXTRA_KINDS = [
  "mistakes",
  "tradeoffs",
  "scenario",
  "code",
  "security",
  "performance",
] as const;
type ExtraKind = (typeof EXTRA_KINDS)[number];

export interface TopicReaderProps {
  topicId: string;
  title: string;
  bodies: Partial<Record<string, string>>;
  alreadyExplained: boolean;
}

export function TopicReader({ topicId, title, bodies, alreadyExplained }: TopicReaderProps) {
  const [level, setLevel] = useState<LevelKey>("beginner");
  const [state, formAction, pending] = useActionState(submitExplanation, {} as ExplainState);

  const extras = EXTRA_KINDS.map((kind) => ({ kind, body: bodies[kind] })).filter(
    (x): x is { kind: ExtraKind; body: string } => typeof x.body === "string",
  );

  return (
    <div className="flex flex-col gap-6">
      <div>
        <div
          role="tablist"
          aria-label="Explanation level"
          className="flex flex-wrap gap-1 border-b border-[var(--border)]"
        >
          {LEVELS.map((l) => (
            <button
              key={l.key}
              role="tab"
              aria-selected={level === l.key}
              onClick={() => setLevel(l.key)}
              className={cn(
                "-mb-px border-b-2 px-3 py-2 text-[13px] transition-colors duration-150",
                level === l.key
                  ? "border-[var(--forge-500)] text-[var(--text)]"
                  : "border-transparent text-[var(--text-muted)] hover:text-[var(--text)]",
              )}
            >
              {l.label}
            </button>
          ))}
        </div>

        <p className="mt-2 text-[12px] text-[var(--text-subtle)]">
          {LEVELS.find((l) => l.key === level)?.blurb}
        </p>

        <div className="mt-4">
          {bodies[level] ? (
            <Markdown content={bodies[level]} />
          ) : (
            <p className="text-[13px] text-[var(--text-subtle)]">
              This level hasn&apos;t been authored yet.
            </p>
          )}
        </div>
      </div>

      {extras.length > 0 && (
        <details className="rounded-[var(--radius)] border border-[var(--border)] bg-[var(--surface)] p-4">
          <summary className="cursor-pointer text-[13px] font-medium">
            Common mistakes, trade-offs, and scenarios
          </summary>
          <div className="mt-4 flex flex-col gap-5">
            {extras.map((x) => (
              <section key={x.kind}>
                <h3 className="mb-2 text-[11px] uppercase tracking-wide text-[var(--text-subtle)]">
                  {x.kind}
                </h3>
                <Markdown content={x.body} />
              </section>
            ))}
          </div>
        </details>
      )}

      {/* ── The Explain gate ────────────────────────────────────────────── */}
      <section className="rounded-[var(--radius)] border border-[var(--border-strong)] bg-[var(--surface)] p-5">
        <h2 className="text-sm font-semibold">Explain it back</h2>
        <p className="mt-1 max-w-[68ch] text-[13px] text-[var(--text-muted)]">
          Reading produces the weakest evidence in your mastery model. Writing it in your own words
          is what actually moves the number — and it&apos;s how the system finds out what you
          haven&apos;t understood yet.
        </p>

        {alreadyExplained && (
          <p className="mt-3 flex items-center gap-1.5 text-[12px] text-[var(--success)]">
            <Check aria-hidden className="size-3.5" />
            You&apos;ve explained this before. Doing it again is good practice, but earns reduced XP.
          </p>
        )}

        <form action={formAction} className="mt-4 flex flex-col gap-3">
          <input type="hidden" name="topicId" value={topicId} />
          <input type="hidden" name="level" value={level} />

          <label className="flex flex-col gap-1.5">
            <span className="sr-only">Your explanation of {title}</span>
            <textarea
              name="body"
              rows={7}
              required
              minLength={40}
              placeholder={`Explain ${title} as if to an interviewer. Cover the mechanism, why it matters, and at least one trade-off.`}
              className="w-full resize-y rounded-[var(--radius)] border border-[var(--border-strong)] bg-[var(--bg)] p-3 text-[14px] leading-relaxed"
            />
          </label>

          {state.error && (
            <p role="alert" className="text-[13px] text-[var(--danger)]">
              {state.error}
            </p>
          )}

          <div className="flex items-center gap-3">
            <Button type="submit" variant="primary" disabled={pending}>
              {pending ? "Grading…" : "Submit explanation"}
            </Button>
            <span className="text-[12px] text-[var(--text-subtle)]">
              Graded against a stored rubric, not a vibe check.
            </span>
          </div>
        </form>

        {state.result && <GradeFeedback result={state.result} />}
      </section>
    </div>
  );
}

function GradeFeedback({ result }: { result: NonNullable<ExplainState["result"]> }) {
  const pct = Math.round(result.score * 100);
  const passed = result.score >= 0.6;

  return (
    <div
      className="mt-5 flex flex-col gap-3 border-t border-[var(--border)] pt-4"
      aria-live="polite"
    >
      <div className="flex flex-wrap items-center gap-2">
        <span className="metric text-2xl font-semibold">{pct}%</span>
        <Badge variant={passed ? "success" : "warn"}>{passed ? "Accepted" : "Needs work"}</Badge>
        {result.xpAwarded > 0 && <Badge variant="forge">+{result.xpAwarded} XP</Badge>}
        {result.degraded && (
          <Badge variant="neutral" title="The AI grader was unavailable; this score is provisional.">
            provisional
          </Badge>
        )}
      </div>

      <p className="max-w-[68ch] text-[14px] leading-relaxed">{result.feedback}</p>

      {result.missingConcepts.length > 0 && (
        <div>
          <h3 className="text-[11px] uppercase tracking-wide text-[var(--text-subtle)]">
            Not covered
          </h3>
          <ul className="mt-1.5 flex flex-wrap gap-1.5">
            {result.missingConcepts.map((c) => (
              <li key={c}>
                <Badge variant="outline">{c}</Badge>
              </li>
            ))}
          </ul>
        </div>
      )}

      {result.impreciseTerms.length > 0 && (
        <p className="text-[12px] text-[var(--text-muted)]">
          Imprecise phrasing: {result.impreciseTerms.join(", ")}. Precision is scored separately from
          correctness — it&apos;s what interviewers hear first.
        </p>
      )}

      {result.followUp && (
        <div className="flex gap-2 rounded-[var(--radius)] bg-[var(--surface-2)] p-3">
          <Lightbulb aria-hidden className="mt-0.5 size-4 shrink-0 text-[var(--forge-500)]" />
          <p className="text-[13px] leading-relaxed">
            <span className="font-medium">Follow-up: </span>
            {result.followUp}
          </p>
        </div>
      )}

      {result.weaknessOpened && (
        <p className="flex items-center gap-1.5 text-[12px] text-[var(--warn)]">
          <AlertTriangle aria-hidden className="size-3.5" />
          A weakness was opened for this skill. Research and revision are already scheduled — check
          tomorrow&apos;s Review block.
        </p>
      )}
    </div>
  );
}
