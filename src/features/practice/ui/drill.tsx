"use client";

import { useActionState, useEffect, useRef, useState } from "react";
import { AlertTriangle, ArrowRight, Check, Lightbulb, X } from "lucide-react";

import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
import { Markdown } from "@/features/learn/ui/markdown";
import { cn } from "@/lib/utils";

import { submitAnswer, type AnswerState } from "../actions";
import type { DrillQuestion } from "../data/select";

/**
 * One question at a time, feedback only after answering.
 *
 * The MCQ answer key is readable by the client — that's deliberate and
 * documented in migration 0004: instant feedback is worth more than a
 * defence that only inconveniences honest users, and cheating costs the
 * cheater their own mastery score, which is the only score that matters.
 */

export function Drill({ questions }: { questions: readonly DrillQuestion[] }) {
  const [index, setIndex] = useState(0);
  const [answered, setAnswered] = useState<Record<string, number>>({});
  const question = questions[index];

  if (!question) {
    return <SessionComplete answered={answered} total={questions.length} />;
  }

  return (
    <QuestionCard
      key={question.id}
      question={question}
      index={index}
      total={questions.length}
      onNext={(score) => {
        setAnswered((a) => ({ ...a, [question.id]: score }));
        setIndex((i) => i + 1);
      }}
    />
  );
}

function QuestionCard({
  question,
  index,
  total,
  onNext,
}: {
  question: DrillQuestion;
  index: number;
  total: number;
  onNext: (score: number) => void;
}) {
  const [state, formAction, pending] = useActionState(submitAnswer, {} as AnswerState);
  const startedAt = useRef<number | null>(null);
  const result = state.result;

  // Timing is started in an effect and read in the submit handler. Calling
  // Date.now() or reading a ref during render is impure — React may re-render
  // at any time, which would silently change the recorded duration.
  useEffect(() => {
    startedAt.current = Date.now();
  }, []);

  function handleSubmit(formData: FormData) {
    const started = startedAt.current ?? Date.now();
    formData.set("seconds", String(Math.round((Date.now() - started) / 1000)));
    formAction(formData);
  }

  return (
    <div className="flex flex-col gap-4">
      <div className="flex flex-wrap items-center gap-2">
        <span className="metric text-[11px] text-[var(--text-subtle)]">
          {index + 1} / {total}
        </span>
        <Badge variant="outline">{question.skillName}</Badge>
        <Badge variant="neutral">difficulty {question.difficulty}/5</Badge>
        <span className="text-[11px] text-[var(--text-subtle)]">{question.reason}</span>
      </div>

      <div className="rounded-[var(--radius)] border border-[var(--border)] bg-[var(--surface)] p-5">
        <Markdown content={question.promptMd} />

        <form action={handleSubmit} className="mt-5 flex flex-col gap-3">
          <input type="hidden" name="questionId" value={question.id} />

          {question.kind === "mcq" ? (
            <fieldset disabled={Boolean(result) || pending} className="flex flex-col gap-2">
              <legend className="sr-only">Choose an answer</legend>
              {question.choices.map((choice) => (
                <label
                  key={choice.id}
                  className={cn(
                    "flex cursor-pointer items-start gap-2.5 rounded-[var(--radius)] border p-3 text-[14px]",
                    "border-[var(--border-strong)] hover:bg-[var(--surface-2)]",
                    "has-[:checked]:border-[var(--forge-500)] has-[:checked]:bg-[var(--forge-glow)]",
                  )}
                >
                  <input
                    type="checkbox"
                    name="selected"
                    value={choice.id}
                    className="mt-0.5 accent-[var(--forge-500)]"
                  />
                  <span>{choice.text}</span>
                </label>
              ))}
            </fieldset>
          ) : (
            <label className="flex flex-col gap-1.5">
              <span className="sr-only">Your answer</span>
              <textarea
                name="response"
                rows={6}
                disabled={Boolean(result) || pending}
                placeholder="Answer as you would in an interview — state the mechanism, then the trade-off."
                className="w-full resize-y rounded-[var(--radius)] border border-[var(--border-strong)] bg-[var(--bg)] p-3 text-[14px] leading-relaxed disabled:opacity-60"
              />
            </label>
          )}

          {state.error && (
            <p role="alert" className="text-[13px] text-[var(--danger)]">
              {state.error}
            </p>
          )}

          {!result && (
            <div>
              <Button type="submit" variant="primary" disabled={pending}>
                {pending ? "Scoring…" : "Submit answer"}
              </Button>
            </div>
          )}
        </form>

        {result && (
          <Feedback
            result={result}
            onNext={() => onNext(result.score)}
            isLast={index + 1 >= total}
          />
        )}
      </div>
    </div>
  );
}

function Feedback({
  result,
  onNext,
  isLast,
}: {
  result: NonNullable<AnswerState["result"]>;
  onNext: () => void;
  isLast: boolean;
}) {
  return (
    <div className="mt-5 flex flex-col gap-3 border-t border-[var(--border)] pt-4" aria-live="polite">
      <div className="flex flex-wrap items-center gap-2">
        <span
          className={cn(
            "grid size-7 place-items-center rounded-full",
            result.correct
              ? "bg-[var(--success)]/15 text-[var(--success)]"
              : "bg-[var(--danger)]/15 text-[var(--danger)]",
          )}
        >
          {result.correct ? <Check aria-hidden className="size-4" /> : <X aria-hidden className="size-4" />}
        </span>
        <span className="metric text-lg font-semibold">{Math.round(result.score * 100)}%</span>
        {result.xpAwarded > 0 && <Badge variant="forge">+{result.xpAwarded} XP</Badge>}
        {result.degraded && <Badge variant="neutral">provisional</Badge>}
      </div>

      <p className="max-w-[68ch] text-[14px] leading-relaxed">{result.feedback}</p>

      {result.explanation && (
        <p className="max-w-[68ch] text-[13px] text-[var(--text-muted)]">{result.explanation}</p>
      )}

      {result.missingConcepts.length > 0 && (
        <ul className="flex flex-wrap gap-1.5">
          {result.missingConcepts.map((c) => (
            <li key={c}>
              <Badge variant="outline">{c}</Badge>
            </li>
          ))}
        </ul>
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
          Weakness opened — research and revision are scheduled automatically.
        </p>
      )}

      <div>
        <Button variant="secondary" onClick={onNext}>
          {isLast ? "Finish session" : "Next question"} <ArrowRight aria-hidden />
        </Button>
      </div>
    </div>
  );
}

function SessionComplete({
  answered,
  total,
}: {
  answered: Record<string, number>;
  total: number;
}) {
  const scores = Object.values(answered);
  const mean = scores.length ? scores.reduce((a, b) => a + b, 0) / scores.length : 0;

  return (
    <div className="rounded-[var(--radius)] border border-[var(--border)] bg-[var(--surface)] p-6">
      <h2 className="text-lg font-semibold">Session complete</h2>
      <p className="mt-1 text-[13px] text-[var(--text-muted)]">
        {scores.length} of {total} answered · average {Math.round(mean * 100)}%
      </p>
      <p className="mt-3 max-w-[60ch] text-[13px] text-[var(--text-muted)]">
        Anything you missed is already scheduled. Your mastery scores have been updated from these
        answers — check the Skills page to see which evidence moved them.
      </p>
      <div className="mt-4 flex gap-2">
        <Button variant="primary" onClick={() => window.location.reload()}>
          New session
        </Button>
        <a href="/skills">
          <Button variant="outline">View skills</Button>
        </a>
      </div>
    </div>
  );
}
