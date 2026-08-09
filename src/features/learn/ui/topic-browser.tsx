"use client";

import { useMemo, useState } from "react";
import Link from "next/link";
import { Check, Clock, Lock, Search, Sparkles } from "lucide-react";

import { Badge } from "@/components/ui/badge";
import { cn } from "@/lib/utils";

/**
 * The topic library.
 *
 * The problem this solves is not "list the topics" — it's that a beginner
 * facing a hundred of them has no way to pick. So the page opens by answering
 * one question, "what should I do next", and only then offers the full list.
 *
 * A topic is *ready* when every prerequisite skill is at or above the readiness
 * threshold. Nothing is hidden or locked out — a locked topic is still
 * clickable, because someone who already knows the material should not be made
 * to grind through prerequisites to prove it. The badge is advice, not a gate.
 */

export interface BrowsableTopic {
  id: string;
  slug: string;
  title: string;
  summary: string | null;
  minutes: number;
  difficulty: number;
  domain: string;
  skillName: string;
  mastery: number;
  explained: boolean;
  /** Prerequisite skills the learner hasn't reached yet. Empty means ready. */
  missingPrereqs: string[];
}

const DIFFICULTY_FILTERS = [
  { key: "all", label: "All levels", test: () => true },
  { key: "starter", label: "Starter", test: (d: number) => d <= 2 },
  { key: "core", label: "Core", test: (d: number) => d === 3 },
  { key: "advanced", label: "Advanced", test: (d: number) => d >= 4 },
] as const;

/** How many suggestions the "start here" rail offers. More than this is a list again. */
const SUGGESTION_COUNT = 3;

