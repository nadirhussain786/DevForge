-- ═══════════════════════════════════════════════════════════════════════════
-- 0010 — Mock interviews and Interview Memory
--
-- Transcripts are owner_only; only aggregate scores are visible to analytics.
-- ═══════════════════════════════════════════════════════════════════════════

create table public.mock_interviews (
  id               uuid primary key default gen_random_uuid(),
  user_id          uuid not null references auth.users(id) on delete cascade,
  mode             text not null check (mode in ('quick','technical','full','system_design','ai','frontend','backend','behavioral','mixed')),
  role_track_id    uuid references public.role_tracks(id) on delete set null,
  duration_minutes smallint not null default 30,
  started_at       timestamptz not null default now(),
  ended_at         timestamptz,
  status           plan_item_status not null default 'in_progress',
  overall_score    numeric(5,2) check (overall_score between 0 and 100),
  dimension_scores jsonb not null default '{}'::jsonb,  -- correctness, depth, communication, structure
  feedback_md      text,
  prompt_version   text
);

create index mock_interviews_user_idx on public.mock_interviews (user_id, started_at desc);

-- ⚠ owner_only — full transcripts are private.
create table public.mock_interview_turns (
  id           uuid primary key default gen_random_uuid(),
  interview_id uuid not null references public.mock_interviews(id) on delete cascade,
  user_id      uuid not null references auth.users(id) on delete cascade,
  turn_index   smallint not null,
  speaker      text not null check (speaker in ('interviewer','candidate')),
  content      text not null,
  question_id  uuid references public.questions(id) on delete set null,
  eval         jsonb,
  created_at   timestamptz not null default now(),
  unique (interview_id, turn_index)
);

create index mock_turns_interview_idx on public.mock_interview_turns (interview_id, turn_index);

-- ── Interview Memory (§11) — real interviews, the strongest evidence ──────

create table public.interview_records (
  id          uuid primary key default gen_random_uuid(),
  user_id     uuid not null references auth.users(id) on delete cascade,
  company_id  uuid references public.companies(id) on delete set null,
  role_title  text not null,
  stage       interview_stage not null,
  occurred_at date not null,
  outcome     text check (outcome in ('passed','failed','pending','withdrawn')),
  confidence  smallint check (confidence between 1 and 5),
  -- ⚠ Stripped from every admin-facing view. Personal reflection.
  notes_md    text,
  created_at  timestamptz not null default now(),
  updated_at  timestamptz not null default now()
);

create index interview_records_user_idx on public.interview_records (user_id, occurred_at desc);

create table public.interview_record_questions (
  id             uuid primary key default gen_random_uuid(),
  record_id      uuid not null references public.interview_records(id) on delete cascade,
  user_id        uuid not null references auth.users(id) on delete cascade,
  question_text  text not null,
  quality        answer_quality not null,
  skill_id       uuid references public.skills(id) on delete set null,
  difficulty     smallint not null default 3 check (difficulty between 1 and 5),
  unexpected     boolean not null default false,
  weakness_id    uuid references public.weaknesses(id) on delete set null,
  created_at     timestamptz not null default now()
);

create index irq_record_idx on public.interview_record_questions (record_id);

select public.attach_updated_at('public.interview_records');

-- A real interview question is the highest-weight evidence in the model (2.5).
-- `shaky` and `failed` answers open weaknesses at severity 2 and 3.
create or replace function public.ingest_interview_question()
returns trigger
language plpgsql
security definer
set search_path = public, pg_temp
as $$
declare
  v_correctness numeric;
  v_severity    smallint;
  v_evidence_id uuid;
begin
  if new.skill_id is null then
    return new;
  end if;

  v_correctness := case new.quality
    when 'strong'     then 0.95
    when 'shaky'      then 0.45
    when 'failed'     then 0.10
    when 'unanswered' then 0.00
  end;

  insert into public.skill_evidence
    (user_id, skill_id, source_type, source_id, difficulty, correctness, weight)
  values
    (new.user_id, new.skill_id, 'real_interview_question', new.id,
     new.difficulty, v_correctness,
     public.evidence_source_weight('real_interview_question'))
  returning id into v_evidence_id;

  perform public.recompute_user_skill(new.user_id, new.skill_id);

  if new.quality in ('shaky', 'failed', 'unanswered') then
    v_severity := case new.quality when 'shaky' then 2 else 3 end;

    insert into public.weaknesses
      (user_id, skill_id, severity, source_type, source_id, evidence)
    values
      (new.user_id, new.skill_id, v_severity, 'real_interview_question', v_evidence_id,
       jsonb_build_object('difficulty', new.difficulty, 'question', new.question_text, 'quality', new.quality))
    on conflict (user_id, skill_id) where status in ('open','researching','retesting')
    do update set severity = greatest(weaknesses.severity, excluded.severity);
  end if;

  return new;
end;
$$;

create trigger interview_question_ingest
  after insert on public.interview_record_questions
  for each row execute function public.ingest_interview_question();

-- ── RLS ────────────────────────────────────────────────────────────────────

alter table public.mock_interviews             enable row level security;
alter table public.mock_interview_turns        enable row level security;
alter table public.interview_records           enable row level security;
alter table public.interview_record_questions  enable row level security;

alter table public.mock_interview_turns        force row level security;
alter table public.interview_records           force row level security;

create policy mock_own on public.mock_interviews for all to authenticated
  using (user_id = auth.uid()) with check (user_id = auth.uid());
create policy mock_admin_read on public.mock_interviews for select to authenticated using (public.is_admin());

-- ⚠ owner_only — no admin clause.
create policy mock_turns_owner_only on public.mock_interview_turns for all to authenticated
  using (user_id = auth.uid()) with check (user_id = auth.uid());

-- ⚠ owner_only — notes_md makes the whole row private. Admin analytics uses
-- interview_record_questions (skills and qualities, no prose) instead.
create policy interview_records_owner_only on public.interview_records for all to authenticated
  using (user_id = auth.uid()) with check (user_id = auth.uid());

create policy irq_own on public.interview_record_questions for all to authenticated
  using (user_id = auth.uid()) with check (user_id = auth.uid());
create policy irq_admin_read on public.interview_record_questions for select to authenticated using (public.is_admin());
