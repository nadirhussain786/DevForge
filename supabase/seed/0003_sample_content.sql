-- ═══════════════════════════════════════════════════════════════════════════
-- Seed 0003 — Sample content
--
-- Two fully authored topics that demonstrate the content contract: four
-- explanation levels that escalate from beginner to interview framing, plus
-- rubric-backed questions and a coding problem.
--
-- This is the shape every topic must follow. Week 1–2 depth for the full-stack
-- track is authored the same way — see docs/07-implementation-roadmap.md.
-- ═══════════════════════════════════════════════════════════════════════════

-- ── Topic: PostgreSQL indexing ─────────────────────────────────────────────

insert into public.topics (slug, skill_id, title, summary, estimated_minutes, difficulty, sort_order)
select 'postgres-indexing-basics', s.id,
       'How PostgreSQL Indexes Actually Work',
       'B-Tree structure, when the planner uses an index, and when it refuses to.',
       15, 3, 1
from public.skills s where s.slug = 'postgres-indexing'
on conflict (slug) do nothing;

insert into public.topic_contents (topic_id, kind, body_md, sort_order)
select t.id, v.kind, v.body, 0
from (values
  ('beginner', E'An index is a lookup structure that lets the database find rows without reading the whole table.\n\nWithout one, finding `WHERE email = ''a@b.com''` means checking every row — a **sequential scan**. With one, the database jumps almost straight to the answer.\n\nThe cost: every index has to be updated on every write, and it takes disk space.'),
  ('engineer', E'PostgreSQL''s default index is a **B-Tree**: a balanced tree where each node holds sorted keys and pointers. Lookups, range scans, and ordered reads are all `O(log n)`.\n\nThat structure explains what a B-Tree can and cannot do:\n\n- `WHERE created_at > now() - interval ''7 days''` — works, ranges are contiguous in a sorted tree\n- `ORDER BY created_at DESC LIMIT 10` — works, the tree is already ordered\n- `WHERE lower(email) = $1` — does **not** work against an index on `email`; the expression is not what was indexed. You need an expression index on `lower(email)`\n\n**Composite indexes are ordered.** An index on `(tenant_id, created_at)` serves `WHERE tenant_id = $1 ORDER BY created_at`, but does little for `WHERE created_at > $1` alone — that''s the leading-column rule.'),
  ('enterprise', E'At scale, indexing stops being about a single query and becomes a set of trade-offs you own.\n\n**Write amplification.** Each index multiplies the cost of every `INSERT`/`UPDATE`. A hot table with eight indexes can spend more time maintaining them than writing rows.\n\n**The planner is cost-based, not rule-based.** It will ignore a perfectly good index when its statistics say a sequential scan is cheaper — typically when the predicate matches a large fraction of the table, or when `ANALYZE` has gone stale. An index that "isn''t being used" is usually a statistics problem, not a missing-index problem.\n\n**Bloat and locking.** Indexes fragment as rows churn. `REINDEX CONCURRENTLY` and `CREATE INDEX CONCURRENTLY` avoid the exclusive lock that would otherwise take a production table offline.\n\n**Covering indexes** (`INCLUDE`) allow index-only scans, skipping the heap entirely — at the cost of a larger index and more write overhead.\n\nThe operational rule: add indexes from measured slow queries, not from guesses, and measure the write cost after.'),
  ('interview', E'**"How would you optimise a slow production query?"**\n\nA strong answer follows evidence, not instinct:\n\n1. **Measure first.** `EXPLAIN (ANALYZE, BUFFERS)` — is it a sequential scan, a bad join order, or a spill to disk? Look at actual vs estimated rows: a large gap means stale statistics.\n2. **Understand the access pattern** before adding anything. Which columns filter, which sort, what''s the selectivity?\n3. **Then** consider an index, with the correct leading column for the predicate.\n4. **State the cost out loud.** "This speeds up the read but adds write overhead on a table taking 2k inserts/second — worth it here because reads outnumber writes 50:1."\n5. **Deploy safely.** `CREATE INDEX CONCURRENTLY` so you don''t lock the table.\n\n**The follow-up you should expect:** *"You added the index and the query is still slow. Now what?"*\n\nGood answers: the planner isn''t using it (check `EXPLAIN` again, check statistics), the predicate isn''t sargable (a function wraps the column), selectivity is too low to help, or the bottleneck was never the scan — it was the sort, the join, or lock contention.'),
  ('mistakes', E'- Indexing every column "just in case" — write cost with no measured read benefit\n- Wrapping the indexed column in a function (`WHERE lower(email) = $1`) and wondering why the index is skipped\n- Getting composite column order backwards\n- Creating indexes without `CONCURRENTLY` on a live table\n- Concluding "the index doesn''t work" when the real cause is stale statistics'),
  ('tradeoffs', E'| Gain | Cost |\n|---|---|\n| Faster reads on the indexed predicate | Slower writes on every insert and update |\n| Ordered results without a sort | Disk space, often 10–30% of table size |\n| Index-only scans with `INCLUDE` | Larger index, more write amplification |\n| More index options for the planner | More planning time and more ways to choose wrong |')
) as v(kind, body)
cross join public.topics t
where t.slug = 'postgres-indexing-basics'
on conflict (topic_id, kind, sort_order) do update set body_md = excluded.body_md;

