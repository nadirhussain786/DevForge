import type { Metadata } from "next";

import { Badge } from "@/components/ui/badge";
import { StatTile } from "@/components/ui/stat-tile";
import { computeReadiness, type SkillReadinessInput } from "@/features/readiness/domain/readiness";
import { HeatBar } from "@/features/mastery/ui/heat-bar";
import type { SkillRank } from "@/features/mastery/domain/mastery";
import { requireOnboarded } from "@/lib/auth/session";
import { createClient } from "@/lib/supabase/server";

export const metadata: Metadata = { title: "Skills · EngForge" };

export default async function SkillsPage() {
  const ctx = await requireOnboarded();
  const supabase = await createClient();
  const roleTrackId = ctx.career?.role_track_id;

  const [{ data: domains }, { data: skills }, { data: userSkills }, { data: trackSkills }, { data: weaknesses }] =
    await Promise.all([
      supabase.from("domains").select("id, slug, name, sort_order").order("sort_order"),
      supabase.from("skills").select("id, slug, name, domain_id").eq("status", "published"),
      supabase
        .from("user_skills")
        .select("skill_id, mastery, confidence, rank, evidence_count")
        .eq("user_id", ctx.userId),
      roleTrackId
        ? supabase
            .from("role_track_skills")
            .select("skill_id, weight, target_mastery, is_critical")
            .eq("role_track_id", roleTrackId)
        : Promise.resolve({ data: [] as never[] }),
      supabase
        .from("weaknesses")
        .select("skill_id, severity, status")
        .eq("user_id", ctx.userId)
        .in("status", ["open", "researching", "retesting"]),
    ]);

  const domainById = new Map((domains ?? []).map((d) => [d.id, d]));
  const masteryById = new Map((userSkills ?? []).map((u) => [u.skill_id, u]));
  const trackById = new Map((trackSkills ?? []).map((t) => [t.skill_id, t]));
  const weaknessBySkill = new Map((weaknesses ?? []).map((w) => [w.skill_id, w]));

  // Only skills the target role actually weights. A frontend engineer should
  // not be shown a wall of red for distributed systems they'll never be asked about.
  const relevant = (skills ?? []).filter((s) => (trackById.get(s.id)?.weight ?? 0) > 0);

  const readinessInput: SkillReadinessInput[] = relevant.map((s) => {
    const track = trackById.get(s.id)!;
    return {
      skillId: s.id,
      domainSlug: domainById.get(s.domain_id)?.slug ?? "general",
      mastery: Number(masteryById.get(s.id)?.mastery ?? 0),
      weight: Number(track.weight),
      isCritical: track.is_critical,
    };
  });

  const readiness = computeReadiness({
    skills: readinessInput,
    dimensions: {},
    consistency: 0,
  });

  const byDomain = new Map<string, typeof relevant>();
  for (const s of relevant) {
    const slug = domainById.get(s.domain_id)?.slug ?? "general";
    byDomain.set(slug, [...(byDomain.get(slug) ?? []), s] as never);
  }

  if (relevant.length === 0) {
    return (
      <div className="mx-auto max-w-lg px-4 py-16 text-center">
        <h1 className="text-lg font-semibold">No skills tracked yet</h1>
        <p className="mt-2 text-[13px] text-[var(--text-muted)]">
          Seed the skill library and pick a role track — your mastery map builds itself from there.
        </p>
      </div>
    );
  }

  return (
    <div className="mx-auto w-full max-w-[1000px] px-4 py-6 md:px-6">
      <h1 className="text-2xl font-semibold tracking-tight">Skills</h1>
      <p className="mt-1 text-[13px] text-[var(--text-muted)]">
        Weighted for your target role. Every number traces to scored attempts — nothing here comes
        from XP.
      </p>

      <div className="mt-5 grid grid-cols-2 gap-3 sm:grid-cols-4">
        <StatTile label="Overall readiness" value={Math.round(readiness.overall)} unit="%" />
        <StatTile label="Skills tracked" value={relevant.length} />
        <StatTile
          label="With evidence"
          value={relevant.filter((s) => (masteryById.get(s.id)?.evidence_count ?? 0) > 0).length}
        />
        <StatTile label="Open weaknesses" value={weaknesses?.length ?? 0} />
      </div>

      {readiness.penaltyExplanation && (
        <p className="mt-4 rounded-[var(--radius)] border border-[var(--warn)]/40 bg-[var(--warn)]/10 px-4 py-3 text-[13px]">
          {readiness.penaltyExplanation}
        </p>
      )}

      <div className="mt-6 flex flex-col gap-6">
        {(domains ?? [])
          .filter((d) => byDomain.has(d.slug))
          .map((domain) => {
            const domainSkills = byDomain.get(domain.slug)!;
            const score = readiness.byDomain[domain.slug] ?? 0;

            return (
              <section key={domain.id}>
                <header className="flex items-baseline gap-2">
                  <h2 className="text-sm font-semibold">{domain.name}</h2>
                  <span className="metric text-[12px] text-[var(--text-muted)]">
                    {Math.round(score)}%
                  </span>
                  {domainSkills.some((s) => trackById.get(s.id)?.is_critical) && (
                    <Badge variant="outline">critical for your role</Badge>
                  )}
                </header>

                <div className="mt-3 grid gap-x-6 gap-y-4 sm:grid-cols-2">
                  {domainSkills
                    .sort(
                      (a, b) =>
                        Number(masteryById.get(a.id)?.mastery ?? 0) -
                        Number(masteryById.get(b.id)?.mastery ?? 0),
                    )
                    .map((skill) => {
                      const us = masteryById.get(skill.id);
                      const weakness = weaknessBySkill.get(skill.id);

                      return (
                        <div key={skill.id} className="flex flex-col gap-1">
                          <HeatBar
                            label={skill.name}
                            mastery={Number(us?.mastery ?? 0)}
                            confidence={Number(us?.confidence ?? 0)}
                            rank={(us?.rank ?? "novice") as SkillRank}
                          />
                          {weakness && (
                            <span className="text-[11px] text-[var(--warn)]">
                              Open weakness · severity {weakness.severity} · scheduled for review
                            </span>
                          )}
                        </div>
                      );
                    })}
                </div>
              </section>
            );
          })}
      </div>
    </div>
  );
}
