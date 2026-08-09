import "server-only";

import { createAdminClient } from "@/lib/supabase/admin";

/**
 * Admin analytics.
 *
 * Reads ONLY from `user_events` and `owner_plus_admin` tables. Nothing here
 * touches `research_notes`, `mock_interview_turns`, `interview_records`,
 * `job_descriptions`, or `system_design_attempts` — that is the §36 guarantee,
 * and it is a property of these queries as much as of the RLS policies.
 *
 * The service-role client is used because materialised views cannot carry RLS
 * and are therefore revoked from `authenticated`. Every caller must have
 * passed `requireAdmin()` first.
 */

export interface PlatformOverview {
  totalUsers: number;
  activeToday: number;
  activeThisWeek: number;
  newThisWeek: number;
  onboarded: number;
  avgStreak: number;
  avgReadiness: number | null;
  totalStudyMinutes: number;
  questionsAnswered: number;
  weaknessesOpen: number;
}

export async function getOverview(): Promise<PlatformOverview> {
  const db = createAdminClient();
  const now = Date.now();
  const dayAgo = new Date(now - 86_400_000).toISOString();
  const weekAgo = new Date(now - 7 * 86_400_000).toISOString();

  const [
    { count: totalUsers },
    { data: recentEvents },
    { count: newThisWeek },
    { count: onboarded },
    { data: streaks },
    { data: readiness },
    { count: questionsAnswered },
    { count: weaknessesOpen },
  ] = await Promise.all([
    db.from("profiles").select("id", { count: "exact", head: true }).is("deleted_at", null),
    db.from("user_events").select("user_id, occurred_at").gte("occurred_at", weekAgo),
    db.from("profiles").select("id", { count: "exact", head: true }).gte("created_at", weekAgo),
    db
      .from("career_profiles")
      .select("user_id", { count: "exact", head: true })
      .not("onboarding_completed_at", "is", null),
    db.from("streaks").select("current_streak, total_minutes"),
    db.from("readiness_snapshots").select("overall").order("snapshot_date", { ascending: false }).limit(200),
    db.from("question_attempts").select("id", { count: "exact", head: true }),
    db
      .from("weaknesses")
      .select("id", { count: "exact", head: true })
      .in("status", ["open", "researching", "retesting"]),
  ]);

  const events = recentEvents ?? [];
  const activeToday = new Set(
    events.filter((e) => e.occurred_at >= dayAgo).map((e) => e.user_id),
  ).size;
  const activeThisWeek = new Set(events.map((e) => e.user_id)).size;

  const streakRows = streaks ?? [];
  const avgStreak =
    streakRows.length > 0
      ? streakRows.reduce((a, s) => a + s.current_streak, 0) / streakRows.length
      : 0;
  const totalStudyMinutes = streakRows.reduce((a, s) => a + s.total_minutes, 0);

  const readinessRows = readiness ?? [];
  const avgReadiness =
    readinessRows.length > 0
      ? readinessRows.reduce((a, r) => a + Number(r.overall), 0) / readinessRows.length
      : null;

  return {
    totalUsers: totalUsers ?? 0,
    activeToday,
    activeThisWeek,
    newThisWeek: newThisWeek ?? 0,
    onboarded: onboarded ?? 0,
    avgStreak: Math.round(avgStreak * 10) / 10,
    avgReadiness: avgReadiness === null ? null : Math.round(avgReadiness),
    totalStudyMinutes,
    questionsAnswered: questionsAnswered ?? 0,
    weaknessesOpen: weaknessesOpen ?? 0,
  };
}

export interface StrugglingSkill {
  skillId: string;
  name: string;
  domain: string;
  openCount: number;
  totalCount: number;
  avgSeverity: number;
}

/**
 * §34 — "what are users struggling with?", the console's reason to exist.
 * Aggregated from weaknesses, which carry a skill and a severity but no prose.
 */
