import type { Metadata } from "next";
import Link from "next/link";

import { Badge } from "@/components/ui/badge";
import { requireOnboarded } from "@/lib/auth/session";
import { createClient } from "@/lib/supabase/server";

export const metadata: Metadata = { title: "Code Forge · EngForge" };

export default async function CodeIndexPage() {
  const ctx = await requireOnboarded();
  const supabase = await createClient();

  const [{ data: problems }, { data: attempts }] = await Promise.all([
    supabase
      .from("coding_problems")
      .select("id, slug, title, pattern, difficulty, estimated_minutes")
      .eq("status", "published")
      .order("difficulty"),
    supabase
      .from("coding_attempts")
      .select("problem_id, status")
      .eq("user_id", ctx.userId),
  ]);

  const solved = new Set(
    (attempts ?? []).filter((a) => a.status === "passed").map((a) => a.problem_id),
  );
  const tried = new Set((attempts ?? []).map((a) => a.problem_id));

  return (
    <div className="mx-auto w-full max-w-[900px] px-4 py-6 md:px-6">
      <h1 className="text-2xl font-semibold tracking-tight">Code Forge</h1>
      <p className="mt-1 max-w-[70ch] text-[13px] text-[var(--text-muted)]">
        Solutions run in a sandboxed worker in your browser, never on the server. Attempts, time,
        hints, and whether your complexity claim was right are all tracked — the claim is scored
        separately, because working code with the wrong cost analysis is a real gap.
      </p>

      {!problems?.length ? (
        <div className="mt-6 rounded-[var(--radius)] border border-dashed border-[var(--border-strong)] p-8 text-center">
          <p className="text-sm font-medium">No published problems yet</p>
          <p className="mx-auto mt-1 max-w-[52ch] text-[13px] text-[var(--text-muted)]">
            Seed the content library or author problems in the admin CMS.
          </p>
        </div>
      ) : (
        <ul className="mt-6 flex flex-col gap-2">
          {problems.map((p) => (
            <li key={p.id}>
              <Link
                href={`/code/${p.slug}`}
                className="flex items-center gap-3 rounded-[var(--radius)] border border-[var(--border)] bg-[var(--surface)] p-4 transition-colors duration-150 hover:bg-[var(--surface-2)]"
              >
                <span className="min-w-0 flex-1">
                  <span className="flex flex-wrap items-center gap-2">
                    <span className="text-[14px] font-medium">{p.title}</span>
                    {solved.has(p.id) ? (
                      <Badge variant="success">solved</Badge>
                    ) : tried.has(p.id) ? (
                      <Badge variant="warn">attempted</Badge>
                    ) : null}
                    {p.pattern && <Badge variant="outline">{p.pattern}</Badge>}
                  </span>
                </span>
                <span className="metric shrink-0 text-[11px] text-[var(--text-subtle)]">
                  d{p.difficulty} · {p.estimated_minutes}m
                </span>
              </Link>
            </li>
          ))}
        </ul>
      )}
    </div>
  );
}
