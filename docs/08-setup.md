# EngForge — Setup

From a fresh clone to a running app with a real database.

## 1. Install

```bash
pnpm install
```

## 2. Create the Supabase project

1. Go to [supabase.com/dashboard](https://supabase.com/dashboard) → **New project**.
2. Pick the region closest to you (this is your latency floor for every query).
3. Save the database password somewhere safe — it is shown once.
4. Wait for provisioning (~2 minutes).

## 3. Environment

```bash
cp .env.example .env.local
```

From **Project Settings → API**, fill in:

| Variable | Where |
|---|---|
| `NEXT_PUBLIC_SUPABASE_URL` | Project URL |
| `NEXT_PUBLIC_SUPABASE_ANON_KEY` | `anon` / publishable key |
| `SUPABASE_SERVICE_ROLE_KEY` | `service_role` key — **server only** |

`ANTHROPIC_API_KEY` comes from [console.anthropic.com](https://console.anthropic.com).
`CRON_SECRET` can be any long random string.

> The service-role key bypasses RLS entirely. It must never be committed and
> never given a `NEXT_PUBLIC_` prefix. `src/lib/supabase/admin.ts` imports
> `server-only`, so an accidental client import fails the build rather than
> leaking it at runtime.

## 4. Apply the migrations

Add the direct Postgres connection string to `.env` — dashboard → **Project
Settings → Database → Connection string → URI**. The "Session pooler" string is
the right one from most networks, because the direct `db.<ref>.supabase.co`
host is IPv6-only on newer projects:

```
SUPABASE_DB_URL=postgresql://postgres.<ref>:<password>@aws-0-<region>.pooler.supabase.com:5432/postgres
```

This is a **different credential** from the service-role key — that one speaks
PostgREST and cannot run DDL.

```bash
pnpm db:migrate
```

Applies `supabase/migrations/0001` → `0014` in order, each in its own
transaction, recording what ran in `public.schema_migrations`. Re-running skips
anything already applied, and a failure leaves no partial migration behind.

`pnpm db:migrate --dry-run` lists what would run. If you'd rather use the
Supabase CLI, `pnpm supabase link --project-ref <ref> && pnpm db:push` does the
same job.

## 5. Seed

```bash
pnpm db:seed
```

Runs the migrations (skipping applied ones) and then `supabase/seed/*.sql`. All
seeds are idempotent — re-running updates rather than duplicating, so this is
also how you reload content after editing a seed file.

You should end up with 12 domains, ~100 skills with prerequisites, 7 role
tracks with a full weight matrix, 17 achievements, and two fully authored
sample topics. Check with:

```bash
pnpm db:probe
```

## 6. Verify the privacy invariant

Before trusting anything else, prove that admins cannot read private content:

```bash
pnpm db:verify
```

This creates three throwaway auth users, exercises the policies as each of them
with **real JWTs** (not the service role, which bypasses RLS by design), and
deletes them afterwards. It checks:

- the signup trigger provisions `profiles`, `user_settings`, `career_profiles`
- an owner can read their own `research_notes`
- **an admin JWT reads zero of them — invariant #7**
- another ordinary user reads zero of them
- `record_evidence` writes the ledger and recomputes mastery atomically
- the ledger rejects `UPDATE` at both layers: RLS matches zero rows for a user,
  and the append-only trigger raises even for the service role
- a duplicate XP award is rejected by the unique index
- a user cannot promote themselves to admin

Expect `All RLS checks passed.` **A failure here is a release blocker.**

There is also `supabase/tests/rls_privacy.sql` for running the same assertions
inside a single rolled-back transaction via `psql`, if you prefer that to the
JWT-level test.

## 7. Generate types

Replace the hand-authored stopgap in `src/lib/supabase/database.types.ts`:

```bash
pnpm db:types
```

After this you can use PostgREST embedded selects (`skills(name)`) instead of
the two-query workaround in `src/features/roadmap/data/today.ts`.

## 8. Run

```bash
pnpm dev
```

Sign up at `/sign-up` → onboarding → your roadmap generates → `/today`.

## Making yourself an admin

Roles are deliberately **not** self-assignable — the RLS policy on `profiles`
blocks a user from changing their own `role`, so the first admin has to be
created out-of-band with the service-role key:

```bash
pnpm db:admin you@example.com                      # generates a strong password
pnpm db:admin you@example.com 'your-password'      # or set one
pnpm db:admin them@example.com --role admin        # non-owner admin
```

Creates the account if it doesn't exist, promotes it if it does, then verifies
it by signing in and confirming that being an admin **still** reads zero rows
from `research_notes`. The generated password is printed once and stored
nowhere.

## Deleting an account

Accounts are **soft-deleted**, not removed. Hard delete is blocked on purpose:
`skill_evidence` is append-only, and cascading a hard delete through it would
mean rewriting an immutable ledger.

```sql
select public.soft_delete_account('<user-uuid>');
```

Callable by the account itself or a super admin. It:

- **erases personal data** — research notes, note links, interview transcripts,
  pasted job descriptions, interview and application notes, notifications
- **scrubs identity** — display name, handle, avatar, and the auth email
- **blocks sign-in** — the auth user is banned rather than deleted
- **keeps the pseudonymous trail** — evidence, attempts, and events, which carry
  no personal data and are what the curriculum analytics in §34 are built from

That satisfies erasure without corrupting aggregate learning data. A hard
`DELETE` still raises, with an error message pointing at this function.

## Everyday commands

```bash
pnpm dev         # dev server
pnpm build       # production build + typecheck
pnpm test        # domain engine tests (135)
pnpm lint
pnpm typecheck
pnpm db:push     # apply new migrations
pnpm db:types    # regenerate types after a schema change
```

## Troubleshooting

**Onboarding says the library isn't seeded.** Step 5 hasn't run, or it ran
before the migrations. Check `select count(*) from role_tracks where status = 'published'`.

**A roadmap generates with no weeks.** The generator only schedules skills that
have published content. With the sample seed only two topics exist, so expect
one thin week — this is the content-authoring work described in
[07-implementation-roadmap.md](07-implementation-roadmap.md), not a bug.

**`daily plan would schedule N minutes against an M minute budget`.** The §7
invariant firing in the database. It means a planner change broke the time
budget; fix the generator rather than the trigger.

**Type errors after a schema change.** Re-run `pnpm db:types`.
