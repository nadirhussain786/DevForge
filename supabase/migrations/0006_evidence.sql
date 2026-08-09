-- ═══════════════════════════════════════════════════════════════════════════
-- 0006 — Attempts, the evidence ledger, and mastery
--
-- `skill_evidence` is append-only and is the single source of truth for
-- capability. `user_skills` is a cache that can be dropped and rebuilt from it
-- (invariant #6, docs/02-domain-engines.md §11).
-- ═══════════════════════════════════════════════════════════════════════════

-- ── Attempt tables ─────────────────────────────────────────────────────────

create table public.study_sessions (
  id            uuid primary key default gen_random_uuid(),
  user_id       uuid not null references auth.users(id) on delete cascade,
  daily_plan_id uuid references public.daily_plans(id) on delete set null,
  started_at    timestamptz not null default now(),
  ended_at      timestamptz,
  minutes       smallint not null default 0,
  source        text
);

create index study_sessions_user_idx on public.study_sessions (user_id, started_at desc);

create table public.question_attempts (
  id             uuid primary key default gen_random_uuid(),
  user_id        uuid not null references auth.users(id) on delete cascade,
  question_id    uuid not null references public.questions(id) on delete cascade,
  response_text  text,
  selected       jsonb,
  score          numeric(4,3) not null check (score between 0 and 1),
  is_correct     boolean generated always as (score >= 0.6) stored,
  ai_eval        jsonb,
  prompt_version text,
  seconds        integer,
  hints_used     smallint not null default 0,
  attempt_no     smallint not null default 1,
  created_at     timestamptz not null default now()
);

create index question_attempts_user_idx on public.question_attempts (user_id, question_id, created_at desc);
create index question_attempts_question_idx on public.question_attempts (question_id);

create table public.coding_attempts (
  id               uuid primary key default gen_random_uuid(),
  user_id          uuid not null references auth.users(id) on delete cascade,
  problem_id       uuid not null references public.coding_problems(id) on delete cascade,
  language         text not null default 'typescript',
  code             text,
  status           text not null default 'in_progress' check (status in ('in_progress','passed','failed','abandoned')),
  tests_passed     smallint not null default 0,
  tests_total      smallint not null default 0,
  seconds          integer,
  hints_used       smallint not null default 0,
  complexity_claim text,
  ai_review        jsonb,
  created_at       timestamptz not null default now()
);

create index coding_attempts_user_idx on public.coding_attempts (user_id, problem_id, created_at desc);

-- The EXPLAIN stage of the loop. Reading alone cannot close a topic.
create table public.explanations (
  id            uuid primary key default gen_random_uuid(),
  user_id       uuid not null references auth.users(id) on delete cascade,
  topic_id      uuid references public.topics(id) on delete set null,
  skill_id      uuid not null references public.skills(id) on delete cascade,
  body_md       text not null,
  level_claimed explanation_level not null default 'engineer',
  score         numeric(4,3) check (score between 0 and 1),
  ai_eval       jsonb,
  created_at    timestamptz not null default now()
);

create index explanations_user_idx on public.explanations (user_id, skill_id, created_at desc);

-- ── The evidence ledger ────────────────────────────────────────────────────

-- Evidence quality per source. Stored on the row at insert time so retuning
-- these values never silently rewrites a user's history.
create or replace function public.evidence_source_weight(src evidence_source)
returns numeric
language sql
immutable
as $$
  select case src
    when 'mcq'                     then 0.5
    when 'short_answer'            then 0.8
    when 'research_note'           then 0.6
    when 'calibration'             then 0.7
    when 'explanation'             then 1.2
    when 'coding_attempt'          then 1.5
    when 'mock_interview_turn'     then 1.8
    when 'system_design_attempt'   then 2.0
    when 'boss_battle'             then 2.0
    when 'incident_run'            then 2.0
    when 'real_interview_question' then 2.5
  end::numeric;
$$;

create table public.skill_evidence (
  id          uuid primary key default gen_random_uuid(),
  user_id     uuid not null references auth.users(id) on delete cascade,
  skill_id    uuid not null references public.skills(id) on delete cascade,
  source_type evidence_source not null,
  source_id   uuid,
  difficulty  smallint not null check (difficulty between 1 and 5),
  correctness numeric(4,3) not null check (correctness between 0 and 1),
  weight      numeric(4,2) not null,
  occurred_at timestamptz not null default now()
);

create index skill_evidence_lookup_idx on public.skill_evidence (user_id, skill_id, occurred_at desc);
create index skill_evidence_source_idx on public.skill_evidence (source_type, source_id);

-- Append-only: no updates, no deletes. Mastery must always be reproducible.
create or replace function public.forbid_mutation()
returns trigger
language plpgsql
as $$
begin
  raise exception '% is append-only', tg_table_name;
end;
$$;

create trigger skill_evidence_immutable
  before update or delete on public.skill_evidence
  for each row execute function public.forbid_mutation();

-- ── Mastery cache ──────────────────────────────────────────────────────────

create table public.user_skills (
  user_id          uuid not null references auth.users(id) on delete cascade,
  skill_id         uuid not null references public.skills(id) on delete cascade,
  mastery          numeric(5,2) not null default 0 check (mastery between 0 and 100),
  raw_mastery      numeric(5,2) not null default 0,
  confidence       numeric(4,3) not null default 0 check (confidence between 0 and 1),
  -- Self-reported at onboarding, capped at 35. Mastery shrinks toward this
  -- while confidence is low, so one lucky answer never reads as expertise.
  prior_mastery    numeric(5,2) not null default 0 check (prior_mastery between 0 and 35),
  rank             skill_rank not null default 'novice',
  evidence_count   integer not null default 0,
  last_practiced_at timestamptz,
  recomputed_at    timestamptz not null default now(),
  primary key (user_id, skill_id)
);

create index user_skills_user_idx on public.user_skills (user_id, mastery);

create or replace function public.mastery_rank(m numeric)
returns skill_rank
language sql
immutable
as $$
  select case
    when m < 20 then 'novice'
    when m < 40 then 'familiar'
    when m < 60 then 'working'
    when m < 75 then 'proficient'
    when m < 90 then 'strong'
    else 'expert'
  end::skill_rank;
$$;

-- The mastery formula from docs/02-domain-engines.md §2, in SQL so it is
-- atomic with the evidence insert.
--
--   m(d)     = 0.5 + 0.25·difficulty
--   decay(t) = 0.5 ^ (ageDays / 45)
--   w_eff    = weight · m(d) · decay(t)
--   raw      = 100 · Σ(w_eff·correctness) / Σ(w_eff)
--   conf     = 1 − exp(−Σw_eff / 6)
--   mastery  = raw·conf + prior·(1−conf)
create or replace function public.recompute_user_skill(p_user uuid, p_skill uuid)
returns void
language plpgsql
security definer
set search_path = public, pg_temp
as $$
declare
  v_sum_w   numeric := 0;
  v_sum_wc  numeric := 0;
  v_count   integer := 0;
  v_last    timestamptz;
  v_conf    numeric;
  v_raw     numeric;
  v_prior   numeric := 0;
  v_mastery numeric;
begin
  select coalesce(sum(w_eff), 0),
         coalesce(sum(w_eff * correctness), 0),
         count(*),
         max(occurred_at)
    into v_sum_w, v_sum_wc, v_count, v_last
  from (
    select correctness,
           occurred_at,
           weight
             * (0.5 + 0.25 * difficulty)
             * power(0.5, extract(epoch from (now() - occurred_at)) / (45 * 86400))
             as w_eff
    from public.skill_evidence
    where user_id = p_user and skill_id = p_skill
  ) e;

  select coalesce(prior_mastery, 0) into v_prior
  from public.user_skills where user_id = p_user and skill_id = p_skill;
  v_prior := coalesce(v_prior, 0);

  v_conf    := 1 - exp(-v_sum_w / 6.0);
  v_raw     := case when v_sum_w > 0 then 100 * v_sum_wc / v_sum_w else 0 end;
  v_mastery := v_raw * v_conf + v_prior * (1 - v_conf);

  insert into public.user_skills as us
    (user_id, skill_id, mastery, raw_mastery, confidence, rank,
     evidence_count, last_practiced_at, recomputed_at)
  values
    (p_user, p_skill, round(v_mastery, 2), round(v_raw, 2), round(v_conf, 3),
     public.mastery_rank(v_mastery), v_count, v_last, now())
  on conflict (user_id, skill_id) do update set
    mastery           = excluded.mastery,
    raw_mastery       = excluded.raw_mastery,
    confidence        = excluded.confidence,
    rank              = excluded.rank,
    evidence_count    = excluded.evidence_count,
    last_practiced_at = excluded.last_practiced_at,
    recomputed_at     = now();
end;
$$;

-- Single entry point for producing evidence. Application code calls this
-- rather than inserting directly, so weight lookup and recomputation can never
-- be forgotten.
create or replace function public.record_evidence(
  p_skill       uuid,
  p_source_type evidence_source,
  p_source_id   uuid,
  p_difficulty  smallint,
  p_correctness numeric
)
returns uuid
language plpgsql
security invoker
set search_path = public, pg_temp
as $$
declare
  v_id uuid;
begin
  insert into public.skill_evidence
    (user_id, skill_id, source_type, source_id, difficulty, correctness, weight)
  values
    (auth.uid(), p_skill, p_source_type, p_source_id, p_difficulty, p_correctness,
     public.evidence_source_weight(p_source_type))
  returning id into v_id;

  perform public.recompute_user_skill(auth.uid(), p_skill);
  return v_id;
end;
$$;

grant execute on function public.record_evidence(uuid, evidence_source, uuid, smallint, numeric) to authenticated;

-- ── Snapshots (nightly) ────────────────────────────────────────────────────

create table public.readiness_snapshots (
  user_id       uuid not null references auth.users(id) on delete cascade,
  snapshot_date date not null,
  role_track_id uuid references public.role_tracks(id) on delete set null,
  overall       numeric(5,2) not null,
  by_domain     jsonb not null default '{}'::jsonb,
  by_dimension  jsonb not null default '{}'::jsonb,
  components    jsonb not null default '{}'::jsonb,  -- blend, weakest, penalty
  created_at    timestamptz not null default now(),
  primary key (user_id, snapshot_date)
);

create table public.momentum_snapshots (
  user_id       uuid not null references auth.users(id) on delete cascade,
  snapshot_date date not null,
  score         numeric(5,2) not null,
  components    jsonb not null default '{}'::jsonb,
  primary key (user_id, snapshot_date)
);

-- ── RLS ────────────────────────────────────────────────────────────────────

alter table public.study_sessions      enable row level security;
alter table public.question_attempts   enable row level security;
alter table public.coding_attempts     enable row level security;
alter table public.explanations        enable row level security;
alter table public.skill_evidence      enable row level security;
alter table public.user_skills         enable row level security;
alter table public.readiness_snapshots enable row level security;
alter table public.momentum_snapshots  enable row level security;

alter table public.skill_evidence      force row level security;
alter table public.user_skills         force row level security;

create policy sessions_own on public.study_sessions for all to authenticated
  using (user_id = auth.uid()) with check (user_id = auth.uid());
create policy sessions_admin_read on public.study_sessions for select to authenticated using (public.is_admin());

create policy q_attempts_own on public.question_attempts for all to authenticated
  using (user_id = auth.uid()) with check (user_id = auth.uid());
create policy q_attempts_admin_read on public.question_attempts for select to authenticated using (public.is_admin());

create policy c_attempts_own on public.coding_attempts for all to authenticated
  using (user_id = auth.uid()) with check (user_id = auth.uid());
create policy c_attempts_admin_read on public.coding_attempts for select to authenticated using (public.is_admin());

create policy explanations_own on public.explanations for all to authenticated
  using (user_id = auth.uid()) with check (user_id = auth.uid());
create policy explanations_admin_read on public.explanations for select to authenticated using (public.is_admin());

create policy evidence_own_read on public.skill_evidence for select to authenticated using (user_id = auth.uid());
create policy evidence_own_insert on public.skill_evidence for insert to authenticated with check (user_id = auth.uid());
create policy evidence_admin_read on public.skill_evidence for select to authenticated using (public.is_admin());

create policy user_skills_own on public.user_skills for all to authenticated
  using (user_id = auth.uid()) with check (user_id = auth.uid());
create policy user_skills_admin_read on public.user_skills for select to authenticated using (public.is_admin());

create policy readiness_own on public.readiness_snapshots for all to authenticated
  using (user_id = auth.uid()) with check (user_id = auth.uid());
create policy readiness_admin_read on public.readiness_snapshots for select to authenticated using (public.is_admin());

create policy momentum_own on public.momentum_snapshots for all to authenticated
  using (user_id = auth.uid()) with check (user_id = auth.uid());
create policy momentum_admin_read on public.momentum_snapshots for select to authenticated using (public.is_admin());
