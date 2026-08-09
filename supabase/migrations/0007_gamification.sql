-- ═══════════════════════════════════════════════════════════════════════════
-- 0007 — XP, levels, streaks, achievements
--
-- XP is effort currency and is never an input to mastery or readiness.
-- ═══════════════════════════════════════════════════════════════════════════

create table public.xp_transactions (
  id          uuid primary key default gen_random_uuid(),
  user_id     uuid not null references auth.users(id) on delete cascade,
  amount      integer not null check (amount >= 0),
  source_type text not null,
  source_id   uuid not null,
  multiplier  numeric(3,2) not null default 1.0,
  note        text,
  occurred_at timestamptz not null default now()
);

-- Invariant #3: XP is awarded at most once per (user, source_type, source_id).
-- This unique index is the entire anti-farming mechanism — Postgres enforces
-- it, so no application bug can double-award.
create unique index xp_once_per_source
  on public.xp_transactions (user_id, source_type, source_id);

create index xp_user_time_idx on public.xp_transactions (user_id, occurred_at desc);

create table public.user_progress (
  user_id    uuid primary key references auth.users(id) on delete cascade,
  total_xp   integer not null default 0,
  level      smallint not null default 1,
  level_name text not null default 'Apprentice',
  updated_at timestamptz not null default now()
);

-- Platform ranks — deliberately NOT job titles. The UI states this wherever a
-- level is displayed.
create or replace function public.level_for_xp(xp integer)
returns table (level smallint, level_name text)
language sql
immutable
as $$
  select * from (values
    (7::smallint, 'Principal Engineer',  20000),
    (6::smallint, 'Staff Engineer',      12000),
    (5::smallint, 'Senior Engineer',      7000),
    (4::smallint, 'Production Engineer',  3500),
    (3::smallint, 'Engineer',             1500),
    (2::smallint, 'Builder',               500),
    (1::smallint, 'Apprentice',              0)
  ) as t(level, level_name, threshold)
  where xp >= t.threshold
  order by t.threshold desc
  limit 1;
$$;

create or replace function public.sync_user_progress()
returns trigger
language plpgsql
security definer
set search_path = public, pg_temp
as $$
declare
  v_total integer;
  v_level smallint;
  v_name  text;
begin
  select coalesce(sum(amount), 0) into v_total
  from public.xp_transactions where user_id = new.user_id;

  select l.level, l.level_name into v_level, v_name from public.level_for_xp(v_total) l;

  insert into public.user_progress (user_id, total_xp, level, level_name, updated_at)
  values (new.user_id, v_total, v_level, v_name, now())
  on conflict (user_id) do update set
    total_xp   = excluded.total_xp,
    level      = excluded.level,
    level_name = excluded.level_name,
    updated_at = now();

  return new;
end;
$$;

create trigger xp_sync_progress
  after insert on public.xp_transactions
  for each row execute function public.sync_user_progress();

-- ── Streaks ────────────────────────────────────────────────────────────────

create table public.streaks (
  user_id             uuid primary key references auth.users(id) on delete cascade,
  current_streak      integer not null default 0,
  longest_streak      integer not null default 0,
  last_qualified_date date,
  shields             smallint not null default 0 check (shields between 0 and 3),
  total_study_days    integer not null default 0,
  total_minutes       integer not null default 0,
  repair_used_at      date,
  updated_at          timestamptz not null default now()
);

-- ── Achievements ───────────────────────────────────────────────────────────
-- Career milestones (§46) are achievements with category='career_milestone',
-- not a separate table.

create table public.achievements (
  id          uuid primary key default gen_random_uuid(),
  slug        citext unique not null,
  name        text not null,
  description text not null,
  category    text not null check (category in ('skill','consistency','career_milestone','arena','research')),
  criteria    jsonb not null default '{}'::jsonb,
  xp          integer not null default 0,
  tier        smallint not null default 1 check (tier between 1 and 3),
  icon        text,
  sort_order  smallint not null default 0
);

create table public.user_achievements (
  user_id        uuid not null references auth.users(id) on delete cascade,
  achievement_id uuid not null references public.achievements(id) on delete cascade,
  progress       jsonb not null default '{}'::jsonb,
  unlocked_at    timestamptz,
  primary key (user_id, achievement_id)
);

create index user_achievements_unlocked_idx on public.user_achievements (user_id, unlocked_at desc);

-- ── RLS ────────────────────────────────────────────────────────────────────

alter table public.xp_transactions   enable row level security;
alter table public.user_progress     enable row level security;
alter table public.streaks           enable row level security;
alter table public.achievements      enable row level security;
alter table public.user_achievements enable row level security;

alter table public.xp_transactions   force row level security;

create policy xp_own_read on public.xp_transactions for select to authenticated using (user_id = auth.uid());
create policy xp_own_insert on public.xp_transactions for insert to authenticated with check (user_id = auth.uid());
create policy xp_admin_read on public.xp_transactions for select to authenticated using (public.is_admin());

create policy progress_own on public.user_progress for select to authenticated using (user_id = auth.uid());
create policy progress_admin_read on public.user_progress for select to authenticated using (public.is_admin());

create policy streaks_own on public.streaks for all to authenticated
  using (user_id = auth.uid()) with check (user_id = auth.uid());
create policy streaks_admin_read on public.streaks for select to authenticated using (public.is_admin());

create policy achievements_read on public.achievements for select to authenticated using (true);
create policy achievements_admin on public.achievements for all to authenticated
  using (public.is_admin()) with check (public.is_admin());

create policy user_achievements_own on public.user_achievements for all to authenticated
  using (user_id = auth.uid()) with check (user_id = auth.uid());
create policy user_achievements_admin_read on public.user_achievements for select to authenticated using (public.is_admin());