update public.topics set status = 'published' where slug = 'postgres-indexing-basics';

-- ── Topic: Idempotency ─────────────────────────────────────────────────────

insert into public.topics (slug, skill_id, title, summary, estimated_minutes, difficulty, sort_order)
select 'idempotency-webhooks', s.id,
       'Idempotency and Duplicate Delivery',
       'Why a webhook arrives twice, and what to do about it.',
       15, 4, 1
from public.skills s where s.slug = 'idempotency'
on conflict (slug) do nothing;

insert into public.topic_contents (topic_id, kind, body_md, sort_order)
select t.id, v.kind, v.body, 0
from (values
  ('beginner', E'An operation is **idempotent** if doing it twice has the same effect as doing it once.\n\nDeleting a file is idempotent — delete it again and it''s still gone. Charging a card is not: do it twice and the customer pays twice.'),
  ('engineer', E'Networks cannot deliver a message exactly once. A sender that gets no acknowledgement cannot tell whether the request was lost on the way *out* or the response was lost on the way *back* — so it retries, and the receiver may see the same request twice.\n\nThis is why almost every payment provider delivers webhooks **at least once**, and why "exactly-once delivery" is a marketing phrase rather than an engineering one.\n\nThe practical fix is exactly-once *processing*, built from at-least-once delivery plus deduplication:\n\n```sql\ncreate table processed_events (\n  event_id text primary key,\n  processed_at timestamptz not null default now()\n);\n```\n\n```ts\nawait db.transaction(async (tx) => {\n  // The primary key does the work. A duplicate raises a conflict and the\n  // side effect below never runs.\n  await tx.insert(processedEvents).values({ eventId: event.id })\n  await applySideEffect(tx, event)\n})\n```\n\nThe dedup record and the side effect must share **one transaction**. Split them and a crash in between produces either a double charge or a silently dropped event.'),
  ('enterprise', E'Idempotency is a system property, not a function property.\n\n**Choosing the key.** Prefer the producer''s event ID over a hash of the payload — providers legitimately resend identical payloads for different events. Where the client initiates, require a client-supplied `Idempotency-Key` header and store the *response* against it, so a retry returns the original result rather than reprocessing.\n\n**Retention.** Dedup tables grow forever unless you prune. Retention must exceed the longest retry window of every upstream provider — 30 days is common; a 24-hour window will silently start double-processing.\n\n**Ordering is a separate problem.** Deduplication does not give you ordering. A `subscription.updated` may arrive before `subscription.created`. Version each entity and reject stale writes.\n\n**Partial failure.** If processing touches an external system as well as your database, you cannot make both atomic. Use the transactional outbox pattern: commit the state change and an outbox row together, then deliver from the outbox — itself at-least-once, into a consumer that is idempotent.\n\n**Observability.** Track the duplicate rate. A sudden spike usually means an upstream provider is retrying because *your* endpoint is timing out.'),
  ('interview', E'**"A payment webhook is delivered twice. How do you prevent duplicate processing?"**\n\nStart by naming the cause: at-least-once delivery is inherent to networks — the sender cannot distinguish a lost request from a lost acknowledgement.\n\nThen the design:\n\n1. **Dedup key** — the provider''s event ID, stored with a unique constraint\n2. **One transaction** — insert the dedup record and apply the side effect together, or neither happens\n3. **Let the database decide** — a primary-key conflict is the dedup check; don''t do a read-then-write, which races under concurrency\n4. **Verify the signature** before any of it, so an attacker cannot poison the dedup table\n5. **Retention** longer than the provider''s maximum retry window\n6. **Return 2xx quickly**; do slow work asynchronously, or the provider will retry and make it worse\n\n**Follow-ups you should expect:**\n\n- *"Why not check-then-insert?"* — two concurrent deliveries both read "not processed" and both proceed. The unique constraint is the only race-free check.\n- *"What if processing calls an external API too?"* — you cannot make two systems atomic. Transactional outbox, and make the downstream consumer idempotent as well.\n- *"What about ordering?"* — a different problem. Version entities and reject stale updates.'),
  ('mistakes', E'- Check-then-insert instead of relying on a unique constraint — races under concurrency\n- Dedup record and side effect in separate transactions\n- Hashing the payload instead of using the provider''s event ID\n- Dedup retention shorter than the provider''s retry window\n- Processing before verifying the webhook signature\n- Assuming deduplication also solves ordering'),
  ('scenario', E'**Production incident.** A customer reports being charged twice. Logs show `payment_intent.succeeded` for the same `event_id` processed at 14:32:01 and 14:32:04.\n\nThe endpoint had a dedup check — but it read `processed_events` first and inserted afterwards, outside the transaction that applied the charge. Two concurrent deliveries both read "not processed".\n\n**Fix:** move the insert to the front, inside the same transaction, and let the primary key raise the conflict. The race disappears because the database is now the arbiter rather than application code.')
) as v(kind, body)
cross join public.topics t
where t.slug = 'idempotency-webhooks'
on conflict (topic_id, kind, sort_order) do update set body_md = excluded.body_md;

