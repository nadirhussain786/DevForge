-- ═══════════════════════════════════════════════════════════════════════════
-- 0012 — Arena: system design, boss battles, incidents, projects
-- ═══════════════════════════════════════════════════════════════════════════

-- ── System Design ──────────────────────────────────────────────────────────

create table public.system_design_cases (
  id                       uuid primary key default gen_random_uuid(),
  slug                     citext unique not null,
  title                    text not null,
  brief_md                 text not null,
  constraints              jsonb not null default '{}'::jsonb,
  traffic_profile          jsonb not null default '{}'::jsonb,
  rubric                   jsonb not null default '{}'::jsonb,
  -- ⚠ Must never reach the client before the user submits (§59).
  reference_architecture_md text,
  difficulty               smallint not null default 3 check (difficulty between 1 and 5),
  estimated_minutes        smallint not null default 45,
  status                   content_status not null default 'draft',
  created_at               timestamptz not null default now(),
  updated_at               timestamptz not null default now()
);

create table public.system_design_attempts (
  id              uuid primary key default gen_random_uuid(),
  user_id         uuid not null references auth.users(id) on delete cascade,
  case_id         uuid not null references public.system_design_cases(id) on delete cascade,
  submission_md   text,
  diagram_mermaid text,
  scores          jsonb not null default '{}'::jsonb,  -- 8 rubric dimensions
  overall_score   numeric(5,2) check (overall_score between 0 and 100),
  ai_feedback     jsonb,
  submitted_at    timestamptz,
  created_at      timestamptz not null default now(),
  updated_at      timestamptz not null default now()
);

create index sd_attempts_user_idx on public.system_design_attempts (user_id, case_id, created_at desc);

-- The view the product reads from. Omitting the column entirely is safer than
-- relying on every query to remember not to select it.
create view public.system_design_cases_public
with (security_invoker = true) as
  select id, slug, title, brief_md, constraints, traffic_profile,
         difficulty, estimated_minutes, status
  from public.system_design_cases;

-- Reference architecture is released only once the user has submitted.
create or replace function public.get_reference_architecture(p_case uuid)
returns text
language plpgsql
stable
security definer
set search_path = public, pg_temp
as $$
declare
  v_md text;
begin
  if not exists (
    select 1 from public.system_design_attempts
    where user_id = auth.uid() and case_id = p_case and submitted_at is not null
  ) then
    raise exception 'reference architecture is available after you submit your design';
  end if;

  select reference_architecture_md into v_md
  from public.system_design_cases where id = p_case;
  return v_md;
end;
$$;

grant execute on function public.get_reference_architecture(uuid) to authenticated;

-- ── Boss Battles ───────────────────────────────────────────────────────────

create table public.boss_battles (
  id          uuid primary key default gen_random_uuid(),
  slug        citext unique not null,
  title       text not null,
  scenario_md text not null,
  week_hint   smallint,
  rubric      jsonb not null default '{}'::jsonb,
  xp          integer not null default 120,
  difficulty  smallint not null default 4 check (difficulty between 1 and 5),
  skill_id    uuid references public.skills(id) on delete set null,
  status      content_status not null default 'draft',
  created_at  timestamptz not null default now()
);

create table public.boss_battle_attempts (
  id           uuid primary key default gen_random_uuid(),
  user_id      uuid not null references auth.users(id) on delete cascade,
  battle_id    uuid not null references public.boss_battles(id) on delete cascade,
  analysis_md  text,
  scores       jsonb not null default '{}'::jsonb,
  overall_score numeric(5,2),
  completed_at timestamptz,
  created_at   timestamptz not null default now()
);

-- ── Incident Simulator ─────────────────────────────────────────────────────

create table public.incident_scenarios (
  id           uuid primary key default gen_random_uuid(),
  slug         citext unique not null,
  title        text not null,
  opening_md   text not null,
  root_cause_md text,   -- ⚠ hidden until the run completes
  rubric       jsonb not null default '{}'::jsonb,
  difficulty   smallint not null default 3,
  status       content_status not null default 'draft',
  created_at   timestamptz not null default now()
);

-- Progressive disclosure: each probe costs simulated minutes, so investigating
-- everything is itself a failure mode.
create table public.incident_reveals (
  id           uuid primary key default gen_random_uuid(),
  scenario_id  uuid not null references public.incident_scenarios(id) on delete cascade,
  step         smallint not null,
  probe        text not null check (probe in ('metrics','logs','traces','deploys','db','deps','oncall')),
  content_md   text not null,
  cost_minutes smallint not null default 5,
  is_red_herring boolean not null default false,
  unique (scenario_id, probe, step)
);

create table public.incident_runs (
  id              uuid primary key default gen_random_uuid(),
  user_id         uuid not null references auth.users(id) on delete cascade,
  scenario_id     uuid not null references public.incident_scenarios(id) on delete cascade,
  elapsed_minutes smallint not null default 0,
  hypothesis_md   text,
  mitigation_md   text,
  overall_score   numeric(5,2),
  completed_at    timestamptz,
  created_at      timestamptz not null default now()
);

