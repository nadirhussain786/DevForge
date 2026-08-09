-- ═══════════════════════════════════════════════════════════════════════════
-- 0002 — Identity, profile, and career targets
-- ═══════════════════════════════════════════════════════════════════════════

-- ── profiles ──────────────────────────────────────── owner_plus_admin ─────
create table public.profiles (
  id            uuid primary key references auth.users(id) on delete cascade,
  handle        citext unique,
  display_name  text,
  avatar_url    text,
  role          app_role not null default 'user',
  timezone      text not null default 'UTC',
  locale        text not null default 'en',
  plan          text not null default 'free',
  last_active_at timestamptz,
  created_at    timestamptz not null default now(),
  updated_at    timestamptz not null default now(),
  constraint handle_format check (handle is null or handle ~ '^[a-z0-9][a-z0-9_-]{2,29}$')
);

-- ── RBAC helpers ───────────────────────────────────────────────────────────
--
-- Defined here rather than in 0001 because they read `profiles` and Postgres
-- validates a SQL function body against the catalog at CREATE time.
--
-- SECURITY DEFINER so they can read `profiles` without re-entering that
-- table's own RLS policies — a policy on `profiles` that subqueried `profiles`
-- directly would recurse infinitely.

create or replace function public.is_admin()
returns boolean
language sql
stable
security definer
set search_path = public, pg_temp
as $$
  select exists (
    select 1
    from public.profiles
    where id = auth.uid()
      and role in ('admin', 'super_admin')
  );
$$;

create or replace function public.is_super_admin()
returns boolean
language sql
stable
security definer
set search_path = public, pg_temp
as $$
  select exists (
    select 1
    from public.profiles
    where id = auth.uid()
      and role = 'super_admin'
  );
$$;

revoke execute on function public.is_admin() from public;
revoke execute on function public.is_super_admin() from public;
grant execute on function public.is_admin() to authenticated;
grant execute on function public.is_super_admin() to authenticated;

-- ── user_settings ─────────────────────────────────────────── owner_only ───
create table public.user_settings (
  user_id            uuid primary key references auth.users(id) on delete cascade,
  theme              text not null default 'system' check (theme in ('system', 'light', 'dark')),
  reminder_at        time,
  notification_prefs jsonb not null default '{"revision":true,"streak":true,"interview":true,"readiness":true}'::jsonb,
  created_at         timestamptz not null default now(),
  updated_at         timestamptz not null default now()
);

-- ── companies ───────────────────────────────────────── public_content ─────
-- Curated rows have created_by = null. Users may add their own private ones.
create table public.companies (
  id          uuid primary key default gen_random_uuid(),
  slug        citext unique not null,
  name        text not null,
  country     text,
  careers_url text,
  created_by  uuid references auth.users(id) on delete set null,
  is_public   boolean not null default true,
  created_at  timestamptz not null default now()
);

create index companies_name_idx on public.companies using gin (to_tsvector('english', name));

-- ── career_profiles ──────────────────────────────── owner_plus_admin ──────
-- `role_tracks` is created in 0003; the FK is added there to keep migration
-- order strictly forward-only.
create table public.career_profiles (
  user_id                uuid primary key references auth.users(id) on delete cascade,
  role_track_id          uuid,
  experience_level       experience_level not null default 'junior',
  target_markets         text[] not null default '{}',
  daily_minutes          smallint not null default 60 check (daily_minutes between 15 and 240),
  study_days             smallint[] not null default '{0,1,2,3,4,5,6}',
  start_date             date,
  weeks                  smallint not null default 8 check (weeks between 2 and 52),
  phase                  user_phase not null default 'onboarding',
  phase_started_at       timestamptz,
  onboarding_step        smallint not null default 0,
  onboarding_completed_at timestamptz,
  created_at             timestamptz not null default now(),
  updated_at             timestamptz not null default now(),
  constraint study_days_valid check (
    array_length(study_days, 1) between 1 and 7
    and study_days <@ '{0,1,2,3,4,5,6}'::smallint[]
  )
);

-- ── target_companies ─────────────────────────────── owner_plus_admin ──────
create table public.target_companies (
  user_id    uuid not null references auth.users(id) on delete cascade,
  company_id uuid not null references public.companies(id) on delete cascade,
  priority   smallint not null default 3 check (priority between 1 and 5),
  created_at timestamptz not null default now(),
  primary key (user_id, company_id)
);

-- ── Provisioning ───────────────────────────────────────────────────────────
-- One trigger creates every per-user row, so no application code can create a
-- user that is missing a profile, settings, or a career profile.
create or replace function public.handle_new_user()
returns trigger
language plpgsql
security definer
set search_path = public, pg_temp
as $$
begin
  insert into public.profiles (id, display_name, avatar_url)
  values (
    new.id,
    coalesce(new.raw_user_meta_data ->> 'full_name', new.raw_user_meta_data ->> 'name', split_part(new.email, '@', 1)),
    new.raw_user_meta_data ->> 'avatar_url'
  );

  insert into public.user_settings (user_id) values (new.id);
  insert into public.career_profiles (user_id) values (new.id);

  return new;
end;
$$;

create trigger on_auth_user_created
  after insert on auth.users
  for each row execute function public.handle_new_user();

select public.attach_updated_at('public.profiles');
select public.attach_updated_at('public.user_settings');
select public.attach_updated_at('public.career_profiles');

-- ── RLS ────────────────────────────────────────────────────────────────────

alter table public.profiles         enable row level security;
alter table public.user_settings    enable row level security;
alter table public.companies        enable row level security;
alter table public.career_profiles  enable row level security;
alter table public.target_companies enable row level security;

alter table public.profiles         force row level security;
alter table public.user_settings    force row level security;
alter table public.career_profiles  force row level security;
alter table public.target_companies force row level security;

-- profiles: owner read/write; admin read. Role escalation is blocked by the
-- WITH CHECK below — a user cannot promote themselves.
create policy profiles_select_own on public.profiles
  for select to authenticated using (id = auth.uid());
create policy profiles_update_own on public.profiles
  for update to authenticated
  using (id = auth.uid())
  with check (id = auth.uid() and role = (select p.role from public.profiles p where p.id = auth.uid()));
create policy profiles_select_admin on public.profiles
  for select to authenticated using (public.is_admin());
create policy profiles_update_super on public.profiles
  for update to authenticated using (public.is_super_admin()) with check (public.is_super_admin());

create policy settings_own on public.user_settings
  for all to authenticated using (user_id = auth.uid()) with check (user_id = auth.uid());

create policy companies_read on public.companies
  for select to authenticated using (is_public or created_by = auth.uid() or public.is_admin());
create policy companies_insert on public.companies
  for insert to authenticated with check (created_by = auth.uid());
create policy companies_admin_write on public.companies
  for all to authenticated using (public.is_admin()) with check (public.is_admin());

create policy career_own on public.career_profiles
  for all to authenticated using (user_id = auth.uid()) with check (user_id = auth.uid());
create policy career_admin_read on public.career_profiles
  for select to authenticated using (public.is_admin());

create policy target_companies_own on public.target_companies
  for all to authenticated using (user_id = auth.uid()) with check (user_id = auth.uid());
create policy target_companies_admin_read on public.target_companies
  for select to authenticated using (public.is_admin());
