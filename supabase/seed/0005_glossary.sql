-- ═══════════════════════════════════════════════════════════════════════════
-- Seed 0005 — Glossary
--
-- The vocabulary a beginner hits in the first weeks. Each definition is one
-- sentence they can act on, not a textbook entry — the goal is to unblock a
-- sentence, not to teach the topic. `skill_id` gives "learn this properly"
-- somewhere to go.
-- ═══════════════════════════════════════════════════════════════════════════

insert into public.glossary_terms (term, aliases, short_def, long_def, skill_id)
select v.term, v.aliases::citext[], v.short_def, v.long_def, s.id
from (values
  ('index', '{indexes,indices}',
   'A lookup structure that lets a database find rows without reading the whole table.',
   'Think of a book''s index versus reading every page. It makes matching reads much faster, and every write slightly slower, because the index has to be updated too.',
   'postgres-indexing'),

  ('sequential scan', '{seq scan,full table scan,table scan}',
   'Reading every row in a table to find the ones you want.',
   'Not always bad: if your query matches most of the table, reading it straight through is genuinely cheaper than jumping around an index.',
   'query-optimization'),

  ('sargable', '{}',
   'A condition the database can satisfy using an index.',
   'Wrapping a column in a function usually breaks this: `WHERE lower(email) = $1` cannot use a plain index on `email`, because the indexed value and the compared value are different things.',
   'postgres-indexing'),

  ('idempotent', '{idempotency,idempotence}',
   'An operation you can safely repeat: doing it twice has the same effect as doing it once.',
   'Deleting a file is idempotent. Charging a card is not. This matters because networks retry, so anything that can be delivered twice must be safe to process twice.',
   'idempotency'),

  ('p95', '{p99,percentile latency,tail latency}',
   'The response time that 95% of requests come in under — a measure of the slow tail, not the average.',
   'Averages hide pain. If p50 is 100ms and p99 is 4s, one request in a hundred is a terrible experience, and the average will never show it.',
   'observability'),

  ('race condition', '{race}',
   'A bug where the result depends on the order two things happen to run in.',
   'Classic example: two requests both check "does this exist?", both see no, and both create it. The check and the write need to be one atomic step.',
   'concurrency-basics'),

  ('transaction', '{transactions,acid}',
   'A group of database operations that either all succeed or all fail together.',
   'The value is the "or all fail": without it, a crash halfway through leaves your data in a state your code never expected.',
   'transactions-isolation'),

  ('cache invalidation', '{invalidation}',
   'Removing or refreshing cached data once the underlying value has changed.',
   'The hard part is knowing *when* it changed. Serving stale data quietly is usually worse than being slightly slower.',
   'redis-caching'),

  ('throughput', '{}',
   'How much work a system completes per unit of time — requests per second, jobs per minute.',
   'Distinct from latency, which is how long one request takes. A system can have great throughput and terrible latency by making everyone queue.',
   'scalability-basics'),

  ('latency', '{}',
   'How long a single operation takes from start to finish.',
   null,
   'scalability-basics'),

  ('horizontal scaling', '{scale out,scaling out}',
   'Handling more load by adding more machines rather than a bigger machine.',
   'It only works if your application is stateless — if a user''s data lives in one server''s memory, the next request hitting a different server breaks.',
   'scalability-basics'),

  ('stateless', '{statelessness}',
   'A service that keeps no per-user memory between requests, so any instance can serve any request.',
   'This is what makes horizontal scaling possible. Session state moves to a shared store rather than living in one process.',
   'scalability-basics'),

  ('eventual consistency', '{eventually consistent}',
   'A guarantee that replicas will agree eventually, but may disagree right now.',
   'Usually a deliberate trade: you accept a brief window of stale reads in exchange for staying available when parts of the system are unreachable.',
   'availability-consistency'),

  ('dead letter queue', '{dlq,dead-letter queue}',
   'Where messages go after they have failed too many times, so they stop blocking the queue.',
   'Without one, a single poison message can retry forever and starve everything behind it.',
   'queues-basics'),

  ('exponential backoff', '{backoff}',
   'Waiting progressively longer between retries — 1s, 2s, 4s — instead of retrying immediately.',
   'Add jitter (a small random offset) or every client that failed during an outage retries in lockstep and knocks the service over again the moment it recovers.',
   'retries-backoff'),

  ('n+1 query', '{n+1,n plus one}',
   'Fetching a list, then running one more query per item — 1 query becomes 101 for 100 rows.',
   'One of the most common causes of a slow page. Usually fixed by fetching the related rows in a single query instead.',
   'query-optimization'),

  ('hydration', '{hydrate}',
   'The step where server-rendered HTML becomes interactive in the browser.',
   'A hydration mismatch means the server and client rendered different markup — often caused by using a timestamp or random value during render.',
   'react-rendering'),

  ('memoization', '{memoize,memo}',
   'Caching the result of a computation so identical inputs do not recompute it.',
   'Not free: you pay a comparison on every render. Applied everywhere by reflex, it can be slower than the work it avoids.',
   'react-rendering'),

  ('closure', '{closures}',
   'A function that remembers the variables from where it was defined, even after that scope has finished.',
   'This is why a callback can still see a variable from the function that created it — and why stale values inside callbacks are such a common bug.',
   'js-fundamentals'),

  ('event loop', '{}',
   'The mechanism that lets single-threaded JavaScript handle many things at once by running work in turns rather than in parallel.',
   'Blocking it — a long synchronous loop — freezes everything, including the UI and every pending request.',
   'js-fundamentals'),

  ('SSRF', '{server-side request forgery}',
   'An attack where you trick a server into making a request to somewhere it should not — often an internal address.',
   'Any feature that fetches a user-supplied URL is a candidate. Validate the resolved IP, not just the string, and re-check after redirects.',
   'owasp-top-ten'),

  ('XSS', '{cross-site scripting}',
   'An attack where attacker-controlled text is executed as code in another user''s browser.',
   'The fix is encoding output for the context it lands in — HTML, attribute, and URL contexts each need different treatment.',
   'xss'),

  ('CSRF', '{cross-site request forgery}',
   'An attack where another site makes an authenticated request on a logged-in user''s behalf.',
   'Cookies are attached automatically by the browser, which is exactly the problem. SameSite cookies and anti-CSRF tokens are the usual defences.',
   'csrf'),

  ('RLS', '{row level security,row-level security}',
   'A database feature where the database itself decides which rows a user can see.',
   'Stronger than filtering in application code, because a forgotten WHERE clause cannot leak data — the database refuses regardless of what the query asked for.',
   'authorization'),

  ('embedding', '{embeddings,vector embedding}',
   'A list of numbers representing meaning, so similar text ends up close together.',
   'This is what makes "find things like this" possible without exact keyword matches.',
   'embeddings'),

  ('RAG', '{retrieval augmented generation,retrieval-augmented generation}',
   'Retrieving relevant documents and giving them to a language model so it answers from real sources.',
   'Most RAG failures are retrieval failures, not generation failures — the model answered faithfully from the wrong context.',
   'rag-architecture'),

  ('token', '{tokens,tokenization}',
   'The chunk of text a language model actually processes — roughly a word or word-piece.',
   'Cost and context limits are counted in tokens, not characters, and the ratio differs by language and by code versus prose.',
   'tokens-context'),

  ('prompt injection', '{}',
   'An attack where untrusted text tells a language model to ignore its instructions.',
   'Any system that puts user content into a prompt is exposed. Structured output and clear data/instruction boundaries reduce it; nothing eliminates it.',
   'prompt-injection'),

  ('CI/CD', '{ci,cd,continuous integration,continuous deployment}',
   'Automatically building and testing every change, and automatically shipping the ones that pass.',
   'The real benefit is smaller, more frequent changes — which are far easier to debug when something breaks.',
   'ci-cd'),

  ('big-O', '{big o,time complexity,complexity}',
   'A way of describing how work grows as input grows — O(n) doubles when the input doubles.',
   'It deliberately ignores constants, so it tells you how something scales, not how fast it is on today''s data.',
   'complexity-analysis'),

  ('load balancer', '{load balancing}',
   'A component that spreads incoming requests across several servers.',
   'It also removes unhealthy instances from rotation, which is often the more valuable half.',
   'load-balancing'),

  ('replica', '{read replica,replication}',
   'A copy of a database kept in sync with the primary, usually to serve reads.',
   'Replicas lag behind by a small amount, so a read immediately after a write may not see it — the classic "I saved it and it disappeared" bug.',
   'replication'),

  ('sharding', '{shard,partitioning}',
   'Splitting data across multiple databases so no single one holds it all.',
   'The shard key decides everything: a bad one creates hotspots where one shard gets most of the traffic.',
   'partitioning-sharding'),

  ('circuit breaker', '{}',
   'A guard that stops calling a failing dependency for a while, instead of retrying into a fire.',
   'It converts a slow cascading failure into a fast, contained one.',
   'fault-tolerance'),

  ('observability', '{observable}',
   'Being able to tell what a system is doing from the outside, using its metrics, logs, and traces.',
   'The test is whether you can answer a question you did not anticipate, without shipping new code to find out.',
   'observability')
) as v(term, aliases, short_def, long_def, skill_slug)
left join public.skills s on s.slug = v.skill_slug
on conflict (term) do update
  set aliases = excluded.aliases,
      short_def = excluded.short_def,
      long_def = excluded.long_def,
      skill_id = excluded.skill_id;
