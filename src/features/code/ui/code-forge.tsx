"use client";

import { useActionState, useEffect, useRef, useState } from "react";
import { AlertTriangle, Check, Lightbulb, Play, X } from "lucide-react";

import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
import { Markdown } from "@/features/learn/ui/markdown";
import { cn } from "@/lib/utils";

import { submitSolution, type SubmitState } from "../actions";
import { detectEntryPoint, runTests, type RunOutcome, type TestCase } from "./runner";

export interface CodeForgeProps {
  problemId: string;
  title: string;
  statementMd: string;
  starterCode: string;
  language: string;
  tests: TestCase[];
  hints: string[];
  targetComplexity: string | null;
}

export function CodeForge(props: CodeForgeProps) {
  const [code, setCode] = useState(props.starterCode);
  const [outcome, setOutcome] = useState<RunOutcome | null>(null);
  const [running, setRunning] = useState(false);
  const [hintsShown, setHintsShown] = useState(0);
  const [complexity, setComplexity] = useState("");
  const startedAt = useRef<number | null>(null);

  const [state, formAction, submitting] = useActionState(submitSolution, {} as SubmitState);

  useEffect(() => {
    startedAt.current = Date.now();
  }, []);

  const entry = detectEntryPoint(props.starterCode) ?? "solution";

  async function handleRun() {
    setRunning(true);
    try {
      setOutcome(await runTests(code, entry, props.tests));
    } finally {
      setRunning(false);
    }
  }

  function handleSubmit(formData: FormData) {
    formData.set("code", code);
    formData.set("testsPassed", String(outcome?.passed ?? 0));
    formData.set("testsTotal", String(outcome?.total ?? props.tests.length));
    formData.set("hintsUsed", String(hintsShown));
    formData.set("complexityClaim", complexity);
    formData.set(
      "seconds",
      String(Math.round((Date.now() - (startedAt.current ?? Date.now())) / 1000)),
    );
    formAction(formData);
  }

  const allPassed = outcome !== null && outcome.total > 0 && outcome.passed === outcome.total;

  return (
    <div className="grid gap-6 lg:grid-cols-[minmax(0,420px)_minmax(0,1fr)]">
      <div className="flex flex-col gap-5">
        <Markdown content={props.statementMd} />

        {props.targetComplexity && (
          <p className="text-[13px] text-[var(--text-muted)]">
            Target: <span className="metric">{props.targetComplexity}</span>
          </p>
        )}

        <div>
          <h3 className="text-[13px] font-semibold">Hints</h3>
          <p className="mt-1 text-[12px] text-[var(--text-subtle)]">
            Each hint costs 10% of the XP for this problem, floored at half. Struggling first is
            worth more than the XP.
          </p>

          <ul className="mt-2 flex flex-col gap-2">
            {props.hints.slice(0, hintsShown).map((hint, i) => (
              <li
                key={i}
                className="flex gap-2 rounded-[var(--radius)] bg-[var(--surface-2)] p-3 text-[13px]"
              >
                <Lightbulb aria-hidden className="mt-0.5 size-4 shrink-0 text-[var(--forge-500)]" />
                {hint}
              </li>
            ))}
          </ul>

          {hintsShown < props.hints.length && (
            <Button
              variant="ghost"
              size="sm"
              className="mt-2"
              onClick={() => setHintsShown((n) => n + 1)}
            >
              Reveal hint {hintsShown + 1} of {props.hints.length}
            </Button>
          )}
        </div>
      </div>

      <div className="flex flex-col gap-3">
        <label className="flex flex-col gap-1.5">
          <span className="flex items-center gap-2 text-[12px] font-medium">
            Solution
            <Badge variant="neutral">{props.language}</Badge>
            <span className="metric text-[11px] text-[var(--text-subtle)]">
              entry: {entry}()
            </span>
          </span>
          <textarea
            value={code}
            onChange={(e) => setCode(e.target.value)}
            spellCheck={false}
            rows={18}
            className="metric w-full resize-y rounded-[var(--radius)] border border-[var(--border-strong)] bg-[var(--bg)] p-3 text-[13px] leading-relaxed"
          />
        </label>

        <div className="flex flex-wrap items-center gap-2">
          <Button variant="secondary" onClick={handleRun} disabled={running}>
            <Play aria-hidden /> {running ? "Running…" : "Run tests"}
          </Button>
          <span className="text-[12px] text-[var(--text-subtle)]">
            Runs in a sandboxed worker in your browser — never on the server.
          </span>
        </div>

        {outcome && <Results outcome={outcome} />}

        {allPassed && !state.result && (
          <form
            action={handleSubmit}
            className="flex flex-col gap-3 rounded-[var(--radius)] border border-[var(--border-strong)] bg-[var(--surface)] p-4"
          >
            <input type="hidden" name="problemId" value={props.problemId} />
            <input type="hidden" name="language" value={props.language} />

            <label className="flex flex-col gap-1.5">
              <span className="text-[12px] font-medium">
                State the complexity of your solution
              </span>
              <input
                value={complexity}
                onChange={(e) => setComplexity(e.target.value)}
                placeholder="O(n) time, O(n) space"
                className="h-9 rounded-[var(--radius)] border border-[var(--border-strong)] bg-[var(--bg)] px-3 text-sm"
              />
              <span className="text-[11px] text-[var(--text-subtle)]">
                Scored separately. Working code with the wrong complexity is a real gap — and it is
                the part an interviewer probes.
              </span>
            </label>

            {state.error && (
              <p role="alert" className="text-[13px] text-[var(--danger)]">
                {state.error}
              </p>
            )}

            <div>
              <Button type="submit" variant="primary" disabled={submitting}>
                {submitting ? "Recording…" : "Submit solution"}
              </Button>
            </div>
          </form>
        )}

        {state.result && <Submitted result={state.result} />}
      </div>
    </div>
  );
}

