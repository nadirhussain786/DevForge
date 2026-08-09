import type { Metadata } from "next";

import { Badge } from "@/components/ui/badge";
import {
  getCurriculumGaps,
  getHardestQuestions,
  getStrugglingSkills,
} from "@/features/admin/data/analytics";
import { requireAdmin } from "@/lib/auth/session";

export const metadata: Metadata = { title: "Learning insights · EngForge" };

export default async function InsightsPage() {
  await requireAdmin();
  const [skills, questions, gaps] = await Promise.all([
    getStrugglingSkills(),
    getHardestQuestions(),
    getCurriculumGaps(),
  ]);

  return (
    <div className="mx-auto w-full max-w-[1100px] px-4 py-6 md:px-6">
      <h1 className="text-2xl font-semibold tracking-tight">Learning insights</h1>
      <p className="mt-1 max-w-[72ch] text-[13px] text-[var(--text-muted)]">
        What users are struggling with, so the curriculum can be improved. Everything here is
        aggregated from skills, scores, and severities — never from anything a user wrote.
      </p>

      <section className="mt-7">
        <h2 className="text-sm font-semibold">Most common weaknesses</h2>
        {skills.length === 0 ? (
          <Empty>No weaknesses recorded yet.</Empty>
        ) : (
          <Table
            head={["Skill", "Domain", "Open", "Total", "Avg severity"]}
            rows={skills.map((s) => [
              s.name,
              s.domain,
              String(s.openCount),
              String(s.totalCount),
              s.avgSeverity.toFixed(2),
            ])}
          />
        )}
      </section>

      <section className="mt-8">
        <h2 className="text-sm font-semibold">Hardest questions</h2>
        <p className="mt-1 max-w-[72ch] text-[13px] text-[var(--text-muted)]">
          High failure with time far over the estimate usually means the wording is unclear, not
          that the question is hard. That distinction is the difference between rewriting a question
          and accepting it.
        </p>
        {questions.length === 0 ? (
          <Empty>Not enough attempts yet — a question needs at least 3.</Empty>
        ) : (
          <Table
            head={["Question", "Attempts", "Avg score", "Failure rate", "Avg time"]}
            rows={questions.map((q) => [
              q.slug,
              String(q.attempts),
              q.avgScore.toFixed(2),
              `${Math.round(q.failureRate * 100)}%`,
              q.avgSeconds ? `${q.avgSeconds}s` : "—",
            ])}
          />
        )}
      </section>

      <section className="mt-8">
        <h2 className="text-sm font-semibold">Curriculum gaps</h2>
        <p className="mt-1 max-w-[72ch] text-[13px] text-[var(--text-muted)]">
          Requirements that appeared in saved job descriptions but map to no skill in the graph.
          This is how the curriculum grows from what employers actually ask for.
        </p>
        {gaps.length === 0 ? (
          <Empty>No unmapped requirements — either nothing is saved yet, or everything maps.</Empty>
        ) : (
          <ul className="mt-3 flex flex-wrap gap-2">
            {gaps.map((g) => (
              <li key={g.label}>
                <Badge variant={g.requiredMentions > 0 ? "warn" : "neutral"}>
                  {g.label} · {g.mentions}
                  {g.requiredMentions > 0 ? ` (${g.requiredMentions} required)` : ""}
                </Badge>
              </li>
            ))}
          </ul>
        )}
      </section>
    </div>
  );
}

function Empty({ children }: { children: React.ReactNode }) {
  return (
    <p className="mt-3 rounded-[var(--radius)] border border-dashed border-[var(--border-strong)] p-5 text-[13px] text-[var(--text-muted)]">
      {children}
    </p>
  );
}

function Table({ head, rows }: { head: string[]; rows: string[][] }) {
  return (
    <div className="mt-3 overflow-x-auto rounded-[var(--radius)] border border-[var(--border)]">
      <table className="w-full border-collapse text-[13px]">
        <thead className="bg-[var(--surface-2)]">
          <tr>
            {head.map((h) => (
              <th key={h} className="px-3 py-2 text-left font-medium text-[var(--text-muted)]">
                {h}
              </th>
            ))}
          </tr>
        </thead>
        <tbody>
          {rows.map((row, i) => (
            <tr key={i} className="border-t border-[var(--border)]">
              {row.map((cell, j) => (
                <td key={j} className={j === 0 ? "px-3 py-2" : "metric px-3 py-2"}>
                  {cell}
                </td>
              ))}
            </tr>
          ))}
        </tbody>
      </table>
    </div>
  );
}
