import { NextResponse, type NextRequest } from "next/server";

import { computeMomentum, type BreadthStage } from "@/features/gamification/domain/momentum";
import { computeReadiness, type SkillReadinessInput } from "@/features/readiness/domain/readiness";
import { createAdminClient } from "@/lib/supabase/admin";

/**
 * Nightly readiness and momentum snapshots.
 *
 * Snapshots exist so the product can say "your System Design score improved
 * 12% this week" (§41) — a delta needs history, and history has to be written
 * on a schedule rather than derived on read.
 *
 * Guarded by CRON_SECRET. All scoring is done by the pure domain engines, so
 * this route only gathers inputs and stores outputs.
 *
 * (Careful with paths in block comments: writing features/<star>/domain here
 * would close the comment early and silently turn the rest of the file into
 * code — which is exactly what happened the first time.)
 */

export const dynamic = "force-dynamic";
export const maxDuration = 300;

function authorized(request: NextRequest): boolean {
  const secret = process.env.CRON_SECRET;
  if (!secret) return false;

  const header = request.headers.get("authorization");
  return header === `Bearer ${secret}`;
}

export async function POST(request: NextRequest) {
  if (!authorized(request)) {
    // 404 rather than 401: an unauthenticated caller learns nothing about
    // whether this endpoint exists.
    return new NextResponse("Not found", { status: 404 });
  }

  const db = createAdminClient();
  const today = new Date().toISOString().slice(0, 10);
  const weekAgo = new Date(Date.now() - 7 * 86_400_000);

  const { data: careers } = await db
    .from("career_profiles")
    .select("user_id, role_track_id, study_days")
    .not("role_track_id", "is", null)
    .not("onboarding_completed_at", "is", null);

  if (!careers?.length) {
    return NextResponse.json({ ok: true, users: 0, note: "no onboarded users" });
  }

  const [{ data: skills }, { data: domains }, { data: trackSkills }] = await Promise.all([
    db.from("skills").select("id, domain_id"),
    db.from("domains").select("id, slug"),
    db.from("role_track_skills").select("role_track_id, skill_id, weight, target_mastery, is_critical"),
  ]);

  const domainSlug = new Map((domains ?? []).map((d) => [d.id, d.slug]));
  const skillDomain = new Map(
    (skills ?? []).map((s) => [s.id, domainSlug.get(s.domain_id) ?? "general"]),
  );

  const trackWeights = new Map<string, typeof trackSkills>();
  for (const t of trackSkills ?? []) {
    trackWeights.set(t.role_track_id, [...(trackWeights.get(t.role_track_id) ?? []), t] as never);
  }

  let processed = 0;
  const errors: string[] = [];

  for (const career of careers) {
    try {
      const weights = trackWeights.get(career.role_track_id!) ?? [];
      if (weights.length === 0) continue;

      const [{ data: userSkills }, { data: attempts }, { data: plans }, { data: revisions }] =
        await Promise.all([
          db.from("user_skills").select("skill_id, mastery, confidence").eq("user_id", career.user_id),
          db
            .from("question_attempts")
            .select("score, created_at")
            .eq("user_id", career.user_id)
            .gte("created_at", weekAgo.toISOString()),
          db
            .from("daily_plans")
            .select("qualified, planned_minutes, completed_minutes, plan_date")
            .eq("user_id", career.user_id)
            .gte("plan_date", weekAgo.toISOString().slice(0, 10)),
          db
            .from("revision_items")
            .select("last_result, last_reviewed_at")
            .eq("user_id", career.user_id)
            .gte("last_reviewed_at", weekAgo.toISOString()),
        ]);

      const masteryBy = new Map(
        (userSkills ?? []).map((u) => [u.skill_id, Number(u.mastery)]),
      );

      const readinessSkills: SkillReadinessInput[] = weights.map((w) => ({
        skillId: w.skill_id,
        domainSlug: skillDomain.get(w.skill_id) ?? "general",
        mastery: masteryBy.get(w.skill_id) ?? 0,
        weight: Number(w.weight),
        isCritical: w.is_critical,
      }));

      const qualifyingDays = (plans ?? []).filter((p) => p.qualified).length;
      const expectedDays = Math.max(1, (career.study_days ?? []).length);
      const consistency = Math.min(100, (qualifyingDays / expectedDays) * 100);

      const knowledge =
        attempts?.length
          ? (attempts.reduce((a, x) => a + Number(x.score), 0) / attempts.length) * 100
          : 0;

      const readiness = computeReadiness({
        skills: readinessSkills,
        dimensions: attempts?.length ? { knowledge } : {},
        consistency,
      });

      const stagesUsed: BreadthStage[] = [];
      if (attempts?.length) stagesUsed.push("test");
      if (revisions?.length) stagesUsed.push("learn");

      const momentum = computeMomentum({
        qualifyingDays,
        expectedDays,
        itemsCompleted: (plans ?? []).reduce((a, p) => a + (p.completed_minutes > 0 ? 1 : 0), 0),
        itemsPlanned: plans?.length ?? 0,
        averageDifficulty: 3,
        revisionCorrect: (revisions ?? []).filter((r) => r.last_result === true).length,
        revisionDue: revisions?.length ?? 0,
        stagesUsed,
      });

      await Promise.all([
        db.from("readiness_snapshots").upsert(
          {
            user_id: career.user_id,
            snapshot_date: today,
            role_track_id: career.role_track_id,
            overall: readiness.overall,
            by_domain: readiness.byDomain as never,
            by_dimension: readiness.byDimension as never,
            components: readiness.components as never,
          },
          { onConflict: "user_id,snapshot_date" },
        ),
        db.from("momentum_snapshots").upsert(
          {
            user_id: career.user_id,
            snapshot_date: today,
            score: momentum.score,
            components: momentum.components as never,
          },
          { onConflict: "user_id,snapshot_date" },
        ),
      ]);

      processed++;
    } catch (error) {
      // One user's bad data must not stop the batch.
      errors.push(`${career.user_id.slice(0, 8)}: ${(error as Error).message}`);
    }
  }

  return NextResponse.json({ ok: true, date: today, processed, errors });
}
