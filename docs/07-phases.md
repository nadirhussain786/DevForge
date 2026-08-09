# EngForge — Phase Status

Live status of the build. Updated as phases land; the plan itself is in
[07-implementation-roadmap.md](07-implementation-roadmap.md).

**Verification commands** — all four pass as of the latest commit:

```bash
pnpm build        # 18 routes
pnpm lint
pnpm test         # 170 unit tests, pure domain engines
pnpm db:verify    # RLS invariants, against the live database
pnpm verify:loop  # the whole Forge Loop write path, end to end
pnpm smoke        # every page renders with a real session (needs pnpm dev)
```

---

## Done

| Phase | What shipped |
|---|---|
| **0 · Foundation** | Next 16 / React 19 / Tailwind v4, design tokens, Supabase clients, `proxy.ts` auth guard, Vitest |
| **1 · Schema** | 17 migrations applied to the live database. ~60 tables, RLS forced on every one, invariants enforced in Postgres. Seeds: 12 domains, 101 skills with a prerequisite DAG, 7 role tracks, 17 achievements, 2 topics, 2 system design cases, 2 boss battles |
| **2 · Onboarding + roadmap** | Six-step wizard, deterministic generator, roadmap page with a stated reason on every item |
| **3 · MVP loop** | Learn (four explanation levels) → Explain (AI-graded, gated) → Test (weighted drill) → Build (Code Forge). Command Center at `/today` |
| **4 · Failure → Skill** | Triggers, remediation, SM-2, `/review` queue, nightly readiness + momentum cron. **Verified end to end** by `pnpm verify:loop` |
| **5 · Code Forge** | Web Worker test execution, hints with XP cost, complexity claim scored separately |
| **6 · Notebook & R&D Lab** | Structured private research; evidence only once the Interview Explanation is written |
| **7 · Interview Memory** | Real interviews at evidence weight 2.5, auto-opening weaknesses via database trigger |
| **8 · Career pipeline** | Applications with journalled status changes, interview memory |
| **9 · Arena** | System Design Arena (reference gated until submission) and Boss Battles |
| **10 · Admin console** | Overview, user list, learning insights — built only on aggregate and `owner_plus_admin` tables |
| **11 · Gamification** | XP, levels, streaks with shields, momentum, achievements with progress rings, command palette (⌘K), global search |
| **12 · Hardening (partial)** | Security headers, Postgres rate limiting, RLS test suite, soft-delete erasure |

---

## Not built yet

| Phase | Missing | Blocked by |
|---|---|---|
| 7 · AI Interviewer | Adaptive mock interview with follow-ups and a session report | Needs `ANTHROPIC_API_KEY` |
| 8 · JD intelligence | LLM parsing of a pasted job description → gap report. **The gap engine itself is built and tested** — only parsing is missing | Needs `ANTHROPIC_API_KEY` |
| 9 · Incident Simulator | Progressive-reveal investigation. Schema and RLS exist (`incident_scenarios`, `incident_reveals` with an earned-reveal policy) | Content authoring |
| 9 · Projects | Multi-milestone project work. Schema exists | Content authoring |
| 10 · Content CMS | Admin authoring UI. Content is currently authored as seed SQL, which works but doesn't scale past one author | — |
| 11 · Notifications | Delivery and the one-per-day digest cap. Table and RLS exist | — |
| 12 · Hardening | CSP with a per-request nonce, Playwright flows, a11y audit, performance budgets | — |

---

## Content is the real constraint

The platform is further along than the curriculum. Right now there are **2
authored topics, 4 questions, 1 coding problem, 2 design cases, 2 boss
battles** against 101 skills.

Every surface degrades honestly when content is thin — the roadmap generator
only schedules skills that have published content, the drill says so when it
runs out, and the 21-day cooldown prevents farming the same four questions.
But an 8-week roadmap needs roughly 80 topics and 320 questions, and that is
now the critical path rather than the code.

## AI is optional, and currently off

No `ANTHROPIC_API_KEY` is configured, which is a supported deployment. MCQ
grading, coding tests, self-assessed design and boss battles, and every
mastery calculation work identically without it. Written answers fall back to
a keyword score **capped at 60%**, which deliberately cannot resolve a weakness
or promote a skill on evidence that was never verified. The Arena states this
in the UI rather than failing quietly.
