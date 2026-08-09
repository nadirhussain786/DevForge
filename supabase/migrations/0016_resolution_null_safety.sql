-- ═══════════════════════════════════════════════════════════════════════════
-- 0016 — Fix null-unsafe comparisons in weakness auto-resolution
--
-- `try_resolve_weaknesses` compared the candidate weakness's `source_id`
-- against the incoming evidence's with `<>`. When the new evidence has a NULL
-- `source_id` — which is legitimate: calibration answers and any evidence not
-- tied to a stored attempt row — `source_id <> NULL` evaluates to NULL rather
-- than TRUE, so the WHERE clause matched nothing and the weakness was never
-- resolved.
--
-- The symptom was silent: strong evidence at equal difficulty came in, mastery
-- moved correctly, and the weakness just stayed open forever. Caught by
-- `pnpm verify:loop` exercising the path end to end.
--
-- `is distinct from` is the null-safe comparison and is what was meant
-- throughout: "a different attempt from the one that opened this".
-- ═══════════════════════════════════════════════════════════════════════════

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
      -- Null-safe: NULL source_id on either side must still count as
      -- "a different attempt", not as an unknown that fails the filter.
      and w.source_id is distinct from new.source_id
  loop
    if new.difficulty >= v_opening_difficulty then
      update public.weaknesses
         set status = 'resolved',
             resolved_at = now(),
             resolved_by_evidence_id = new.id
       where user_id = new.user_id
         and skill_id = new.skill_id
         and status in ('open', 'researching', 'retesting')
         and source_id is distinct from new.source_id;
    end if;
  end loop;

  return new;
end;
$$;

-- The same null-unsafe shape in the constraint that enforces invariant #5.
-- With a NULL source_id, `resolved_by_evidence_id <> source_id` yields NULL,
-- which a CHECK treats as satisfied — so the guard quietly stopped guarding.
alter table public.weaknesses
  drop constraint if exists not_resolved_by_opener;

alter table public.weaknesses
  add constraint not_resolved_by_opener
  check (
    resolved_by_evidence_id is null
    or source_id is null
    or resolved_by_evidence_id is distinct from source_id
  );
