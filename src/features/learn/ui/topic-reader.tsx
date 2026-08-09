"use client";

import { useActionState, useRef, useState } from "react";
import { AlertTriangle, Check, Lightbulb, Sparkles } from "lucide-react";

import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
import { cn } from "@/lib/utils";

import { submitExplanation, type ExplainState } from "../actions";
import { ScaffoldButtons, WorkedExample, scaffoldUsed } from "./guided-attempt";
import { Markdown } from "./markdown";
import { MermaidDiagram } from "./mermaid-diagram";

/**
 * The four explanation levels (§28), plus the Explain gate.
 *
 * The levels are a ladder, not alternatives: a beginner starts at Beginner and
 * climbs, and the labels say what each one is *for* rather than just naming a
 * seniority. Reading is the weakest evidence in the mastery model, so it
 * cannot close a Learn block on its own — the explanation below is what scores.
 */

export const LEVELS = [
  {
    key: "beginner",
    label: "Start here",
    sub: "Beginner",
    blurb: "Plain language, no assumed background.",
  },
  {
    key: "engineer",
    label: "How it works",
    sub: "Engineer",
    blurb: "The actual mechanism, with the details that matter.",
  },
  {
    key: "enterprise",
    label: "At scale",
    sub: "Enterprise",
    blurb: "What changes under real load, and what it costs.",
  },
  {
    key: "interview",
    label: "Say it out loud",
    sub: "Interview",
    blurb: "How to answer this under pressure, and the follow-ups to expect.",
  },
] as const;

export type LevelKey = (typeof LEVELS)[number]["key"];

const EXTRA_KINDS = [
  { key: "mistakes", label: "Common mistakes" },
  { key: "tradeoffs", label: "Trade-offs" },
  { key: "scenario", label: "Real scenario" },
  { key: "code", label: "Code" },
  { key: "security", label: "Security" },
  { key: "performance", label: "Performance" },
] as const;

export interface TopicMedia {
  id: string;
  kind: "mermaid" | "image" | "table";
  source: string;
  caption: string | null;
  explanationMd: string;
  altText: string | null;
}

export interface TopicReaderProps {
  topicId: string;
  title: string;
  bodies: Partial<Record<string, string>>;
  media: TopicMedia[];
  alreadyExplained: boolean;
}

