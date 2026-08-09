import type { Metadata } from "next";
import Link from "next/link";
import { Beaker, Lock, NotebookPen, Plus } from "lucide-react";

import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
import { createNote } from "@/features/notebook/actions";
import { requireOnboarded } from "@/lib/auth/session";
import { createClient } from "@/lib/supabase/server";

export const metadata: Metadata = { title: "Notebook · EngForge" };

export default async function NotebookPage() {
  const ctx = await requireOnboarded();
  const supabase = await createClient();

  const { data: notes } = await supabase
    .from("research_notes")
    .select("id, kind, title, status, confidence, tags, skill_id, updated_at, completed_at")
    .eq("user_id", ctx.userId)
    .order("updated_at", { ascending: false });

  const skillIds = [...new Set((notes ?? []).map((n) => n.skill_id).filter(Boolean) as string[])];
  const { data: skills } = skillIds.length
    ? await supabase.from("skills").select("id, name").in("id", skillIds)
    : { data: [] as Array<{ id: string; name: string }> };
  const skillName = new Map((skills ?? []).map((s) => [s.id, s.name]));

  return (
    <div className="mx-auto w-full max-w-[900px] px-4 py-6 md:px-6">
      <header className="flex flex-wrap items-start justify-between gap-3">
        <div>
          <h1 className="text-2xl font-semibold tracking-tight">Notebook & R&amp;D Lab</h1>
          <p className="mt-1 max-w-[68ch] text-[13px] text-[var(--text-muted)]">
            Question → hypothesis → experiment → evidence → conclusion → how you&apos;d say it in an
            interview. A lab notebook, not a blog.
          </p>
        </div>

        <div className="flex gap-2">
          <form action={createNote}>
            <input type="hidden" name="kind" value="notebook" />
            <Button type="submit" variant="primary" size="sm">
              <Plus aria-hidden /> Note
            </Button>
          </form>
          <form action={createNote}>
            <input type="hidden" name="kind" value="experiment" />
            <Button type="submit" variant="outline" size="sm">
              <Beaker aria-hidden /> Experiment
            </Button>
          </form>
        </div>
      </header>

      <p className="mt-4 flex items-center gap-1.5 text-[12px] text-[var(--text-subtle)]">
        <Lock aria-hidden className="size-3.5" />
        Private to you. These rows have no admin read policy — verified by{" "}
        <code className="metric">pnpm db:verify</code>.
      </p>

      {!notes?.length ? (
        <div className="mt-6 rounded-[var(--radius)] border border-dashed border-[var(--border-strong)] p-8 text-center">
          <p className="text-sm font-medium">Nothing here yet</p>
          <p className="mx-auto mt-1 max-w-[52ch] text-[13px] text-[var(--text-muted)]">
            Research tasks generated from your weaknesses show up in{" "}
            <Link href="/review" className="text-[var(--forge-500)] hover:underline">
              Review
            </Link>
            . Start one there, or open a blank note above.
          </p>
        </div>
      ) : (
        <ul className="mt-6 flex flex-col gap-2">
          {notes.map((n) => (
            <li key={n.id}>
              <Link
                href={`/notebook/${n.id}`}
                className="flex items-start gap-3 rounded-[var(--radius)] border border-[var(--border)] bg-[var(--surface)] p-4 transition-colors duration-150 hover:bg-[var(--surface-2)]"
              >
                <span
                  aria-hidden
                  className="mt-0.5 grid size-8 shrink-0 place-items-center rounded-[8px] bg-[var(--surface-2)] text-[var(--text-muted)]"
                >
                  {n.kind === "experiment" ? (
                    <Beaker className="size-4" />
                  ) : (
                    <NotebookPen className="size-4" />
                  )}
                </span>

                <span className="min-w-0 flex-1">
                  <span className="flex flex-wrap items-center gap-2">
                    <span className="text-[14px] font-medium">{n.title}</span>
                    {n.status === "completed" && <Badge variant="success">evidence recorded</Badge>}
                    {n.skill_id && <Badge variant="outline">{skillName.get(n.skill_id)}</Badge>}
                  </span>
                  {Array.isArray(n.tags) && n.tags.length > 0 && (
                    <span className="mt-1 block text-[12px] text-[var(--text-subtle)]">
                      {n.tags.join(" · ")}
                    </span>
                  )}
                </span>

                <span className="metric shrink-0 text-[11px] text-[var(--text-subtle)]">
                  {new Date(n.updated_at).toISOString().slice(0, 10)}
                </span>
              </Link>
            </li>
          ))}
        </ul>
      )}
    </div>
  );
}
