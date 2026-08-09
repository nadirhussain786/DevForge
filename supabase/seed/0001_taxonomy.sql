-- ═══════════════════════════════════════════════════════════════════════════
-- Seed 0001 — Domains, skills, prerequisites, role tracks, weight matrix
--
-- Idempotent: safe to re-run. Uses slugs as natural keys throughout.
-- ═══════════════════════════════════════════════════════════════════════════

-- ── Domains ────────────────────────────────────────────────────────────────
insert into public.domains (slug, name, description, sort_order) values
  ('cs-fundamentals',     'CS Fundamentals',     'Networking, operating systems, concurrency, complexity', 1),
  ('dsa',                 'Data Structures & Algorithms', 'Interview patterns and problem solving',        2),
  ('frontend',            'Frontend',            'JavaScript, TypeScript, React, Next.js, the browser',    3),
  ('backend',             'Backend',             'APIs, Node.js, auth, caching, background work',          4),
  ('databases',           'Databases',           'SQL, indexing, transactions, replication, caching',      5),
  ('architecture',        'Architecture',        'SOLID, clean architecture, DDD, service boundaries',     6),
  ('distributed-systems', 'Distributed Systems', 'Scale, consistency, messaging, failure',                 7),
  ('security',            'Security',            'OWASP, authn/authz, secrets, threat modelling',          8),
  ('devops',              'DevOps',              'Git, CI/CD, containers, cloud, observability',           9),
  ('system-design',       'System Design',       'Requirements, estimation, trade-offs, reliability',     10),
  ('ai-engineering',      'AI Engineering',      'LLMs, RAG, agents, evaluation, AI security',            11),
  ('communication',       'Communication',       'Precise technical language and behavioural depth',      12)
on conflict (slug) do update set name = excluded.name, description = excluded.description;

