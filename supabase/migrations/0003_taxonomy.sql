-- ═══════════════════════════════════════════════════════════════════════════
-- 0003 — Taxonomy: domains, skills, prerequisites, role tracks
--
-- This is the highest-leverage data in the product. `role_track_skills.weight`
-- is what makes a Frontend roadmap differ from an AI Engineer roadmap while
-- both draw on the same content library.
-- ═══════════════════════════════════════════════════════════════════════════

create table public.domains (
  id          uuid primary key default gen_random_uuid(),
  slug        citext unique not null,
  name        text not null,
  description text,
  icon        text,
  sort_order  smallint not null default 0,
  created_at  timestamptz not null default now()
);

create table public.skills (
  id         uuid primary key default gen_random_uuid(),
  slug       citext unique not null,
  domain_id  uuid not null references public.domains(id) on delete restrict,
  name       text not null,
  summary    text,
  difficulty smallint not null default 3 check (difficulty between 1 and 5),
  status     content_status not null default 'published',
  sort_order smallint not null default 0,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now()
);

create index skills_domain_idx on public.skills (domain_id);

-- ── Prerequisites (a DAG) ──────────────────────────────────────────────────
create table public.skill_prerequisites (
  skill_id        uuid not null references public.skills(id) on delete cascade,
  prereq_skill_id uuid not null references public.skills(id) on delete cascade,
  strength        numeric(3,2) not null default 1.0 check (strength between 0 and 1),
  primary key (skill_id, prereq_skill_id),
  constraint no_self_prereq check (skill_id <> prereq_skill_id)
);

create index skill_prereq_reverse_idx on public.skill_prerequisites (prereq_skill_id);

-- Cycle guard: a prerequisite edge may not close a loop, or the roadmap
-- scheduler would never terminate.
create or replace function public.check_prereq_acyclic()
returns trigger
language plpgsql
as $$
begin
  if exists (
    with recursive reachable as (
      select new.skill_id as node
      union
      select sp.skill_id
      from public.skill_prerequisites sp
      join reachable r on sp.prereq_skill_id = r.node
    )
    select 1 from reachable where node = new.prereq_skill_id
  ) then
    raise exception 'skill_prerequisites: edge %->% would create a cycle',
      new.prereq_skill_id, new.skill_id;
  end if;
  return new;
end;
$$;

create trigger skill_prereq_acyclic
  before insert or update on public.skill_prerequisites
  for each row execute function public.check_prereq_acyclic();

-- ── Aliases — power JD requirement → skill mapping (§10) ───────────────────
create table public.skill_aliases (
  id       uuid primary key default gen_random_uuid(),
  skill_id uuid not null references public.skills(id) on delete cascade,
  alias    citext not null unique
);

create index skill_aliases_skill_idx on public.skill_aliases (skill_id);

-- ── Role tracks ────────────────────────────────────────────────────────────
create table public.role_tracks (
  id          uuid primary key default gen_random_uuid(),
  slug        citext unique not null,
  name        text not null,
  description text,
  is_default  boolean not null default false,
  sort_order  smallint not null default 0,
  status      content_status not null default 'published',
  created_at  timestamptz not null default now()
);

create unique index role_tracks_one_default on public.role_tracks (is_default) where is_default;

create table public.role_track_skills (
  role_track_id  uuid not null references public.role_tracks(id) on delete cascade,
  skill_id       uuid not null references public.skills(id) on delete cascade,
  weight         numeric(3,2) not null check (weight between 0 and 1),
  target_mastery smallint not null default 70 check (target_mastery between 0 and 100),
  is_critical    boolean not null default false,
  primary key (role_track_id, skill_id)
);

create index role_track_skills_skill_idx on public.role_track_skills (skill_id);

-- Deferred FK from 0002 — career_profiles.role_track_id.
alter table public.career_profiles
  add constraint career_profiles_role_track_fk
  foreign key (role_track_id) references public.role_tracks(id) on delete set null;

select public.attach_updated_at('public.skills');

-- ── RLS — all public_content ───────────────────────────────────────────────

alter table public.domains             enable row level security;
alter table public.skills              enable row level security;
alter table public.skill_prerequisites enable row level security;
alter table public.skill_aliases       enable row level security;
alter table public.role_tracks         enable row level security;
alter table public.role_track_skills   enable row level security;

create policy domains_read on public.domains for select to authenticated using (true);
create policy domains_admin on public.domains for all to authenticated using (public.is_admin()) with check (public.is_admin());

create policy skills_read on public.skills for select to authenticated
  using (status = 'published' or public.is_admin());
create policy skills_admin on public.skills for all to authenticated
  using (public.is_admin()) with check (public.is_admin());

create policy prereq_read on public.skill_prerequisites for select to authenticated using (true);
create policy prereq_admin on public.skill_prerequisites for all to authenticated using (public.is_admin()) with check (public.is_admin());

create policy aliases_read on public.skill_aliases for select to authenticated using (true);
create policy aliases_admin on public.skill_aliases for all to authenticated using (public.is_admin()) with check (public.is_admin());

create policy tracks_read on public.role_tracks for select to authenticated
  using (status = 'published' or public.is_admin());
create policy tracks_admin on public.role_tracks for all to authenticated
  using (public.is_admin()) with check (public.is_admin());

create policy track_skills_read on public.role_track_skills for select to authenticated using (true);
create policy track_skills_admin on public.role_track_skills for all to authenticated using (public.is_admin()) with check (public.is_admin());
