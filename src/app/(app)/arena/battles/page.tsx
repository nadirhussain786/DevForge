import type { Metadata } from "next";
import Link from "next/link";
import { ArrowLeft } from "lucide-react";

import { BossBattle } from "@/features/design/ui/boss-battle";
import type { Criterion } from "@/features/design/ui/design-workspace";
import { requireOnboarded } from "@/lib/auth/session";
import { createClient } from "@/lib/supabase/server";

export const metadata: Metadata = { title: "Boss Battles · EngForge" };

export default async function BossBattlesPage() {
  const ctx = await requireOnboarded();
  const supabase = await createClient();

  const [{ data: battles }, { data: attempts }] = await Promise.all([
    supabase
      .from("boss_battles")
      .select("id, slug, title, scenario_md, rubric, xp, difficulty")
      .eq("status", "published")
      .order("difficulty"),
    supabase
      .from("boss_battle_attempts")
      .select("id, battle_id, overall_score")
      .eq("user_id", ctx.userId),
  ]);

  const attemptBy = new Map((attempts ?? []).map((a) => [a.battle_id, a]));

  return (
    <div className="mx-auto w-full max-w-[880px] px-4 py-6 md:px-6">
      <Link
        href="/arena"
        className="inline-flex items-center gap-1 text-[12px] text-[var(--text-muted)] hover:text-[var(--text)]"
      >
        <ArrowLeft aria-hidden className="size-3.5" /> Arena
      </Link>

      <h1 className="mt-3 text-2xl font-semibold tracking-tight">Boss Battles</h1>
      <p className="mt-1 max-w-[70ch] text-[13px] text-[var(--text-muted)]">
        Realistic production scenarios with no clean answer. Work the problem the way you would at
        2am: what you check, in what order, and what evidence would rule each hypothesis in or out.
      </p>

      {!battles?.length ? (
        <div className="mt-6 rounded-[var(--radius)] border border-dashed border-[var(--border-strong)] p-8 text-center text-[13px] text-[var(--text-muted)]">
          No published battles yet.
        </div>
      ) : (
        <div className="mt-6 flex flex-col gap-5">
          {battles.map((b) => {
            const rubric = (b.rubric ?? {}) as { criteria?: Criterion[] };
            const attempt = attemptBy.get(b.id);
            return (
              <BossBattle
                key={b.id}
                battleId={b.id}
                title={b.title}
                scenarioMd={b.scenario_md}
                criteria={rubric.criteria ?? []}
                xp={b.xp}
                existingAttemptId={attempt?.id ?? null}
                existingScore={attempt?.overall_score ?? null}
              />
            );
          })}
        </div>
      )}
    </div>
  );
}
