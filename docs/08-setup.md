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

## 4. Link the CLI and push migrations

Your project ref is the ID in the dashboard URL:
`https://supabase.com/dashboard/project/<ref>`

```bash
pnpm supabase login
pnpm supabase link --project-ref <ref>
pnpm db:push
```

`db:push` applies `supabase/migrations/0001` → `0014` in order. It will ask for
the database password from step 2.

## 5. Seed

The seed files are ordinary SQL. Either paste them into the dashboard **SQL
Editor** in order, or pipe them with psql:

```bash
psql "$DATABASE_URL" -v ON_ERROR_STOP=1 -f supabase/seed/0001_taxonomy.sql
psql "$DATABASE_URL" -v ON_ERROR_STOP=1 -f supabase/seed/0002_achievements.sql
psql "$DATABASE_URL" -v ON_ERROR_STOP=1 -f supabase/seed/0003_sample_content.sql
```

All three are idempotent — re-running them updates rather than duplicating.

After seeding you have 12 domains, ~100 skills with prerequisites, 7 role
tracks with a full weight matrix, 17 achievements, and two fully authored
sample topics.

## 6. Verify the privacy invariant

Before trusting anything else, prove that admins cannot read private content:

```bash
psql "$DATABASE_URL" -v ON_ERROR_STOP=1 -f supabase/tests/rls_privacy.sql
```

Expect a series of `ok:` notices and no exception. The script rolls back, so it
leaves no fixtures behind. **A failure here is a release blocker** — it means
`owner_only` RLS has regressed.

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

Roles are not self-assignable — the RLS policy on `profiles` blocks a user from
changing their own `role`. Promote yourself once from the SQL Editor:

```sql
update public.profiles set role = 'super_admin' where id = '<your-auth-uid>';
```

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
