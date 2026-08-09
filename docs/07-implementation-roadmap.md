# EngForge — Implementation Roadmap

Incremental by design (§68). Every phase ends with something usable and tested.
No phase depends on a later phase.

---

## Phase 0 — Foundation ✅ **done**

Next.js 16 + React 19 + Tailwind v4, dependencies, design tokens, Supabase
browser/server/admin clients, `proxy.ts` auth guard (Next 16 renamed
`middleware` → `proxy`), `is_admin()` helper, Vitest, `server-only` guard on the
service-role client.

**Exit met:** `pnpm build`, `pnpm lint`, and `pnpm test` all pass.

---

## Phase 1 — Schema & taxonomy ✅ **done** (pending a live database)

Migrations `0001`–`0014` — the complete schema, not just the MVP slice. Seeds for
12 domains, ~100 skills with a prerequisite DAG, 7 role tracks with a full
weight matrix, 17 achievements, 2 sample topics.

**Exit:** RLS test harness written (`supabase/tests/rls_privacy.sql`) and proves
invariant #7 plus append-only evidence and XP idempotency. **It has not been
executed yet** — that requires a linked Supabase project (see
[08-setup.md](08-setup.md) steps 4–6). Types are hand-authored until `pnpm db:types` runs.

> The role-track weight matrix is declared per (track, domain) and expanded
> across skills — 84 readable rows instead of ~600 opaque ones, and a new skill
> inherits sensible weights everywhere automatically. Skill-level exceptions
> are applied on top.

---

## Phase 2 — Onboarding + roadmap engine ✅ **done**

- 6-step onboarding wizard with self-reported skills → capped mastery priors
- deterministic roadmap generator (priority → week themes → week fill)
- roadmap page with "why is this here?" on every item
- generation service bridging the pure engine to Postgres

**Exit met:** unit-tested that two role tracks produce different reproducible
plans from the same content library, that prerequisites are never scheduled out
of order, and that weekly capacity is never exceeded.

**Not yet built:** the 8-question calibration step. Onboarding currently leans
on self-report alone, so week 1 is less targeted than it should be.

---

## Phase 3 — The MVP loop 🚧 **Learn/Explain closed; Test pending**

Done: daily plan composer (revision-first, budget-capped), Command Center
(`/today`), XP/level/streak/momentum engines, `user_events` emitter, evidence →
`user_skills` recompute in SQL, **the AI grading layer** (`lib/ai/`), and the
**Learn → Explain** surface — a topic reader with the four explanation levels
plus the Explain gate that actually produces evidence.

The AI layer uses Claude Opus 5 with schema-constrained structured output
(`messages.parse` + `zodOutputFormat`), so a grade is a validated object, never
prose we regex. It degrades to a capped keyword heuristic when the provider is
unavailable — a graded answer is nice, losing someone's completed work is not.

**Remaining:** question drills (the Test block) and the Build block.

---

## Phase 4 — Failure → Skill 🚧 **loop closed end to end; UI pending**

Done: weakness triggers, severity model, remediation generation, SM-2
scheduling, resolution rules (all unit-tested); the SQL trigger that opens
weaknesses from real interview answers and auto-resolves on new evidence; and
`features/practice/data/record.ts` — the single write path that turns every
scored attempt into evidence, XP, and (when triggered) a weakness with its
research task and spaced revision items already scheduled.

A failed explanation now visibly opens a weakness and schedules its remediation
without the user deciding anything.

**Remaining:** the weakness/revision UI and the nightly readiness + momentum
snapshot cron.

---

## Phase 8 — Career Mode 🚧 **engine done, UI pending**

The JD gap engine is built and unit-tested: requirement → skill mapping via the
alias table, four-class gap classification, honest match scoring that does not
penalise users for our own mapping blind spots, and market-signal extraction
that feeds the roadmap generator. **Remaining:** LLM JD parsing, the gap report
UI, and the application pipeline.

---

## Phase 5 — Code Forge
Coding problems, editor, test runner, hints (XP cost), AI review, complexity
self-claim scoring, DSA pattern tracking (§60).

## Phase 6 — Notebook & R&D Lab
Structured private notes, markdown editor, autosave, linking, full-text search,
`owner_only` RLS verified. Completing "Interview Explanation" emits evidence.

## Phase 7 — Interview
Interview Arena modes, adaptive AI Interviewer with weakness-weighted selection,
session reports, Interview Memory for real interviews (highest-weight evidence).

## Phase 8 — Career Mode
JD parsing → structured requirements → skill mapping → gap classification →
forward-week plan injection. Application pipeline. Phase 1 → Phase 2 transition.

## Phase 9 — Arena
System Design Arena (reference architecture gated until submission), Boss
Battles, Incident Simulator with progressive reveals, projects.

## Phase 10 — Admin
Overview, user segments, privacy-filtered user inspection with audit logging,
analytics materialised views, learning insights, content CMS with versioning,
curriculum-gap report.

## Phase 11 — Product polish
Achievements + career milestones, notification engine (one/day cap), command
palette, global search, weekly missions, motivation engine copy.

## Phase 12 — Hardening
Full RLS suite, Playwright flows, a11y audit, performance budgets, rate limiting,
CSP, mobile pass, AI cost controls.

---

## Your 16 August start date — the honest read

Today is **9 August 2026**. Your Phase 1 begins in **7 days**.

Phases 0–3 are what you need to open EngForge on day one, and they are
achievable in that window. **The binding constraint is not code — it is
curriculum content.** An 8-week roadmap for one role track needs roughly:

| Asset | Week 1–2 (must exist by 16 Aug) | Full 8 weeks |
|---|---|---|
| Topics × 4 explanation levels | ~20 | ~80 |
| Questions with rubrics | ~80 | ~320 |
| Coding problems with tests | ~15 | ~60 |
| System design cases | 1 | 6 |
| Boss battles | 1 | 7 |

### Decision — author ahead of the learner ✅

**16 August holds.** Ship Phases 0–3 plus deep content for weeks 1–2 by then,
and stay ~2 weeks ahead while Phases 4–7 land. Content is AI-drafted and
human-reviewed, never served unreviewed.

This also has a design benefit: you experience the daily loop while the weakness
engine is being built, so Phase 4 is shaped by real friction rather than
assumption.

**First role track: `full-stack`.** Its skill graph feeds the Frontend, Backend,
and MERN tracks almost entirely, so the second and third tracks become weight
matrices over mostly-existing content rather than new authoring.

### Countdown to 16 August

| Days | Deliverable |
|---|---|
| 1–2 | Phase 1 — migrations `0001`–`0004`, full-stack skill graph, role-track weights, RLS tests |
| 2–4 | Phase 2 — onboarding, calibration, roadmap generator (pure + tested) |
| 4–6 | Phase 3 — daily plan, Command Center, Learn/Explain/Test, evidence, XP, streak |
| 3–6 | *(parallel)* content authoring — weeks 1–2 depth for the full-stack track |
| 7 | Seed, smoke-test a full day end to end, deploy |

---

## Definition of done (every phase)

1. Domain logic is pure and unit-tested.
2. New tables have RLS policies **and** an RLS test.
3. Zod validation at every input boundary.
4. Meaningful `user_events` emitted.
5. Keyboard accessible, both themes, mobile-checked.
6. AI paths degrade gracefully when the provider fails.
7. Docs updated in the same commit.
