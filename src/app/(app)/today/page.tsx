import type { Metadata } from "next";
import Link from "next/link";
import { AlertTriangle, ArrowRight } from "lucide-react";

import { Badge } from "@/components/ui/badge";
import { StatTile } from "@/components/ui/stat-tile";
import { getProgressStory } from "@/features/gamification/data/story";
import { ProgressStory } from "@/features/gamification/ui/progress-story";
import { getTodaySnapshot } from "@/features/roadmap/data/today";
import { MissionCard } from "@/features/roadmap/ui/mission-card";
import { requireOnboarded } from "@/lib/auth/session";

export const metadata: Metadata = { title: "Today · EngForge" };

export default async function TodayPage() {
  const ctx = await requireOnboarded();
  const snapshot = await getTodaySnapshot(ctx.userId, ctx.profile?.timezone ?? "UTC");

  // The snapshot already paid for momentum and streak; don't re-fetch them.
  const story = await getProgressStory(ctx.userId, {
    limit: 3,
    overrides: {
      momentum: snapshot.momentum?.score ?? 0,
      currentStreak: snapshot.streak.current,
    },
  });

  const xpAvailable = snapshot.items
    .filter((i) => i.status !== "completed")
    .reduce((a, i) => a + i.xp, 0);

  const weekday = new Intl.DateTimeFormat("en-GB", {
    weekday: "long",
    day: "numeric",
    month: "long",
    timeZone: ctx.profile?.timezone ?? "UTC",
  }).format(new Date(`${snapshot.planDate}T12:00:00Z`));

  return (
    <div className="mx-auto w-full max-w-[1200px] px-4 py-6 md:px-6">
      <div className="flex flex-col gap-1">
        <span className="text-[11px] uppercase tracking-wide text-[var(--text-subtle)]">
          Today · {weekday}
          {snapshot.weekIndex ? ` · Week ${snapshot.weekIndex}` : ""}
        </span>
        <h1 className="text-2xl font-semibold tracking-tight">
          {snapshot.missionTitle ?? "Your mission is being prepared"}
        </h1>
      </div>

      <div className="mt-5 grid gap-5 lg:grid-cols-[minmax(0,1fr)_300px]">
        {/* ── Primary column: what matters now ───────────────────────────── */}
        <div className="flex flex-col gap-5">
          <div className="grid grid-cols-2 gap-3 sm:grid-cols-4">
            <StatTile
              label="Time"
              value={snapshot.plannedMinutes}
              unit="min"
              hint={`${snapshot.completedMinutes} done`}
            />
            <StatTile label="XP available" value={`+${xpAvailable}`} />
            <StatTile
              label="Streak"
              value={snapshot.streak.current}
              unit={snapshot.streak.current === 1 ? "day" : "days"}
              hint={snapshot.streak.shields > 0 ? `${snapshot.streak.shields} shield` : undefined}
            />
            <StatTile
              label="Momentum"
              value={snapshot.momentum ? Math.round(snapshot.momentum.score) : "—"}
              hint={snapshot.momentum?.band}
            />
          </div>

          <ProgressStory beats={story} />

          <MissionCard items={snapshot.items} />

          {snapshot.dueRevisionCount > 0 && (
            <p className="text-[13px] text-[var(--text-muted)]">
              <span className="metric text-[var(--text)]">{snapshot.dueRevisionCount}</span> revision
              item{snapshot.dueRevisionCount === 1 ? "" : "s"} due — these are scheduled before any
              new material.
            </p>
          )}
        </div>

        {/* ── Context column: always secondary, safe to hide ─────────────── */}
        <aside className="flex flex-col gap-4">
          {snapshot.readiness && (
            <StatTile
              label="Readiness"
              value={Math.round(snapshot.readiness.overall)}
              unit="%"
              delta={Math.round(snapshot.readiness.delta)}
              hint="vs last week"
            />
          )}

          <div className="rounded-[var(--radius)] border border-[var(--border)] bg-[var(--surface)] p-4">
            <h2 className="flex items-center gap-2 text-[13px] font-semibold">
              <AlertTriangle aria-hidden className="size-4 text-[var(--warn)]" />
              Open weaknesses
            </h2>

            {snapshot.openWeaknesses.length === 0 ? (
              <p className="mt-2 text-[12px] text-[var(--text-subtle)]">
                None yet. They appear automatically when you miss something — start today&apos;s Test
                block to generate real signal.
              </p>
            ) : (
              <ul className="mt-3 flex flex-col gap-2">
                {snapshot.openWeaknesses.map((w) => (
                  <li key={w.id} className="flex items-center justify-between gap-2">
                    <span className="truncate text-[13px]">{w.skillName}</span>
                    <Badge variant={w.severity >= 3 ? "danger" : w.severity === 2 ? "warn" : "neutral"}>
                      S{w.severity}
                    </Badge>
                  </li>
                ))}
              </ul>
            )}

            <Link
              href="/skills"
              className="mt-3 inline-flex items-center gap-1 text-[12px] text-[var(--forge-500)] hover:underline"
            >
              View all skills <ArrowRight aria-hidden className="size-3" />
            </Link>
          </div>

          <div className="rounded-[var(--radius)] border border-[var(--border)] bg-[var(--surface-2)] p-4">
            <p className="text-[12px] leading-relaxed text-[var(--text-muted)]">
              {snapshot.openWeaknesses.length > 0
                ? `Yesterday you struggled with ${snapshot.openWeaknesses[0].skillName}. It is already scheduled into your review block.`
                : "You don't need to master everything today. Close the loop once, and the plan takes care of tomorrow."}
            </p>
          </div>
        </aside>
      </div>
    </div>
  );
}
