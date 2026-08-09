import Link from "next/link";
import { Flame, Shield } from "lucide-react";

import { Badge } from "@/components/ui/badge";
import { levelForXp } from "@/features/gamification/domain/xp";

export interface TopBarProps {
  displayName: string | null;
  totalXp: number;
  currentStreak: number;
  shields: number;
}

export function TopBar({ displayName, totalXp, currentStreak, shields }: TopBarProps) {
  const level = levelForXp(totalXp);

  return (
    <header className="flex h-14 shrink-0 items-center gap-3 border-b border-[var(--border)] bg-[var(--surface)] px-4">
      <Link href="/today" className="flex items-center gap-2">
        <span
          aria-hidden
          className="grid size-6 place-items-center rounded-[6px] bg-[var(--forge-500)] text-[13px] font-bold text-[var(--on-forge)]"
        >
          E
        </span>
        <span className="text-sm font-semibold tracking-tight">EngForge</span>
      </Link>

      <div className="ml-auto flex items-center gap-3">
        {currentStreak > 0 && (
          <span className="flex items-center gap-1.5 text-[13px] text-[var(--text-muted)]">
            <Flame aria-hidden className="size-4 text-[var(--forge-500)]" />
            <span className="metric">{currentStreak}</span>
            <span className="sr-only">day streak</span>
            {shields > 0 && (
              <span className="flex items-center gap-0.5" title={`${shields} streak shield${shields > 1 ? "s" : ""}`}>
                <Shield aria-hidden className="size-3.5 text-[var(--info)]" />
                <span className="metric text-[11px]">{shields}</span>
              </span>
            )}
          </span>
        )}

        {/* Platform rank, not a job title — stated wherever a level appears. */}
        <Badge
          variant="outline"
          title="Platform rank — reflects work done on EngForge, not a job title."
        >
          {level.name}
        </Badge>

        <span className="metric text-[13px] text-[var(--text-muted)]">
          {totalXp.toLocaleString()} XP
        </span>

        <Link
          href="/profile"
          aria-label="Profile and achievements"
          className="grid size-7 place-items-center rounded-full bg-[var(--surface-3)] text-[11px] font-medium hover:bg-[var(--border-strong)]"
        >
          {(displayName ?? "?").slice(0, 1).toUpperCase()}
        </Link>
      </div>
    </header>
  );
}
