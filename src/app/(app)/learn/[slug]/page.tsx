import type { Metadata } from "next";
import Link from "next/link";
import { notFound } from "next/navigation";
import { ArrowLeft } from "lucide-react";

import { Badge } from "@/components/ui/badge";
import { HeatBar } from "@/features/mastery/ui/heat-bar";
import type { SkillRank } from "@/features/mastery/domain/mastery";
import { TopicReader } from "@/features/learn/ui/topic-reader";
import { requireOnboarded } from "@/lib/auth/session";
import { createClient } from "@/lib/supabase/server";

export async function generateMetadata({
  params,
}: PageProps<"/learn/[slug]">): Promise<Metadata> {
  const { slug } = await params;
  const supabase = await createClient();
  const { data } = await supabase
    .from("topics")
    .select("title")
    .eq("slug", slug)
    .maybeSingle();
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

  const [{ data: contents }, { data: skill }, { data: userSkill }, { count: priorExplanations }] =
    await Promise.all([
      supabase.from("topic_contents").select("kind, body_md").eq("topic_id", topic.id),
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
    ]);

  const bodies = Object.fromEntries((contents ?? []).map((c) => [c.kind, c.body_md]));

  return (
    <div className="mx-auto w-full max-w-[820px] px-4 py-6 md:px-6">
      <Link
        href="/learn"
        className="inline-flex items-center gap-1 text-[12px] text-[var(--text-muted)] hover:text-[var(--text)]"
      >
        <ArrowLeft aria-hidden className="size-3.5" /> All topics
      </Link>

      <header className="mt-3 flex flex-col gap-2">
        <div className="flex flex-wrap items-center gap-2">
          {skill && <Badge variant="outline">{skill.name}</Badge>}
          <Badge variant="neutral">{topic.estimated_minutes} min</Badge>
          <Badge variant="neutral">difficulty {topic.difficulty}/5</Badge>
        </div>
        <h1 className="text-2xl font-semibold tracking-tight">{topic.title}</h1>
        {topic.summary && (
          <p className="max-w-[68ch] text-[14px] text-[var(--text-muted)]">{topic.summary}</p>
        )}
      </header>

      {skill && (
        <div className="mt-5 max-w-sm">
          <HeatBar
            label={`Your ${skill.name} mastery`}
            mastery={Number(userSkill?.mastery ?? 0)}
            confidence={Number(userSkill?.confidence ?? 0)}
            rank={(userSkill?.rank ?? "novice") as SkillRank}
          />
        </div>
      )}

      <div className="mt-7">
        <TopicReader
          topicId={topic.id}
          title={topic.title}
          bodies={bodies}
          alreadyExplained={(priorExplanations ?? 0) > 0}
        />
      </div>
    </div>
  );
}