update public.topics set status = 'published' where slug = 'idempotency-webhooks';

-- ── Questions ──────────────────────────────────────────────────────────────

insert into public.questions
  (slug, topic_id, skill_id, kind, prompt_md, difficulty, choices, answer_key, rubric,
   expected_points, followup_seeds, is_interview, estimated_seconds, status)
select v.slug, t.id, s.id, v.kind::question_kind, v.prompt, v.difficulty,
       v.choices::jsonb, v.answer_key::jsonb, v.rubric::jsonb,
       v.expected::jsonb, v.followups::jsonb, v.is_interview, v.seconds, 'published'
from (values
  ('pg-index-not-used',
   'postgres-indexing-basics', 'postgres-indexing', 'explain',
   'You added an index on `orders(created_at)` but the query planner still chooses a sequential scan. Give three distinct reasons this can happen.',
   4, null,
   null,
   '{"criteria":[{"id":"selectivity","label":"Low selectivity — the predicate matches a large share of the table","weight":0.3},{"id":"stats","label":"Stale statistics — ANALYZE has not run, estimates are wrong","weight":0.3},{"id":"sargability","label":"Predicate not sargable — a function wraps the column","weight":0.25},{"id":"cost","label":"Frames the planner as cost-based rather than rule-based","weight":0.15}]}',
   '["selectivity","stale statistics","non-sargable predicate","cost-based planner"]',
   '["The table has 100M rows and the predicate matches 40M. Would an index help at all?","How would you confirm the statistics are stale?"]',
   true, 240, 'published'),

  ('pg-composite-order',
   'postgres-indexing-basics', 'postgres-indexing', 'mcq',
   'Given an index on `(tenant_id, created_at)`, which query benefits **least**?',
   3,
   '[{"id":"a","text":"WHERE tenant_id = $1 ORDER BY created_at DESC"},{"id":"b","text":"WHERE tenant_id = $1 AND created_at > $2"},{"id":"c","text":"WHERE created_at > $1"},{"id":"d","text":"WHERE tenant_id = $1"}]',
   '{"correct":["c"],"explanation":"A composite B-Tree is ordered by its leading column. Without a tenant_id predicate the index cannot be range-scanned usefully."}',
   '{"criteria":[]}',
   '["leading column rule"]', '[]', false, 60, 'published'),

  ('idempotency-duplicate-webhook',
   'idempotency-webhooks', 'idempotency', 'explain',
   'A payment webhook is delivered twice. Describe how you would prevent duplicate processing, and explain why a check-then-insert is not sufficient.',
   4, null, null,
   '{"criteria":[{"id":"cause","label":"Names at-least-once delivery as inherent to networks","weight":0.2},{"id":"key","label":"Uses the provider event ID as a dedup key with a unique constraint","weight":0.25},{"id":"atomicity","label":"Dedup record and side effect in one transaction","weight":0.3},{"id":"race","label":"Explains that check-then-insert races under concurrency","weight":0.25}]}',
   '["at-least-once delivery","unique constraint","single transaction","concurrency race"]',
   '["What if processing also calls an external payment API?","How long do you retain dedup records, and why?","Does this also give you ordering guarantees?"]',
   true, 300, 'published'),

  ('idempotency-definition',
   'idempotency-webhooks', 'idempotency', 'mcq',
   'Which operation is **not** naturally idempotent?',
   2,
   '[{"id":"a","text":"DELETE /orders/42"},{"id":"b","text":"PUT /orders/42 with a full representation"},{"id":"c","text":"POST /orders creating a new order"},{"id":"d","text":"GET /orders/42"}]',
   '{"correct":["c"],"explanation":"POST creates a new resource each time it is called. The others converge on the same state however many times they run."}',
   '{"criteria":[]}',
   '["HTTP method semantics"]', '[]', false, 45, 'published')
) as v(slug, topic_slug, skill_slug, kind, prompt, difficulty, choices, answer_key, rubric, expected, followups, is_interview, seconds)
join public.topics t on t.slug = v.topic_slug
join public.skills s on s.slug = v.skill_slug
on conflict (slug) do update
  set prompt_md = excluded.prompt_md, rubric = excluded.rubric, status = excluded.status;

