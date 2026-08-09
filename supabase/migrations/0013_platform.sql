-- ═══════════════════════════════════════════════════════════════════════════
-- 0013 — Events, notifications, audit, AI metering, rate limiting
-- ═══════════════════════════════════════════════════════════════════════════

-- Append-only. The ONLY source for product analytics — admin dashboards never
-- query domain tables, so they can never accidentally reach private content.
create table public.user_events (
  id          bigint generated always as identity,
  user_id     uuid not null references auth.users(id) on delete cascade,
  name        text not null,
  payload     jsonb not null default '{}'::jsonb,
  session_id  uuid,
  occurred_at timestamptz not null default now(),
  primary key (id, occurred_at)
) partition by range (occurred_at);

-- Monthly partitions; the cron job creates the next month ahead of time.
create or replace function public.ensure_event_partition(p_month date)
returns void
language plpgsql
as $$
declare
  v_start date := date_trunc('month', p_month)::date;
  v_end   date := (date_trunc('month', p_month) + interval '1 month')::date;
  v_name  text := format('user_events_%s', to_char(v_start, 'YYYY_MM'));
begin
  if to_regclass(format('public.%I', v_name)) is null then
    execute format(
      'create table public.%I partition of public.user_events for values from (%L) to (%L)',
      v_name, v_start, v_end
    );
    execute format('create index %I on public.%I (user_id, occurred_at desc)', v_name || '_user_idx', v_name);
    execute format('create index %I on public.%I (name, occurred_at desc)', v_name || '_name_idx', v_name);
  end if;
end;
$$;

select public.ensure_event_partition(current_date);
select public.ensure_event_partition((current_date + interval '1 month')::date);

create table public.notifications (
  id         uuid primary key default gen_random_uuid(),
  user_id    uuid not null references auth.users(id) on delete cascade,
  kind       text not null,
  title      text not null,
  body       text,
  action_url text,
  read_at    timestamptz,
  created_at timestamptz not null default now()
);

create index notifications_user_idx on public.notifications (user_id, created_at desc) where read_at is null;

create table public.admin_audit_logs (
  id          bigint generated always as identity primary key,
  actor_id    uuid not null references auth.users(id) on delete set null,
  action      text not null,
  target_type text,
  target_id   uuid,
  meta        jsonb not null default '{}'::jsonb,
  occurred_at timestamptz not null default now()
);

create index audit_actor_idx on public.admin_audit_logs (actor_id, occurred_at desc);
create index audit_target_idx on public.admin_audit_logs (target_type, target_id);

create trigger audit_immutable
  before update or delete on public.admin_audit_logs
  for each row execute function public.forbid_mutation();

create table public.ai_usage (
  id            bigint generated always as identity primary key,
  user_id       uuid not null references auth.users(id) on delete cascade,
  feature       text not null,
  model         text not null,
  input_tokens  integer not null default 0,
  output_tokens integer not null default 0,
  cost_usd      numeric(10,6) not null default 0,
  occurred_at   timestamptz not null default now()
);

create index ai_usage_user_day_idx on public.ai_usage (user_id, occurred_at desc);

-- Token bucket, in Postgres, so rate limiting needs no external dependency.
create table public.rate_limit_buckets (
  key         text primary key,
  tokens      numeric not null,
  refilled_at timestamptz not null default now()
);

create or replace function public.consume_rate_limit(
  p_key      text,
  p_capacity numeric,
  p_refill_per_minute numeric,
  p_cost     numeric default 1
)
returns boolean
language plpgsql
security definer
set search_path = public, pg_temp
as $$
declare
  v_tokens numeric;
  v_last   timestamptz;
begin
  insert into public.rate_limit_buckets (key, tokens)
  values (p_key, p_capacity)
  on conflict (key) do nothing;

  select tokens, refilled_at into v_tokens, v_last
  from public.rate_limit_buckets where key = p_key for update;

  v_tokens := least(
    p_capacity,
    v_tokens + extract(epoch from (now() - v_last)) / 60.0 * p_refill_per_minute
  );

  if v_tokens < p_cost then
    update public.rate_limit_buckets set tokens = v_tokens, refilled_at = now() where key = p_key;
    return false;
  end if;

  update public.rate_limit_buckets
     set tokens = v_tokens - p_cost, refilled_at = now()
   where key = p_key;
  return true;
end;
$$;

-- ── RLS ────────────────────────────────────────────────────────────────────

alter table public.user_events        enable row level security;
alter table public.notifications      enable row level security;
alter table public.admin_audit_logs   enable row level security;
alter table public.ai_usage           enable row level security;
alter table public.rate_limit_buckets enable row level security;

create policy events_own_insert on public.user_events for insert to authenticated with check (user_id = auth.uid());
create policy events_own_read on public.user_events for select to authenticated using (user_id = auth.uid());
create policy events_admin_read on public.user_events for select to authenticated using (public.is_admin());

create policy notifications_own on public.notifications for all to authenticated
  using (user_id = auth.uid()) with check (user_id = auth.uid());

create policy audit_admin_read on public.admin_audit_logs for select to authenticated using (public.is_admin());
create policy audit_admin_insert on public.admin_audit_logs for insert to authenticated with check (public.is_admin());

create policy ai_usage_own on public.ai_usage for select to authenticated using (user_id = auth.uid());
create policy ai_usage_admin_read on public.ai_usage for select to authenticated using (public.is_admin());

-- No policy on rate_limit_buckets: reachable only through the SECURITY DEFINER
-- function above. A table with RLS on and no policy is unreadable by design.
