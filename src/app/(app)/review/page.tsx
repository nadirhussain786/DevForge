import type { Metadata } from "next";
import Link from "next/link";
import { ArrowRight, FlaskConical } from "lucide-react";

import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
import { StatTile } from "@/components/ui/stat-tile";
import { startResearch } from "@/features/weakness/actions";
import { getDueRevision, getOpenWeaknesses } from "@/features/weakness/data/queue";
import { ReviewQueue } from "@/features/weakness/ui/review-queue";
import { requireOnboarded } from "@/lib/auth/session";

export const metadata: Metadata = { title: "Review · EngForge" };

const SEVERITY_LABEL: Record<number, string> = {
  1: "minor",
  2: "significant",
  3: "critical",
};

export default async function ReviewPage() {
  const ctx = await requireOnboarded();
  const [due, weaknesses] = await Promise.all([
    getDueRevision(ctx.userId),
    getOpenWeaknesses(ctx.userId),
  ]);

  const overdue = due.filter((d) => d.daysUntilDue < 0).length;

  return (
    <div className="mx-auto w-full max-w-[900px] px-4 py-6 md:px-6">
      <header className="flex flex-col gap-1">
        <h1 className="text-2xl font-semibold tracking-tight">Review</h1>
        <p className="max-w-[70ch] text-[13px] text-[var(--text-muted)]">
          Everything here was scheduled automatically when you missed something. Revision is always
          placed before new material in your daily plan — decay is the thing that quietly undoes
          progress.
        </p>
      </header>

      <div className="mt-5 grid grid-cols-2 gap-3 sm:grid-cols-4">
        <StatTile label="Due now" value={due.length} />
        <StatTile label="Overdue" value={overdue} />
        <StatTile label="Open weaknesses" value={weaknesses.length} />
        <StatTile
          label="Retesting"
          value={weaknesses.filter((w) => w.status === "retesting").length}
          hint="waiting on new evidence"
        />
      </div>

      <section className="mt-7">
        <h2 className="text-sm font-semibold">Due for recall</h2>
        <div className="mt-3">
          <ReviewQueue items={due} />
        </div>
      </section>

      <section className="mt-8">
        <h2 className="text-sm font-semibold">Open weaknesses</h2>
        <p className="mt-1 text-[13px] text-[var(--text-muted)]">
          A weakness closes only when new evidence scores well at the same difficulty or harder —
          never by re-answering the question that opened it.
        </p>

        {weaknesses.length === 0 ? (
          <div className="mt-3 rounded-[var(--radius)] border border-dashed border-[var(--border-strong)] p-6 text-center">
            <p className="text-sm font-medium">No open weaknesses</p>
            <p className="mx-auto mt-1 max-w-[52ch] text-[13px] text-[var(--text-muted)]">
              They appear automatically when you miss something. Start a drill in the{" "}
              <Link href="/arena" className="text-[var(--forge-500)] hover:underline">
                Arena
              </Link>{" "}
              to generate real signal.
            </p>
          </div>
        ) : (
          <ul className="mt-3 flex flex-col gap-3">
            {weaknesses.map((w) => (
              <li
                key={w.id}
                className="rounded-[var(--radius)] border border-[var(--border)] bg-[var(--surface)] p-4"
              >
                <div className="flex flex-wrap items-center gap-2">
                  <span className="text-[14px] font-medium">{w.skillName}</span>
                  {w.domainName && <Badge variant="outline">{w.domainName}</Badge>}
                  <Badge
                    variant={w.severity >= 3 ? "danger" : w.severity === 2 ? "warn" : "neutral"}
                  >
                    {SEVERITY_LABEL[w.severity] ?? `S${w.severity}`}
                  </Badge>
                  <Badge variant={w.status === "retesting" ? "info" : "neutral"}>{w.status}</Badge>
                  <span className="metric ml-auto text-[11px] text-[var(--text-subtle)]">
                    {w.revisionDone}/{w.revisionCount} recalled
                  </span>
                </div>

                <p className="mt-2 max-w-[70ch] text-[13px] text-[var(--text-muted)]">{w.reason}</p>

                {w.researchTask && (
                  <div className="mt-3 flex flex-wrap items-start gap-3 rounded-[var(--radius)] bg-[var(--surface-2)] p-3">
                    <FlaskConical
                      aria-hidden
                      className="mt-0.5 size-4 shrink-0 text-[var(--forge-500)]"
                    />
                    <p className="min-w-0 flex-1 text-[13px] leading-relaxed">
                      {w.researchTask.prompt}
                    </p>
                    {w.researchTask.status === "pending" ? (
                      <form action={startResearch}>
                        <input type="hidden" name="researchTaskId" value={w.researchTask.id} />
                        <Button type="submit" size="sm" variant="outline">
                          Start research
                        </Button>
                      </form>
                    ) : (
                      <Badge variant="info">{w.researchTask.status}</Badge>
                    )}
                  </div>
                )}

                {w.status === "retesting" && (
                  <Link
                    href="/arena"
                    className="mt-3 inline-flex items-center gap-1 text-[12px] text-[var(--forge-500)] hover:underline"
                  >
                    Re-test this in the Arena <ArrowRight aria-hidden className="size-3" />
                  </Link>
                )}
              </li>
            ))}
          </ul>
        )}
      </section>
    </div>
  );
}
