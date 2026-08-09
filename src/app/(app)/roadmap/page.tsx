import type { Metadata } from "next";

import { Badge } from "@/components/ui/badge";
import { STAGE_META } from "@/features/roadmap/ui/mission-card";
import type { LoopStage } from "@/features/roadmap/domain/types";
import { requireOnboarded } from "@/lib/auth/session";
import { createClient } from "@/lib/supabase/server";

export const metadata: Metadata = { title: "Roadmap · EngForge" };

interface Reason {
  weight?: number;
  gap?: number;
  source?: string;
  priority?: number;
}

export default async function RoadmapPage() {
  const ctx = await requireOnboarded();
  const supabase = await createClient();

  const { data: roadmap } = await supabase
    .from("roadmaps")
    .select("id, start_date, weeks, daily_minutes, generator_version")
    .eq("user_id", ctx.userId)
    .eq("status", "active")
    .maybeSingle();

  if (!roadmap) {
    return (
      <EmptyState
        title="No active roadmap"
        body="Finish onboarding and one is generated from your role track, your available time, and what you already know."
      />
    );
  }

  const [{ data: weeks }, { data: items }, { data: skills }] = await Promise.all([
    supabase
      .from("roadmap_weeks")
      .select("week_index, theme, status")
      .eq("roadmap_id", roadmap.id)
      .order("week_index"),
    supabase
      .from("roadmap_items")
      .select("id, week_index, skill_id, stage, planned_minutes, reason, status, sort_order")
      .eq("roadmap_id", roadmap.id)
      .order("week_index")
      .order("sort_order"),
    supabase.from("skills").select("id, name"),
  ]);

  const skillName = new Map((skills ?? []).map((s) => [s.id, s.name]));
  const itemsByWeek = new Map<number, NonNullable<typeof items>>();
  for (const item of items ?? []) {
    itemsByWeek.set(item.week_index, [...(itemsByWeek.get(item.week_index) ?? []), item] as never);
  }

  return (
    <div className="mx-auto w-full max-w-[900px] px-4 py-6 md:px-6">
      <h1 className="text-2xl font-semibold tracking-tight">Your roadmap</h1>
      <p className="mt-1 text-[13px] text-[var(--text-muted)]">
        {roadmap.weeks} weeks from {roadmap.start_date} · {roadmap.daily_minutes} min/day ·
        generated deterministically (v{roadmap.generator_version}). Every item below says why it is
        here.
      </p>

      <div className="mt-6 flex flex-col gap-4">
        {(weeks ?? []).map((week) => {
          const weekItems = itemsByWeek.get(week.week_index) ?? [];
          const minutes = weekItems.reduce((a, i) => a + i.planned_minutes, 0);

          return (
            <section
              key={week.week_index}
              className="overflow-hidden rounded-[var(--radius)] border border-[var(--border)] bg-[var(--surface)]"
            >
              <header className="flex flex-wrap items-baseline gap-2 border-b border-[var(--border)] px-4 py-3">
                <span className="metric text-[11px] text-[var(--text-subtle)]">
                  WEEK {String(week.week_index).padStart(2, "0")}
                </span>
                <h2 className="text-sm font-semibold">{week.theme}</h2>
                <span className="metric ml-auto text-[12px] text-[var(--text-subtle)]">
                  {minutes} min
                </span>
              </header>

              <ul className="divide-y divide-[var(--border)]">
                {weekItems.map((item) => {
                  const reason = (item.reason ?? {}) as Reason;
                  const meta = STAGE_META[item.stage as LoopStage];

                  return (
                    <li key={item.id} className="flex flex-wrap items-center gap-x-3 gap-y-1 px-4 py-2.5">
                      <Badge variant="outline">{meta?.label ?? item.stage}</Badge>
                      <span className="text-[13px]">
                        {item.skill_id ? skillName.get(item.skill_id) ?? "Skill" : "General"}
                      </span>
                      <span className="metric text-[11px] text-[var(--text-subtle)]">
                        {item.planned_minutes}m
                      </span>

                      {/* §21 explainability — never a black box. */}
                      <span className="ml-auto text-[11px] text-[var(--text-subtle)]">
                        {reason.source === "jd_gap"
                          ? "from a job description you saved"
                          : reason.source === "weakness"
                            ? "from an open weakness"
                            : `role weight ${reason.weight ?? "—"} · gap ${
                                reason.gap !== undefined ? Math.round(reason.gap * 100) : "—"
                              }%`}
                      </span>
                    </li>
                  );
                })}

                {weekItems.length === 0 && (
                  <li className="px-4 py-3 text-[13px] text-[var(--text-subtle)]">
                    No content available for this week yet.
                  </li>
                )}
              </ul>
            </section>
          );
        })}
      </div>
    </div>
  );
}

function EmptyState({ title, body }: { title: string; body: string }) {
  return (
    <div className="mx-auto max-w-lg px-4 py-16 text-center">
      <h1 className="text-lg font-semibold">{title}</h1>
      <p className="mt-2 text-[13px] text-[var(--text-muted)]">{body}</p>
    </div>
  );
}
