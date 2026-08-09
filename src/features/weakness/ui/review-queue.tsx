"use client";

import { useActionState, useState } from "react";
import { Check, RotateCcw, X } from "lucide-react";

import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
import { cn } from "@/lib/utils";

import { reviewItem, type ReviewState } from "../actions";
import type { DueRevisionItem } from "../data/queue";

/**
 * Self-graded recall. The honest answer is the useful one — a review that
 * schedules the next repetition is worth far less than one that tells the
 * truth about what you actually remembered.
 *
 * Reviewing never resolves a weakness. That takes new evidence at
 * equal-or-higher difficulty, which comes from the Test or Build blocks.
 */
export function ReviewQueue({ items }: { items: readonly DueRevisionItem[] }) {
  const [index, setIndex] = useState(0);
  const item = items[index];

  if (!item) {
    return (
      <div className="rounded-[var(--radius)] border border-[var(--border)] bg-[var(--surface)] p-6 text-center">
        <p className="text-sm font-medium">Review queue clear</p>
        <p className="mx-auto mt-1 max-w-[52ch] text-[13px] text-[var(--text-muted)]">
          {items.length > 0
            ? "Everything due has been reviewed. The next repetitions are scheduled."
            : "Nothing is due. Items appear here automatically when you miss something."}
        </p>
      </div>
    );
  }

  return (
    <ReviewCard
      key={item.id}
      item={item}
      index={index}
      total={items.length}
      onNext={() => setIndex((i) => i + 1)}
    />
  );
}

function ReviewCard({
  item,
  index,
  total,
  onNext,
}: {
  item: DueRevisionItem;
  index: number;
  total: number;
  onNext: () => void;
}) {
  const [state, formAction, pending] = useActionState(reviewItem, {} as ReviewState);
  const result = state.result;
  const overdue = item.daysUntilDue < 0;

  return (
    <div className="rounded-[var(--radius)] border border-[var(--border)] bg-[var(--surface)] p-5">
      <div className="flex flex-wrap items-center gap-2">
        <span className="metric text-[11px] text-[var(--text-subtle)]">
          {index + 1} / {total}
        </span>
        <Badge variant="outline">{item.skillName}</Badge>
        {overdue ? (
          <Badge variant="warn">{Math.abs(item.daysUntilDue)}d overdue</Badge>
        ) : (
          <Badge variant="neutral">due today</Badge>
        )}
        <span className="metric text-[11px] text-[var(--text-subtle)]">
          rep {item.repetitions} · ease {item.ease.toFixed(2)}
        </span>
      </div>

      <h2 className="mt-3 text-lg font-semibold tracking-tight">{item.skillName}</h2>
      <p className="mt-1 max-w-[64ch] text-[13px] text-[var(--text-muted)]">
        Recall this before revealing anything. Can you explain it now — the mechanism, why it
        matters, and one trade-off — without looking it up?
      </p>

      {!result ? (
        <form action={formAction} className="mt-5 flex flex-wrap gap-2">
          <input type="hidden" name="revisionItemId" value={item.id} />
          <Button
            type="submit"
            name="recalled"
            value="yes"
            variant="primary"
            disabled={pending}
          >
            <Check aria-hidden /> I could explain it
          </Button>
          <Button type="submit" name="recalled" value="no" variant="outline" disabled={pending}>
            <X aria-hidden /> Not yet
          </Button>
        </form>
      ) : (
        <div className="mt-5 flex flex-col gap-3 border-t border-[var(--border)] pt-4" aria-live="polite">
          <div className="flex flex-wrap items-center gap-2">
            <span
              className={cn(
                "grid size-7 place-items-center rounded-full",
                result.correct
                  ? "bg-[var(--success)]/15 text-[var(--success)]"
                  : "bg-[var(--warn)]/15 text-[var(--warn)]",
              )}
            >
              {result.correct ? <Check aria-hidden className="size-4" /> : <RotateCcw aria-hidden className="size-4" />}
            </span>
            <span className="text-[14px]">
              {result.correct
                ? `Next review in ${result.nextDueInDays} day${result.nextDueInDays === 1 ? "" : "s"}.`
                : "Back to tomorrow — the schedule was too optimistic."}
            </span>
          </div>

          {result.retired && (
            <p className="text-[13px] text-[var(--success)]">
              Retired — this has stuck across enough repetitions to stop asking.
            </p>
          )}

          {result.movedToRetesting && (
            <p className="max-w-[64ch] text-[13px] text-[var(--text-muted)]">
              Every revision item for this weakness has now been recalled, so it moved to{" "}
              <strong>retesting</strong>. It stays open until you answer a real question on it at
              the same difficulty or harder — recall alone doesn&apos;t close it.
            </p>
          )}

          <div>
            <Button variant="secondary" onClick={onNext}>
              {index + 1 >= total ? "Finish" : "Next item"}
            </Button>
          </div>
        </div>
      )}
    </div>
  );
}
