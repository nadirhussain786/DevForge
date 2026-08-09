import type { Metadata } from "next";

import { Badge } from "@/components/ui/badge";
import { buildDrill } from "@/features/practice/data/select";
import { Drill } from "@/features/practice/ui/drill";
import { isAiConfigured } from "@/lib/ai/provider";
import { requireOnboarded } from "@/lib/auth/session";

export const metadata: Metadata = { title: "Arena · EngForge" };

export default async function ArenaPage() {
  const ctx = await requireOnboarded();
  const questions = await buildDrill(ctx.userId, ctx.career?.role_track_id ?? null, 5);

  return (
    <div className="mx-auto w-full max-w-[820px] px-4 py-6 md:px-6">
      <header className="flex flex-col gap-1">
        <h1 className="text-2xl font-semibold tracking-tight">Interview Arena</h1>
        <p className="max-w-[68ch] text-[13px] text-[var(--text-muted)]">
          Questions are weighted toward your open weaknesses and the skills you have least evidence
          for — not sampled at random. Each one says why it was chosen.
        </p>
      </header>

      {!isAiConfigured() && (
        <p className="mt-4 rounded-[var(--radius)] border border-[var(--border-strong)] bg-[var(--surface-2)] px-4 py-3 text-[13px] text-[var(--text-muted)]">
          <Badge variant="neutral">AI grading off</Badge>{" "}
          No <code className="metric">ANTHROPIC_API_KEY</code> is configured. Multiple-choice
          questions score exactly as normal; written answers get a conservative keyword score capped
          at 60%, which deliberately can&apos;t resolve a weakness on its own.
        </p>
      )}

      <div className="mt-6">
        {questions.length === 0 ? (
          <div className="rounded-[var(--radius)] border border-dashed border-[var(--border-strong)] p-6 text-center">
            <p className="text-sm font-medium">No questions available yet</p>
            <p className="mx-auto mt-1 max-w-[52ch] text-[13px] text-[var(--text-muted)]">
              Either the question library hasn&apos;t been seeded for your role track, or
              you&apos;ve seen everything recently — questions have a 21-day cooldown so you
              can&apos;t farm the same ones.
            </p>
          </div>
        ) : (
          <Drill questions={questions} />
        )}
      </div>
    </div>
  );
}