-- ── Skills ─────────────────────────────────────────────────────────────────
insert into public.skills (slug, domain_id, name, summary, difficulty, status, sort_order)
select v.slug, d.id, v.name, v.summary, v.difficulty, 'published', v.sort_order
from (values
  -- CS fundamentals
  ('computer-networks',      'cs-fundamentals', 'Computer Networks',        'TCP/IP, HTTP, DNS, TLS', 3, 1),
  ('operating-systems',      'cs-fundamentals', 'Operating Systems',        'Processes, threads, memory, scheduling', 3, 2),
  ('concurrency-basics',     'cs-fundamentals', 'Concurrency',              'Race conditions, locks, async models', 4, 3),
  ('complexity-analysis',    'cs-fundamentals', 'Complexity Analysis',      'Big-O in time and space', 2, 4),

  -- DSA
  ('arrays-strings',         'dsa', 'Arrays & Strings',        'The base pattern for most interviews', 1, 1),
  ('hash-maps',              'dsa', 'Hash Maps',               'Lookup, counting, grouping', 2, 2),
  ('two-pointers',           'dsa', 'Two Pointers',            'Linear scans from both ends', 2, 3),
  ('sliding-window',         'dsa', 'Sliding Window',          'Contiguous subarray problems', 3, 4),
  ('stacks-queues',          'dsa', 'Stacks & Queues',         'Monotonic stacks, BFS queues', 2, 5),
  ('binary-search',          'dsa', 'Binary Search',           'On values as well as indices', 3, 6),
  ('linked-lists',           'dsa', 'Linked Lists',            'Pointer manipulation, cycle detection', 2, 7),
  ('trees',                  'dsa', 'Trees',                   'Traversal, BST, recursion', 3, 8),
  ('graphs',                 'dsa', 'Graphs',                  'BFS, DFS, topological sort, shortest path', 4, 9),
  ('heaps',                  'dsa', 'Heaps',                   'Top-k and streaming problems', 3, 10),
  ('intervals',              'dsa', 'Intervals',               'Merging, scheduling, sweep line', 3, 11),
  ('greedy',                 'dsa', 'Greedy',                  'Exchange arguments and proofs', 4, 12),
  ('backtracking',           'dsa', 'Backtracking',            'Combinatorial search with pruning', 4, 13),
  ('dynamic-programming',    'dsa', 'Dynamic Programming',     'State design and transitions', 5, 14),

  -- Frontend
  ('js-fundamentals',        'frontend', 'JavaScript Fundamentals', 'Closures, prototypes, the event loop', 2, 1),
  ('typescript',             'frontend', 'TypeScript',              'Structural typing, generics, narrowing', 3, 2),
  ('react-rendering',        'frontend', 'React Rendering Model',   'Reconciliation, memo, server components', 3, 3),
  ('react-state',            'frontend', 'React State',             'Local, derived, and server state', 3, 4),
  ('nextjs-app-router',      'frontend', 'Next.js App Router',      'Routing, RSC, caching, actions', 4, 5),
  ('css-layout',             'frontend', 'CSS & Layout',            'Flexbox, grid, containment', 2, 6),
  ('web-performance',        'frontend', 'Web Performance',         'Core Web Vitals, bundles, rendering cost', 4, 7),
  ('accessibility',          'frontend', 'Accessibility',           'Semantics, ARIA, keyboard operation', 3, 8),
  ('browser-architecture',   'frontend', 'Browser Architecture',    'Parsing, layout, paint, compositing', 4, 9),

  -- Backend
  ('nodejs-runtime',         'backend', 'Node.js Runtime',      'Event loop, streams, clustering', 3, 1),
  ('rest-design',            'backend', 'REST API Design',      'Resources, status codes, versioning', 2, 2),
  ('express-apis',           'backend', 'Express & Middleware', 'Routing, middleware, error handling', 2, 3),
  ('authentication',         'backend', 'Authentication',       'Sessions, tokens, password handling', 3, 4),
  ('authorization',          'backend', 'Authorization',        'RBAC, ABAC, row-level policies', 4, 5),
  ('api-caching',            'backend', 'API Caching',          'HTTP caching, ETags, invalidation', 4, 6),
  ('background-jobs',        'backend', 'Background Jobs',      'Workers, scheduling, failure handling', 3, 7),
  ('queues-basics',          'backend', 'Queues',               'At-least-once delivery, DLQs', 4, 8),
  ('rate-limiting',          'backend', 'Rate Limiting',        'Token bucket, sliding window, fairness', 3, 9),
  ('error-handling',         'backend', 'Error Handling',       'Failure taxonomy, retries, surfacing', 3, 10),

  -- Databases
  ('sql-fundamentals',       'databases', 'SQL Fundamentals',        'Joins, aggregation, set operations', 2, 1),
  ('postgres-indexing',      'databases', 'PostgreSQL Indexing',     'B-Tree, composite, partial, covering', 4, 2),
  ('query-optimization',     'databases', 'Query Optimization',      'EXPLAIN ANALYZE and the planner', 4, 3),
  ('transactions-isolation', 'databases', 'Transactions & Isolation','ACID, isolation levels, anomalies', 4, 4),
  ('replication',            'databases', 'Replication',             'Primary/replica, lag, read scaling', 4, 5),
  ('partitioning-sharding',  'databases', 'Partitioning & Sharding', 'Keys, hotspots, rebalancing', 5, 6),
  ('mongodb-modeling',       'databases', 'MongoDB Modelling',       'Embedding vs referencing, indexes', 3, 7),
  ('redis-caching',          'databases', 'Redis & Caching',         'Eviction, invalidation, stampedes', 4, 8),

  -- Architecture
  ('solid-principles',       'architecture', 'SOLID Principles',       'Cohesion, coupling, substitution', 3, 1),
  ('clean-architecture',     'architecture', 'Clean Architecture',     'Dependency direction and boundaries', 4, 2),
  ('ddd-basics',             'architecture', 'Domain-Driven Design',   'Aggregates, bounded contexts', 4, 3),
  ('hexagonal-architecture', 'architecture', 'Hexagonal Architecture', 'Ports and adapters', 4, 4),
  ('modular-monolith',       'architecture', 'Modular Monolith',       'Module boundaries without the network', 3, 5),
  ('microservices',          'architecture', 'Microservices',          'Service boundaries and their cost', 4, 6),
  ('event-driven-architecture','architecture','Event-Driven Architecture','Events, choreography, ordering', 5, 7),

  -- Distributed systems
  ('scalability-basics',     'distributed-systems', 'Scalability',              'Vertical, horizontal, statelessness', 3, 1),
  ('load-balancing',         'distributed-systems', 'Load Balancing',           'Algorithms, health checks, stickiness', 3, 2),
  ('availability-consistency','distributed-systems','Availability & Consistency','Trade-offs in practice', 4, 3),
  ('cap-theorem',            'distributed-systems', 'CAP & Its Limits',         'What CAP does and does not say', 4, 4),
  ('idempotency',            'distributed-systems', 'Idempotency',              'Keys, dedup, exactly-once illusions', 4, 5),
  ('retries-backoff',        'distributed-systems', 'Retries & Backoff',        'Jitter, budgets, retry storms', 3, 6),
  ('pubsub-messaging',       'distributed-systems', 'Pub/Sub & Messaging',      'Topics, ordering, delivery guarantees', 4, 7),
  ('fault-tolerance',        'distributed-systems', 'Fault Tolerance',          'Bulkheads, circuit breakers, degradation', 4, 8),

  -- Security
  ('owasp-top-ten',          'security', 'OWASP Top Ten',       'The failure modes that actually happen', 3, 1),
  ('xss',                    'security', 'Cross-Site Scripting','Contexts, encoding, CSP', 3, 2),
  ('csrf',                   'security', 'CSRF',                'SameSite, tokens, state changes', 3, 3),
  ('sql-injection',          'security', 'SQL Injection',       'Parameterisation and least privilege', 2, 4),
  ('oauth-oidc',             'security', 'OAuth & OIDC',        'Flows, scopes, tokens', 4, 5),
  ('jwt-sessions',           'security', 'JWT & Session Management','Storage, rotation, revocation', 4, 6),
  ('secrets-management',     'security', 'Secrets Management',  'Rotation, scoping, leakage', 3, 7),
  ('threat-modeling',        'security', 'Threat Modelling',    'STRIDE, trust boundaries', 4, 8),

  -- DevOps
  ('git-workflows',          'devops', 'Git Workflows',        'Branching, rebasing, review', 2, 1),
  ('ci-cd',                  'devops', 'CI/CD',                'Pipelines, gates, rollbacks', 3, 2),
  ('docker-basics',          'devops', 'Containers',           'Images, layers, runtime', 3, 3),
  ('cloud-fundamentals',     'devops', 'Cloud Fundamentals',   'Compute, storage, networking, IAM', 3, 4),
  ('aws-core',               'devops', 'AWS Core Services',    'EC2, S3, RDS, Lambda, SQS', 4, 5),
  ('deployment-strategies',  'devops', 'Deployment Strategies','Blue/green, canary, feature flags', 4, 6),
  ('observability',          'devops', 'Observability',        'Metrics, SLIs, dashboards, alerts', 4, 7),
  ('logging-tracing',        'devops', 'Logging & Tracing',    'Structured logs, spans, correlation', 3, 8),

  -- System design
  ('requirements-gathering', 'system-design', 'Requirements Gathering', 'Functional and non-functional scoping', 3, 1),
  ('capacity-estimation',    'system-design', 'Capacity Estimation',    'QPS, storage, bandwidth maths', 3, 2),
  ('api-design',             'system-design', 'API Design',             'Contracts, pagination, evolution', 3, 3),
  ('data-modeling',          'system-design', 'Data Modelling',         'Access patterns first', 4, 4),
  ('bottleneck-analysis',    'system-design', 'Bottleneck Analysis',    'Finding the actual constraint', 4, 5),
  ('reliability-slo',        'system-design', 'Reliability & SLOs',     'Error budgets and their consequences', 4, 6),
  ('architecture-tradeoffs', 'system-design', 'Architecture Trade-offs','Naming the cost of every gain', 5, 7),

  -- AI engineering
  ('llm-basics',             'ai-engineering', 'LLM Fundamentals',      'Architecture, inference, limitations', 3, 1),
  ('tokens-context',         'ai-engineering', 'Tokens & Context',      'Windows, truncation, cost', 2, 2),
  ('prompt-engineering',     'ai-engineering', 'Prompt Engineering',    'Instructions, examples, decomposition', 2, 3),
  ('structured-output',      'ai-engineering', 'Structured Output',     'Schemas, validation, retries', 3, 4),
  ('embeddings',             'ai-engineering', 'Embeddings',            'Vector semantics and similarity', 3, 5),
  ('vector-search',          'ai-engineering', 'Vector Search',         'ANN indexes, recall vs latency', 4, 6),
  ('chunking-retrieval',     'ai-engineering', 'Chunking & Retrieval',  'Splitting, overlap, hybrid search', 4, 7),
  ('reranking',              'ai-engineering', 'Reranking',             'Two-stage retrieval', 4, 8),
  ('rag-architecture',       'ai-engineering', 'RAG Architecture',      'End-to-end retrieval-augmented systems', 4, 9),
  ('llm-evaluation',         'ai-engineering', 'LLM Evaluation',        'Golden sets, LLM judges, regression', 5, 10),
  ('agents-tool-calling',    'ai-engineering', 'Agents & Tool Calling', 'Loops, tools, termination', 4, 11),
  ('ai-guardrails',          'ai-engineering', 'Guardrails',            'Validation, refusal, fallbacks', 4, 12),
  ('prompt-injection',       'ai-engineering', 'Prompt Injection',      'Untrusted input in LLM systems', 4, 13),
  ('ai-cost-latency',        'ai-engineering', 'AI Cost & Latency',     'Model selection, caching, streaming', 3, 14),

  -- Communication
  ('technical-communication','communication', 'Technical Communication', 'Precision over vocabulary', 3, 1),
  ('tradeoff-articulation',  'communication', 'Articulating Trade-offs', 'Every gain has a named cost', 4, 2),
  ('incident-communication', 'communication', 'Incident Communication',  'Status, impact, mitigation', 3, 3),
  ('behavioral-storytelling','communication', 'Behavioural Storytelling','Ownership, conflict, failure', 3, 4)
) as v(slug, domain_slug, name, summary, difficulty, sort_order)
join public.domains d on d.slug = v.domain_slug
on conflict (slug) do update
  set name = excluded.name, summary = excluded.summary, difficulty = excluded.difficulty;

