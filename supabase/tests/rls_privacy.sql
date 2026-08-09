-- ═══════════════════════════════════════════════════════════════════════════
-- RLS privacy test — INVARIANT #7
--
--   An admin JWT reads ZERO rows from every `owner_only` table.
--
-- This is the §36 guarantee. It is a database property, not a UI convention,
-- and this script is what proves it. Run after every migration:
--
--   psql "$DATABASE_URL" -v ON_ERROR_STOP=1 -f supabase/tests/rls_privacy.sql
--
-- The script rolls back, so it is safe against any environment — though you
-- should still prefer a branch database over production.
-- ═══════════════════════════════════════════════════════════════════════════

begin;

-- ── Fixtures: one ordinary user, one admin ────────────────────────────────

insert into auth.users (id, email, raw_user_meta_data)
values
  ('11111111-1111-1111-1111-111111111111', 'learner@test.local', '{}'::jsonb),
  ('22222222-2222-2222-2222-222222222222', 'admin@test.local',   '{}'::jsonb);

update public.profiles set role = 'admin'
where id = '22222222-2222-2222-2222-222222222222';

-- Private content owned by the learner.
insert into public.research_notes (user_id, kind, title, question_md, conclusion_md)
values ('11111111-1111-1111-1111-111111111111', 'notebook',
        'Why is this query slow?', 'Missing composite index?', 'It was a sequential scan.');

insert into public.mock_interviews (id, user_id, mode)
values ('33333333-3333-3333-3333-333333333333',
        '11111111-1111-1111-1111-111111111111', 'technical');

insert into public.mock_interview_turns (interview_id, user_id, turn_index, speaker, content)
values ('33333333-3333-3333-3333-333333333333',
        '11111111-1111-1111-1111-111111111111', 0, 'candidate',
        'I think Redis is just faster.');

insert into public.interview_records (user_id, role_title, stage, occurred_at, notes_md)
values ('11111111-1111-1111-1111-111111111111', 'Senior Engineer', 'technical',
        current_date, 'I froze on isolation levels and it shook me.');

insert into public.job_descriptions (user_id, title, raw_text)
values ('11111111-1111-1111-1111-111111111111', 'Staff Engineer',
        'Confidential posting text with recruiter contact details.');

-- ── Helper ────────────────────────────────────────────────────────────────

create or replace function pg_temp.assert_no_rows(tbl text, ctx text)
returns void language plpgsql as $$
declare n integer;
begin
  execute format('select count(*) from %s', tbl) into n;
  if n <> 0 then
    raise exception 'PRIVACY VIOLATION: % is readable by % (% row(s))', tbl, ctx, n;
  end if;
  raise notice 'ok: % invisible to %', tbl, ctx;
end $$;

create or replace function pg_temp.assert_rows(tbl text, ctx text)
returns void language plpgsql as $$
declare n integer;
begin
  execute format('select count(*) from %s', tbl) into n;
  if n = 0 then
    raise exception 'BROKEN ACCESS: % returns nothing for % but should', tbl, ctx;
  end if;
  raise notice 'ok: % visible to % (% row(s))', tbl, ctx, n;
end $$;

-- ── 1. The owner can read their own private content ───────────────────────

set local role authenticated;
set local request.jwt.claims = '{"sub":"11111111-1111-1111-1111-111111111111","role":"authenticated"}';

select pg_temp.assert_rows('public.research_notes',        'the owner');
select pg_temp.assert_rows('public.mock_interview_turns',  'the owner');
select pg_temp.assert_rows('public.interview_records',     'the owner');
select pg_temp.assert_rows('public.job_descriptions',      'the owner');

-- ── 2. INVARIANT #7 — admin sees none of it ───────────────────────────────

set local request.jwt.claims = '{"sub":"22222222-2222-2222-2222-222222222222","role":"authenticated"}';

select pg_temp.assert_no_rows('public.research_notes',       'an admin');
select pg_temp.assert_no_rows('public.note_links',           'an admin');
select pg_temp.assert_no_rows('public.mock_interview_turns', 'an admin');
select pg_temp.assert_no_rows('public.interview_records',    'an admin');
select pg_temp.assert_no_rows('public.job_descriptions',     'an admin');
select pg_temp.assert_no_rows('public.system_design_attempts','an admin');

-- ── 3. Admin CAN see the aggregate tables analytics is built on ───────────
-- Analytics must still work; the boundary is prose, not progress.

select pg_temp.assert_rows('public.mock_interviews', 'an admin (scores only, no transcript)');

-- ── 4. A second ordinary user sees nothing of the first ───────────────────

insert into auth.users (id, email, raw_user_meta_data)
values ('44444444-4444-4444-4444-444444444444', 'other@test.local', '{}'::jsonb);

set local request.jwt.claims = '{"sub":"44444444-4444-4444-4444-444444444444","role":"authenticated"}';

select pg_temp.assert_no_rows('public.research_notes',    'another user');
select pg_temp.assert_no_rows('public.interview_records', 'another user');
select pg_temp.assert_no_rows('public.mock_interviews',   'another user');

-- ── 5. The evidence ledger is append-only ─────────────────────────────────

set local request.jwt.claims = '{"sub":"11111111-1111-1111-1111-111111111111","role":"authenticated"}';

do $$
declare
  v_skill uuid;
  v_id uuid;
begin
  select id into v_skill from public.skills limit 1;
  if v_skill is null then
    raise notice 'skipped: append-only check needs a seeded skill library';
    return;
  end if;

  insert into public.skill_evidence
    (user_id, skill_id, source_type, difficulty, correctness, weight)
  values (auth.uid(), v_skill, 'mcq', 3, 1.0, 0.5)
  returning id into v_id;

  begin
    update public.skill_evidence set correctness = 0 where id = v_id;
    raise exception 'MUTABILITY VIOLATION: skill_evidence accepted an UPDATE';
  exception when others then
    if sqlerrm like '%append-only%' then
      raise notice 'ok: skill_evidence rejects UPDATE';
    else
      raise;
    end if;
  end;
end $$;

-- ── 6. XP cannot be awarded twice for the same source ─────────────────────

do $$
begin
  insert into public.xp_transactions (user_id, amount, source_type, source_id)
  values (auth.uid(), 40, 'coding_problem_solved', '55555555-5555-5555-5555-555555555555');

  begin
    insert into public.xp_transactions (user_id, amount, source_type, source_id)
    values (auth.uid(), 40, 'coding_problem_solved', '55555555-5555-5555-5555-555555555555');
    raise exception 'IDEMPOTENCY VIOLATION: XP was awarded twice for one source';
  exception when unique_violation then
    raise notice 'ok: duplicate XP award rejected';
  end;
end $$;

reset role;
rollback;
