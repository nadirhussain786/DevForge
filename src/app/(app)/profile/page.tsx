import type { Metadata } from "next";

import { Badge } from "@/components/ui/badge";
import { StatTile } from "@/components/ui/stat-tile";
import { syncAchievements } from "@/features/achievements/data/sync";
import { levelForXp } from "@/features/gamification/domain/xp";
import { requireOnboarded } from "@/lib/auth/session";
import { createClient } from "@/lib/supabase/server";
import { cn } from "@/lib/utils";

export const metadata: Metadata = { title: "Profile · EngForge" };

const CATEGORY_LABEL: Record<string, string> = {
  skill: "Skill",
  research: "Research",
  arena: "Arena",
  consistency: "Consistency",
  career_milestone: "Career milestones",
};

export default async function ProfilePage() {
  const ctx = await requireOnboarded();

  // Recomputed on view rather than incremented on each action: a recompute is
  // self-healing, and a newly authored achievement becomes retroactive with no
  // backfill.
  await syncAchievements(ctx.userId);

  const supabase = await createClient();
  const [{ data: achievements }, { data: mine }, { data: progress }, { data: streak }] =
    await Promise.all([
      supabase.from("achievements").select("*").order("sort_order"),
      supabase.from("user_achievements").select("achievement_id, progress, unlocked_at").eq("user_id", ctx.userId),
      supabase.from("user_progress").select("total_xp").eq("user_id", ctx.userId).maybeSingle(),
      supabase
        .from("streaks")
        .select("current_streak, longest_streak, total_study_days, total_minutes, shields")
        .eq("user_id", ctx.userId)
        .maybeSingle(),
    ]);

  const mineById = new Map((mine ?? []).map((m) => [m.achievement_id, m]));
  const level = levelForXp(progress?.total_xp ?? 0);
  const unlockedCount = (mine ?? []).filter((m) => m.unlocked_at).length;

  const grouped = new Map<string, NonNullable<typeof achievements>>();
  for (const a of achievements ?? []) {
    grouped.set(a.category, [...(grouped.get(a.category) ?? []), a] as never);
  }

  return (
    <div className="mx-auto w-full max-w-[900px] px-4 py-6 md:px-6">
      <h1 className="text-2xl font-semibold tracking-tight">
        {ctx.profile?.display_name ?? "Your profile"}
      </h1>

      <div className="mt-5 grid grid-cols-2 gap-3 sm:grid-cols-4">
        <StatTile label="Level" value={level.level} hint={level.name} />
        <StatTile
          label="XP"
          value={(progress?.total_xp ?? 0).toLocaleString()}
          hint={level.xpToNextLevel !== null ? `${level.xpToNextLevel} to next` : "max rank"}
        />
        <StatTile
          label="Streak"
          value={streak?.current_streak ?? 0}
          unit="days"
          hint={`longest ${streak?.longest_streak ?? 0}`}
        />
        <StatTile
          label="Achievements"
          value={`${unlockedCount}/${achievements?.length ?? 0}`}
        />
      </div>

      <p className="mt-3 text-[12px] text-[var(--text-subtle)]">
        <strong>{level.name}</strong> is a platform rank — it reflects work done on EngForge, not a
        job title. Readiness is what the career surfaces use.
      </p>

      <div className="mt-4 grid grid-cols-2 gap-3 sm:grid-cols-4">
        <StatTile label="Study days" value={streak?.total_study_days ?? 0} />
        <StatTile
          label="Total time"
          value={Math.round((streak?.total_minutes ?? 0) / 60)}
          unit="hrs"
        />
        <StatTile label="Shields" value={streak?.shields ?? 0} hint="absorb a missed day" />
        <StatTile label="Phase" value={ctx.career?.phase === "phase2" ? "Career" : "Phase 1"} />
      </div>

      <div className="mt-8 flex flex-col gap-7">
        {[...grouped.entries()].map(([category, list]) => (
          <section key={category}>
            <h2 className="text-sm font-semibold">{CATEGORY_LABEL[category] ?? category}</h2>
            <ul className="mt-3 grid gap-3 sm:grid-cols-2">
              {list.map((a) => {
                const record = mineById.get(a.id);
                const unlocked = Boolean(record?.unlocked_at);
                const p = (record?.progress ?? {}) as { current?: number; target?: number; ratio?: number };
                const ratio = Math.min(1, p.ratio ?? 0);

                return (
                  <li
                    key={a.id}
                    className={cn(
                      "rounded-[var(--radius)] border p-4 transition-colors duration-150",
                      unlocked
                        ? "border-[var(--forge-500)]/40 bg-[var(--forge-glow)]"
                        : "border-[var(--border)] bg-[var(--surface)]",
                    )}
                  >
                    <div className="flex flex-wrap items-center gap-2">
                      <span
                        className={cn(
                          "text-[14px] font-medium",
                          !unlocked && "text-[var(--text-muted)]",
                        )}
                      >
                        {a.name}
                      </span>
                      {unlocked ? (
                        <Badge variant="forge">unlocked</Badge>
                      ) : (
                        <span className="metric text-[11px] text-[var(--text-subtle)]">
                          {p.current ?? 0}/{p.target ?? "?"}
                        </span>
                      )}
                      {a.xp > 0 && (
                        <span className="metric ml-auto text-[11px] text-[var(--text-subtle)]">
                          +{a.xp} XP
                        </span>
                      )}
                    </div>

                    <p className="mt-1 text-[13px] text-[var(--text-muted)]">{a.description}</p>

                    {!unlocked && (
                      <div className="mt-3 h-1 overflow-hidden rounded-full bg-[var(--surface-3)]">
                        <div
                          className="h-full rounded-full bg-[var(--forge-500)] transition-[width] duration-250"
                          style={{ width: `${Math.round(ratio * 100)}%` }}
                        />
                      </div>
                    )}
                  </li>
                );
              })}
            </ul>
          </section>
        ))}
      </div>
    </div>
  );
}