-- ── Prerequisites ──────────────────────────────────────────────────────────
insert into public.skill_prerequisites (skill_id, prereq_skill_id, strength)
select s.id, p.id, v.strength
from (values
  ('typescript',              'js-fundamentals',        1.0),
  ('react-rendering',         'js-fundamentals',        1.0),
  ('react-state',             'react-rendering',        1.0),
  ('nextjs-app-router',       'react-rendering',        1.0),
  ('web-performance',         'browser-architecture',   0.7),
  ('express-apis',            'nodejs-runtime',         1.0),
  ('authorization',           'authentication',         1.0),
  ('api-caching',             'rest-design',            0.8),
  ('queues-basics',           'background-jobs',        0.8),
  ('postgres-indexing',       'sql-fundamentals',       1.0),
  ('query-optimization',      'postgres-indexing',      1.0),
  ('replication',             'transactions-isolation', 0.7),
  ('partitioning-sharding',   'replication',            0.8),
  ('redis-caching',           'api-caching',            0.6),
  ('clean-architecture',      'solid-principles',       1.0),
  ('hexagonal-architecture',  'clean-architecture',     0.9),
  ('microservices',           'modular-monolith',       0.9),
  ('event-driven-architecture','pubsub-messaging',      0.9),
  ('cap-theorem',             'availability-consistency',0.9),
  ('idempotency',             'retries-backoff',        0.7),
  ('fault-tolerance',         'retries-backoff',        0.8),
  ('pubsub-messaging',        'queues-basics',          0.8),
  ('oauth-oidc',              'authentication',         1.0),
  ('jwt-sessions',            'authentication',         1.0),
  ('threat-modeling',         'owasp-top-ten',          0.8),
  ('aws-core',                'cloud-fundamentals',     1.0),
  ('deployment-strategies',   'ci-cd',                  0.9),
  ('logging-tracing',         'observability',          0.8),
  ('capacity-estimation',     'requirements-gathering', 0.8),
  ('bottleneck-analysis',     'capacity-estimation',    0.7),
  ('architecture-tradeoffs',  'scalability-basics',     0.8),
  ('data-modeling',           'sql-fundamentals',       0.7),
  ('vector-search',           'embeddings',             1.0),
  ('chunking-retrieval',      'vector-search',          0.9),
  ('rag-architecture',        'chunking-retrieval',     1.0),
  ('reranking',               'vector-search',          0.8),
  ('llm-evaluation',          'rag-architecture',       0.7),
  ('agents-tool-calling',     'structured-output',      0.9),
  ('prompt-injection',        'agents-tool-calling',    0.6),
  ('structured-output',       'prompt-engineering',     0.9),
  ('prompt-engineering',      'tokens-context',         0.7),
  ('embeddings',              'llm-basics',             0.8),
  ('sliding-window',          'two-pointers',           0.8),
  ('graphs',                  'trees',                  0.8),
  ('trees',                   'linked-lists',           0.5),
  ('dynamic-programming',     'backtracking',           0.8),
  ('heaps',                   'trees',                  0.6),
  ('two-pointers',            'arrays-strings',         1.0),
  ('hash-maps',               'arrays-strings',         0.8),
  ('tradeoff-articulation',   'technical-communication',0.9)
) as v(skill_slug, prereq_slug, strength)
join public.skills s on s.slug = v.skill_slug
join public.skills p on p.slug = v.prereq_slug
on conflict (skill_id, prereq_skill_id) do nothing;

