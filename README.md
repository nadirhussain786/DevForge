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
cp .env.example .env.local          # Supabase + Anthropic keys
pnpm supabase login && pnpm supabase link --project-ref <ref>
pnpm db:push                         # migrations 0001–0014
# then run supabase/seed/*.sql in order
pnpm db:types                        # replaces the hand-authored stopgap
pnpm dev
```

Database migrations live in `supabase/migrations/` and are the schema source of
truth. TypeScript types are generated *from* the database, never the reverse.

```bash
pnpm db:push       # apply migrations to the linked Supabase project
pnpm db:types      # regenerate src/lib/supabase/database.types.ts
```

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
