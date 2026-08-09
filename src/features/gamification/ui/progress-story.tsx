import { AlertTriangle, ArrowUpRight, Compass, Flame, Sparkles } from "lucide-react";

import { cn } from "@/lib/utils";
import type { StoryBeat, StoryTone } from "../domain/story";

/**
 * The story beats, rendered as prose rather than as stats.
 *
 * The first beat is set as the lead and typeset larger, because it carries the
 * frame everything after it is read in. The rest are quiet — they are context,
 * not notifications, and a page that shouts five times has shouted zero times.
 */

const TONE: Record<StoryTone, { icon: typeof Sparkles; color: string; ring: string }> = {
  celebrate: {
    icon: Sparkles,
    color: "text-[var(--success)]",
    ring: "border-[var(--success)]/25 bg-[var(--success)]/[0.06]",
  },
  encourage: {
    icon: Compass,
    color: "text-[var(--forge-500)]",
    ring: "border-[var(--forge-500)]/25 bg-[var(--forge-glow)]",
  },
  steady: {
    icon: Flame,
    color: "text-[var(--text-subtle)]",
    ring: "border-[var(--border)] bg-[var(--surface-2)]",
  },
  nudge: {
    icon: ArrowUpRight,
    color: "text-[var(--warn)]",
    ring: "border-[var(--warn)]/25 bg-[var(--warn)]/[0.06]",
  },
  warn: {
    icon: AlertTriangle,
    color: "text-[var(--danger)]",
    ring: "border-[var(--danger)]/30 bg-[var(--danger)]/[0.06]",
  },
};

export function ProgressStory({ beats, className }: { beats: StoryBeat[]; className?: string }) {
  if (beats.length === 0) return null;

  const [lead, ...rest] = beats;
  const LeadIcon = TONE[lead.tone].icon;

  return (
    <section
      aria-label="Your progress"
      className={cn("flex flex-col gap-4 animate-rise", className)}
    >
      <div className={cn("card flex gap-3.5 p-5", TONE[lead.tone].ring)}>
        <LeadIcon aria-hidden className={cn("mt-0.5 size-[18px] shrink-0", TONE[lead.tone].color)} />
        <div className="flex flex-col gap-1.5">
          <p className="text-[1.0625rem] font-medium leading-snug tracking-[-0.01em]">{lead.text}</p>
          {lead.detail && (
            <p className="measure text-[14px] leading-relaxed text-[var(--text-muted)]">
              {lead.detail}
            </p>
          )}
        </div>
      </div>

      {rest.length > 0 && (
        <ul className="flex flex-col gap-2.5">
          {rest.map((beat) => {
            const Icon = TONE[beat.tone].icon;
            return (
              <li key={beat.id} className="flex gap-3">
                <Icon aria-hidden className={cn("mt-[3px] size-4 shrink-0", TONE[beat.tone].color)} />
                <div>
                  <p className="text-[14px] leading-snug">{beat.text}</p>
                  {beat.detail && (
                    <p className="measure mt-1 text-[13px] leading-relaxed text-[var(--text-muted)]">
                      {beat.detail}
                    </p>
                  )}
                </div>
              </li>
            );
          })}
        </ul>
      )}
    </section>
  );
}
