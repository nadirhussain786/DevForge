import type { Metadata } from "next";
import Link from "next/link";
import { notFound } from "next/navigation";
import { ArrowLeft, Clock } from "lucide-react";

import { Badge } from "@/components/ui/badge";
import { HeatBar } from "@/features/mastery/ui/heat-bar";
import type { SkillRank } from "@/features/mastery/domain/mastery";
import { GlossaryProvider, type GlossaryTerm } from "@/features/learn/ui/glossary";
import { Prerequisites, type Prerequisite } from "@/features/learn/ui/prerequisites";
import { TopicReader, type TopicMedia } from "@/features/learn/ui/topic-reader";
import { requireOnboarded } from "@/lib/auth/session";
import { createClient } from "@/lib/supabase/server";

export async function generateMetadata({
  params,
}: PageProps<"/learn/[slug]">): Promise<Metadata> {
  const { slug } = await params;
  const supabase = await createClient();
  const { data } = await supabase.from("topics").select("title").eq("slug", slug).maybeSingle();
  return { title: data?.title ? `${data.title} · EngForge` : "Topic · EngForge" };
}

export default async function TopicPage({ params }: PageProps<"/learn/[slug]">) {
  const { slug } = await params;
  const ctx = await requireOnboarded();
  const supabase = await createClient();

  const { data: topic } = await supabase
    .from("topics")
    .select("id, slug, title, summary, estimated_minutes, difficulty, skill_id")
    .eq("slug", slug)
    .eq("status", "published")
    .maybeSingle();

  if (!topic) notFound();

  const [
    { data: contents },
    { data: media },
    { data: skill },
    { data: userSkill },
    { count: priorExplanations },
    { data: glossary },
    { data: prereqEdges },
  ] = await Promise.all([
    supabase.from("topic_contents").select("kind, body_md").eq("topic_id", topic.id),
    supabase
      .from("topic_media")
      .select("id, kind, source, caption, explanation_md, alt_text, sort_order")
      .eq("topic_id", topic.id)
      .order("sort_order"),
    supabase.from("skills").select("id, name, slug").eq("id", topic.skill_id).maybeSingle(),
    supabase
      .from("user_skills")
      .select("mastery, confidence, rank")
      .eq("user_id", ctx.userId)
      .eq("skill_id", topic.skill_id)
      .maybeSingle(),
    supabase
      .from("explanations")
      .select("id", { count: "exact", head: true })
      .eq("user_id", ctx.userId)
      .eq("topic_id", topic.id),
    supabase.from("glossary_terms").select("term, aliases, short_def, long_def, skill_id"),
    supabase.from("skill_prerequisites").select("prereq_skill_id").eq("skill_id", topic.skill_id),
  ]);

  // Prerequisites, with the learner's current standing on each.
  const prereqIds = (prereqEdges ?? []).map((p) => p.prereq_skill_id);
  let prerequisites: Prerequisite[] = [];

  if (prereqIds.length > 0) {
    const [{ data: prereqSkills }, { data: prereqMastery }, { data: prereqTopics }] =
      await Promise.all([
        supabase.from("skills").select("id, name").in("id", prereqIds),
        supabase
          .from("user_skills")
          .select("skill_id, mastery")
          .eq("user_id", ctx.userId)
          .in("skill_id", prereqIds),
        supabase
          .from("topics")
          .select("skill_id, slug")
          .in("skill_id", prereqIds)
          .eq("status", "published"),
      ]);

    const masteryBy = new Map((prereqMastery ?? []).map((m) => [m.skill_id, Number(m.mastery)]));
    const topicBy = new Map((prereqTopics ?? []).map((t) => [t.skill_id, t.slug]));

    prerequisites = (prereqSkills ?? []).map((s) => ({
      skillId: s.id,
      name: s.name,
      mastery: masteryBy.get(s.id) ?? 0,
      topicSlug: topicBy.get(s.id) ?? null,
    }));
  }

  const bodies = Object.fromEntries((contents ?? []).map((c) => [c.kind, c.body_md]));

  const terms: GlossaryTerm[] = (glossary ?? []).map((g) => ({
    term: g.term,
    aliases: g.aliases ?? [],
    shortDef: g.short_def,
    longDef: g.long_def,
    skillSlug: g.skill_id,
  }));

  const topicMedia: TopicMedia[] = (media ?? []).map((m) => ({
    id: m.id,
    kind: m.kind,
    source: m.source,
    caption: m.caption,
    explanationMd: m.explanation_md,
    altText: m.alt_text,
  }));

  return (
    <GlossaryProvider terms={terms}>
      <div className="mx-auto w-full max-w-[46rem] px-5 py-8 md:px-8 md:py-12">
        <Link
          href="/learn"
          className="inline-flex items-center gap-1.5 text-[13px] text-[var(--text-muted)] transition-colors hover:text-[var(--text)]"
        >
          <ArrowLeft aria-hidden className="size-3.5" /> All topics
        </Link>

        <header className="mt-6 flex flex-col gap-3">
          <div className="flex flex-wrap items-center gap-2">
            {skill && <Badge variant="forge">{skill.name}</Badge>}
            <span className="flex items-center gap-1 text-[12px] text-[var(--text-subtle)]">
              <Clock aria-hidden className="size-3.5" />
              {topic.estimated_minutes} min
            </span>
            <span className="text-[12px] text-[var(--text-subtle)]">
              difficulty {topic.difficulty}/5
            </span>
          </div>

          <h1 className="text-[2rem] font-semibold leading-tight tracking-tight md:text-[2.5rem]">
            {topic.title}
          </h1>

          {topic.summary && (
            <p className="measure text-[1.0625rem] leading-relaxed text-[var(--text-muted)]">
              {topic.summary}
            </p>
          )}
        </header>

        {prerequisites.length > 0 && (
          <div className="mt-7">
            <Prerequisites items={prerequisites} />
          </div>
        )}

        {skill && (
          <div className="mt-7 max-w-sm">
            <HeatBar
              label={`Your ${skill.name} mastery`}
              mastery={Number(userSkill?.mastery ?? 0)}
              confidence={Number(userSkill?.confidence ?? 0)}
              rank={(userSkill?.rank ?? "novice") as SkillRank}
            />
          </div>
        )}

        <div className="mt-10">
          <TopicReader
            topicId={topic.id}
            title={topic.title}
            bodies={bodies}
            media={topicMedia}
            alreadyExplained={(priorExplanations ?? 0) > 0}
          />
        </div>
      </div>
    </GlossaryProvider>
  );
}
