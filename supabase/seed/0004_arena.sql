-- ═══════════════════════════════════════════════════════════════════════════
-- Seed 0004 — System design cases and boss battles
--
-- `reference_architecture_md` is never served until the learner has submitted
-- (§59). It is readable only through `get_reference_architecture()`, which
-- checks for a submitted attempt first.
-- ═══════════════════════════════════════════════════════════════════════════

insert into public.system_design_cases
  (slug, title, brief_md, constraints, traffic_profile, rubric, reference_architecture_md, difficulty, estimated_minutes, status)
values
(
  'webhook-delivery-service',
  'Design a webhook delivery service',
  E'Your platform needs to deliver events to customer-owned HTTPS endpoints — the same job Stripe or GitHub does for their webhooks.\n\nCustomers register endpoints and subscribe to event types. When an event occurs, every matching endpoint must receive it. Customer endpoints are unreliable: some are slow, some return 500s for hours, and some quietly disappear.\n\nDesign the system. Cover the data model, the delivery path, and what happens when things go wrong.',
  '{"scale":"10k customers, 50M events/day","latency":"p95 delivery under 30s for healthy endpoints","durability":"no event may be silently dropped","retention":"delivery attempts queryable for 30 days"}',
  '{"events_per_day":50000000,"peak_multiplier":4,"endpoints":25000,"avg_payload_kb":2}',
  '{"criteria":[
     {"id":"model","label":"Data model separates events from delivery attempts","weight":0.15},
     {"id":"queue","label":"Uses a queue with per-endpoint isolation so one bad customer cannot starve others","weight":0.2},
     {"id":"retry","label":"Retry policy with exponential backoff and jitter, plus a dead-letter path","weight":0.2},
     {"id":"idempotency","label":"Gives receivers what they need to deduplicate, and handles at-least-once honestly","weight":0.15},
     {"id":"security","label":"Signs payloads and addresses SSRF from customer-controlled URLs","weight":0.15},
     {"id":"observability","label":"Per-endpoint health, delivery lag, and a replay mechanism","weight":0.15}
   ]}',
  E'## Reference architecture\n\nThis is one good answer, not the answer. Compare the *reasoning*, not the diagram.\n\n### Data model\n\nSeparate `events` (what happened, immutable, written once) from `deliveries` (one row per endpoint per event, carrying attempt count, next retry time, and status). Conflating them is the most common mistake: you cannot retry a delivery independently if the retry state lives on the event.\n\n### Delivery path\n\nEvent produced → fan out one `delivery` row per matching subscription → enqueue.\n\n**Per-endpoint isolation is the load-bearing decision.** With a single shared queue, one customer whose endpoint takes 30s to time out consumes every worker and delays everyone. Partition by endpoint (a queue per shard keyed on endpoint id, or a per-endpoint concurrency limiter), so a slow consumer only starves itself.\n\n### Failure handling\n\n- Exponential backoff with **jitter** — without jitter, everything that failed during an outage retries in lockstep and takes the endpoint down again the moment it recovers.\n- Cap attempts (commonly ~8 over 24h), then dead-letter.\n- **Circuit-break per endpoint**: after N consecutive failures, stop attempting and mark it unhealthy. This is what stops a dead endpoint consuming capacity forever.\n\n### What the receiver needs\n\nDelivery is at-least-once and cannot be made exactly-once, so give receivers a stable `event_id` to deduplicate on and say so in the docs. Sign the payload with an HMAC over `timestamp + body`, and include the timestamp in the signature so a captured request cannot be replayed indefinitely.\n\n### Security\n\nThe URLs are customer-controlled, which makes delivery an **SSRF** vector: a customer can point a webhook at `169.254.169.254` or an internal address and use your workers as a proxy. Resolve and validate the destination IP before connecting, and re-validate after redirects.\n\n### Observability\n\nPer-endpoint success rate and delivery lag, a queryable attempt history, and an operator-triggered replay. Alert on delivery lag rather than error rate — a healthy-looking error rate with a growing backlog is the failure you care about.\n\n### Trade-offs worth naming\n\n| Gain | Cost |\n|---|---|\n| Per-endpoint queues isolate failures | Many more queues to operate and monitor |\n| Long retry windows improve delivery | Storage and a longer window for duplicates |\n| Signing every payload | Key rotation becomes a customer-facing concern |',
  4,
  45,
  'published'
),
(
  'read-heavy-feed',
  'Design a read-heavy activity feed',
  E'Design the feed that shows a user everything relevant that has happened since they last looked — the shape behind a notifications page or a social timeline.\n\nReads dominate writes by roughly 100:1. Users expect their own actions to appear immediately. Some accounts are followed by hundreds of thousands of others.',
  '{"scale":"5M daily active users","read_write_ratio":"100:1","latency":"p95 feed load under 200ms","freshness":"own actions visible immediately"}',
  '{"daily_active_users":5000000,"feed_loads_per_user_per_day":12,"writes_per_second":3000}',
  '{"criteria":[
     {"id":"fanout","label":"Chooses between fan-out-on-write and fan-out-on-read with a stated reason","weight":0.25},
     {"id":"hotspot","label":"Handles high-follower accounts without fanning out to millions of inboxes","weight":0.2},
     {"id":"cache","label":"Caching strategy with an invalidation story","weight":0.2},
     {"id":"consistency","label":"Explains read-your-own-writes","weight":0.15},
     {"id":"pagination","label":"Stable pagination over a changing feed","weight":0.2}
   ]}',
  E'## Reference architecture\n\n### The central decision\n\n**Fan-out-on-write** (push into each follower''s inbox) makes reads trivial and writes expensive. **Fan-out-on-read** (query what you follow, merge at read time) makes writes trivial and reads expensive. At 100:1 reads, push is the right default — but not for everyone.\n\n**The hybrid is the real answer.** Push for ordinary accounts; for accounts above a follower threshold, do not fan out at all — pull their recent posts at read time and merge. This is what stops a single celebrity post generating millions of inbox writes, and it is the specific thing an interviewer is listening for.\n\n### Caching\n\nCache the materialised feed page per user with a short TTL, and invalidate on write rather than waiting for expiry. Cache the merged result, not the individual items — merging is the expensive part.\n\n### Read-your-own-writes\n\nUsers tolerate someone else''s post arriving late; they do not tolerate their own not appearing. Write your own action into your own cached feed synchronously, and let the fan-out to everyone else run asynchronously.\n\n### Pagination\n\nOffset pagination breaks on a feed that changes underneath you — items shift and the reader sees duplicates or gaps. Use cursor pagination keyed on `(timestamp, id)`, which is stable regardless of what was inserted since.\n\n### Trade-offs worth naming\n\n| Gain | Cost |\n|---|---|\n| Fan-out-on-write makes reads cheap | Write amplification, and storage per follower |\n| Hybrid handles celebrities | Two code paths, and a threshold to tune |\n| Aggressive caching | Invalidation complexity and staleness windows |',
  4,
  45,
  'published'
)
on conflict (slug) do update
  set brief_md = excluded.brief_md,
      rubric = excluded.rubric,
      reference_architecture_md = excluded.reference_architecture_md,
      status = excluded.status;

