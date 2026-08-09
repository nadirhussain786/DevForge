-- ═══════════════════════════════════════════════════════════════════════════
-- 0015 — Account deletion, done as soft delete
--
-- Hard-deleting an account was impossible: `skill_evidence` is ON DELETE
-- CASCADE, and its append-only trigger refused the cascade, so
-- `auth.admin.deleteUser` failed with an opaque "Database error deleting user".
--
-- Rather than weaken the append-only guarantee to make hard delete work, we
-- keep the ledger immutable and delete accounts the way this product should
-- anyway:
--
--   * erase the personal data     — profile identity and every owner_only row
--   * keep the pseudonymous trail — evidence, attempts, and events, which
--     carry no personal data and are what the curriculum analytics in §34 are
--     built from
--   * block access                — the account can no longer sign in
--
-- That satisfies erasure (nothing identifying survives) without corrupting
-- aggregate learning data or rewriting an append-only ledger.
-- ═══════════════════════════════════════════════════════════════════════════

alter table public.profiles
  add column if not exists deleted_at timestamptz;

comment on column public.profiles.deleted_at is
  'Set by public.soft_delete_account(). Identity fields are scrubbed at the same time; the row is retained so pseudonymous evidence keeps a valid owner reference.';

create index if not exists profiles_active_idx on public.profiles (id) where deleted_at is null;

-- ── Make the blocked hard delete explain itself ────────────────────────────
-- Without this the failure surfaces as "Database error deleting user", which
-- tells an operator nothing about what to do instead.
create or replace function public.forbid_mutation()
returns trigger
language plpgsql
as $$
begin
  if tg_op = 'DELETE' then
    raise exception
      '% is append-only and cannot be deleted. To remove an account, call public.soft_delete_account(user_id), which erases personal data and blocks sign-in while leaving the pseudonymous ledger intact.',
      tg_table_name;
  end if;

  raise exception '% is append-only', tg_table_name;
end;
$$;

-- ── The erasure routine ────────────────────────────────────────────────────
--
-- SECURITY DEFINER because it must reach `auth.users` and delete rows in
-- owner_only tables that the caller may not own. Callable by the account
-- itself or by a super admin — never by one ordinary user against another.
create or replace function public.soft_delete_account(p_user uuid)
returns void
language plpgsql
security definer
set search_path = public, auth, pg_temp
as $$
declare
  v_caller uuid := auth.uid();
begin
  if v_caller is null then
    raise exception 'soft_delete_account requires an authenticated caller';
  end if;

  if v_caller <> p_user and not public.is_super_admin() then
    raise exception 'only the account owner or a super admin may delete this account';
  end if;

  -- 1. Erase personal content outright. These are the owner_only tables — the
  --    notebook, interview reflections, and pasted job descriptions — and they
  --    are the rows that actually contain personal narrative.
  delete from public.research_notes       where user_id = p_user;
  delete from public.note_links           where user_id = p_user;
  delete from public.mock_interview_turns where user_id = p_user;
  delete from public.job_descriptions     where user_id = p_user;
  update public.interview_records set notes_md = null where user_id = p_user;
  update public.applications      set notes_md = null where user_id = p_user;
  delete from public.notifications        where user_id = p_user;

  -- 2. Scrub identity from the profile, keeping the row so the pseudonymous
  --    ledger still references a valid owner.
  update public.profiles
     set display_name = null,
         handle       = null,
         avatar_url   = null,
         timezone     = 'UTC',
         deleted_at   = coalesce(deleted_at, now())
   where id = p_user;

  -- 3. Scrub the auth identity and block sign-in. The row is retained because
  --    deleting it would cascade into the append-only ledger.
  update auth.users
     set email              = concat('deleted-', p_user, '@invalid.local'),
         phone              = null,
         raw_user_meta_data = '{}'::jsonb,
         banned_until       = 'infinity'::timestamptz
   where id = p_user;
end;
$$;

revoke execute on function public.soft_delete_account(uuid) from public;
grant execute on function public.soft_delete_account(uuid) to authenticated;

-- ── Keep deleted accounts out of the product ──────────────────────────────
-- `is_admin()` must not return true for a scrubbed account, or a deleted admin
-- would keep its powers if the ban were ever lifted.
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
      and deleted_at is null
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
      and deleted_at is null
  );
$$;
