-- ═══════════════════════════════════════════════════════════════════════════
-- 0014 — Admin analytics
--
-- Built ONLY from user_events and owner_plus_admin tables. Nothing here reads
-- research_notes, mock_interview_turns, interview_records, job_descriptions,
-- or system_design_attempts — that is the §36 privacy guarantee in practice.
-- ═══════════════════════════════════════════════════════════════════════════

create materialized view public.mv_daily_active_users as
  select occurred_at::date as day,
         count(distinct user_id) as dau
  from public.user_events
  group by 1;

create unique index mv_dau_day_idx on public.mv_daily_active_users (day);

create materialized view public.mv_engagement_rollup as
  with days as (
    select occurred_at::date as day, user_id
    from public.user_events
    group by 1, 2
  )
  select d.day,
         count(distinct d.user_id) as dau,
         (select count(distinct w.user_id) from days w
           where w.day between d.day - 6 and d.day) as wau,
         (select count(distinct m.user_id) from days m
           where m.day between d.day - 29 and d.day) as mau
  from days d
  group by d.day;

create unique index mv_engagement_day_idx on public.mv_engagement_rollup (day);

-- Cohort retention by signup week.
create materialized view public.mv_retention_cohorts as
  with cohort as (
    select id as user_id, date_trunc('week', created_at)::date as cohort_week
    from public.profiles
  ),
  activity as (
    select e.user_id,
           c.cohort_week,
           floor(extract(epoch from (e.occurred_at - c.cohort_week)) / 604800)::int as week_offset
    from public.user_events e
    join cohort c on c.user_id = e.user_id
  )
  select cohort_week,
         week_offset,
         count(distinct user_id) as users
  from activity
  where week_offset between 0 and 12
  group by 1, 2;

create unique index mv_retention_idx on public.mv_retention_cohorts (cohort_week, week_offset);

-- §34 — "what are users struggling with?"
--
-- Separates *hard* from *badly explained*: high failure with on-estimate time
-- is genuinely difficult; high failure with time far over estimate means the
-- explanation is not doing its job.
create materialized view public.mv_topic_difficulty as
  select t.id as topic_id,
         t.slug,
         t.title,
         t.difficulty,
         t.estimated_minutes,
         count(qa.id)                                        as attempts,
         count(distinct qa.user_id)                          as users,
         avg(qa.score)::numeric(4,3)                         as avg_score,
         (count(*) filter (where qa.score < 0.6))::numeric
           / nullif(count(qa.id), 0)                         as failure_rate,
         avg(qa.seconds)::numeric(8,1)                       as avg_seconds
  from public.topics t
  left join public.questions q on q.topic_id = t.id
  left join public.question_attempts qa on qa.question_id = q.id
  group by t.id, t.slug, t.title, t.difficulty, t.estimated_minutes;

create unique index mv_topic_difficulty_idx on public.mv_topic_difficulty (topic_id);

create materialized view public.mv_question_failure_rates as
  select q.id as question_id,
         q.slug,
         q.skill_id,
         q.difficulty,
         count(qa.id) as attempts,
         avg(qa.score)::numeric(4,3) as avg_score,
         (count(*) filter (where qa.score < 0.6))::numeric
           / nullif(count(qa.id), 0) as failure_rate
  from public.questions q
  join public.question_attempts qa on qa.question_id = q.id
  group by q.id, q.slug, q.skill_id, q.difficulty
  having count(qa.id) >= 5;

create unique index mv_question_failure_idx on public.mv_question_failure_rates (question_id);

create materialized view public.mv_common_weaknesses as
  select w.skill_id,
         s.slug,
         s.name,
         d.name as domain,
         count(*) filter (where w.status <> 'resolved') as open_count,
         count(*) as total_count,
         avg(w.severity)::numeric(3,2) as avg_severity,
         avg(extract(epoch from (coalesce(w.resolved_at, now()) - w.opened_at)) / 86400)::numeric(6,1)
           as avg_days_to_resolve
  from public.weaknesses w
  join public.skills s on s.id = w.skill_id
  join public.domains d on d.id = s.domain_id
  group by w.skill_id, s.slug, s.name, d.name;

create unique index mv_common_weaknesses_idx on public.mv_common_weaknesses (skill_id);

create materialized view public.mv_roadmap_completion as
  select r.id as roadmap_id,
         r.user_id,
         r.role_track_id,
         r.weeks,
         count(ri.id) as total_items,
         count(*) filter (where ri.status = 'completed') as completed_items,
         (count(*) filter (where ri.status = 'completed'))::numeric
           / nullif(count(ri.id), 0) as completion_rate
  from public.roadmaps r
  left join public.roadmap_items ri on ri.roadmap_id = r.id
  where r.status = 'active'
  group by r.id, r.user_id, r.role_track_id, r.weeks;

create unique index mv_roadmap_completion_idx on public.mv_roadmap_completion (roadmap_id);

-- Curriculum growth signal: what employers ask for that we cannot teach yet.
create materialized view public.mv_curriculum_gaps as
  select normalized_label,
         count(*) as mentions,
         count(*) filter (where kind = 'required') as required_mentions,
         count(distinct user_id) as users
  from public.jd_requirements
  where skill_id is null
  group by normalized_label;

create unique index mv_curriculum_gaps_idx on public.mv_curriculum_gaps (normalized_label);

-- ── Refresh ────────────────────────────────────────────────────────────────

create or replace function public.refresh_analytics()
returns void
language plpgsql
security definer
set search_path = public, pg_temp
as $$
begin
  refresh materialized view concurrently public.mv_daily_active_users;
  refresh materialized view concurrently public.mv_engagement_rollup;
  refresh materialized view concurrently public.mv_retention_cohorts;
  refresh materialized view concurrently public.mv_topic_difficulty;
  refresh materialized view concurrently public.mv_question_failure_rates;
  refresh materialized view concurrently public.mv_common_weaknesses;
  refresh materialized view concurrently public.mv_roadmap_completion;
  refresh materialized view concurrently public.mv_curriculum_gaps;
end;
$$;

-- Materialized views cannot carry RLS. They are readable only through the
-- service-role client in /api/cron and admin server actions that have already
-- verified is_admin(); no grant is issued to `authenticated`.
revoke all on public.mv_daily_active_users      from anon, authenticated;
revoke all on public.mv_engagement_rollup       from anon, authenticated;
revoke all on public.mv_retention_cohorts       from anon, authenticated;
revoke all on public.mv_topic_difficulty        from anon, authenticated;
revoke all on public.mv_question_failure_rates  from anon, authenticated;
revoke all on public.mv_common_weaknesses       from anon, authenticated;
revoke all on public.mv_roadmap_completion      from anon, authenticated;
revoke all on public.mv_curriculum_gaps         from anon, authenticated;
