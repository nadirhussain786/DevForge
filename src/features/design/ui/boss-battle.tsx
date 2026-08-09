"use client";

import { useActionState } from "react";
import { Check, Swords } from "lucide-react";

import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
import { Markdown } from "@/features/learn/ui/markdown";
import { cn } from "@/lib/utils";

import {
  scoreBossBattle,
  submitBossBattle,
  type BossScoreState,
  type BossState,
} from "../actions-boss";
import type { Criterion } from "./design-workspace";

export interface BossBattleProps {
  battleId: string;
  title: string;
  scenarioMd: string;
  criteria: Criterion[];
  xp: number;
  existingAttemptId: string | null;
  existingScore: number | null;
}

export function BossBattle(props: BossBattleProps) {
  const [submitState, submitAction, submitting] = useActionState(submitBossBattle, {} as BossState);
  const [scoreState, scoreAction, scoring] = useActionState(
    scoreBossBattle,
    {} as BossScoreState,
  );

  const attemptId = submitState.attemptId ?? props.existingAttemptId;
  const scored = props.existingScore !== null || Boolean(scoreState.result);

  return (
    <div className="overflow-hidden rounded-[var(--radius)] border border-[var(--danger)]/40 bg-[var(--surface)]">
      <header className="flex flex-wrap items-center gap-2 border-b border-[var(--danger)]/30 bg-[var(--danger)]/10 px-5 py-3">
        <Swords aria-hidden className="size-4 text-[var(--danger)]" />
        <h2 className="text-sm font-semibold">{props.title}</h2>
        <Badge variant="danger">boss battle</Badge>
        <span className="metric ml-auto text-[12px] text-[var(--text-subtle)]">+{props.xp} XP</span>
      </header>

      <div className="p-5">
        <Markdown content={props.scenarioMd} />

        {!attemptId ? (
          <form action={submitAction} className="mt-5 flex flex-col gap-3">
            <input type="hidden" name="battleId" value={props.battleId} />
            <textarea
              name="analysisMd"
              rows={12}
              required
              minLength={120}
              placeholder={
                "What do you check first, and why?\n\nWhat are the plausible causes?\n\nWhat evidence would confirm or eliminate each?\n\nWhat do you do once you know?"
              }
              className="w-full resize-y rounded-[var(--radius)] border border-[var(--border-strong)] bg-[var(--bg)] p-3 text-[14px] leading-relaxed"
            />
            {submitState.error && (
              <p role="alert" className="text-[13px] text-[var(--danger)]">
                {submitState.error}
              </p>
            )}
            <div>
              <Button type="submit" variant="primary" disabled={submitting}>
                {submitting ? "Submitting…" : "Submit analysis"}
              </Button>
            </div>
          </form>
        ) : scored ? (
          <div className="mt-5 flex flex-wrap items-center gap-2 border-t border-[var(--border)] pt-4">
            <Check aria-hidden className="size-4 text-[var(--success)]" />
            <span className="metric text-lg font-semibold">
              {scoreState.result?.overall ?? Math.round(props.existingScore ?? 0)}%
            </span>
            <span className="text-[13px] text-[var(--text-muted)]">recorded as evidence</span>
            {scoreState.result?.xpAwarded ? (
              <Badge variant="forge">+{scoreState.result.xpAwarded} XP</Badge>
            ) : null}
          </div>
        ) : (
          <form action={scoreAction} className="mt-5 flex flex-col gap-3 border-t border-[var(--border)] pt-4">
            <input type="hidden" name="attemptId" value={attemptId} />
            <input type="hidden" name="battleId" value={props.battleId} />

            <h3 className="text-[13px] font-semibold">Score yourself honestly</h3>
            <ul className="flex flex-col gap-3">
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
      </div>
    </div>
  );
}
