-- ═══════════════════════════════════════════════════════════════════════════
-- 0001 — Extensions, enums, and shared helpers
-- ═══════════════════════════════════════════════════════════════════════════

create extension if not exists pgcrypto;
create extension if not exists citext;

-- ── Enums ──────────────────────────────────────────────────────────────────

create type app_role           as enum ('user', 'admin', 'super_admin');
create type experience_level   as enum ('beginner', 'junior', 'mid', 'senior', 'staff', 'transition');
create type user_phase         as enum ('onboarding', 'phase1', 'phase2');
create type skill_rank         as enum ('novice', 'familiar', 'working', 'proficient', 'strong', 'expert');
create type content_status     as enum ('draft', 'in_review', 'published', 'archived');
create type question_kind      as enum ('mcq', 'short_answer', 'explain', 'followup');

-- Ordered by evidence strength — see docs/02-domain-engines.md §2.
create type evidence_source    as enum (
  'mcq', 'short_answer', 'research_note', 'explanation', 'coding_attempt',
  'mock_interview_turn', 'system_design_attempt', 'boss_battle',
  'incident_run', 'real_interview_question', 'calibration'
);

create type loop_stage         as enum ('learn', 'build', 'explain', 'test', 'research', 'apply', 'interview', 'review');
create type plan_item_status   as enum ('pending', 'in_progress', 'completed', 'skipped', 'deferred');
create type weakness_status    as enum ('open', 'researching', 'retesting', 'resolved', 'dismissed');
create type roadmap_status     as enum ('active', 'superseded', 'draft');
create type ref_type           as enum (
  'topic', 'question', 'question_set', 'coding_problem', 'system_design_case',
  'boss_battle', 'incident_scenario', 'project_milestone', 'research_task', 'weekly_mission'
);

create type application_status as enum (
  'saved', 'preparing', 'applied', 'recruiter_screen', 'technical_screen',
  'technical_interview', 'system_design', 'behavioral', 'final',
  'offer', 'rejected', 'withdrawn'
);

create type interview_stage    as enum ('recruiter', 'technical_screen', 'technical', 'system_design', 'behavioral', 'final', 'take_home');
create type answer_quality     as enum ('strong', 'shaky', 'failed', 'unanswered');
create type gap_class          as enum ('strong', 'partial', 'gap', 'critical');
create type requirement_kind   as enum ('required', 'preferred');
create type note_kind          as enum ('notebook', 'experiment');
create type explanation_level  as enum ('beginner', 'engineer', 'enterprise', 'interview');

create type content_kind       as enum (
  'beginner', 'engineer', 'enterprise', 'interview', 'visual', 'code',
  'scenario', 'mistakes', 'tradeoffs', 'performance', 'security'
);

create type plan_item_source   as enum ('roadmap', 'revision', 'weakness', 'jd');

-- ── Helpers ────────────────────────────────────────────────────────────────

-- SECURITY DEFINER so it can read `profiles` without re-entering that table's
-- own RLS policies. A policy on `profiles` that subqueried `profiles` directly
-- would recurse infinitely.
create or replace function public.is_admin()
returns boolean
language sql
stable
security definer
set search_path = public, pg_temp
as $$
  select exists (
    select 1
    from public.profiles
    where id = auth.uid()
      and role in ('admin', 'super_admin')
  );
$$;

create or replace function public.is_super_admin()
returns boolean
language sql
stable
security definer
set search_path = public, pg_temp
as $$
  select exists (
    select 1
    from public.profiles
    where id = auth.uid()
      and role = 'super_admin'
  );
$$;

revoke execute on function public.is_admin() from public;
revoke execute on function public.is_super_admin() from public;
grant execute on function public.is_admin() to authenticated;
grant execute on function public.is_super_admin() to authenticated;

create or replace function public.set_updated_at()
returns trigger
language plpgsql
as $$
begin
  new.updated_at := now();
  return new;
end;
$$;

-- Applied to every table with an `updated_at` column.
create or replace function public.attach_updated_at(tbl regclass)
returns void
language plpgsql
as $$
begin
  execute format(
    'create trigger set_updated_at before update on %s
     for each row execute function public.set_updated_at()', tbl
  );
end;
$$;