-- ── Role tracks ────────────────────────────────────────────────────────────
insert into public.role_tracks (slug, name, description, is_default, sort_order, status) values
  ('full-stack',        'Full-Stack Engineer',  'Balanced frontend, backend, data, and system design', true,  1, 'published'),
  ('frontend',          'Frontend Engineer',    'Deep browser, React, performance, accessibility',     false, 2, 'published'),
  ('backend',           'Backend Engineer',     'APIs, data, distributed systems, reliability',        false, 3, 'published'),
  ('ai-engineer',       'AI Engineer',          'LLM systems, RAG, agents, evaluation, AI security',   false, 4, 'published'),
  ('platform',          'Platform Engineer',    'Infrastructure, CI/CD, observability, reliability',   false, 5, 'published'),
  ('mern',              'MERN Engineer',        'MongoDB, Express, React, Node with enterprise depth', false, 6, 'published'),
  ('senior-generalist', 'Senior Software Engineer', 'Breadth plus architecture and communication depth', false, 7, 'published')
on conflict (slug) do update set name = excluded.name, description = excluded.description;

-- ── The weight matrix ──────────────────────────────────────────────────────
--
-- Weights are declared per (track, domain) and expanded across that domain's
-- skills. 7 tracks × 12 domains is 84 readable rows instead of ~600 opaque
-- ones, and adding a skill automatically inherits sensible weights everywhere.
-- Skill-level exceptions are applied afterwards.
--
-- A weight of 0 means "not part of this role" and is excluded from the
-- roadmap and from readiness entirely — a frontend engineer is never marked
-- down for not knowing sharding.