create table public.incident_actions (
  id        uuid primary key default gen_random_uuid(),
  run_id    uuid not null references public.incident_runs(id) on delete cascade,
  user_id   uuid not null references auth.users(id) on delete cascade,
  reveal_id uuid not null references public.incident_reveals(id) on delete cascade,
  taken_at  timestamptz not null default now()
);

-- ── Projects ───────────────────────────────────────────────────────────────

create table public.projects (
  id               uuid primary key default gen_random_uuid(),
  slug             citext unique not null,
  title            text not null,
  brief_md         text not null,
  estimated_hours  smallint not null default 8,
  difficulty       smallint not null default 3,
  status           content_status not null default 'draft',
  created_at       timestamptz not null default now()
);

create table public.project_milestones (
  id           uuid primary key default gen_random_uuid(),
  project_id   uuid not null references public.projects(id) on delete cascade,
  milestone_index smallint not null,
  title        text not null,
  requirements jsonb not null default '[]'::jsonb,
  rubric       jsonb not null default '{}'::jsonb,
  estimated_minutes smallint not null default 60,
  unique (project_id, milestone_index)
);

create table public.project_progress (
  id           uuid primary key default gen_random_uuid(),
  user_id      uuid not null references auth.users(id) on delete cascade,
  milestone_id uuid not null references public.project_milestones(id) on delete cascade,
  status       plan_item_status not null default 'pending',
  repo_url     text,
  notes_md     text,
  score        numeric(5,2),
  completed_at timestamptz,
  unique (user_id, milestone_id)
);

select public.attach_updated_at('public.system_design_cases');
select public.attach_updated_at('public.system_design_attempts');

-- ── RLS ────────────────────────────────────────────────────────────────────

alter table public.system_design_cases    enable row level security;
alter table public.system_design_attempts enable row level security;
alter table public.boss_battles           enable row level security;
alter table public.boss_battle_attempts   enable row level security;
alter table public.incident_scenarios     enable row level security;
alter table public.incident_reveals       enable row level security;
alter table public.incident_runs          enable row level security;
alter table public.incident_actions       enable row level security;
alter table public.projects               enable row level security;
alter table public.project_milestones     enable row level security;
alter table public.project_progress       enable row level security;

alter table public.system_design_attempts force row level security;

-- Base table is admin-only for select; users read the view, which cannot
-- expose reference_architecture_md.
create policy sd_cases_admin on public.system_design_cases for all to authenticated
  using (public.is_admin()) with check (public.is_admin());
create policy sd_cases_read on public.system_design_cases for select to authenticated
  using (status = 'published');

-- ⚠ owner_only — a design write-up is the user's own work.
create policy sd_attempts_owner_only on public.system_design_attempts for all to authenticated
  using (user_id = auth.uid()) with check (user_id = auth.uid());

create policy boss_read on public.boss_battles for select to authenticated
  using (status = 'published' or public.is_admin());
create policy boss_admin on public.boss_battles for all to authenticated
  using (public.is_admin()) with check (public.is_admin());
create policy boss_attempts_own on public.boss_battle_attempts for all to authenticated
  using (user_id = auth.uid()) with check (user_id = auth.uid());
create policy boss_attempts_admin_read on public.boss_battle_attempts for select to authenticated using (public.is_admin());

create policy incident_read on public.incident_scenarios for select to authenticated
  using (status = 'published' or public.is_admin());
create policy incident_admin on public.incident_scenarios for all to authenticated
  using (public.is_admin()) with check (public.is_admin());

-- A reveal is readable only once the user has paid for it with an action row.
create policy reveals_earned on public.incident_reveals for select to authenticated
  using (
    public.is_admin() or exists (
      select 1 from public.incident_actions ia
      where ia.reveal_id = incident_reveals.id and ia.user_id = auth.uid()
    )
  );
create policy reveals_admin on public.incident_reveals for all to authenticated
  using (public.is_admin()) with check (public.is_admin());

create policy incident_runs_own on public.incident_runs for all to authenticated
  using (user_id = auth.uid()) with check (user_id = auth.uid());
create policy incident_runs_admin_read on public.incident_runs for select to authenticated using (public.is_admin());

create policy incident_actions_own on public.incident_actions for all to authenticated
  using (user_id = auth.uid()) with check (user_id = auth.uid());

create policy projects_read on public.projects for select to authenticated
  using (status = 'published' or public.is_admin());
create policy projects_admin on public.projects for all to authenticated
  using (public.is_admin()) with check (public.is_admin());

create policy milestones_read on public.project_milestones for select to authenticated using (true);
create policy milestones_admin on public.project_milestones for all to authenticated
  using (public.is_admin()) with check (public.is_admin());

create policy project_progress_own on public.project_progress for all to authenticated
  using (user_id = auth.uid()) with check (user_id = auth.uid());
create policy project_progress_admin_read on public.project_progress for select to authenticated using (public.is_admin());
