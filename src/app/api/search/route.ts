import { NextResponse, type NextRequest } from "next/server";

import { createClient } from "@/lib/supabase/server";

/**
 * Global search (§50).
 *
 * Runs as the signed-in user through the anon key, so RLS decides what is
 * visible: private notes come back for their owner and for nobody else, with
 * no filtering logic here to get wrong.
 */

export interface SearchHit {
  type: "topic" | "skill" | "problem" | "note" | "application";
  id: string;
  title: string;
  subtitle: string | null;
  href: string;
}

const LIMIT = 6;

export async function GET(request: NextRequest) {
  const query = request.nextUrl.searchParams.get("q")?.trim() ?? "";
  if (query.length < 2) return NextResponse.json({ hits: [] });

  const supabase = await createClient();
  const {
    data: { user },
  } = await supabase.auth.getUser();
  if (!user) return NextResponse.json({ hits: [] }, { status: 401 });

  // Escape PostgREST's `ilike` wildcards so a user searching for "100%" does
  // not accidentally match everything.
  const pattern = `%${query.replace(/[%_]/g, (c) => `\\${c}`)}%`;

  const [topics, skills, problems, notes, applications] = await Promise.all([
    supabase
      .from("topics")
      .select("id, slug, title, summary")
      .eq("status", "published")
      .ilike("title", pattern)
      .limit(LIMIT),
    supabase
      .from("skills")
      .select("id, slug, name, summary")
      .eq("status", "published")
      .ilike("name", pattern)
      .limit(LIMIT),
    supabase
      .from("coding_problems")
      .select("id, slug, title, pattern")
      .eq("status", "published")
      .ilike("title", pattern)
      .limit(LIMIT),
    supabase
      .from("research_notes")
      .select("id, title, kind")
      .ilike("title", pattern)
      .limit(LIMIT),
    supabase
      .from("applications")
      .select("id, role_title, status")
      .ilike("role_title", pattern)
      .limit(LIMIT),
  ]);

  const hits: SearchHit[] = [
    ...(topics.data ?? []).map((t) => ({
      type: "topic" as const,
      id: t.id,
      title: t.title,
      subtitle: t.summary,
      href: `/learn/${t.slug}`,
    })),
    ...(skills.data ?? []).map((s) => ({
      type: "skill" as const,
      id: s.id,
      title: s.name,
      subtitle: s.summary,
      href: "/skills",
    })),
    ...(problems.data ?? []).map((p) => ({
      type: "problem" as const,
      id: p.id,
      title: p.title,
      subtitle: p.pattern,
      href: `/code/${p.slug}`,
    })),
    ...(notes.data ?? []).map((n) => ({
      type: "note" as const,
      id: n.id,
      title: n.title,
      subtitle: n.kind === "experiment" ? "Experiment" : "Note",
      href: `/notebook/${n.id}`,
    })),
    ...(applications.data ?? []).map((a) => ({
      type: "application" as const,
      id: a.id,
      title: a.role_title,
      subtitle: a.status.replace(/_/g, " "),
      href: "/career",
    })),
  ];

  return NextResponse.json({ hits });
}
