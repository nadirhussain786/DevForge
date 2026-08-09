-- ═══════════════════════════════════════════════════════════════════════════
-- 0018 — Glossary
--
-- A beginner's most common failure mode is not difficulty, it's vocabulary: a
-- sentence that assumes "sargable" or "p99" or "idempotent" stops them dead,
-- and nothing in the content tells them where to look.
--
-- Terms are matched into rendered content and shown inline on hover/tap. They
-- are separate from `skills` because most jargon is not a skill you master —
-- it's a word you need once, in passing.
-- ═══════════════════════════════════════════════════════════════════════════

create table public.glossary_terms (
  id          uuid primary key default gen_random_uuid(),
  term        citext unique not null,
  -- Alternate spellings and plurals that should resolve to this entry.
  aliases     citext[] not null default '{}',
  -- One sentence a beginner can act on. Not a textbook definition.
  short_def   text not null,
  -- Optional second paragraph for the "tell me more" expansion.
  long_def    text,
  -- Links the term to a skill, so "learn this properly" has somewhere to go.
  skill_id    uuid references public.skills(id) on delete set null,
  domain_id   uuid references public.domains(id) on delete set null,
  created_at  timestamptz not null default now(),
  updated_at  timestamptz not null default now(),

  constraint short_def_is_short check (char_length(short_def) between 10 and 400)
);

create index glossary_aliases_idx on public.glossary_terms using gin (aliases);
create index glossary_skill_idx on public.glossary_terms (skill_id);

select public.attach_updated_at('public.glossary_terms');

alter table public.glossary_terms enable row level security;

create policy glossary_read on public.glossary_terms
  for select to authenticated using (true);

create policy glossary_admin on public.glossary_terms
  for all to authenticated
  using (public.is_admin()) with check (public.is_admin());

-- ── Topic media ────────────────────────────────────────────────────────────
--
-- Diagrams and images belong with the topic, not inline in the markdown, so
-- they can carry their own explanation and alt text. A diagram with no
-- explanation is decoration; a diagram with one is the fastest way to
-- understand a mechanism.

create table public.topic_media (
  id          uuid primary key default gen_random_uuid(),
  topic_id    uuid not null references public.topics(id) on delete cascade,
  kind        text not null check (kind in ('mermaid', 'image', 'table')),
  -- Mermaid source, an image URL, or markdown table source.
  source      text not null,
  caption     text,
  -- Why this diagram matters, in prose. Required: an unexplained diagram
  -- teaches nothing.
  explanation_md text not null,
  -- Screen-reader description. Required for images; diagrams fall back to the
  -- explanation.
  alt_text    text,
  sort_order  smallint not null default 0,
  created_at  timestamptz not null default now(),

  constraint image_needs_alt check (kind <> 'image' or alt_text is not null)
);

create index topic_media_topic_idx on public.topic_media (topic_id, sort_order);

alter table public.topic_media enable row level security;

create policy topic_media_read on public.topic_media
  for select to authenticated
  using (exists (
    select 1 from public.topics t
    where t.id = topic_id and (t.status = 'published' or public.is_admin())
  ));

create policy topic_media_admin on public.topic_media
  for all to authenticated
  using (public.is_admin()) with check (public.is_admin());