insert into public.role_track_skills (role_track_id, skill_id, weight, target_mastery, is_critical)
select rt.id, s.id, m.weight, m.target, m.critical
from (values
  -- track,              domain,                weight, target, critical
  ('full-stack','cs-fundamentals',     0.55, 60, false),
  ('full-stack','dsa',                 0.70, 65, true),
  ('full-stack','frontend',            0.90, 75, true),
  ('full-stack','backend',             0.90, 75, true),
  ('full-stack','databases',           0.80, 70, true),
  ('full-stack','architecture',        0.65, 65, false),
  ('full-stack','distributed-systems', 0.60, 60, false),
  ('full-stack','security',            0.60, 60, true),
  ('full-stack','devops',              0.50, 55, false),
  ('full-stack','system-design',       0.80, 70, true),
  ('full-stack','ai-engineering',      0.30, 45, false),
  ('full-stack','communication',       0.70, 70, true),

  ('frontend','cs-fundamentals',       0.35, 50, false),
  ('frontend','dsa',                   0.60, 60, true),
  ('frontend','frontend',              1.00, 85, true),
  ('frontend','backend',               0.40, 50, false),
  ('frontend','databases',             0.25, 40, false),
  ('frontend','architecture',          0.50, 60, false),
  ('frontend','distributed-systems',   0.20, 35, false),
  ('frontend','security',              0.50, 60, true),
  ('frontend','devops',                0.30, 45, false),
  ('frontend','system-design',         0.55, 60, true),
  ('frontend','ai-engineering',        0.20, 35, false),
  ('frontend','communication',         0.70, 70, true),

  ('backend','cs-fundamentals',        0.70, 65, true),
  ('backend','dsa',                    0.70, 65, true),
  ('backend','frontend',               0.25, 40, false),
  ('backend','backend',                1.00, 85, true),
  ('backend','databases',              0.95, 80, true),
  ('backend','architecture',           0.75, 70, true),
  ('backend','distributed-systems',    0.85, 75, true),
  ('backend','security',               0.70, 65, true),
  ('backend','devops',                 0.55, 55, false),
  ('backend','system-design',          0.90, 78, true),
  ('backend','ai-engineering',         0.25, 40, false),
  ('backend','communication',          0.70, 70, true),

  ('ai-engineer','cs-fundamentals',    0.45, 55, false),
  ('ai-engineer','dsa',                0.50, 55, false),
  ('ai-engineer','frontend',           0.30, 45, false),
  ('ai-engineer','backend',            0.70, 68, true),
  ('ai-engineer','databases',          0.60, 60, false),
  ('ai-engineer','architecture',       0.55, 60, false),
  ('ai-engineer','distributed-systems',0.55, 58, false),
  ('ai-engineer','security',           0.65, 65, true),
  ('ai-engineer','devops',             0.45, 50, false),
  ('ai-engineer','system-design',      0.75, 70, true),
  ('ai-engineer','ai-engineering',     1.00, 85, true),
  ('ai-engineer','communication',      0.70, 70, true),

  ('platform','cs-fundamentals',       0.75, 70, true),
  ('platform','dsa',                   0.45, 50, false),
  ('platform','frontend',              0.15, 30, false),
  ('platform','backend',               0.65, 65, false),
  ('platform','databases',             0.60, 60, false),
  ('platform','architecture',          0.60, 62, false),
  ('platform','distributed-systems',   0.90, 78, true),
  ('platform','security',              0.75, 70, true),
  ('platform','devops',                1.00, 85, true),
  ('platform','system-design',         0.85, 75, true),
  ('platform','ai-engineering',        0.15, 30, false),
  ('platform','communication',         0.65, 68, true),

  ('mern','cs-fundamentals',           0.40, 50, false),
  ('mern','dsa',                       0.65, 62, true),
  ('mern','frontend',                  0.95, 80, true),
  ('mern','backend',                   0.95, 80, true),
  ('mern','databases',                 0.75, 68, true),
  ('mern','architecture',              0.55, 58, false),
  ('mern','distributed-systems',       0.40, 48, false),
  ('mern','security',                  0.60, 60, true),
  ('mern','devops',                    0.40, 48, false),
  ('mern','system-design',             0.65, 62, true),
  ('mern','ai-engineering',            0.25, 40, false),
  ('mern','communication',             0.65, 68, true),

  ('senior-generalist','cs-fundamentals',     0.65, 65, false),
  ('senior-generalist','dsa',                 0.65, 65, true),
  ('senior-generalist','frontend',            0.70, 70, true),
  ('senior-generalist','backend',             0.80, 75, true),
  ('senior-generalist','databases',           0.75, 72, true),
  ('senior-generalist','architecture',        0.90, 78, true),
  ('senior-generalist','distributed-systems', 0.80, 72, true),
  ('senior-generalist','security',            0.70, 68, true),
  ('senior-generalist','devops',              0.60, 60, false),
  ('senior-generalist','system-design',       0.95, 82, true),
  ('senior-generalist','ai-engineering',      0.35, 45, false),
  ('senior-generalist','communication',       0.90, 80, true)
) as m(track_slug, domain_slug, weight, target, critical)
join public.role_tracks rt on rt.slug = m.track_slug
join public.domains d on d.slug = m.domain_slug
join public.skills s on s.domain_id = d.id
on conflict (role_track_id, skill_id) do update
  set weight = excluded.weight,
      target_mastery = excluded.target_mastery,
      is_critical = excluded.is_critical;

