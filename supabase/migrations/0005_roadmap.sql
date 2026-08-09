-- ═══════════════════════════════════════════════════════════════════════════
-- 0005 — Roadmaps, weekly missions, and daily plans
-- ═══════════════════════════════════════════════════════════════════════════

create table public.roadmaps (
  id                uuid primary key default gen_random_uuid(),
  user_id           uuid not null references auth.users(id) on delete cascade,
  role_track_id     uuid not null references public.role_tracks(id) on delete restrict,
  version           integer not null default 1,
  status            roadmap_status not null default 'active',
  start_date        date not null,
  weeks             smallint not null check (weeks between 2 and 52),
  daily_minutes     smallint not null check (daily_minutes between 15 and 240),
  study_days        smallint[] not null,
  generator_version text not null,
  params            jsonb not null default '{}'::jsonb,
  generated_at      timestamptz not null default now(),
  created_at        timestamptz not null default now()
);

-- Exactly one active roadmap per user; older ones become 'superseded'.
create unique index roadmaps_one_active on public.roadmaps (user_id) where status = 'active';
create index roadmaps_user_idx on public.roadmaps (user_id, created_at desc);

create table public.roadmap_weeks (
  id          uuid primary key default gen_random_uuid(),
  roadmap_id  uuid not null references public.roadmaps(id) on delete cascade,
  week_index  smallint not null check (week_index >= 1),
  theme       text not null,
  domain_id   uuid references public.domains(id) on delete set null,
  summary_md  text,
  status      plan_item_status not null default 'pending',
  unique (roadmap_id, week_index)
);

create table public.roadmap_items (
  id              uuid primary key default gen_random_uuid(),
  roadmap_id      uuid not null references public.roadmaps(id) on delete cascade,
  week_index      smallint not null check (week_index >= 1),
  skill_id        uuid references public.skills(id) on delete set null,
  stage           loop_stage not null,
  item_ref_type   ref_type not null,
  item_ref_id     uuid,
  planned_minutes smallint not null check (planned_minutes > 0),
  sort_order      smallint not null default 0,
  -- Explainability: why this item is in this plan. Rendered verbatim in the UI.
  -- {"weight":0.9,"gap":0.62,"prereqsMet":true,"source":"role_track"}
  reason          jsonb not null default '{}'::jsonb,
  status          plan_item_status not null default 'pending',
  created_at      timestamptz not null default now()
);

create index roadmap_items_week_idx on public.roadmap_items (roadmap_id, week_index, sort_order);

create table public.weekly_missions (
  id            uuid primary key default gen_random_uuid(),
  roadmap_id    uuid not null references public.roadmaps(id) on delete cascade,
  week_index    smallint not null,
  title         text not null,
  brief_md      text,
  requirements  jsonb not null default '[]'::jsonb,
  rubric        jsonb not null default '{}'::jsonb,
  submission_md text,
  score         numeric(5,2) check (score between 0 and 100),
  status        plan_item_status not null default 'pending',
  completed_at  timestamptz,
  unique (roadmap_id, week_index)
);

-- ── Daily plans ────────────────────────────────────────────────────────────
create table public.daily_plans (
  id                uuid primary key default gen_random_uuid(),
  user_id           uuid not null references auth.users(id) on delete cascade,
  plan_date         date not null,
  roadmap_id        uuid references public.roadmaps(id) on delete set null,
  week_index        smallint,
  mission_title     text,
  planned_minutes   smallint not null default 0,
  completed_minutes smallint not null default 0,
  status            plan_item_status not null default 'pending',
  qualified         boolean not null default false,   -- counted toward the streak
  generated_at      timestamptz not null default now(),
  unique (user_id, plan_date)
);

create index daily_plans_user_date_idx on public.daily_plans (user_id, plan_date desc);

create table public.daily_plan_items (
  id              uuid primary key default gen_random_uuid(),
  daily_plan_id   uuid not null references public.daily_plans(id) on delete cascade,
  stage           loop_stage not null,
  item_ref_type   ref_type not null,
  item_ref_id     uuid,
  skill_id        uuid references public.skills(id) on delete set null,
  title           text not null,
  planned_minutes smallint not null check (planned_minutes > 0),
  xp_available    smallint not null default 0,
  status          plan_item_status not null default 'pending',
  source          plan_item_source not null default 'roadmap',
  sort_order      smallint not null default 0,
  completed_at    timestamptz,
  created_at      timestamptz not null default now()
);

