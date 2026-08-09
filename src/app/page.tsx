import Link from "next/link";
import { ArrowRight } from "lucide-react";

import { Button } from "@/components/ui/button";

const LOOP = [
  ["Learn", "Understand the concept"],
  ["Build", "Write actual code"],
  ["Explain", "In your own words"],
  ["Test", "Interview questions"],
  ["Research", "Investigate deeper"],
  ["Apply", "A real engineering scenario"],
  ["Interview", "Under pressure"],
  ["Review", "Find the weakness"],
] as const;

const PILLARS = [
  {
    title: "Evidence-based mastery",
    body: "Every score traces to specific scored attempts, weighted by difficulty and decayed by time. Nothing is derived from XP or from marking a lesson complete.",
  },
  {
    title: "A roadmap that is actually yours",
    body: "A skill graph and a solver over your daily time budget decide the plan — not a chatbot. Two people targeting different roles get genuinely different weeks.",
  },
  {
    title: "Failure is the input",
    body: "Every missed question, failed design review, and shaky interview answer becomes research, spaced revision, and a re-test. Automatically.",
  },
] as const;

export default function Home() {
  return (
    <div className="flex flex-1 flex-col">
      <header className="flex h-14 items-center px-4 md:px-8">
        <span className="flex items-center gap-2">
          <span
            aria-hidden
            className="grid size-6 place-items-center rounded-[6px] bg-[var(--forge-500)] text-[13px] font-bold text-[var(--on-forge)]"
          >
            E
          </span>
          <span className="text-sm font-semibold tracking-tight">EngForge</span>
        </span>
        <nav className="ml-auto flex items-center gap-2">
          <Link href="/sign-in">
            <Button variant="ghost" size="sm">
              Sign in
            </Button>
          </Link>
          <Link href="/sign-up">
            <Button variant="primary" size="sm">
              Get started
            </Button>
          </Link>
        </nav>
      </header>

      <main className="mx-auto w-full max-w-[1100px] flex-1 px-4 md:px-8">
        <section className="py-16 md:py-24">
          <p className="text-[13px] uppercase tracking-[0.2em] text-[var(--forge-500)]">
            Your engineering career operating system
          </p>
          <h1 className="mt-4 max-w-3xl text-4xl font-semibold tracking-tight md:text-6xl">
            Forge the engineer companies want.
          </h1>
          <p className="mt-5 max-w-2xl text-base leading-relaxed text-[var(--text-muted)]">
            Not a course platform. EngForge measures what you can actually do against a target role,
            builds the plan that closes the gap, and turns every failure into the next thing you
            study.
          </p>
          <div className="mt-8 flex flex-wrap items-center gap-3">
            <Link href="/sign-up">
              <Button variant="primary" size="lg">
                Start your roadmap <ArrowRight aria-hidden />
              </Button>
            </Link>
            <span className="text-[13px] text-[var(--text-muted)]">
              Six questions. Then your first mission.
            </span>
          </div>
        </section>

        <section className="border-t border-[var(--border)] py-12">
          <h2 className="text-sm font-semibold uppercase tracking-wide text-[var(--text-subtle)]">
            The Forge Loop
          </h2>
          <ol className="mt-5 grid grid-cols-2 gap-3 md:grid-cols-4">
            {LOOP.map(([name, blurb], i) => (
              <li
                key={name}
                className="rounded-[var(--radius)] border border-[var(--border)] bg-[var(--surface)] p-4"
              >
                <span className="metric text-[11px] text-[var(--text-subtle)]">
                  {String(i + 1).padStart(2, "0")}
                </span>
                <p className="mt-1 text-sm font-medium">{name}</p>
                <p className="mt-0.5 text-[12px] text-[var(--text-muted)]">{blurb}</p>
              </li>
            ))}
          </ol>
        </section>

        <section className="grid gap-4 border-t border-[var(--border)] py-12 md:grid-cols-3">
          {PILLARS.map((p) => (
            <div key={p.title} className="flex flex-col gap-2">
              <h3 className="text-sm font-semibold">{p.title}</h3>
              <p className="text-[13px] leading-relaxed text-[var(--text-muted)]">{p.body}</p>
            </div>
          ))}
        </section>
      </main>

      <footer className="border-t border-[var(--border)] px-4 py-6 text-[12px] text-[var(--text-subtle)] md:px-8">
        EngForge — built for engineers targeting international enterprise roles.
      </footer>
    </div>
  );
}
