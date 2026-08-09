# EngForge

**Forge the Engineer Companies Want.**
An engineering career operating system — personalised roadmaps, evidence-based
mastery, interview simulation, and a failure-to-skill loop.

Not a course platform. The unit of value is *verified capability against a target
role*, not lessons completed.

## Documentation

Read in order — the design package precedes the code (§68 of the brief).

| Doc | What it covers |
|---|---|
| [00 — Product Architecture](docs/00-product-architecture.md) | Positioning, the Forge Loop, phases, surface map, MVP boundary |
| [01 — Technical Architecture](docs/01-technical-architecture.md) | Stack, layering, AI layer, security, privacy classes, testing |
| [02 — Domain Engines](docs/02-domain-engines.md) | Mastery, readiness, XP, streaks, momentum, roadmap generator, failure→skill |
| [03 — Database Schema](docs/03-database-schema.md) | Tables, enums, RLS classes, migration order |
| [04 — User Flows](docs/04-user-flows.md) | Onboarding, daily loop, learn/build/explain/test, interview, career |
| [05 — Admin Flows](docs/05-admin-flows.md) | Console, analytics, learning insights, CMS, privacy boundaries |
| [06 — Design System](docs/06-design-system.md) | Tokens, layout, components, motion, accessibility |
| [07 — Implementation Roadmap](docs/07-implementation-roadmap.md) | Phases 0–12, exit criteria, content-authoring timeline |
| [07 — Phase Status](docs/07-phases.md) | **Live build status** — what shipped, what hasn't, and why |
| [08 — Setup](docs/08-setup.md) | Supabase provisioning, migrations, seeds, RLS verification |

## Three things that define the architecture

1. **Evidence-based mastery.** Every score traces to specific scored attempts,
   recency-decayed and difficulty-weighted. `skill_evidence` is an append-only
   ledger — mastery can be rebuilt from it entirely.
2. **A deterministic roadmap engine.** Plans come from a skill graph and a
   constraint solver over the user's daily time budget. The LLM writes the
   framing; it never decides the syllabus.
3. **Privacy enforced in Postgres.** Private notebooks, interview transcripts,
   and pasted job descriptions are unreadable by admins at the RLS layer — not
   by UI convention.

## Stack

Next.js 16 · React 19 · TypeScript · Tailwind v4 · shadcn/ui · Supabase
(Postgres + Auth + RLS) · Anthropic Claude · Zod · Vitest

## Getting started

Full walkthrough in [docs/08-setup.md](docs/08-setup.md). The short version:

```bash
pnpm install
cp .env.example .env               # Supabase keys + SUPABASE_DB_URL
pnpm db:seed                       # migrations, then seeds — both idempotent
pnpm db:admin you@example.com      # create an admin, verified on creation
pnpm dev
```

`ANTHROPIC_API_KEY` is **optional**. Without it, multiple-choice grading,
coding tests, self-assessed design work, and every mastery calculation behave
identically; written answers fall back to a keyword score capped at 60% that
deliberately cannot resolve a weakness.

Migrations in `supabase/migrations/` are the schema source of truth.

```bash
pnpm db:migrate           # apply migrations over SUPABASE_DB_URL
pnpm db:migrate --dry-run # list what would run
pnpm db:probe             # what's applied, and how much is seeded
```

### Verification

Four independent levels, because each proves something the others don't:

```bash
pnpm test         # pure engines — formulas, invariants, edge cases (170)
pnpm db:verify    # RLS: an admin JWT reads zero owner_only rows, live
pnpm verify:loop  # the write path: answer → evidence → weakness → resolution
pnpm smoke        # every page renders with a real session (run pnpm dev first)
```

`db:verify` and `verify:loop` create and remove their own throwaway accounts,
and both are safe to re-run. Type-checking proves a page compiles; these prove
it works.

## Project layout

```
src/
  app/         (marketing) (auth) (app) (admin) api
  features/    <feature>/{domain,data,ui,schema.ts}
  lib/         supabase · ai · events · auth
  components/  ui primitives
supabase/      migrations · seed
docs/          design package
```

`features/*/domain/` is pure TypeScript — no I/O, no implicit clock. Every
scoring rule lives there so it can be unit-tested without a database. If a rule
needs a DB to test, it is in the wrong layer.

## Engine invariants

These are unit-tested and must never regress:

1. A generated daily plan never exceeds the user's `daily_minutes`.
2. Due revision is scheduled before any new material.
3. XP is awarded at most once per `(user, source_type, source_id)`.
4. Mastery cannot increase without a new `skill_evidence` row.
5. A weakness cannot be resolved by the attempt that opened it.
6. Readiness is fully reproducible from `skill_evidence`.
7. An admin JWT reads zero rows from every `owner_only` table.
