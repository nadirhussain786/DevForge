import "server-only";

import {
  orderForSession,
  selectQuestions,
  type Candidate,
  type Pool,
  type SelectedQuestion,
} from "@/features/practice/domain/select";
import { createClient } from "@/lib/supabase/server";

/**
 * Builds the candidate pools the pure selector reasons over. All the judgement
 * lives in `domain/select.ts`; this file only fetches.
 */

export interface DrillQuestion {
  id: string;
  slug: string;
  kind: "mcq" | "short_answer" | "explain" | "followup";
  promptMd: string;
  difficulty: number;
  skillId: string;
  skillName: string;
  choices: Array<{ id: string; text: string }>;
  estimatedSeconds: number;
  pool: Pool;
  reason: string;
}

export async function buildDrill(
  userId: string,
  roleTrackId: string | null,
  count = 5,
  now = new Date(),
): Promise<DrillQuestion[]> {
  const supabase = await createClient();

  // Typed explicitly rather than falling back to `never[]` — a bare `[]` in a
  // conditional makes TypeScript collapse the union and every field access on
  // the result becomes an error.
  type TrackSkill = { skill_id: string; weight: number; is_critical: boolean };

  const [{ data: weaknesses }, { data: userSkills }, { data: jdReqs }] = await Promise.all([
    supabase
      .from("weaknesses")
      .select("skill_id, severity")
      .eq("user_id", userId)
      .in("status", ["open", "researching", "retesting"]),
    supabase.from("user_skills").select("skill_id, mastery, confidence").eq("user_id", userId),
    supabase
      .from("jd_requirements")
      .select("skill_id, gap")
      .eq("user_id", userId)
      .in("gap", ["gap", "critical"]),
  ]);

  const trackSkills: TrackSkill[] = roleTrackId
    ? ((
        await supabase
          .from("role_track_skills")
          .select("skill_id, weight, is_critical")
          .eq("role_track_id", roleTrackId)
          .gt("weight", 0)
      ).data ?? [])
    : [];

  const trackSkillIds = trackSkills.map((t) => t.skill_id);
  if (trackSkillIds.length === 0) return [];

  const { data: questions } = await supabase
    .from("questions")
    .select("id, slug, kind, prompt_md, difficulty, skill_id, choices, estimated_seconds")
    .eq("status", "published")
    .in("skill_id", trackSkillIds);

  if (!questions?.length) return [];

  // Cooldown data: when did this user last see each question?
  const { data: attempts } = await supabase
    .from("question_attempts")
    .select("question_id, created_at")
    .eq("user_id", userId)
    .order("created_at", { ascending: false })
    .limit(500);

  const lastSeen = new Map<string, Date>();
  for (const a of attempts ?? []) {
    if (!lastSeen.has(a.question_id)) lastSeen.set(a.question_id, new Date(a.created_at));
  }

  const severityBySkill = new Map((weaknesses ?? []).map((w) => [w.skill_id, w.severity]));
  const masteryBySkill = new Map(
    (userSkills ?? []).map((u) => [u.skill_id, Number(u.mastery) * Number(u.confidence)]),
  );
  const weightBySkill = new Map(trackSkills.map((t) => [t.skill_id, Number(t.weight)]));
  const jdSkillIds = new Set((jdReqs ?? []).map((r) => r.skill_id).filter(Boolean) as string[]);

  const base = (q: (typeof questions)[number]): Candidate => ({
    questionId: q.id,
    skillId: q.skill_id,
    difficulty: q.difficulty,
    priority: 1,
    lastSeenAt: lastSeen.get(q.id) ?? null,
  });

  const pools: Partial<Record<Pool, Candidate[]>> = {
    weakness: questions
      .filter((q) => severityBySkill.has(q.skill_id))
      .map((q) => ({ ...base(q), priority: severityBySkill.get(q.skill_id) ?? 1 })),

    // Lowest mastery x confidence first — the skills we know least about.
    lowConfidence: questions
      .filter((q) => !severityBySkill.has(q.skill_id))
      .map((q) => ({
        ...base(q),
        priority: 100 - (masteryBySkill.get(q.skill_id) ?? 0),
      })),

    jd: questions
      .filter((q) => jdSkillIds.has(q.skill_id))
      .map((q) => ({ ...base(q), priority: 50 })),

    breadth: questions.map((q) => ({
      ...base(q),
      priority: (weightBySkill.get(q.skill_id) ?? 0) * 10,
    })),
  };

  const selected = orderForSession(selectQuestions({ pools, count, now }));
  if (selected.length === 0) return [];

  const { data: skills } = await supabase
    .from("skills")
    .select("id, name")
    .in("id", [...new Set(selected.map((s) => s.skillId))]);
  const skillName = new Map((skills ?? []).map((s) => [s.id, s.name]));
  const questionById = new Map(questions.map((q) => [q.id, q]));

  return selected
    .map((s: SelectedQuestion) => {
      const q = questionById.get(s.questionId);
      if (!q) return null;
      return {
        id: q.id,
        slug: q.slug,
        kind: q.kind,
        promptMd: q.prompt_md,
        difficulty: q.difficulty,
        skillId: q.skill_id,
        skillName: skillName.get(q.skill_id) ?? "Skill",
        choices: Array.isArray(q.choices) ? (q.choices as DrillQuestion["choices"]) : [],
        estimatedSeconds: q.estimated_seconds,
        pool: s.pool,
        reason: s.reason,
      } satisfies DrillQuestion;
    })
    .filter((q): q is DrillQuestion => q !== null);
}

