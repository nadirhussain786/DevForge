-- ═══════════════════════════════════════════════════════════════════════════
-- 0011 — Job description intelligence and the application pipeline
-- ═══════════════════════════════════════════════════════════════════════════

-- ⚠ raw_text is owner_only — a pasted JD can contain a recruiter's name,
-- salary bands, and internal details the user never agreed to share.
create table public.job_descriptions (
  id             uuid primary key default gen_random_uuid(),
  user_id        uuid not null references auth.users(id) on delete cascade,
  company_id     uuid references public.companies(id) on delete set null,
  title          text not null,
  source_url     text,
  raw_text       text not null,
  parsed         jsonb,
  parsed_at      timestamptz,
  prompt_version text,
  created_at     timestamptz not null default now()
);

create index jd_user_idx on public.job_descriptions (user_id, created_at desc);

-- Requirements carry no free text from the posting beyond a short label, so
-- they are safe for the curriculum-gap report.
create table public.jd_requirements (
  id                   uuid primary key default gen_random_uuid(),
  jd_id                uuid not null references public.job_descriptions(id) on delete cascade,
  user_id              uuid not null references auth.users(id) on delete cascade,
  skill_id             uuid references public.skills(id) on delete set null,
  raw_label            text not null,
  normalized_label     citext generated always as (lower(trim(raw_label))) stored,
  kind                 requirement_kind not null default 'required',
  gap                  gap_class,
  user_mastery_at_parse numeric(5,2),
  created_at           timestamptz not null default now()
);

create index jd_req_jd_idx on public.jd_requirements (jd_id);
-- Drives /admin/curriculum-gaps: what employers ask for that we can't teach yet.
create index jd_req_unmapped_idx on public.jd_requirements (normalized_label) where skill_id is null;

create table public.applications (
  id           uuid primary key default gen_random_uuid(),
  user_id      uuid not null references auth.users(id) on delete cascade,
  company_id   uuid references public.companies(id) on delete set null,
  jd_id        uuid references public.job_descriptions(id) on delete set null,
  role_title   text not null,
  status       application_status not null default 'saved',
  applied_at   date,
  next_event_at timestamptz,
  notes_md     text,
  created_at   timestamptz not null default now(),
  updated_at   timestamptz not null default now()
);

create index applications_user_idx on public.applications (user_id, status, next_event_at);

create table public.application_events (
  id             uuid primary key default gen_random_uuid(),
  application_id uuid not null references public.applications(id) on delete cascade,
  user_id        uuid not null references auth.users(id) on delete cascade,
  status         application_status not null,
  occurred_at    timestamptz not null default now(),
  note           text
);

create index application_events_app_idx on public.application_events (application_id, occurred_at desc);

-- Every status change is journalled, so the pipeline funnel is derivable.
create or replace function public.log_application_status()
returns trigger
language plpgsql
as $$
begin
  if tg_op = 'INSERT' or new.status is distinct from old.status then
    insert into public.application_events (application_id, user_id, status)
    values (new.id, new.user_id, new.status);
  end if;
  return new;
end;
$$;

create trigger applications_status_log
  after insert or update of status on public.applications
  for each row execute function public.log_application_status();

select public.attach_updated_at('public.applications');

-- ── RLS ────────────────────────────────────────────────────────────────────

alter table public.job_descriptions   enable row level security;
alter table public.jd_requirements    enable row level security;
alter table public.applications       enable row level security;
alter table public.application_events enable row level security;

alter table public.job_descriptions   force row level security;

-- ⚠ owner_only — no admin clause.
create policy jd_owner_only on public.job_descriptions for all to authenticated
  using (user_id = auth.uid()) with check (user_id = auth.uid());

create policy jd_req_own on public.jd_requirements for all to authenticated
  using (user_id = auth.uid()) with check (user_id = auth.uid());
create policy jd_req_admin_read on public.jd_requirements for select to authenticated using (public.is_admin());

create policy applications_own on public.applications for all to authenticated
  using (user_id = auth.uid()) with check (user_id = auth.uid());
create policy applications_admin_read on public.applications for select to authenticated using (public.is_admin());

create policy app_events_own on public.application_events for all to authenticated
  using (user_id = auth.uid()) with check (user_id = auth.uid());
create policy app_events_admin_read on public.application_events for select to authenticated using (public.is_admin());
