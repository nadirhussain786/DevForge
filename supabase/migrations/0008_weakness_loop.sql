-- ═══════════════════════════════════════════════════════════════════════════
-- 0008 — Failure → Skill: weaknesses, revision, research tasks
--
-- The signature loop (§12). Failure is an input event, not a dead end.
-- ═══════════════════════════════════════════════════════════════════════════

create table public.weaknesses (
  id                     uuid primary key default gen_random_uuid(),
  user_id                uuid not null references auth.users(id) on delete cascade,
  skill_id               uuid not null references public.skills(id) on delete cascade,
  severity               smallint not null default 1 check (severity between 1 and 3),
  status                 weakness_status not null default 'open',
  source_type            evidence_source not null,
  source_id              uuid,
  evidence               jsonb not null default '{}'::jsonb,
  opened_at              timestamptz not null default now(),
  resolved_at            timestamptz,
  resolved_by_evidence_id uuid references public.skill_evidence(id) on delete set null,

  -- Invariant #5: a weakness can never be resolved by the attempt that opened
  -- it. Re-answering the same question you just failed proves nothing.
  constraint not_resolved_by_opener
    check (resolved_by_evidence_id is null or resolved_by_evidence_id <> source_id),
  constraint resolved_needs_evidence
    check (status <> 'resolved' or resolved_by_evidence_id is not null)
);

-- One live weakness per skill per user; resolved ones accumulate as history.
create unique index weaknesses_one_open
  on public.weaknesses (user_id, skill_id)
  where status in ('open', 'researching', 'retesting');

create index weaknesses_user_idx on public.weaknesses (user_id, status, severity desc);
create index weaknesses_skill_idx on public.weaknesses (skill_id) where status <> 'resolved';

-- ── Revision queue (SM-2 lite) ─────────────────────────────────────────────

create table public.revision_items (
  id               uuid primary key default gen_random_uuid(),
  user_id          uuid not null references auth.users(id) on delete cascade,
  weakness_id      uuid references public.weaknesses(id) on delete cascade,
  skill_id         uuid not null references public.skills(id) on delete cascade,
  item_ref_type    ref_type not null,
  item_ref_id      uuid,
  due_at           timestamptz not null default now(),
  interval_days    smallint not null default 1,
  ease             numeric(3,2) not null default 2.5 check (ease between 1.3 and 2.8),
  repetitions      smallint not null default 0,
  last_result      boolean,
  last_reviewed_at timestamptz,
  retired_at       timestamptz,
  created_at       timestamptz not null default now()
);

-- The daily planner queries this constantly: "what is due for me right now".
create index revision_due_idx on public.revision_items (user_id, due_at)
  where retired_at is null;

create table public.research_tasks (
  id           uuid primary key default gen_random_uuid(),
  user_id      uuid not null references auth.users(id) on delete cascade,
  weakness_id  uuid references public.weaknesses(id) on delete cascade,
  skill_id     uuid not null references public.skills(id) on delete cascade,
  prompt_md    text not null,
  status       plan_item_status not null default 'pending',
  note_id      uuid,   -- FK added in 0009, after research_notes exists
  completed_at timestamptz,
  created_at   timestamptz not null default now()
);

create index research_tasks_user_idx on public.research_tasks (user_id, status);

-- ── Auto-resolution ────────────────────────────────────────────────────────
-- New evidence scoring >= 0.75 at difficulty >= the difficulty that opened the
-- weakness moves it to resolved. Anything weaker leaves it open.
create or replace function public.try_resolve_weaknesses()
returns trigger
language plpgsql
security definer
set search_path = public, pg_temp
as $$
declare
  v_opening_difficulty smallint;
begin
  if new.correctness < 0.75 then
    return new;
  end if;

  for v_opening_difficulty in
    select coalesce((w.evidence ->> 'difficulty')::smallint, 1)
    from public.weaknesses w
    where w.user_id = new.user_id
      and w.skill_id = new.skill_id
      and w.status in ('open', 'researching', 'retesting')
      and (w.source_id is null or w.source_id <> new.source_id)
  loop
    if new.difficulty >= v_opening_difficulty then
      update public.weaknesses
         set status = 'resolved',
             resolved_at = now(),
             resolved_by_evidence_id = new.id
       where user_id = new.user_id
         and skill_id = new.skill_id
         and status in ('open', 'researching', 'retesting')
         and (source_id is null or source_id <> new.source_id);
    end if;
  end loop;

  return new;
end;
$$;

create trigger evidence_resolves_weakness
  after insert on public.skill_evidence
  for each row execute function public.try_resolve_weaknesses();

-- ── RLS — owner_plus_admin (skills and statuses are analytics input) ───────

alter table public.weaknesses     enable row level security;
alter table public.revision_items enable row level security;
alter table public.research_tasks enable row level security;

create policy weaknesses_own on public.weaknesses for all to authenticated
  using (user_id = auth.uid()) with check (user_id = auth.uid());
create policy weaknesses_admin_read on public.weaknesses for select to authenticated using (public.is_admin());

create policy revision_own on public.revision_items for all to authenticated
  using (user_id = auth.uid()) with check (user_id = auth.uid());
create policy revision_admin_read on public.revision_items for select to authenticated using (public.is_admin());

create policy research_tasks_own on public.research_tasks for all to authenticated
  using (user_id = auth.uid()) with check (user_id = auth.uid());
create policy research_tasks_admin_read on public.research_tasks for select to authenticated using (public.is_admin());
