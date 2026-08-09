import type { Metadata } from "next";
import Link from "next/link";
import { notFound } from "next/navigation";
import { ArrowLeft } from "lucide-react";

import { Badge } from "@/components/ui/badge";
import { DesignWorkspace, type Criterion } from "@/features/design/ui/design-workspace";
import { requireOnboarded } from "@/lib/auth/session";
import { createClient } from "@/lib/supabase/server";

export async function generateMetadata({
  params,
}: PageProps<"/arena/design/[slug]">): Promise<Metadata> {
  const { slug } = await params;
  const supabase = await createClient();
  const { data } = await supabase
    .from("system_design_cases")
    .select("title")
    .eq("slug", slug)
    .maybeSingle();
  return { title: data?.title ? `${data.title} · EngForge` : "System design · EngForge" };
}

export default async function DesignCasePage({ params }: PageProps<"/arena/design/[slug]">) {
  const { slug } = await params;
  const ctx = await requireOnboarded();
  const supabase = await createClient();

  // Deliberately does NOT select reference_architecture_md. Even though RLS
  // would allow it, keeping it out of the query means a future refactor cannot
  // leak it into the client bundle by accident.
  const { data: designCase } = await supabase
    .from("system_design_cases")
    .select("id, slug, title, brief_md, constraints, rubric, difficulty, estimated_minutes")
    .eq("slug", slug)
    .eq("status", "published")
    .maybeSingle();

  if (!designCase) notFound();

  const { data: attempt } = await supabase
    .from("system_design_attempts")
    .select("id, submission_md, overall_score, submitted_at")
    .eq("user_id", ctx.userId)
    .eq("case_id", designCase.id)
    .not("submitted_at", "is", null)
    .order("submitted_at", { ascending: false })
    .limit(1)
    .maybeSingle();

  // The RPC refuses unless a submitted attempt exists, so the gate is enforced
  // in the database rather than by this page remembering to check.
  let reference: string | null = null;
  if (attempt) {
    const { data } = await supabase.rpc("get_reference_architecture", { p_case: designCase.id });
    reference = typeof data === "string" ? data : null;
  }

  const rubric = (designCase.rubric ?? {}) as { criteria?: Criterion[] };

  return (
    <div className="mx-auto w-full max-w-[880px] px-4 py-6 md:px-6">
      <Link
        href="/arena/design"
        className="inline-flex items-center gap-1 text-[12px] text-[var(--text-muted)] hover:text-[var(--text)]"
      >
        <ArrowLeft aria-hidden className="size-3.5" /> System design cases
      </Link>

      <header className="mt-3 flex flex-wrap items-center gap-2">
        <h1 className="text-2xl font-semibold tracking-tight">{designCase.title}</h1>
        <Badge variant="neutral">difficulty {designCase.difficulty}/5</Badge>
        <Badge variant="neutral">{designCase.estimated_minutes} min</Badge>
      </header>

      <div className="mt-6">
        <DesignWorkspace
          caseId={designCase.id}
          briefMd={designCase.brief_md}
          constraints={(designCase.constraints ?? {}) as Record<string, unknown>}
          criteria={rubric.criteria ?? []}
          reference={reference}
          existingAttemptId={attempt?.id ?? null}
          existingScore={attempt?.overall_score ?? null}
          existingSubmission={attempt?.submission_md ?? null}
        />
      </div>
    </div>
  );
}