-- Skill-level exceptions where the domain default is wrong.
insert into public.role_track_skills (role_track_id, skill_id, weight, target_mastery, is_critical)
select rt.id, s.id, v.weight, v.target, v.critical
from (values
  -- MongoDB matters far more on the MERN track than the Postgres-leaning default.
  ('mern','mongodb-modeling',        1.00, 80, true),
  ('mern','partitioning-sharding',   0.20, 35, false),
  ('mern','replication',             0.30, 40, false),
  -- Frontend engineers still get asked about caching and auth at the edge.
  ('frontend','api-caching',         0.60, 60, false),
  ('frontend','authentication',      0.55, 55, false),
  ('frontend','browser-architecture',0.90, 78, true),
  ('frontend','web-performance',     1.00, 82, true),
  ('frontend','accessibility',       0.85, 75, true),
  -- Backend and platform need indexing and isolation deeply, not on average.
  ('backend','postgres-indexing',    1.00, 82, true),
  ('backend','transactions-isolation',1.00, 82, true),
  ('backend','idempotency',          0.95, 78, true),
  ('platform','observability',       1.00, 85, true),
  ('platform','logging-tracing',     0.95, 80, true),
  -- AI engineers must handle untrusted input in LLM systems.
  ('ai-engineer','prompt-injection', 1.00, 82, true),
  ('ai-engineer','llm-evaluation',   0.95, 78, true),
  ('ai-engineer','rag-architecture', 1.00, 85, true),
  -- Full-stack: system design and idempotency are the usual senior gaps.
  ('full-stack','idempotency',       0.85, 72, true),
  ('full-stack','architecture-tradeoffs', 0.90, 75, true)
) as v(track_slug, skill_slug, weight, target, critical)
join public.role_tracks rt on rt.slug = v.track_slug
join public.skills s on s.slug = v.skill_slug
on conflict (role_track_id, skill_id) do update
  set weight = excluded.weight,
      target_mastery = excluded.target_mastery,
      is_critical = excluded.is_critical;

