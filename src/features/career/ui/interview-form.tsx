"use client";

import { useActionState, useState } from "react";
import { AlertTriangle, Plus, Trash2 } from "lucide-react";

import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";

import { logInterview, type InterviewState } from "../actions";

/**
 * Interview Memory (§11).
 *
 * The per-question grid is the whole point: a real interview question is the
 * strongest evidence the model accepts, and every `shaky` or `failed` answer
 * opens a weakness with research and revision already scheduled.
 */

const STAGES = [
  ["recruiter", "Recruiter screen"],
  ["technical_screen", "Technical screen"],
  ["technical", "Technical interview"],
  ["system_design", "System design"],
  ["behavioral", "Behavioural"],
  ["final", "Final round"],
  ["take_home", "Take-home"],
] as const;

const QUALITIES = [
  ["strong", "Answered well"],
  ["shaky", "Shaky"],
  ["failed", "Couldn't answer"],
  ["unanswered", "Ran out of time"],
] as const;

export function InterviewForm({ skills }: { skills: Array<{ id: string; name: string }> }) {
  const [state, formAction, pending] = useActionState(logInterview, {} as InterviewState);
  const [rows, setRows] = useState([0]);

  if (state.result) {
    return (
      <div className="rounded-[var(--radius)] border border-[var(--border)] bg-[var(--surface)] p-5">
        <h3 className="text-sm font-semibold">Interview recorded</h3>
        <p className="mt-1 max-w-[64ch] text-[13px] text-[var(--text-muted)]">
          {state.result.questionsLogged} question
          {state.result.questionsLogged === 1 ? "" : "s"} logged.
          {state.result.weaknessesOpened > 0 ? (
            <>
              {" "}
              <strong>{state.result.weaknessesOpened}</strong> weakness
              {state.result.weaknessesOpened === 1 ? " was" : "es were"} opened, with research and
              spaced revision already scheduled — check Review.
            </>
          ) : (
            " Nothing opened a weakness."
          )}
        </p>
        <Button className="mt-4" variant="secondary" onClick={() => window.location.reload()}>
          Log another
        </Button>
      </div>
    );
  }

  return (
    <form
      action={formAction}
      className="rounded-[var(--radius)] border border-[var(--border)] bg-[var(--surface)] p-5"
    >
      <h3 className="text-sm font-semibold">Log a real interview</h3>
      <p className="mt-1 max-w-[68ch] text-[13px] text-[var(--text-muted)]">
        This teaches the system more than anything it can generate. Be honest about what went badly
        — that&apos;s the part that turns into a study plan.
      </p>

      <div className="mt-4 grid gap-3 sm:grid-cols-2">
        <label className="flex flex-col gap-1.5">
          <span className="text-[12px] font-medium">Role</span>
          <input
            name="roleTitle"
            required
            placeholder="Senior Full-Stack Engineer"
            className="h-9 rounded-[var(--radius)] border border-[var(--border-strong)] bg-[var(--bg)] px-3 text-sm"
          />
        </label>

        <label className="flex flex-col gap-1.5">
          <span className="text-[12px] font-medium">Company</span>
          <input
            name="company"
            placeholder="Optional"
            className="h-9 rounded-[var(--radius)] border border-[var(--border-strong)] bg-[var(--bg)] px-3 text-sm"
          />
        </label>

        <label className="flex flex-col gap-1.5">
          <span className="text-[12px] font-medium">Stage</span>
          <select
            name="stage"
            required
            className="h-9 rounded-[var(--radius)] border border-[var(--border-strong)] bg-[var(--bg)] px-2 text-sm"
          >
            {STAGES.map(([value, label]) => (
              <option key={value} value={value}>
                {label}
              </option>
            ))}
          </select>
        </label>

        <label className="flex flex-col gap-1.5">
          <span className="text-[12px] font-medium">Date</span>
          <input
            name="occurredAt"
            type="date"
            required
            defaultValue={new Date().toISOString().slice(0, 10)}
            className="h-9 rounded-[var(--radius)] border border-[var(--border-strong)] bg-[var(--bg)] px-3 text-sm"
          />
        </label>

        <label className="flex flex-col gap-1.5">
          <span className="text-[12px] font-medium">Outcome</span>
          <select
            name="outcome"
            className="h-9 rounded-[var(--radius)] border border-[var(--border-strong)] bg-[var(--bg)] px-2 text-sm"
          >
            <option value="pending">Waiting to hear</option>
            <option value="passed">Moved forward</option>
            <option value="failed">Rejected</option>
            <option value="withdrawn">Withdrew</option>
          </select>
        </label>

        <label className="flex flex-col gap-1.5">
          <span className="text-[12px] font-medium">How it felt (1–5)</span>
          <select
            name="confidence"
            defaultValue="3"
            className="h-9 rounded-[var(--radius)] border border-[var(--border-strong)] bg-[var(--bg)] px-2 text-sm"
          >
            {[1, 2, 3, 4, 5].map((n) => (
              <option key={n} value={n}>
                {n}
              </option>
            ))}
          </select>
        </label>
      </div>

      <div className="mt-5">
        <div className="flex items-center justify-between gap-2">
          <span className="text-[13px] font-medium">Questions you were asked</span>
          <Badge variant="forge">weight 2.5 — the strongest evidence there is</Badge>
        </div>

        <div className="mt-2 flex flex-col gap-2">
          {rows.map((row, i) => (
            <div key={row} className="grid gap-2 sm:grid-cols-[1fr_140px_150px_60px_auto]">
              <input
                name="questionText"
                placeholder="Explain database isolation levels"
                className="h-9 rounded-[var(--radius)] border border-[var(--border-strong)] bg-[var(--bg)] px-3 text-sm"
              />
              <select
                name="questionQuality"
                defaultValue="shaky"
                className="h-9 rounded-[var(--radius)] border border-[var(--border-strong)] bg-[var(--bg)] px-2 text-sm"
              >
                {QUALITIES.map(([value, label]) => (
                  <option key={value} value={value}>
                    {label}
                  </option>
                ))}
              </select>
              <select
                name="questionSkill"
                defaultValue=""
                className="h-9 rounded-[var(--radius)] border border-[var(--border-strong)] bg-[var(--bg)] px-2 text-sm"
              >
                <option value="">— skill —</option>
                {skills.map((s) => (
                  <option key={s.id} value={s.id}>
                    {s.name}
                  </option>
                ))}
              </select>
              <select
                name="questionDifficulty"
                defaultValue="3"
                aria-label="Difficulty"
                className="h-9 rounded-[var(--radius)] border border-[var(--border-strong)] bg-[var(--bg)] px-2 text-sm"
              >
                {[1, 2, 3, 4, 5].map((n) => (
                  <option key={n} value={n}>
                    {n}
                  </option>
                ))}
              </select>
              {rows.length > 1 && (
                <Button
                  type="button"
                  variant="ghost"
                  size="icon"
                  aria-label={`Remove question ${i + 1}`}
                  onClick={() => setRows((r) => r.filter((x) => x !== row))}
                >
                  <Trash2 aria-hidden />
                </Button>
              )}
            </div>
          ))}
        </div>

        <Button
          type="button"
          variant="ghost"
          size="sm"
          className="mt-2"
          onClick={() => setRows((r) => [...r, (r.at(-1) ?? 0) + 1])}
        >
          <Plus aria-hidden /> Add question
        </Button>

        <p className="mt-2 flex items-start gap-1.5 text-[12px] text-[var(--text-subtle)]">
          <AlertTriangle aria-hidden className="mt-0.5 size-3.5 shrink-0" />
          Link each question to a skill so it can score. Anything marked shaky or worse opens a
          weakness automatically.
        </p>
      </div>

      <label className="mt-4 flex flex-col gap-1.5">
        <span className="text-[12px] font-medium">Private reflection</span>
        <textarea
          name="notes"
          rows={3}
          placeholder="What surprised you? What would you do differently?"
          className="w-full resize-y rounded-[var(--radius)] border border-[var(--border-strong)] bg-[var(--bg)] p-3 text-[14px]"
        />
        <span className="text-[11px] text-[var(--text-subtle)]">
          Private to you — admins cannot read this.
        </span>
      </label>

      {state.error && (
        <p role="alert" className="mt-3 text-[13px] text-[var(--danger)]">
          {state.error}
        </p>
      )}

      <Button type="submit" variant="primary" className="mt-4" disabled={pending}>
        {pending ? "Recording…" : "Record interview"}
      </Button>
    </form>
  );
}
