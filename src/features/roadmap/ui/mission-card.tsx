import {
  BookOpen,
  Check,
  FlaskConical,
  Hammer,
  MessageSquare,
  RotateCcw,
  Target,
} from "lucide-react";

import { cn } from "@/lib/utils";
import type { LoopStage } from "@/features/roadmap/domain/types";

/**
 * The six blocks of the day. This is the Command Center's whole reason to
 * exist — everything else on the page is secondary and can be hidden without
 * breaking it (§43 progressive disclosure).
 */

export const STAGE_META: Record<
  LoopStage,
  { label: string; icon: typeof Target; blurb: string }
> = {
  review: { label: "Review", icon: RotateCcw, blurb: "Due revision — always first" },
  learn: { label: "Learn", icon: BookOpen, blurb: "Understand the concept" },
  build: { label: "Build", icon: Hammer, blurb: "Write actual code" },
  explain: { label: "Explain", icon: MessageSquare, blurb: "In your own words" },
  test: { label: "Test", icon: Target, blurb: "Interview questions" },
  research: { label: "Research", icon: FlaskConical, blurb: "Go one level deeper" },
  apply: { label: "Apply", icon: Hammer, blurb: "Real engineering scenario" },
  interview: { label: "Interview", icon: MessageSquare, blurb: "Under pressure" },
};

export interface MissionItem {
  id: string;
  stage: LoopStage;
  title: string;
  minutes: number;
  xp: number;
  status: "pending" | "in_progress" | "completed" | "skipped" | "deferred";
  href?: string;
}

export function MissionCard({ items }: { items: readonly MissionItem[] }) {
  if (items.length === 0) {
    return (
      <div className="rounded-[var(--radius)] border border-dashed border-[var(--border-strong)] p-6 text-center">
        <p className="text-sm font-medium">No mission yet.</p>
        <p className="mt-1 text-[13px] text-[var(--text-muted)]">
          Finish onboarding and your first day is generated automatically.
        </p>
      </div>
    );
  }

  const done = items.filter((i) => i.status === "completed").length;

  return (
    <div className="overflow-hidden rounded-[var(--radius)] border border-[var(--border)] bg-[var(--surface)]">
      <ul className="divide-y divide-[var(--border)]">
        {items.map((item) => {
          const meta = STAGE_META[item.stage];
          const Icon = meta.icon;
          const completed = item.status === "completed";

          return (
            <li key={item.id}>
              <a
                href={item.href ?? "#"}
                className={cn(
                  "flex items-center gap-3 px-4 py-3 transition-colors duration-150",
                  completed ? "opacity-60" : "hover:bg-[var(--surface-2)]",
                )}
              >
                <span
                  aria-hidden
                  className={cn(
                    "grid size-8 shrink-0 place-items-center rounded-[8px]",
                    completed
                      ? "bg-[var(--success)]/15 text-[var(--success)]"
                      : "bg-[var(--surface-2)] text-[var(--text-muted)]",
                  )}
                >
                  {completed ? <Check className="size-4" /> : <Icon className="size-4" />}
                </span>

                <span className="min-w-0 flex-1">
                  <span className="flex items-baseline gap-2">
                    <span className="text-[13px] font-medium">{meta.label}</span>
                    <span className="metric text-[11px] text-[var(--text-subtle)]">
                      {item.minutes}m
                    </span>
                    {item.xp > 0 && !completed && (
                      <span className="metric text-[11px] text-[var(--forge-500)]">
                        +{item.xp} XP
                      </span>
                    )}
                  </span>
                  <span
                    className={cn(
                      "block truncate text-[13px] text-[var(--text-muted)]",
                      completed && "line-through",
                    )}
                  >
                    {item.title}
                  </span>
                </span>
              </a>
            </li>
          );
        })}
      </ul>

      <div className="flex items-center justify-between border-t border-[var(--border)] bg-[var(--surface-2)] px-4 py-2.5">
        <span className="text-[12px] text-[var(--text-muted)]">
          Finish condition: all {items.length} blocks closed.
        </span>
        <span className="metric text-[12px] text-[var(--text-muted)]">
          {done}/{items.length}
        </span>
      </div>
    </div>
  );
}
