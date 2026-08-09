-- ═══════════════════════════════════════════════════════════════════════════
-- 0009 — Engineering Notebook and R&D Lab
--
-- ⚠ PRIVACY CRITICAL. These tables are `owner_only`: their policies have NO
-- admin clause, deliberately. An admin JWT must read zero rows here. See
-- docs/01-technical-architecture.md §6 and the RLS test suite.
--
-- §13 (Notebook) and §14 (R&D Lab) are the same shape with different UI
-- emphasis, discriminated by `kind` rather than duplicated across two tables.
-- ═══════════════════════════════════════════════════════════════════════════

create table public.research_notes (
  id                      uuid primary key default gen_random_uuid(),
  user_id                 uuid not null references auth.users(id) on delete cascade,
  kind                    note_kind not null default 'notebook',
  title                   text not null,
  topic_id                uuid references public.topics(id) on delete set null,
  skill_id                uuid references public.skills(id) on delete set null,

  question_md             text,
  hypothesis_md           text,
  research_md             text,
  experiment_md           text,
  code_md                 text,
  result_md               text,
  evidence_md             text,
  conclusion_md           text,
  -- Completing this section is what converts a note into skill evidence:
  -- research only counts once you can explain it.
  interview_explanation_md text,
  open_questions_md       text,

  confidence              smallint check (confidence between 1 and 5),
  tags                    text[] not null default '{}',
  status                  plan_item_status not null default 'in_progress',
  completed_at            timestamptz,
  created_at              timestamptz not null default now(),
  updated_at              timestamptz not null default now(),

  search_tsv tsvector generated always as (
    setweight(to_tsvector('english', coalesce(title, '')), 'A') ||
    setweight(to_tsvector('english', coalesce(question_md, '')), 'B') ||
    setweight(to_tsvector('english', coalesce(conclusion_md, '')), 'B') ||
    setweight(to_tsvector('english', coalesce(interview_explanation_md, '')), 'B') ||
    setweight(to_tsvector('english',
      coalesce(hypothesis_md, '') || ' ' || coalesce(research_md, '') || ' ' ||
      coalesce(experiment_md, '') || ' ' || coalesce(result_md, '') || ' ' ||
      coalesce(evidence_md, '')), 'C')
  ) stored
);

create index research_notes_user_idx on public.research_notes (user_id, updated_at desc);
create index research_notes_search_idx on public.research_notes using gin (search_tsv);
create index research_notes_tags_idx on public.research_notes using gin (tags);

create table public.note_links (
  id            uuid primary key default gen_random_uuid(),
  note_id       uuid not null references public.research_notes(id) on delete cascade,
  user_id       uuid not null references auth.users(id) on delete cascade,
  item_ref_type ref_type not null,
  item_ref_id   uuid not null,
  created_at    timestamptz not null default now(),
  unique (note_id, item_ref_type, item_ref_id)
);

-- Deferred FK from 0008.
alter table public.research_tasks
  add constraint research_tasks_note_fk
  foreign key (note_id) references public.research_notes(id) on delete set null;

select public.attach_updated_at('public.research_notes');

-- ── RLS — owner_only. Do NOT add an admin policy to these tables. ─────────

alter table public.research_notes enable row level security;
alter table public.note_links     enable row level security;
alter table public.research_notes force row level security;
alter table public.note_links     force row level security;

create policy notes_owner_only on public.research_notes for all to authenticated
  using (user_id = auth.uid()) with check (user_id = auth.uid());

create policy note_links_owner_only on public.note_links for all to authenticated
  using (user_id = auth.uid()) with check (user_id = auth.uid());