export function TopicReader({
  topicId,
  title,
  bodies,
  media,
  alreadyExplained,
}: TopicReaderProps) {
  const [level, setLevel] = useState<LevelKey>("beginner");
  const [draft, setDraft] = useState("");
  const textareaRef = useRef<HTMLTextAreaElement>(null);
  const [state, formAction, pending] = useActionState(submitExplanation, {} as ExplainState);

  // Scaffolding is for the blank page. Once there's a real draft it stops
  // being help and starts being clutter, so it withdraws on its own.
  const showGuidance = !alreadyExplained && draft.trim().length < 240;

  function insertStarter(starter: string) {
    setDraft((current) => {
      const needsBreak = current.length > 0 && !current.endsWith("\n\n");
      return current + (needsBreak ? "\n\n" : "") + starter;
    });
    // Put the caret after the inserted phrase so they can just keep typing.
    requestAnimationFrame(() => {
      const el = textareaRef.current;
      if (!el) return;
      el.focus();
      el.setSelectionRange(el.value.length, el.value.length);
      el.scrollTop = el.scrollHeight;
    });
  }

  const levelIndex = LEVELS.findIndex((l) => l.key === level);
  const extras = EXTRA_KINDS.map((k) => ({ ...k, body: bodies[k.key] })).filter(
    (x): x is (typeof EXTRA_KINDS)[number] & { body: string } => typeof x.body === "string",
  );

  return (
    <div className="flex flex-col gap-10">
      {/* ── Level ladder ──────────────────────────────────────────────── */}
      <section>
        <div
          role="tablist"
          aria-label="Explanation level"
          className="grid grid-cols-2 gap-2 sm:grid-cols-4"
        >
          {LEVELS.map((l, i) => {
            const active = level === l.key;
            const available = Boolean(bodies[l.key]);
            return (
              <button
                key={l.key}
                role="tab"
                aria-selected={active}
                disabled={!available}
                onClick={() => setLevel(l.key)}
                className={cn(
                  "flex flex-col items-start gap-0.5 rounded-[var(--radius)] border px-3 py-2.5 text-left transition-all duration-150",
                  active
                    ? "border-[var(--forge-500)] bg-[var(--forge-glow)] shadow-[var(--shadow-sm)]"
                    : "border-[var(--border)] bg-[var(--surface)] hover:border-[var(--border-strong)]",
                  !available && "cursor-not-allowed opacity-40",
                )}
              >
                <span className="metric text-[10px] text-[var(--text-subtle)]">
                  {String(i + 1).padStart(2, "0")}
                </span>
                <span
                  className={cn(
                    "text-[13px] font-medium",
                    active ? "text-[var(--forge-600)]" : "text-[var(--text)]",
                  )}
                >
                  {l.label}
                </span>
                <span className="text-[11px] text-[var(--text-subtle)]">{l.sub}</span>
              </button>
            );
          })}
        </div>

        <p className="mt-3 text-[13px] text-[var(--text-muted)]">
          {LEVELS[levelIndex]?.blurb}
        </p>

        <div className="mt-6 animate-fade" key={level}>
          {bodies[level] ? (
            <Markdown content={bodies[level]} />
          ) : (
            <p className="text-[13px] text-[var(--text-subtle)]">
              This level hasn&apos;t been written yet.
            </p>
          )}
        </div>

        {levelIndex < LEVELS.length - 1 && bodies[LEVELS[levelIndex + 1].key] && (
          <button
            onClick={() => setLevel(LEVELS[levelIndex + 1].key)}
            className="mt-6 flex w-full items-center justify-between rounded-[var(--radius)] border border-[var(--border)] bg-[var(--surface-2)] px-4 py-3 text-left transition-colors hover:border-[var(--border-strong)]"
          >
            <span>
              <span className="block text-[13px] font-medium">
                Next: {LEVELS[levelIndex + 1].label}
              </span>
              <span className="block text-[12px] text-[var(--text-muted)]">
                {LEVELS[levelIndex + 1].blurb}
              </span>
            </span>
            <span aria-hidden className="text-[var(--forge-500)]">
              →
            </span>
          </button>
        )}
      </section>

      {/* ── Diagrams, each with its explanation ───────────────────────── */}
      {media.length > 0 && (
        <section>
          <h2 className="text-[13px] font-semibold uppercase tracking-wide text-[var(--text-subtle)]">
            Seeing it
          </h2>
          <div className="mt-4 flex flex-col gap-8">
            {media.map((m) => (
              <div key={m.id}>
                {m.kind === "mermaid" ? (
                  <MermaidDiagram source={m.source} caption={m.caption} />
                ) : m.kind === "image" ? (
                  <figure className="my-2">
                    {/* eslint-disable-next-line @next/next/no-img-element */}
                    <img
                      src={m.source}
                      alt={m.altText ?? ""}
                      loading="lazy"
                      className="mx-auto max-w-full rounded-[var(--radius)] border border-[var(--border)]"
                    />
                    {m.caption && (
                      <figcaption className="mt-2 text-center text-[13px] text-[var(--text-muted)]">
                        {m.caption}
                      </figcaption>
                    )}
                  </figure>
                ) : (
                  <Markdown content={m.source} />
                )}

                {/* A diagram without an explanation is decoration. */}
                <div className="mt-2">
                  <Markdown content={m.explanationMd} />
                </div>
              </div>
            ))}
          </div>
        </section>
      )}

      {/* ── Supporting material ───────────────────────────────────────── */}
      {extras.length > 0 && (
        <section className="flex flex-col gap-3">
          {extras.map((x) => (
            <details
              key={x.key}
              className="group rounded-[var(--radius)] border border-[var(--border)] bg-[var(--surface)] px-4 py-3"
            >
              <summary className="cursor-pointer list-none text-[14px] font-medium">
                <span className="mr-2 inline-block text-[var(--text-subtle)] transition-transform group-open:rotate-90">
                  ›
                </span>
                {x.label}
              </summary>
              <div className="mt-3">
                <Markdown content={x.body} />
              </div>
            </details>
          ))}
        </section>
      )}

      {/* ── The Explain gate ──────────────────────────────────────────── */}
      <section className="rounded-[var(--radius-lg)] border border-[var(--border-strong)] bg-[var(--surface)] p-6 shadow-[var(--shadow-sm)]">
        <h2 className="flex items-center gap-2 text-[15px] font-semibold">
          <Sparkles aria-hidden className="size-4 text-[var(--forge-500)]" />
          Now explain it back
        </h2>
        <p className="mt-1.5 max-w-[62ch] text-[14px] leading-relaxed text-[var(--text-muted)]">
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

        {showGuidance && (
          <div className="mt-5 flex flex-col gap-3">
            <WorkedExample />
            <ScaffoldButtons onInsert={insertStarter} used={scaffoldUsed(draft)} />
          </div>
        )}

        <form action={formAction} className="mt-5 flex flex-col gap-3">
          <input type="hidden" name="topicId" value={topicId} />
          <input type="hidden" name="level" value={level} />

          <label>
            <span className="sr-only">Your explanation of {title}</span>
            <textarea
              ref={textareaRef}
              name="body"
              rows={7}
              required
              minLength={40}
              value={draft}
              onChange={(e) => setDraft(e.target.value)}
              placeholder={`Explain ${title} as if to an interviewer. Cover the mechanism, why it matters, and at least one trade-off.`}
              className="w-full resize-y rounded-[var(--radius)] border border-[var(--border-strong)] bg-[var(--bg)] p-4 text-[15px] leading-relaxed transition-shadow focus:shadow-[0_0_0_4px_var(--forge-ring)]"
            />
          </label>

          {draft.trim().length > 0 && draft.trim().length < 40 && (
            <p className="text-[12px] text-[var(--text-subtle)]">
              {40 - draft.trim().length} more characters before you can submit.
            </p>
          )}

          {state.error && (
            <p role="alert" className="text-[13px] text-[var(--danger)]">
              {state.error}
            </p>
          )}

          <div className="flex flex-wrap items-center gap-3">
            <Button type="submit" variant="primary" size="lg" disabled={pending}>
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
      className="mt-6 flex animate-rise flex-col gap-4 border-t border-[var(--border)] pt-5"
      aria-live="polite"
    >
      <div className="flex flex-wrap items-center gap-2.5">
        <span className="metric text-[2rem] font-semibold leading-none">{pct}%</span>
        <Badge variant={passed ? "success" : "warn"}>{passed ? "Accepted" : "Needs work"}</Badge>
        {result.xpAwarded > 0 && <Badge variant="forge">+{result.xpAwarded} XP</Badge>}
        {result.degraded && (
          <Badge variant="neutral" title="The AI grader was unavailable; this score is provisional.">
            provisional
          </Badge>
        )}
      </div>

      <p className="measure text-[15px] leading-relaxed">{result.feedback}</p>

      {result.missingConcepts.length > 0 && (
        <div>
          <h3 className="text-[11px] uppercase tracking-wide text-[var(--text-subtle)]">
            Not covered
          </h3>
          <ul className="mt-2 flex flex-wrap gap-1.5">
            {result.missingConcepts.map((c) => (
              <li key={c}>
                <Badge variant="outline">{c}</Badge>
              </li>
            ))}
          </ul>
        </div>
      )}

      {result.impreciseTerms.length > 0 && (
        <p className="text-[13px] text-[var(--text-muted)]">
          Imprecise phrasing: {result.impreciseTerms.join(", ")}. Precision is scored separately from
          correctness — it&apos;s what interviewers hear first.
        </p>
      )}

      {result.followUp && (
        <div className="inset flex gap-2.5 p-4">
          <Lightbulb aria-hidden className="mt-0.5 size-4 shrink-0 text-[var(--forge-500)]" />
          <p className="text-[14px] leading-relaxed">
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
