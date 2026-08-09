import type { Metadata } from "next";
import Link from "next/link";

import { Badge } from "@/components/ui/badge";
import { requireOnboarded } from "@/lib/auth/session";
import { createClient } from "@/lib/supabase/server";

export const metadata: Metadata = { title: "Learn · EngForge" };

export default async function LearnIndexPage() {
  const ctx = await requireOnboarded();
  const supabase = await createClient();

  const [{ data: topics }, { data: skills }, { data: domains }, { data: explained }] =
    await Promise.all([
      supabase
        .from("topics")
        .select("id, slug, title, summary, estimated_minutes, difficulty, skill_id")
        .eq("status", "published")
        .order("sort_order"),
      supabase.from("skills").select("id, name, domain_id"),
      supabase.from("domains").select("id, slug, name, sort_order").order("sort_order"),
      supabase.from("explanations").select("topic_id").eq("user_id", ctx.userId),
    ]);

  const skillById = new Map((skills ?? []).map((s) => [s.id, s]));
  const domainById = new Map((domains ?? []).map((d) => [d.id, d]));
  const explainedTopicIds = new Set((explained ?? []).map((e) => e.topic_id));

  if (!topics?.length) {
    return (
      <div className="mx-auto max-w-lg px-4 py-16 text-center">
        <h1 className="text-lg font-semibold">No published topics yet</h1>
        <p className="mt-2 text-[13px] text-[var(--text-muted)]">
          Seed the content library, or author topics in the admin CMS. A topic needs all four
          explanation levels before it can be published — that rule is enforced in the database.
        </p>
      </div>
    );
  }

  const byDomain = new Map<string, typeof topics>();
  for (const t of topics) {
    const domain = domainById.get(skillById.get(t.skill_id)?.domain_id ?? "");
    const key = domain?.name ?? "Other";
    byDomain.set(key, [...(byDomain.get(key) ?? []), t] as never);
  }

  return (
    <div className="mx-auto w-full max-w-[900px] px-4 py-6 md:px-6">
      <h1 className="text-2xl font-semibold tracking-tight">Learn</h1>
      <p className="mt-1 text-[13px] text-[var(--text-muted)]">
        Every topic runs beginner → engineer → enterprise → interview, then asks you to explain it
        back. Only the explanation produces evidence.
      </p>

      <div className="mt-6 flex flex-col gap-7">
        {[...byDomain.entries()].map(([domain, list]) => (
          <section key={domain}>
            <h2 className="text-[11px] uppercase tracking-wide text-[var(--text-subtle)]">
              {domain}
            </h2>
            <ul className="mt-3 flex flex-col gap-2">
              {list.map((t) => (
                <li key={t.id}>
                  <Link
                    href={`/learn/${t.slug}`}
                    className="flex items-start gap-3 rounded-[var(--radius)] border border-[var(--border)] bg-[var(--surface)] p-4 transition-colors duration-150 hover:bg-[var(--surface-2)]"
                  >
                    <span className="min-w-0 flex-1">
                      <span className="flex flex-wrap items-center gap-2">
                        <span className="text-[14px] font-medium">{t.title}</span>
                        {explainedTopicIds.has(t.id) && <Badge variant="success">explained</Badge>}
                      </span>
                      {t.summary && (
                        <span className="mt-0.5 block text-[13px] text-[var(--text-muted)]">
                          {t.summary}
                        </span>
                      )}
                    </span>
                    <span className="metric shrink-0 text-[12px] text-[var(--text-subtle)]">
                      {t.estimated_minutes}m
                    </span>
                  </Link>
                </li>
              ))}
            </ul>
          </section>
        ))}
      </div>
    </div>
  );
}
