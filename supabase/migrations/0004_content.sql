-- ═══════════════════════════════════════════════════════════════════════════
-- 0004 — Learning content: topics, explanations, questions, coding problems
--
-- Content is authored data, never runtime LLM output. Stable IDs are what make
-- "which topic do users struggle with?" answerable (§34).
-- ═══════════════════════════════════════════════════════════════════════════

create table public.topics (
  id                uuid primary key default gen_random_uuid(),
  slug              citext unique not null,
  skill_id          uuid not null references public.skills(id) on delete restrict,
  title             text not null,
  summary           text,
  estimated_minutes smallint not null default 15 check (estimated_minutes between 3 and 120),
  difficulty        smallint not null default 3 check (difficulty between 1 and 5),
  status            content_status not null default 'draft',
  version           integer not null default 1,
  sort_order        smallint not null default 0,
  created_at        timestamptz not null default now(),
  updated_at        timestamptz not null default now()
);

create index topics_skill_idx on public.topics (skill_id, sort_order);
create index topics_status_idx on public.topics (status);

-- The four explanation levels (§28) plus supporting blocks, as rows rather
-- than eleven columns on `topics`.
create table public.topic_contents (
  id         uuid primary key default gen_random_uuid(),
  topic_id   uuid not null references public.topics(id) on delete cascade,
  kind       content_kind not null,
  body_md    text not null,
  sort_order smallint not null default 0,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now(),
  unique (topic_id, kind, sort_order)
);

create index topic_contents_topic_idx on public.topic_contents (topic_id);

-- Publishing guard: a topic is not publishable without all four explanation
-- levels. Enforced in the database so the CMS cannot ship a half-written topic.
--
-- A topic cannot be created already-published, because its content rows cannot
-- exist before the topic they reference does. Publishing is therefore always a
-- second step — which also means this check can never be bypassed by inserting
-- straight into 'published'.
create or replace function public.check_topic_publishable()
returns trigger
language plpgsql
as $$
declare
  levels int;
begin
  if tg_op = 'INSERT' then
    if new.status = 'published' then
      raise exception
        'topic % cannot be created as published: add its explanation levels first, then update the status',
        new.slug;
    end if;
    return new;
  end if;

  if new.status = 'published' and old.status is distinct from 'published' then
    select count(distinct kind) into levels
    from public.topic_contents
    where topic_id = new.id
      and kind in ('beginner', 'engineer', 'enterprise', 'interview');

    if levels < 4 then
      raise exception 'topic % cannot be published: % of 4 explanation levels present', new.slug, levels;
    end if;
  end if;

  return new;
end;
$$;

create trigger topics_publishable
  before insert or update on public.topics
  for each row execute function public.check_topic_publishable();

-- ── Questions ──────────────────────────────────────────────────────────────
create table public.questions (
  id              uuid primary key default gen_random_uuid(),
  slug            citext unique not null,
  topic_id        uuid references public.topics(id) on delete set null,
  skill_id        uuid not null references public.skills(id) on delete restrict,
  kind            question_kind not null,
  prompt_md       text not null,
  difficulty      smallint not null default 3 check (difficulty between 1 and 5),
  choices         jsonb,          -- mcq: [{id, text}]
  answer_key      jsonb,          -- mcq: {correct: [id]}   short/explain: {points: []}
  rubric          jsonb,          -- AI grading rubric: {criteria: [{id, label, weight}]}
  expected_points jsonb,          -- concepts a strong answer must hit
  followup_seeds  jsonb,          -- prompts the AI interviewer may escalate to
  is_interview    boolean not null default false,
  estimated_seconds smallint not null default 120,
  status          content_status not null default 'draft',
  version         integer not null default 1,
  created_at      timestamptz not null default now(),
  updated_at      timestamptz not null default now(),
  constraint mcq_needs_choices check (kind <> 'mcq' or (choices is not null and answer_key is not null)),
  constraint graded_needs_rubric check (kind = 'mcq' or rubric is not null)
);

create index questions_skill_idx on public.questions (skill_id, difficulty);
create index questions_topic_idx on public.questions (topic_id);
create index questions_interview_idx on public.questions (is_interview) where is_interview;

-- ── Coding problems ────────────────────────────────────────────────────────
create table public.coding_problems (
  id               uuid primary key default gen_random_uuid(),
  slug             citext unique not null,
  title            text not null,
  pattern          text,          -- two-pointers, sliding-window, graph-bfs …
  difficulty       smallint not null default 3 check (difficulty between 1 and 5),
  statement_md     text not null,
  starter_code     jsonb not null default '{}'::jsonb,  -- {typescript: "...", python: "..."}
  tests            jsonb not null default '[]'::jsonb,  -- [{name, input, expected}]
  target_complexity text,                               -- "O(n log n) time, O(n) space"
  hints            jsonb not null default '[]'::jsonb,  -- ordered, each costs XP
  estimated_minutes smallint not null default 20,
  status           content_status not null default 'draft',
  created_at       timestamptz not null default now(),
  updated_at       timestamptz not null default now()
);

create index coding_problems_pattern_idx on public.coding_problems (pattern, difficulty);

create table public.coding_problem_skills (
  problem_id uuid not null references public.coding_problems(id) on delete cascade,
  skill_id   uuid not null references public.skills(id) on delete cascade,
  weight     numeric(3,2) not null default 1.0 check (weight between 0 and 1),
  primary key (problem_id, skill_id)
);

select public.attach_updated_at('public.topics');
select public.attach_updated_at('public.topic_contents');
select public.attach_updated_at('public.questions');
select public.attach_updated_at('public.coding_problems');

-- ── RLS — public_content ───────────────────────────────────────────────────

alter table public.topics                enable row level security;
alter table public.topic_contents        enable row level security;
alter table public.questions             enable row level security;
alter table public.coding_problems       enable row level security;
alter table public.coding_problem_skills enable row level security;

create policy topics_read on public.topics for select to authenticated
  using (status = 'published' or public.is_admin());
create policy topics_admin on public.topics for all to authenticated
  using (public.is_admin()) with check (public.is_admin());

create policy topic_contents_read on public.topic_contents for select to authenticated
  using (exists (select 1 from public.topics t where t.id = topic_id and (t.status = 'published' or public.is_admin())));
create policy topic_contents_admin on public.topic_contents for all to authenticated
  using (public.is_admin()) with check (public.is_admin());

-- Answer keys are deliberately readable: MCQ grading happens client-side for
-- instant feedback, and a determined user can always read the network response.
-- Cheating costs the cheater their own mastery score, which is the only score
-- that matters. Free-text rubrics are graded server-side regardless.
create policy questions_read on public.questions for select to authenticated
  using (status = 'published' or public.is_admin());
create policy questions_admin on public.questions for all to authenticated
  using (public.is_admin()) with check (public.is_admin());

create policy coding_read on public.coding_problems for select to authenticated
  using (status = 'published' or public.is_admin());
create policy coding_admin on public.coding_problems for all to authenticated
  using (public.is_admin()) with check (public.is_admin());

create policy coding_skills_read on public.coding_problem_skills for select to authenticated using (true);
create policy coding_skills_admin on public.coding_problem_skills for all to authenticated
  using (public.is_admin()) with check (public.is_admin());