-- ── Coding problem ─────────────────────────────────────────────────────────

insert into public.coding_problems
  (slug, title, pattern, difficulty, statement_md, starter_code, tests, target_complexity, hints, estimated_minutes, status)
values (
  'idempotent-event-processor',
  'Idempotent Event Processor',
  'hash-maps',
  3,
  E'Implement `processEvents(events, apply)` so that each event is applied **at most once**, identified by `event.id`.\n\nEvents may arrive duplicated and out of order. `apply` must not be called twice for the same id. Return the number of events actually applied.\n\nThis is the in-memory shape of the webhook problem — the same reasoning, without the database.',
  '{"typescript":"type Event = { id: string; payload: unknown }\\n\\nexport function processEvents(\\n  events: Event[],\\n  apply: (event: Event) => void,\\n): number {\\n  // your code here\\n  return 0\\n}\\n"}',
  '[{"name":"applies each unique event once","input":[[{"id":"a"},{"id":"b"},{"id":"a"}]],"expected":2},{"name":"handles an empty batch","input":[[]],"expected":0},{"name":"handles all duplicates","input":[[{"id":"x"},{"id":"x"},{"id":"x"}]],"expected":1}]',
  'O(n) time, O(n) space',
  '["What data structure gives O(1) membership checks?","Check membership before calling apply, not after.","Would your solution still be correct if apply threw an exception?"]',
  20,
  'published'
)
on conflict (slug) do update set statement_md = excluded.statement_md, status = excluded.status;

insert into public.coding_problem_skills (problem_id, skill_id, weight)
select p.id, s.id, v.weight
from (values
  ('idempotent-event-processor', 'idempotency', 1.0),
  ('idempotent-event-processor', 'hash-maps',   0.6)
) as v(problem_slug, skill_slug, weight)
join public.coding_problems p on p.slug = v.problem_slug
join public.skills s on s.slug = v.skill_slug
on conflict (problem_id, skill_id) do nothing;
