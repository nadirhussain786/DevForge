"use client";

import { useActionState, useState } from "react";
import { Check, Eye, Lock } from "lucide-react";

import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
import { Markdown } from "@/features/learn/ui/markdown";
import { cn } from "@/lib/utils";

import { scoreDesign, submitDesign, type DesignState, type ScoreState } from "../actions";

export interface Criterion {
  id: string;
  label: string;
  weight: number;
}

export interface DesignWorkspaceProps {
  caseId: string;
  briefMd: string;
  constraints: Record<string, unknown>;
  criteria: Criterion[];
  /** Present only once an attempt has been submitted. */
  reference: string | null;
  existingAttemptId: string | null;
  existingScore: number | null;
  existingSubmission: string | null;
}

export function DesignWorkspace(props: DesignWorkspaceProps) {
  const [submitState, submitAction, submitting] = useActionState(submitDesign, {} as DesignState);
  const [scoreState, scoreAction, scoring] = useActionState(scoreDesign, {} as ScoreState);
  const [revealed, setRevealed] = useState(false);

  const attemptId = submitState.attemptId ?? props.existingAttemptId;
  const hasSubmitted = Boolean(attemptId);
  const alreadyScored = props.existingScore !== null || Boolean(scoreState.result);

  return (
    <div className="flex flex-col gap-6">
      <section>
        <Markdown content={props.briefMd} />

        {Object.keys(props.constraints).length > 0 && (
          <dl className="mt-4 grid gap-2 rounded-[var(--radius)] border border-[var(--border)] bg-[var(--surface)] p-4 sm:grid-cols-2">
            {Object.entries(props.constraints).map(([key, value]) => (
              <div key={key}>
                <dt className="text-[11px] uppercase tracking-wide text-[var(--text-subtle)]">
                  {key.replace(/_/g, " ")}
                </dt>
                <dd className="text-[13px]">{String(value)}</dd>
              </div>
            ))}
          </dl>
        )}
      </section>

      {!hasSubmitted ? (
        <form
          action={submitAction}
          className="flex flex-col gap-3 rounded-[var(--radius)] border border-[var(--border-strong)] bg-[var(--surface)] p-5"
        >
          <input type="hidden" name="caseId" value={props.caseId} />

          <div className="flex items-center gap-2">
            <Lock aria-hidden className="size-4 text-[var(--text-subtle)]" />
            <p className="text-[13px] text-[var(--text-muted)]">
              The reference architecture unlocks after you submit. Reading a model answer before
              attempting one teaches nothing — the value is the gap between what you wrote and what
              you didn&apos;t think of.
            </p>
          </div>

          <label className="flex flex-col gap-1.5">
            <span className="text-[12px] font-medium">Your design</span>
            <textarea
              name="submissionMd"
              rows={16}
              required
              minLength={120}
              placeholder={
                "Requirements and scale\n\nData model\n\nArchitecture\n\nFailure modes\n\nTrade-offs — what you gained and what it cost"
              }
              className="w-full resize-y rounded-[var(--radius)] border border-[var(--border-strong)] bg-[var(--bg)] p-3 text-[14px] leading-relaxed"
            />
          </label>

          <label className="flex flex-col gap-1.5">
            <span className="text-[12px] font-medium">Diagram (Mermaid, optional)</span>
            <textarea
              name="diagramMermaid"
              rows={4}
              placeholder={"flowchart LR\n  client --> api --> queue --> worker"}
              className="metric w-full resize-y rounded-[var(--radius)] border border-[var(--border-strong)] bg-[var(--bg)] p-3 text-[13px]"
            />
          </label>

          {submitState.error && (
            <p role="alert" className="text-[13px] text-[var(--danger)]">
              {submitState.error}
            </p>
          )}

          <div>
            <Button type="submit" variant="primary" disabled={submitting}>
              {submitting ? "Submitting…" : "Submit design"}
            </Button>
          </div>
        </form>
      ) : (
        <>
          {props.existingSubmission && (
            <details className="rounded-[var(--radius)] border border-[var(--border)] bg-[var(--surface)] p-4">
              <summary className="cursor-pointer text-[13px] font-medium">Your submission</summary>
              <div className="mt-3">
                <Markdown content={props.existingSubmission} />
              </div>
            </details>
          )}

          <section className="rounded-[var(--radius)] border border-[var(--border)] bg-[var(--surface)] p-5">
            <div className="flex flex-wrap items-center gap-2">
              <h2 className="text-sm font-semibold">Reference architecture</h2>
              <Badge variant="success">unlocked</Badge>
            </div>

            {!revealed ? (
              <Button variant="secondary" className="mt-3" onClick={() => setRevealed(true)}>
                <Eye aria-hidden /> Reveal
              </Button>
            ) : props.reference ? (
              <div className="mt-4">
                <Markdown content={props.reference} />
              </div>
            ) : (
              <p className="mt-3 text-[13px] text-[var(--text-muted)]">
                No reference architecture has been authored for this case yet.
              </p>
            )}
          </section>

          {revealed && !alreadyScored && (
            <form
              action={scoreAction}
              className="flex flex-col gap-3 rounded-[var(--radius)] border border-[var(--border-strong)] bg-[var(--surface)] p-5"
            >
              <input type="hidden" name="attemptId" value={attemptId ?? ""} />
              <input type="hidden" name="caseId" value={props.caseId} />

              <h2 className="text-sm font-semibold">Score yourself against the rubric</h2>
              <p className="max-w-[68ch] text-[13px] text-[var(--text-muted)]">
                A design has no test suite. Having just written your own answer and read a
                reference, you are unusually well placed to judge which criteria you actually hit —
                and an honest assessment here is worth far more to your readiness score than a
                flattering one.
              </p>

              <ul className="mt-1 flex flex-col gap-3">
                {props.criteria.map((c) => (
                  <li key={c.id} className="flex flex-wrap items-center gap-3">
                    <span className="min-w-0 flex-1 text-[13px]">{c.label}</span>
                    <span className="flex gap-1">
                      {(["hit", "partial", "missed"] as const).map((value) => (
                        <label
                          key={value}
                          className={cn(
                            "cursor-pointer rounded-[var(--radius)] border px-2.5 py-1 text-[12px]",
                            "border-[var(--border-strong)] text-[var(--text-muted)]",
                            "has-[:checked]:border-[var(--forge-500)] has-[:checked]:bg-[var(--forge-glow)] has-[:checked]:text-[var(--forge-500)]",
                          )}
                        >
                          <input
                            type="radio"
                            name={`criterion_${c.id}`}
                            value={value}
                            defaultChecked={value === "missed"}
                            className="sr-only"
                          />
                          {value}
                        </label>
                      ))}
                    </span>
                  </li>
                ))}
              </ul>

              {scoreState.error && (
                <p role="alert" className="text-[13px] text-[var(--danger)]">
                  {scoreState.error}
                </p>
              )}

              <div>
                <Button type="submit" variant="primary" disabled={scoring}>
                  {scoring ? "Recording…" : "Record score"}
                </Button>
              </div>
            </form>
          )}

          {(scoreState.result || props.existingScore !== null) && (
            <div className="flex flex-wrap items-center gap-2 rounded-[var(--radius)] border border-[var(--border)] bg-[var(--surface)] p-4">
              <Check aria-hidden className="size-4 text-[var(--success)]" />
              <span className="metric text-lg font-semibold">
                {scoreState.result?.overall ?? Math.round(props.existingScore ?? 0)}%
              </span>
              <span className="text-[13px] text-[var(--text-muted)]">recorded as evidence</span>
              {scoreState.result?.xpAwarded ? (
                <Badge variant="forge">+{scoreState.result.xpAwarded} XP</Badge>
              ) : null}
            </div>
          )}
        </>
      )}
    </div>
  );
}
