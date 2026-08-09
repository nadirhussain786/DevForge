import type { Metadata } from "next";
import Link from "next/link";
import { ArrowLeft } from "lucide-react";

import { Badge } from "@/components/ui/badge";
import { requireOnboarded } from "@/lib/auth/session";
import { createClient } from "@/lib/supabase/server";

export const metadata: Metadata = { title: "System Design Arena · EngForge" };

export default async function DesignIndexPage() {
  const ctx = await requireOnboarded();
  const supabase = await createClient();

  const [{ data: cases }, { data: attempts }] = await Promise.all([
    supabase
      .from("system_design_cases")
      .select("id, slug, title, brief_md, difficulty, estimated_minutes")
      .eq("status", "published")
      .order("difficulty"),
    supabase
      .from("system_design_attempts")
      .select("case_id, overall_score, submitted_at")
      .eq("user_id", ctx.userId)
      .not("submitted_at", "is", null),
  ]);

  const attemptBy = new Map((attempts ?? []).map((a) => [a.case_id, a]));

  return (
    <div className="mx-auto w-full max-w-[880px] px-4 py-6 md:px-6">
      <Link
        href="/arena"
        className="inline-flex items-center gap-1 text-[12px] text-[var(--text-muted)] hover:text-[var(--text)]"
      >
        <ArrowLeft aria-hidden className="size-3.5" /> Arena
      </Link>

      <h1 className="mt-3 text-2xl font-semibold tracking-tight">System Design Arena</h1>
      <p className="mt-1 max-w-[70ch] text-[13px] text-[var(--text-muted)]">
        Write the design first. The reference architecture stays locked until you submit — the value
        of this exercise is the gap between what you wrote and what you didn&apos;t think of, and
        that gap disappears the moment you read the answer first.
      </p>

      {!cases?.length ? (
        <div className="mt-6 rounded-[var(--radius)] border border-dashed border-[var(--border-strong)] p-8 text-center text-[13px] text-[var(--text-muted)]">
          No published cases yet.
        </div>
      ) : (
        <ul className="mt-6 flex flex-col gap-2">
          {cases.map((c) => {
            const attempt = attemptBy.get(c.id);
            return (
              <li key={c.id}>
                <Link
                  href={`/arena/design/${c.slug}`}
                  className="flex items-start gap-3 rounded-[var(--radius)] border border-[var(--border)] bg-[var(--surface)] p-4 transition-colors duration-150 hover:bg-[var(--surface-2)]"
                >
                  <span className="min-w-0 flex-1">
                    <span className="flex flex-wrap items-center gap-2">
                      <span className="text-[14px] font-medium">{c.title}</span>
                      {attempt &&
                        (attempt.overall_score !== null ? (
                          <Badge variant="success">
                            scored {Math.round(attempt.overall_score)}%
                          </Badge>
                        ) : (
                          <Badge variant="warn">submitted, not scored</Badge>
                        ))}
                    </span>
                    <span className="mt-0.5 block text-[13px] text-[var(--text-muted)]">
                      {c.brief_md.split("\n")[0].slice(0, 140)}…
                    </span>
                  </span>
                  <span className="metric shrink-0 text-[11px] text-[var(--text-subtle)]">
                    d{c.difficulty} · {c.estimated_minutes}m
                  </span>
                </Link>
              </li>
            );
          })}
        </ul>
      )}
    </div>
  );
}