export function TopicBrowser({ topics }: { topics: BrowsableTopic[] }) {
  const [query, setQuery] = useState("");
  const [difficulty, setDifficulty] = useState<string>("all");

  /**
   * What to do next: ready, not yet explained, easiest first. Ties break on
   * lowest mastery, so the suggestion is the thing they know least among the
   * things they can actually start.
   */
  const suggestions = useMemo(
    () =>
      topics
        .filter((t) => !t.explained && t.missingPrereqs.length === 0)
        .sort((a, b) => a.difficulty - b.difficulty || a.mastery - b.mastery)
        .slice(0, SUGGESTION_COUNT),
    [topics],
  );

  const filtered = useMemo(() => {
    const q = query.trim().toLowerCase();
    const test = DIFFICULTY_FILTERS.find((f) => f.key === difficulty)?.test ?? (() => true);

    return topics.filter(
      (t) =>
        test(t.difficulty) &&
        (q === "" ||
          t.title.toLowerCase().includes(q) ||
          t.skillName.toLowerCase().includes(q) ||
          t.domain.toLowerCase().includes(q) ||
          (t.summary ?? "").toLowerCase().includes(q)),
    );
  }, [topics, query, difficulty]);

  const byDomain = useMemo(() => {
    const map = new Map<string, BrowsableTopic[]>();
    for (const t of filtered) map.set(t.domain, [...(map.get(t.domain) ?? []), t]);
    return [...map.entries()];
  }, [filtered]);

  const done = topics.filter((t) => t.explained).length;

  return (
    <div className="flex flex-col gap-8">
      {/* ── What to do next ─────────────────────────────────────────────── */}
      {suggestions.length > 0 && (
        <section className="animate-rise">
          <h2 className="flex items-center gap-1.5 text-[13px] font-semibold">
            <Sparkles aria-hidden className="size-3.5 text-[var(--forge-500)]" />
            Start here
          </h2>
          <p className="mt-1 text-[13px] text-[var(--text-muted)]">
            {done === 0
              ? "Nothing you've picked yet depends on anything you haven't covered."
              : `${done} explained so far. These are ready for you now.`}
          </p>

          <div className="mt-3.5 grid gap-2.5 sm:grid-cols-3">
            {suggestions.map((t) => (
              <Link
                key={t.id}
                href={`/learn/${t.slug}`}
                className="card flex flex-col gap-1.5 p-4 transition-all duration-150 hover:-translate-y-px hover:shadow-[var(--shadow-md)]"
              >
                <span className="text-[11px] uppercase tracking-wide text-[var(--text-subtle)]">
                  {t.domain}
                </span>
                <span className="text-[14px] font-medium leading-snug">{t.title}</span>
                <span className="mt-auto flex items-center gap-1 pt-1.5 text-[12px] text-[var(--text-subtle)]">
                  <Clock aria-hidden className="size-3" />
                  {t.minutes} min · difficulty {t.difficulty}/5
                </span>
              </Link>
            ))}
          </div>
        </section>
      )}

      {/* ── Filters ─────────────────────────────────────────────────────── */}
      <section className="flex flex-col gap-3">
        <div className="flex flex-wrap items-center gap-2">
          <label className="relative min-w-[14rem] flex-1">
            <span className="sr-only">Search topics</span>
            <Search
              aria-hidden
              className="pointer-events-none absolute left-3 top-1/2 size-3.5 -translate-y-1/2 text-[var(--text-subtle)]"
            />
            <input
              type="search"
              value={query}
              onChange={(e) => setQuery(e.target.value)}
              placeholder="Search topics, skills or domains"
              className="w-full rounded-[var(--radius)] border border-[var(--border)] bg-[var(--surface)] py-2 pl-9 pr-3 text-[13px] transition-shadow focus:shadow-[0_0_0_3px_var(--forge-ring)] focus:outline-none"
            />
          </label>

          <div role="group" aria-label="Filter by difficulty" className="flex gap-1.5">
            {DIFFICULTY_FILTERS.map((f) => (
              <button
                key={f.key}
                type="button"
                aria-pressed={difficulty === f.key}
                onClick={() => setDifficulty(f.key)}
                className={cn(
                  "rounded-[var(--radius-sm)] border px-2.5 py-1.5 text-[12px] transition-colors",
                  difficulty === f.key
                    ? "border-[var(--forge-500)] bg-[var(--forge-glow)] text-[var(--forge-600)]"
                    : "border-[var(--border)] bg-[var(--surface)] text-[var(--text-muted)] hover:border-[var(--border-strong)]",
                )}
              >
                {f.label}
              </button>
            ))}
          </div>
        </div>

        {filtered.length !== topics.length && (
          <p aria-live="polite" className="text-[12px] text-[var(--text-subtle)]">
            {filtered.length} of {topics.length} topics
          </p>
        )}
      </section>

      {/* ── The library ─────────────────────────────────────────────────── */}
      {byDomain.length === 0 ? (
        <p className="py-8 text-center text-[13px] text-[var(--text-muted)]">
          Nothing matches &ldquo;{query}&rdquo;.
        </p>
      ) : (
        <div className="flex flex-col gap-7">
          {byDomain.map(([domain, list]) => (
            <section key={domain}>
              <h2 className="text-[11px] uppercase tracking-wide text-[var(--text-subtle)]">
                {domain}
                <span className="ml-2 normal-case tracking-normal text-[var(--text-subtle)]/70">
                  {list.filter((t) => t.explained).length}/{list.length}
                </span>
              </h2>

              <ul className="mt-3 flex flex-col gap-2">
                {list.map((t) => (
                  <li key={t.id}>
                    <Link
                      href={`/learn/${t.slug}`}
                      className="group flex items-start gap-3 rounded-[var(--radius)] border border-[var(--border)] bg-[var(--surface)] p-4 transition-all duration-150 hover:border-[var(--border-strong)] hover:bg-[var(--surface-2)]"
                    >
                      <span className="min-w-0 flex-1">
                        <span className="flex flex-wrap items-center gap-2">
                          <span className="text-[14px] font-medium">{t.title}</span>
                          {t.explained && (
                            <Badge variant="success">
                              <Check aria-hidden className="mr-0.5 size-3" />
                              explained
                            </Badge>
                          )}
                          {!t.explained && t.missingPrereqs.length > 0 && (
                            <span
                              title={`Builds on: ${t.missingPrereqs.join(", ")}`}
                              className="flex items-center gap-1 text-[11px] text-[var(--text-subtle)]"
                            >
                              <Lock aria-hidden className="size-3" />
                              builds on {t.missingPrereqs.length}
                            </span>
                          )}
                        </span>

                        {t.summary && (
                          <span className="mt-0.5 block text-[13px] leading-relaxed text-[var(--text-muted)]">
                            {t.summary}
                          </span>
                        )}
                      </span>

                      <span className="flex shrink-0 flex-col items-end gap-1">
                        <span className="metric text-[12px] text-[var(--text-subtle)]">
                          {t.minutes}m
                        </span>
                        <span
                          aria-label={`${t.skillName} mastery ${Math.round(t.mastery)}`}
                          className="h-1 w-12 overflow-hidden rounded-full bg-[var(--surface-3)]"
                        >
                          <span
                            className="block h-full rounded-full bg-[var(--forge-500)]"
                            style={{ width: `${Math.max(2, Math.min(100, t.mastery))}%` }}
                          />
                        </span>
                      </span>
                    </Link>
                  </li>
                ))}
              </ul>
            </section>
          ))}
        </div>
      )}
    </div>
  );
}
