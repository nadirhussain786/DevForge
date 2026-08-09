import type { Metadata } from "next";
import Link from "next/link";
import { notFound } from "next/navigation";
import { ArrowLeft } from "lucide-react";

import { Badge } from "@/components/ui/badge";
import { CodeForge } from "@/features/code/ui/code-forge";
import type { TestCase } from "@/features/code/ui/runner";
import { requireOnboarded } from "@/lib/auth/session";
import { createClient } from "@/lib/supabase/server";

export async function generateMetadata({ params }: PageProps<"/code/[slug]">): Promise<Metadata> {
  const { slug } = await params;
  const supabase = await createClient();
  const { data } = await supabase.from("coding_problems").select("title").eq("slug", slug).maybeSingle();
  return { title: data?.title ? `${data.title} · EngForge` : "Problem · EngForge" };
}

export default async function CodingProblemPage({ params }: PageProps<"/code/[slug]">) {
  const { slug } = await params;
  await requireOnboarded();
  const supabase = await createClient();

  const { data: problem } = await supabase
    .from("coding_problems")
    .select("id, slug, title, pattern, difficulty, statement_md, starter_code, tests, hints, target_complexity, estimated_minutes")
    .eq("slug", slug)
    .eq("status", "published")
    .maybeSingle();

  if (!problem) notFound();

  const starter = (problem.starter_code ?? {}) as Record<string, string>;
  const language = Object.keys(starter)[0] ?? "typescript";

  return (
    <div className="mx-auto w-full max-w-[1200px] px-4 py-6 md:px-6">
      <Link
        href="/code"
        className="inline-flex items-center gap-1 text-[12px] text-[var(--text-muted)] hover:text-[var(--text)]"
      >
        <ArrowLeft aria-hidden className="size-3.5" /> All problems
      </Link>

      <header className="mt-3 flex flex-wrap items-center gap-2">
        <h1 className="text-2xl font-semibold tracking-tight">{problem.title}</h1>
        {problem.pattern && <Badge variant="outline">{problem.pattern}</Badge>}
        <Badge variant="neutral">difficulty {problem.difficulty}/5</Badge>
        <Badge variant="neutral">{problem.estimated_minutes} min</Badge>
      </header>

      <div className="mt-6">
        <CodeForge
          problemId={problem.id}
          title={problem.title}
          statementMd={problem.statement_md}
          starterCode={starter[language] ?? ""}
          language={language}
          // Tests are authored JSON, so they arrive as `Json` and have to be
          // asserted through `unknown` — the shape is guaranteed by the
          // content contract, not by the column type.
          tests={(Array.isArray(problem.tests) ? problem.tests : []) as unknown as TestCase[]}
          hints={(Array.isArray(problem.hints) ? problem.hints : []) as string[]}
          targetComplexity={problem.target_complexity}
        />
      </div>
    </div>
  );
}