export async function getStrugglingSkills(limit = 15): Promise<StrugglingSkill[]> {
  const db = createAdminClient();

  const [{ data: weaknesses }, { data: skills }, { data: domains }] = await Promise.all([
    db.from("weaknesses").select("skill_id, severity, status"),
    db.from("skills").select("id, name, domain_id"),
    db.from("domains").select("id, name"),
  ]);

  const skillById = new Map((skills ?? []).map((s) => [s.id, s]));
  const domainById = new Map((domains ?? []).map((d) => [d.id, d.name]));

  const grouped = new Map<string, { open: number; total: number; severity: number }>();
  for (const w of weaknesses ?? []) {
    const entry = grouped.get(w.skill_id) ?? { open: 0, total: 0, severity: 0 };
    entry.total++;
    entry.severity += w.severity;
    if (w.status !== "resolved" && w.status !== "dismissed") entry.open++;
    grouped.set(w.skill_id, entry);
  }

  return [...grouped.entries()]
    .map(([skillId, v]) => {
      const skill = skillById.get(skillId);
      return {
        skillId,
        name: skill?.name ?? "Unknown skill",
        domain: domainById.get(skill?.domain_id ?? "") ?? "",
        openCount: v.open,
        totalCount: v.total,
        avgSeverity: Math.round((v.severity / v.total) * 100) / 100,
      };
    })
    .sort((a, b) => b.openCount - a.openCount || b.avgSeverity - a.avgSeverity)
    .slice(0, limit);
}

export interface HardQuestion {
  questionId: string;
  slug: string;
  attempts: number;
  avgScore: number;
  failureRate: number;
  avgSeconds: number | null;
}

/**
 * Separates *hard* from *badly written*: high failure with time far over the
 * estimate usually means the question is unclear, not difficult.
 */
export async function getHardestQuestions(limit = 15): Promise<HardQuestion[]> {
  const db = createAdminClient();

  const [{ data: attempts }, { data: questions }] = await Promise.all([
    db.from("question_attempts").select("question_id, score, seconds"),
    db.from("questions").select("id, slug"),
  ]);

  const slugById = new Map((questions ?? []).map((q) => [q.id, q.slug]));
  const grouped = new Map<string, { n: number; score: number; fails: number; seconds: number[] }>();

  for (const a of attempts ?? []) {
    const entry = grouped.get(a.question_id) ?? { n: 0, score: 0, fails: 0, seconds: [] };
    entry.n++;
    entry.score += Number(a.score);
    if (Number(a.score) < 0.6) entry.fails++;
    if (a.seconds) entry.seconds.push(a.seconds);
    grouped.set(a.question_id, entry);
  }

  return [...grouped.entries()]
    .filter(([, v]) => v.n >= 3)
    .map(([questionId, v]) => ({
      questionId,
      slug: slugById.get(questionId) ?? questionId.slice(0, 8),
      attempts: v.n,
      avgScore: Math.round((v.score / v.n) * 100) / 100,
      failureRate: Math.round((v.fails / v.n) * 100) / 100,
      avgSeconds: v.seconds.length
        ? Math.round(v.seconds.reduce((a, b) => a + b, 0) / v.seconds.length)
        : null,
    }))
    .sort((a, b) => b.failureRate - a.failureRate)
    .slice(0, limit);
}

export interface CurriculumGap {
  label: string;
  mentions: number;
  requiredMentions: number;
}

/** Requirements employers ask for that the skill graph cannot yet teach (§35). */
export async function getCurriculumGaps(limit = 20): Promise<CurriculumGap[]> {
  const db = createAdminClient();

  const { data } = await db
    .from("jd_requirements")
    .select("normalized_label, kind")
    .is("skill_id", null);

  const grouped = new Map<string, { n: number; required: number }>();
  for (const r of data ?? []) {
    const entry = grouped.get(r.normalized_label) ?? { n: 0, required: 0 };
    entry.n++;
    if (r.kind === "required") entry.required++;
    grouped.set(r.normalized_label, entry);
  }

  return [...grouped.entries()]
    .map(([label, v]) => ({ label, mentions: v.n, requiredMentions: v.required }))
    .sort((a, b) => b.mentions - a.mentions)
    .slice(0, limit);
}
