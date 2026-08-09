import Link from "next/link";
import { CheckCircle2, CircleAlert, CircleDashed } from "lucide-react";

import { cn } from "@/lib/utils";

/**
 * "Are you ready for this?" — shown before the content, not after.
 *
 * Beginners rarely fail because a topic is too hard; they fail because they
 * were missing something underneath it and had no way to know. The mastery
 * floor (40) is the same threshold the roadmap generator uses to decide a
 * skill is schedulable, so this reflects the real scheduling rule rather than
 * a second opinion.
 */

export const PREREQ_READY_MASTERY = 40;

export interface Prerequisite {
  skillId: string;
  name: string;
  mastery: number;
  topicSlug: string | null;
}

export function Prerequisites({ items }: { items: Prerequisite[] }) {
  if (items.length === 0) return null;

  const missing = items.filter((p) => p.mastery < PREREQ_READY_MASTERY);
  const ready = missing.length === 0;

  return (
    <aside
      className={cn(
        "rounded-[var(--radius)] border p-4",
        ready
          ? "border-[var(--border)] bg-[var(--surface-2)]"
          : "border-[var(--warn)]/40 bg-[var(--warn)]/10",
      )}
    >
      <h2 className="flex items-center gap-2 text-[13px] font-semibold">
        {ready ? (
          <>
            <CheckCircle2 aria-hidden className="size-4 text-[var(--success)]" />
            You&apos;re ready for this
          </>
        ) : (
          <>
            <CircleAlert aria-hidden className="size-4 text-[var(--warn)]" />
            This builds on {missing.length} thing{missing.length === 1 ? "" : "s"} you haven&apos;t
            covered
          </>
        )}
      </h2>

      <p className="mt-1 max-w-[62ch] text-[13px] text-[var(--text-muted)]">
        {ready
          ? "Everything this topic assumes, you already have evidence for. Go ahead."
          : "You can still read it — but the gaps below will make it harder than it needs to be, and they're quick to close first."}
      </p>

      <ul className="mt-3 flex flex-col gap-1.5">
        {items.map((p) => {
          const has = p.mastery >= PREREQ_READY_MASTERY;
          return (
            <li key={p.skillId} className="flex items-center gap-2 text-[13px]">
              {has ? (
                <CheckCircle2 aria-hidden className="size-3.5 shrink-0 text-[var(--success)]" />
              ) : (
                <CircleDashed aria-hidden className="size-3.5 shrink-0 text-[var(--text-subtle)]" />
              )}
              <span className={cn(has ? "text-[var(--text-muted)]" : "text-[var(--text)]")}>
                {p.name}
              </span>
              <span className="metric text-[11px] text-[var(--text-subtle)]">
                {Math.round(p.mastery)}%
              </span>
              {!has && p.topicSlug && (
                <Link
                  href={`/learn/${p.topicSlug}`}
                  className="text-[12px] text-[var(--forge-600)] hover:underline"
                >
                  cover it first →
                </Link>
              )}
            </li>
          );
        })}
      </ul>
    </aside>
  );
}