-- ── Aliases — power JD requirement → skill mapping (§10) ───────────────────
insert into public.skill_aliases (skill_id, alias)
select s.id, v.alias
from (values
  ('react-rendering','react'), ('react-rendering','react.js'), ('react-rendering','reactjs'),
  ('typescript','typescript'), ('typescript','ts'),
  ('js-fundamentals','javascript'), ('js-fundamentals','js'), ('js-fundamentals','es6'),
  ('nextjs-app-router','next.js'), ('nextjs-app-router','nextjs'),
  ('nodejs-runtime','node.js'), ('nodejs-runtime','node'), ('nodejs-runtime','nodejs'),
  ('express-apis','express'), ('express-apis','express.js'),
  ('postgres-indexing','postgresql'), ('postgres-indexing','postgres'),
  ('sql-fundamentals','sql'),
  ('mongodb-modeling','mongodb'), ('mongodb-modeling','mongo'),
  ('redis-caching','redis'),
  ('aws-core','aws'), ('aws-core','amazon web services'),
  ('docker-basics','docker'), ('docker-basics','containers'),
  ('ci-cd','ci/cd'), ('ci-cd','continuous integration'),
  ('rest-design','rest'), ('rest-design','rest api'), ('rest-design','restful apis'),
  ('graphs','algorithms'),
  ('system-design','system design'),
  ('requirements-gathering','system design'),
  ('observability','monitoring'), ('logging-tracing','logging'),
  ('oauth-oidc','oauth'), ('oauth-oidc','oidc'), ('jwt-sessions','jwt'),
  ('rag-architecture','rag'), ('rag-architecture','retrieval augmented generation'),
  ('embeddings','embeddings'), ('vector-search','vector database'), ('vector-search','vector search'),
  ('llm-basics','llm'), ('llm-basics','large language models'),
  ('agents-tool-calling','ai agents'), ('prompt-engineering','prompt engineering'),
  ('microservices','microservices'), ('event-driven-architecture','event driven'),
  ('queues-basics','message queues'), ('pubsub-messaging','kafka'), ('pubsub-messaging','pub/sub'),
  ('web-performance','web performance'), ('accessibility','accessibility'), ('accessibility','wcag'),
  ('css-layout','css'), ('css-layout','tailwind')
) as v(skill_slug, alias)
join public.skills s on s.slug = v.skill_slug
on conflict (alias) do nothing;
