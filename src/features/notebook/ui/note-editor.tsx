"use client";

import { useActionState } from "react";
import { Check, Lock } from "lucide-react";

import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";

import { completeNote, saveNote, type NoteState } from "../actions";

/**
 * The structured research workspace from §13.
 *
 * The section order is the argument: question → hypothesis → experiment →
 * evidence → conclusion → how you'd say it in an interview. It's a lab
 * notebook, not a blog post, and the last section is the one that turns the
 * work into evidence.
 */

export const SECTIONS = [
  { key: "question_md", label: "Question", hint: "What are you actually trying to find out?" },
  { key: "hypothesis_md", label: "Hypothesis", hint: "What do you expect, and why?" },
  { key: "research_md", label: "Research", hint: "What did you read, and what did it claim?" },
  { key: "experiment_md", label: "Experiment", hint: "What did you run to test it?" },
  { key: "code_md", label: "Code", hint: "The query, script, or config that mattered" },
  { key: "result_md", label: "Result", hint: "What actually happened" },
  { key: "evidence_md", label: "Evidence", hint: "Numbers, output, EXPLAIN plans — the receipts" },
  { key: "conclusion_md", label: "Conclusion", hint: "What you now believe, and how confident you are" },
  {
    key: "interview_explanation_md",
    label: "Interview Explanation",
    hint: "Say it the way you would out loud, under pressure. This section is what produces evidence.",
  },
  { key: "open_questions_md", label: "Open Questions", hint: "What you still don't know" },
] as const;

export interface NoteEditorProps {
  note: Record<string, string | number | string[] | null> & { id: string };
  skills: Array<{ id: string; name: string }>;
}

export function NoteEditor({ note, skills }: NoteEditorProps) {
  const [saveState, saveAction, saving] = useActionState(saveNote, {} as NoteState);
  const [completeState, completeAction, completing] = useActionState(completeNote, {} as NoteState);

  const isComplete = note.status === "completed" || completeState.completed;

  return (
    <div className="flex flex-col gap-6">
      <form action={saveAction} className="flex flex-col gap-5">
        <input type="hidden" name="id" value={note.id} />
        <input type="hidden" name="kind" value={String(note.kind ?? "notebook")} />

        <div className="grid gap-3 sm:grid-cols-[1fr_200px_120px]">
          <label className="flex flex-col gap-1.5">
            <span className="text-[12px] font-medium">Title</span>
            <input
              name="title"
              defaultValue={String(note.title ?? "")}
              required
              className="h-9 rounded-[var(--radius)] border border-[var(--border-strong)] bg-[var(--surface)] px-3 text-sm"
            />
          </label>

          <label className="flex flex-col gap-1.5">
            <span className="text-[12px] font-medium">Skill</span>
            <select
              name="skillId"
              defaultValue={String(note.skill_id ?? "")}
              className="h-9 rounded-[var(--radius)] border border-[var(--border-strong)] bg-[var(--surface)] px-2 text-sm"
            >
              <option value="">— none —</option>
              {skills.map((s) => (
                <option key={s.id} value={s.id}>
                  {s.name}
                </option>
              ))}
            </select>
          </label>

          <label className="flex flex-col gap-1.5">
            <span className="text-[12px] font-medium">Confidence</span>
            <select
              name="confidence"
              defaultValue={String(note.confidence ?? 3)}
              className="h-9 rounded-[var(--radius)] border border-[var(--border-strong)] bg-[var(--surface)] px-2 text-sm"
            >
              {[1, 2, 3, 4, 5].map((n) => (
                <option key={n} value={n}>
                  {n} / 5
                </option>
              ))}
            </select>
          </label>
        </div>

        <label className="flex flex-col gap-1.5">
          <span className="text-[12px] font-medium">Tags</span>
          <input
            name="tags"
            defaultValue={Array.isArray(note.tags) ? note.tags.join(", ") : ""}
            placeholder="postgres, indexing, production"
            className="h-9 rounded-[var(--radius)] border border-[var(--border-strong)] bg-[var(--surface)] px-3 text-sm"
          />
        </label>

        <div className="flex flex-col gap-5">
          {SECTIONS.map((section) => (
            <label key={section.key} className="flex flex-col gap-1.5">
              <span className="flex flex-wrap items-baseline gap-2">
                <span className="text-[13px] font-medium">{section.label}</span>
                {section.key === "interview_explanation_md" && (
                  <Badge variant="forge">produces evidence</Badge>
                )}
                <span className="text-[11px] text-[var(--text-subtle)]">{section.hint}</span>
              </span>
              <textarea
                name={section.key}
                rows={section.key === "interview_explanation_md" ? 6 : 3}
                defaultValue={String(note[section.key] ?? "")}
                className="w-full resize-y rounded-[var(--radius)] border border-[var(--border-strong)] bg-[var(--bg)] p-3 text-[14px] leading-relaxed"
              />
            </label>
          ))}
        </div>

        {saveState.error && (
          <p role="alert" className="text-[13px] text-[var(--danger)]">
            {saveState.error}
          </p>
        )}

        <div className="flex items-center gap-3">
          <Button type="submit" variant="secondary" disabled={saving}>
            {saving ? "Saving…" : "Save"}
          </Button>
          {saveState.saved && (
            <span className="flex items-center gap-1 text-[12px] text-[var(--success)]">
              <Check aria-hidden className="size-3.5" /> Saved
            </span>
          )}
        </div>
      </form>

      <div className="rounded-[var(--radius)] border border-[var(--border-strong)] bg-[var(--surface)] p-5">
        <h2 className="text-sm font-semibold">
          {isComplete ? "Completed" : "Mark this research complete"}
        </h2>
        <p className="mt-1 max-w-[68ch] text-[13px] text-[var(--text-muted)]">
          Completing converts this into evidence against the linked skill — but only once the
          Interview Explanation is written. Research counts when you can explain it, not when
          you&apos;ve read about it.
        </p>

        {completeState.error && (
          <p role="alert" className="mt-3 text-[13px] text-[var(--danger)]">
            {completeState.error}
          </p>
        )}

        {isComplete ? (
          <p className="mt-3 flex items-center gap-1.5 text-[13px] text-[var(--success)]">
            <Check aria-hidden className="size-4" />
            Recorded as evidence
            {completeState.xpAwarded ? ` · +${completeState.xpAwarded} XP` : ""}
          </p>
        ) : (
          <form action={completeAction} className="mt-4">
            <input type="hidden" name="id" value={note.id} />
            <Button type="submit" variant="primary" disabled={completing}>
              {completing ? "Recording…" : "Complete and record evidence"}
            </Button>
          </form>
        )}
      </div>

      <p className="flex items-center gap-1.5 text-[12px] text-[var(--text-subtle)]">
        <Lock aria-hidden className="size-3.5" />
        Private to you. Admins cannot read this — enforced in the database, not the interface.
      </p>
    </div>
  );
}
