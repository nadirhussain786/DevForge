-- ═══════════════════════════════════════════════════════════════════════════
-- 0017 — Make the resolution constraint survive evidence removal
--
-- `resolved_needs_evidence` required `resolved_by_evidence_id` to be non-null
-- on any resolved weakness, while the column is `ON DELETE SET NULL` against
-- `skill_evidence`. Those two rules contradict each other: the moment an
-- evidence row is removed, Postgres tries to null the reference and the CHECK
-- rejects it, so the delete fails and the table can no longer be maintained.
--
-- The invariant actually worth enforcing is that a resolved weakness records
-- WHEN it resolved. The link to the specific piece of evidence is valuable
-- provenance, but it is allowed to decay if that row is ever erased — the
-- resolution still happened.
--
-- Invariant #5 (a weakness may not be resolved by the attempt that opened it)
-- is unaffected: it lives in `not_resolved_by_opener`, which already tolerates
-- nulls on both sides.
-- ═══════════════════════════════════════════════════════════════════════════

alter table public.weaknesses
  drop constraint if exists resolved_needs_evidence;

alter table public.weaknesses
  add constraint resolved_records_when
  check (status <> 'resolved' or resolved_at is not null);

-- Resolution only ever happens through `try_resolve_weaknesses`, which always
-- supplies the evidence id. The constraint is a backstop against a hand-written
-- UPDATE, not the mechanism.
comment on constraint resolved_records_when on public.weaknesses is
  'A resolved weakness must record when it resolved. resolved_by_evidence_id is provenance and may be nulled if that evidence row is erased.';
