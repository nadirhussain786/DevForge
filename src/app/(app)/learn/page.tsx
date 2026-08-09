import type { Metadata } from "next";

import { PREREQ_READY_MASTERY } from "@/features/learn/ui/prerequisites";
import { TopicBrowser, type BrowsableTopic } from "@/features/learn/ui/topic-browser";
import { requireOnboarded } from "@/lib/auth/session";
import { createClient } from "@/lib/supabase/server";

export const metadata: Metadata = { title: "Learn · EngForge" };

export default async function LearnIndexPage() {
  const ctx = await requireOnboarded();
  const supabase = await createClient();

  const [
    { data: topics },
    { data: skills },
    { data: domains },
    { data: explained },
    { data: userSkills },
    { data: prereqEdges },
  ] = await Promise.all([
    supabase
      .from("topics")
      .select("id, slug, title, summary, estimated_minutes, difficulty, skill_id")
      .eq("status", "published")
      .order("sort_order"),
    supabase.from("skills").select("id, name, domain_id"),
    supabase.from("domains").select("id, name, sort_order").order("sort_order"),
    supabase.from("explanations").select("topic_id").eq("user_id", ctx.userId),
    supabase.from("user_skills").select("skill_id, mastery").eq("user_id", ctx.userId),
    supabase.from("skill_prerequisites").select("skill_id, prereq_skill_id"),
  ]);

  if (!topics?.length) {
    return (
      <div className="mx-auto max-w-lg px-4 py-16 text-center">
        <h1 className="text-lg font-semibold">No published topics yet</h1>
        <p className="mt-2 text-[13px] leading-relaxed text-[var(--text-muted)]">
          Generate drafts with <code className="metric">pnpm content:generate</code>, then publish
          them. A topic needs all four explanation levels before it can be published — that rule is
          enforced in the database, not in the UI.
        </p>
      </div>
    );
  }

  const skillById = new Map((skills ?? []).map((s) => [s.id, s]));
  const domainById = new Map((domains ?? []).map((d) => [d.id, d]));
  const masteryBySkill = new Map((userSkills ?? []).map((u) => [u.skill_id, Number(u.mastery)]));
  const explainedTopicIds = new Set((explained ?? []).map((e) => e.topic_id));

  // skill → prerequisite skill ids, so readiness is one map lookup per topic.
  const prereqsBySkill = new Map<string, string[]>();
  for (const edge of prereqEdges ?? []) {
    prereqsBySkill.set(edge.skill_id, [
      ...(prereqsBySkill.get(edge.skill_id) ?? []),
      edge.prereq_skill_id,
    ]);
  }

  const browsable: BrowsableTopic[] = topics.map((t) => {
    const skill = skillById.get(t.skill_id);
    const missingPrereqs = (prereqsBySkill.get(t.skill_id) ?? [])
      .filter((id) => (masteryBySkill.get(id) ?? 0) < PREREQ_READY_MASTERY)
      .map((id) => skillById.get(id)?.name ?? "an earlier skill");

    return {
      id: t.id,
      slug: t.slug,
      title: t.title,
      summary: t.summary,
      minutes: t.estimated_minutes,
      difficulty: t.difficulty,
      domain: domainById.get(skill?.domain_id ?? "")?.name ?? "Other",
      skillName: skill?.name ?? "Unknown skill",
      mastery: masteryBySkill.get(t.skill_id) ?? 0,
      explained: explainedTopicIds.has(t.id),
      missingPrereqs,
    };
  });

  return (
    <div className="mx-auto w-full max-w-[900px] px-5 py-8 md:px-6">
      <header className="mb-8">
        <h1 className="text-[1.75rem] font-semibold tracking-tight">Learn</h1>
        <p className="measure mt-1.5 text-[14px] leading-relaxed text-[var(--text-muted)]">
          Every topic runs beginner → engineer → enterprise → interview, then asks you to explain it
          back. Reading is the weakest evidence in your mastery model; only the explanation really
          moves it.
        </p>
      </header>

      <TopicBrowser topics={browsable} />
    </div>
  );
}