-- ── Boss battles (§22) ─────────────────────────────────────────────────────

insert into public.boss_battles (slug, title, scenario_md, week_hint, rubric, xp, difficulty, skill_id, status)
select v.slug, v.title, v.scenario, v.week_hint, v.rubric::jsonb, v.xp, v.difficulty, s.id, 'published'
from (values
  (
    'latency-5x',
    'Production API latency has gone 5x',
    E'**14:02 UTC.** Your main API''s p95 latency jumped from 120ms to 600ms. Error rate is normal. No deploy went out in the last six hours.\n\nTraffic is up about 15% on the same time yesterday — noticeable, but not five times anything.\n\nWhat do you check, in what order, and why? Name what would confirm or eliminate each hypothesis.',
    3,
    '{"criteria":[
       {"id":"order","label":"Investigates in an order that eliminates whole classes of cause","weight":0.3},
       {"id":"hypotheses","label":"Offers several plausible causes rather than fixating on one","weight":0.25},
       {"id":"evidence","label":"Says what evidence would confirm or eliminate each","weight":0.25},
       {"id":"nonlinear","label":"Recognises that 15% more traffic causing 5x latency implies a saturating resource","weight":0.2}
     ]}',
    120, 4, 'bottleneck-analysis'
  ),
  (
    'duplicate-webhook',
    'A payment webhook was delivered twice',
    E'A customer was charged twice. Your logs show `payment_intent.succeeded` with the same `event_id` processed at 14:32:01 and again at 14:32:04.\n\nThe handler already had a deduplication check.\n\nExplain how this happened despite the check, how you would fix it, and how you would find out whether it has happened to anyone else.',
    2,
    '{"criteria":[
       {"id":"race","label":"Identifies check-then-insert as a race under concurrency","weight":0.35},
       {"id":"fix","label":"Fixes it with a unique constraint inside the same transaction as the side effect","weight":0.3},
       {"id":"blast","label":"Has a plan for finding other affected customers","weight":0.2},
       {"id":"prevention","label":"Names what would have caught this before production","weight":0.15}
     ]}',
    120, 4, 'idempotency'
  )
) as v(slug, title, scenario, week_hint, rubric, xp, difficulty, skill_slug)
join public.skills s on s.slug = v.skill_slug
on conflict (slug) do update
  set scenario_md = excluded.scenario_md, rubric = excluded.rubric, status = excluded.status;
