"use client";

import { useState } from "react";
import { BookOpen, PenLine } from "lucide-react";

import { cn } from "@/lib/utils";

/**
 * Guided first attempt — the scaffolding for someone facing a blank textarea.
 *
 * The Explain gate is the hardest thing in the product for a beginner, because
 * it asks for production rather than recognition. Two aids, both of which
 * disappear once they aren't needed:
 *
 *   - A scaffold whose three parts are the same three things the grader looks
 *     for. Nothing is hidden: the rubric is the outline.
 *   - One worked example, annotated with *why* each sentence earns its score.
 *     It is deliberately about a different topic, so it teaches the shape of a
 *     strong answer without handing over the answer to this one.
 */

interface ScaffoldPart {
  id: string;
  label: string;
  hint: string;
  starter: string;
}

/**
 * These map onto the fixed grading criteria, not onto any per-topic rubric —
 * which is why the same scaffold is correct on every topic in the product.
 */
export const SCAFFOLD: ScaffoldPart[] = [
  {
    id: "mechanism",
    label: "What it actually does",
    hint: "The mechanism, in steps. Not the definition — how it works.",
    starter: "It works by ",
  },
  {
    id: "why",
    label: "Why it exists",
    hint: "What breaks without it. Name the concrete failure.",
    starter: "Without it, ",
  },
  {
    id: "tradeoff",
    label: "What it costs",
    hint: "Every choice buys something and pays for it. Name the price.",
    starter: "The trade-off is that ",
  },
];

export function ScaffoldButtons({
  onInsert,
  used,
}: {
  onInsert: (starter: string) => void;
  used: ReadonlySet<string>;
}) {
  return (
    <div className="flex flex-col gap-2">
      <p className="text-[12px] text-[var(--text-subtle)]">
        Stuck on how to start? These are the three things the grader looks for.
      </p>
      <div className="grid gap-2 sm:grid-cols-3">
        {SCAFFOLD.map((part) => (
          <button
            key={part.id}
            type="button"
            onClick={() => onInsert(part.starter)}
            className={cn(
              "flex flex-col gap-1 rounded-[var(--radius)] border px-3 py-2.5 text-left transition-all duration-150",
              used.has(part.id)
                ? "border-[var(--success)]/30 bg-[var(--success)]/[0.05]"
                : "border-[var(--border)] bg-[var(--surface)] hover:border-[var(--border-strong)] hover:shadow-[var(--shadow-sm)]",
            )}
          >
            <span className="flex items-center gap-1.5 text-[12.5px] font-medium">
              <PenLine aria-hidden className="size-3 text-[var(--forge-500)]" />
              {part.label}
            </span>
            <span className="text-[11.5px] leading-snug text-[var(--text-subtle)]">{part.hint}</span>
          </button>
        ))}
      </div>
    </div>
  );
}

/** Which scaffold parts the learner's draft already covers, judged by the starter phrase. */
export function scaffoldUsed(draft: string): Set<string> {
  const lower = draft.toLowerCase();
  return new Set(SCAFFOLD.filter((p) => lower.includes(p.starter.trim().toLowerCase())).map((p) => p.id));
}

// ── The worked example ──────────────────────────────────────────────────────

const EXAMPLE_LINES: { text: string; note: string; part: string }[] = [
  {
    part: "mechanism",
    text: "A database index is a separate sorted structure — usually a B-tree — holding the indexed column's values alongside pointers back to the rows. Looking up a value walks the tree instead of reading the table, so the cost is proportional to the tree's depth rather than the table's size.",
    note: "Names the actual data structure and the actual cost. 'It makes queries faster' would score nothing here — that's the effect, not the mechanism.",
  },
  {
    part: "why",
    text: "Without one, finding a single row means a sequential scan: every row is read and tested. On ten thousand rows nobody notices. On fifty million it's the difference between two milliseconds and forty seconds, and it gets worse linearly as the table grows.",
    note: "A concrete failure with real magnitudes. Specific numbers are what separate someone who has hit this from someone who has read about it.",
  },
  {
    part: "tradeoff",
    text: "The cost is on writes. Every insert, update and delete has to maintain the index too, so a table with six indexes does seven structures' worth of work per write. Indexes also occupy real disk and real memory, and an index the planner never chooses is pure overhead.",
    note: "Trade-offs come in pairs. Naming both sides is the single strongest signal in an interview — it shows you've operated the thing, not just used it.",
  },
  {
    part: "precision",
    text: "It's also worth saying the planner decides whether to use an index — creating one gives it an option, not an instruction. If a condition matches most of the table, a sequential scan genuinely is cheaper.",
    note: "Precision is scored separately from correctness. This sentence corrects a common misconception before the interviewer has to ask about it.",
  },
];

export function WorkedExample() {
  const [open, setOpen] = useState(false);
  const [annotated, setAnnotated] = useState(true);

  return (
    <div className="rounded-[var(--radius)] border border-[var(--border)] bg-[var(--surface-2)]">
      <button
        type="button"
        onClick={() => setOpen((o) => !o)}
        aria-expanded={open}
        className="flex w-full items-center gap-2 px-4 py-3 text-left text-[13px] font-medium"
      >
        <BookOpen aria-hidden className="size-3.5 text-[var(--forge-500)]" />
        See a worked example first
        <span
          aria-hidden
          className={cn(
            "ml-auto text-[var(--text-subtle)] transition-transform duration-200",
            open && "rotate-90",
          )}
        >
          ›
        </span>
      </button>

      {open && (
        <div className="animate-fade border-t border-[var(--border)] px-4 pb-4 pt-3.5">
          <div className="flex flex-wrap items-baseline justify-between gap-2">
            <p className="measure text-[13px] leading-relaxed text-[var(--text-muted)]">
              A strong answer to <em>&ldquo;explain database indexes&rdquo;</em>. It&apos;s a
              different topic on purpose — copy the shape, not the content.
            </p>
            <button
              type="button"
              onClick={() => setAnnotated((a) => !a)}
              className="shrink-0 text-[12px] text-[var(--forge-600)] underline-offset-2 hover:underline"
            >
              {annotated ? "Hide why it scores" : "Show why it scores"}
            </button>
          </div>

          <div className="mt-4 flex flex-col gap-4">
            {EXAMPLE_LINES.map((line) => (
              <div key={line.part}>
                <p className="reading border-l-2 border-[var(--forge-500)]/30 pl-3.5 text-[14.5px]">
                  {line.text}
                </p>
                {annotated && (
                  <p className="mt-1.5 pl-3.5 text-[12.5px] leading-relaxed text-[var(--text-subtle)]">
                    {line.note}
                  </p>
                )}
              </div>
            ))}
          </div>

          <p className="mt-4 text-[12px] leading-relaxed text-[var(--text-subtle)]">
            Four short paragraphs, roughly 150 words. Length is not what&apos;s being scored —
            a rambling page covering two of these four would score lower than this does.
          </p>
        </div>
      )}
    </div>
  );
}