create index daily_plan_items_plan_idx on public.daily_plan_items (daily_plan_id, sort_order);

-- Invariant #1 (docs/02-domain-engines.md §11): a plan never exceeds the user's
-- daily budget. Enforced here as well as in the generator's unit tests, because
-- a bug that silently overloads the user is the fastest way to lose them.
create or replace function public.check_daily_budget()
returns trigger
language plpgsql
as $$
declare
  budget    smallint;
  scheduled smallint;
  owner     uuid;
begin
  select dp.user_id into owner from public.daily_plans dp where dp.id = new.daily_plan_id;
  select cp.daily_minutes into budget from public.career_profiles cp where cp.user_id = owner;

  select coalesce(sum(planned_minutes), 0) into scheduled
  from public.daily_plan_items
  where daily_plan_id = new.daily_plan_id
    and id <> new.id;

  if scheduled + new.planned_minutes > budget then
    raise exception
      'daily plan % would schedule % minutes against a % minute budget',
      new.daily_plan_id, scheduled + new.planned_minutes, budget;
  end if;

  return new;
end;
$$;

create trigger daily_plan_items_budget
  before insert or update on public.daily_plan_items
  for each row execute function public.check_daily_budget();

-- ── RLS — owner_plus_admin throughout ──────────────────────────────────────

alter table public.roadmaps         enable row level security;
alter table public.roadmap_weeks    enable row level security;
alter table public.roadmap_items    enable row level security;
alter table public.weekly_missions  enable row level security;
alter table public.daily_plans      enable row level security;
alter table public.daily_plan_items enable row level security;

alter table public.roadmaps         force row level security;
alter table public.daily_plans      force row level security;
alter table public.daily_plan_items force row level security;

create policy roadmaps_own on public.roadmaps for all to authenticated
  using (user_id = auth.uid()) with check (user_id = auth.uid());
create policy roadmaps_admin_read on public.roadmaps for select to authenticated
  using (public.is_admin());

-- Child tables inherit ownership through their roadmap.
create policy roadmap_weeks_own on public.roadmap_weeks for all to authenticated
  using (exists (select 1 from public.roadmaps r where r.id = roadmap_id and r.user_id = auth.uid()))
  with check (exists (select 1 from public.roadmaps r where r.id = roadmap_id and r.user_id = auth.uid()));
create policy roadmap_weeks_admin_read on public.roadmap_weeks for select to authenticated using (public.is_admin());

create policy roadmap_items_own on public.roadmap_items for all to authenticated
  using (exists (select 1 from public.roadmaps r where r.id = roadmap_id and r.user_id = auth.uid()))
  with check (exists (select 1 from public.roadmaps r where r.id = roadmap_id and r.user_id = auth.uid()));
create policy roadmap_items_admin_read on public.roadmap_items for select to authenticated using (public.is_admin());

create policy weekly_missions_own on public.weekly_missions for all to authenticated
  using (exists (select 1 from public.roadmaps r where r.id = roadmap_id and r.user_id = auth.uid()))
  with check (exists (select 1 from public.roadmaps r where r.id = roadmap_id and r.user_id = auth.uid()));
create policy weekly_missions_admin_read on public.weekly_missions for select to authenticated using (public.is_admin());

create policy daily_plans_own on public.daily_plans for all to authenticated
  using (user_id = auth.uid()) with check (user_id = auth.uid());
create policy daily_plans_admin_read on public.daily_plans for select to authenticated using (public.is_admin());

create policy daily_plan_items_own on public.daily_plan_items for all to authenticated
  using (exists (select 1 from public.daily_plans d where d.id = daily_plan_id and d.user_id = auth.uid()))
  with check (exists (select 1 from public.daily_plans d where d.id = daily_plan_id and d.user_id = auth.uid()));
create policy daily_plan_items_admin_read on public.daily_plan_items for select to authenticated using (public.is_admin());
