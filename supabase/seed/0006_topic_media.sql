-- ═══════════════════════════════════════════════════════════════════════════
-- Seed 0006 — Diagrams for the authored topics
--
-- Every diagram carries an `explanation_md`. A diagram without one is
-- decoration; a diagram with one is usually the fastest route to understanding
-- a mechanism, which is exactly what a beginner needs.
-- ═══════════════════════════════════════════════════════════════════════════

insert into public.topic_media (topic_id, kind, source, caption, explanation_md, sort_order)
select t.id, v.kind, v.source, v.caption, v.explanation, v.sort_order
from (values
  -- ── PostgreSQL indexing ─────────────────────────────────────────────────
  (
    'postgres-indexing-basics', 'mermaid',
    E'flowchart TD\n    Q["WHERE email = \'a@b.com\'"] --> P{Planner decides}\n    P -->|"index exists\\nand looks selective"| I["Index Scan\\nO(log n) jumps"]\n    P -->|"no index, or\\nmatches most rows"| S["Sequential Scan\\nreads every row"]\n    I --> R[Rows]\n    S --> R',
    'How the planner chooses between an index scan and a sequential scan',
    E'The important thing this shows is that **the planner chooses** — you do not.\n\nCreating an index gives the planner an *option*, not an instruction. It compares the estimated cost of each path and picks the cheaper one. That is why an index you just created can sit unused: if the planner estimates your condition matches most of the table, reading straight through really is faster than jumping around the index and back to the heap for every match.\n\nSo "my index isn''t being used" is usually one of two things: the condition is not selective enough to be worth it, or the statistics the planner is estimating from are stale.',
    0
  ),
  (
    'postgres-indexing-basics', 'mermaid',
    E'flowchart LR\n    subgraph BT["B-Tree on (tenant_id, created_at)"]\n      direction TB\n      A["tenant: 1\\ncreated: Jan"] --- B["tenant: 1\\ncreated: Feb"]\n      B --- C["tenant: 2\\ncreated: Jan"]\n      C --- D["tenant: 2\\ncreated: Mar"]\n    end\n    Q1["WHERE tenant_id = 1\\nORDER BY created_at"] -->|"fast — contiguous"| BT\n    Q2["WHERE created_at > Feb"] -->|"slow — scattered"| BT',
    'Why column order in a composite index decides what it can do',
    E'A composite index is sorted by its **first** column, then the second within that.\n\nLook at the ordering above: all of tenant 1 sits together, and within tenant 1 the dates are in order. So a query filtering on `tenant_id` finds one contiguous block and can read the dates already sorted — no extra sort step needed.\n\nBut a query filtering only on `created_at` is looking for values scattered across every tenant''s block. There is no single run to read, so the index barely helps.\n\nThis is the leading-column rule, and it is the single most common composite-index mistake: the order is not cosmetic.',
    1
  ),

  -- ── Idempotency ─────────────────────────────────────────────────────────
  (
    'idempotency-webhooks', 'mermaid',
    E'sequenceDiagram\n    participant S as Stripe\n    participant Y as Your API\n    S->>Y: POST /webhook (event_1)\n    Y->>Y: process — charge customer\n    Y--xS: 200 OK (lost in transit)\n    Note over S: no ack received\n    S->>Y: POST /webhook (event_1) again\n    Y->>Y: process AGAIN — charged twice\n    Y->>S: 200 OK',
    'Why an event arrives twice even when nothing is broken',
    E'Nothing failed here. The customer was charged twice because of a message that got lost on the way *back*.\n\nThe sender cannot tell the difference between "my request never arrived" and "it arrived, but the acknowledgement was lost". Both look identical from the outside: no response. The only safe thing it can do is retry.\n\nThis is why at-least-once delivery is not a flaw in Stripe or GitHub — it is a property of networks. Which means the responsibility for not double-charging sits with **the receiver**, and that is you.',
    0
  ),
  (
    'idempotency-webhooks', 'mermaid',
    E'flowchart TD\n    E["Webhook arrives\\nevent_id = abc"] --> T{{"BEGIN TRANSACTION"}}\n    T --> I["INSERT INTO processed_events\\n(event_id) VALUES (abc)"]\n    I -->|"unique violation —\\nalready processed"| RB["ROLLBACK\\nreturn 200, do nothing"]\n    I -->|"inserted"| SE["Apply the side effect\\ncharge the customer"]\n    SE --> C{{"COMMIT"}}\n    C --> OK["200 OK"]',
    'Deduplication that actually holds under concurrency',
    E'The load-bearing detail is that the insert and the side effect are in **one transaction**.\n\nThe obvious version — check whether we have seen this id, then process it — has a race: two copies of the same webhook arriving at once both check, both see nothing, and both proceed. Checking is not the same as claiming.\n\nHere the database does the claiming. The unique constraint on `event_id` means exactly one of the two inserts can succeed; the other fails and rolls back without charging anyone. And because the charge shares the transaction, a crash between the two leaves neither behind.\n\nRead-then-write is the bug. Let the constraint decide.',
    1
  )
) as v(topic_slug, kind, source, caption, explanation, sort_order)
join public.topics t on t.slug = v.topic_slug
on conflict do nothing;