function Results({ outcome }: { outcome: RunOutcome }) {
  if (outcome.compileError) {
    return (
      <div className="rounded-[var(--radius)] border border-[var(--danger)]/40 bg-[var(--danger)]/10 p-3">
        <p className="text-[13px] font-medium text-[var(--danger)]">Your code didn&apos;t run</p>
        <pre className="metric mt-1 overflow-x-auto text-[12px]">{outcome.compileError}</pre>
      </div>
    );
  }

  if (outcome.timedOut) {
    return (
      <div className="rounded-[var(--radius)] border border-[var(--warn)]/40 bg-[var(--warn)]/10 p-3">
        <p className="text-[13px] font-medium text-[var(--warn)]">Timed out</p>
        <p className="mt-1 text-[12px] text-[var(--text-muted)]">
          Execution was stopped after 4 seconds. That usually means an infinite loop, or a solution
          far above the target complexity.
        </p>
      </div>
    );
  }

  return (
    <div className="overflow-hidden rounded-[var(--radius)] border border-[var(--border)]">
      <div className="flex items-center justify-between border-b border-[var(--border)] bg-[var(--surface-2)] px-3 py-2">
        <span className="text-[13px] font-medium">Tests</span>
        <span className="metric text-[12px]">
          {outcome.passed}/{outcome.total} passing
        </span>
      </div>
      <ul className="divide-y divide-[var(--border)]">
        {outcome.results.map((r) => (
          <li key={r.name} className="flex items-start gap-2 px-3 py-2 text-[13px]">
            <span
              className={cn(
                "mt-0.5 grid size-4 shrink-0 place-items-center rounded-full",
                r.passed
                  ? "bg-[var(--success)]/15 text-[var(--success)]"
                  : "bg-[var(--danger)]/15 text-[var(--danger)]",
              )}
            >
              {r.passed ? <Check aria-hidden className="size-3" /> : <X aria-hidden className="size-3" />}
            </span>
            <span className="min-w-0 flex-1">
              <span className="block">{r.name}</span>
              {!r.passed && (
                <span className="metric mt-0.5 block text-[11px] text-[var(--text-muted)]">
                  {r.error
                    ? r.error
                    : `expected ${JSON.stringify(r.expected)}, got ${JSON.stringify(r.actual)}`}
                </span>
              )}
            </span>
            <span className="metric shrink-0 text-[11px] text-[var(--text-subtle)]">{r.ms}ms</span>
          </li>
        ))}
      </ul>
    </div>
  );
}

function Submitted({ result }: { result: NonNullable<SubmitState["result"]> }) {
  return (
    <div
      className="flex flex-col gap-2 rounded-[var(--radius)] border border-[var(--border)] bg-[var(--surface)] p-4"
      aria-live="polite"
    >
      <div className="flex flex-wrap items-center gap-2">
        <Badge variant={result.passed ? "success" : "warn"}>
          {result.passed ? "Solved" : "Partial"}
        </Badge>
        <span className="metric text-lg font-semibold">{Math.round(result.score * 100)}%</span>
        {result.xpAwarded > 0 && <Badge variant="forge">+{result.xpAwarded} XP</Badge>}
      </div>

      {result.complexityMatches === false && (
        <p className="flex items-start gap-1.5 text-[13px] text-[var(--warn)]">
          <AlertTriangle aria-hidden className="mt-0.5 size-3.5 shrink-0" />
          Your complexity claim didn&apos;t match the target ({result.targetComplexity}). The code
          works — the cost analysis is the gap, and that&apos;s scored separately.
        </p>
      )}

      {result.complexityMatches === true && (
        <p className="text-[13px] text-[var(--success)]">
          Complexity claim matches the target.
        </p>
      )}

      {result.weaknessOpened && (
        <p className="text-[12px] text-[var(--warn)]">
          A weakness was opened — research and revision are scheduled.
        </p>
      )}
    </div>
  );
}
