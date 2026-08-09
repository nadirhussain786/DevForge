-- ═══════════════════════════════════════════════════════════════════════════
-- Seed 0002 — Achievements and career milestones (§46, §56)
--
-- Career milestones are achievements with category = 'career_milestone', not a
-- separate table. `criteria` is read by the achievement evaluator.
-- ═══════════════════════════════════════════════════════════════════════════

insert into public.achievements (slug, name, description, category, criteria, xp, tier, sort_order) values
  -- Skill
  ('first-commit',      'First Commit',      'Complete your first coding challenge.',
    'skill', '{"type":"count","event":"coding_problem_solved","target":1}', 25, 1, 1),
  ('pattern-hunter',    'Pattern Hunter',    'Solve problems across 8 different DSA patterns.',
    'skill', '{"type":"distinct","field":"pattern","source":"coding_attempts","target":8}', 150, 2, 2),
  ('first-expert',      'Forged',            'Reach Expert rank in any skill.',
    'skill', '{"type":"skill_rank","rank":"expert","target":1}', 200, 3, 3),

  -- Research
  ('deep-dive',         'Deep Dive',         'Complete your first R&D experiment.',
    'research', '{"type":"count","event":"research_completed","target":1}', 50, 1, 10),
  ('researcher',        'Researcher',        'Complete 20 research notes with an interview explanation.',
    'research', '{"type":"count","event":"research_completed","target":20}', 250, 3, 11),

  -- Arena
  ('architect',         'Architect',         'Complete 10 system designs.',
    'arena', '{"type":"count","event":"system_design_completed","target":10}', 300, 3, 20),
  ('debugger',          'Debugger',          'Complete 5 incident simulations.',
    'arena', '{"type":"count","event":"incident_completed","target":5}', 200, 2, 21),
  ('interviewer',       'Interviewer',       'Complete 10 mock interviews.',
    'arena', '{"type":"count","event":"mock_interview_completed","target":10}', 300, 3, 22),
  ('boss-slayer',       'Boss Slayer',       'Win 5 boss battles.',
    'arena', '{"type":"count","event":"boss_battle_completed","target":5}', 250, 2, 23),

  -- Consistency
  ('week-one',          'Week One',          'Maintain a 7-day streak.',
    'consistency', '{"type":"streak","target":7}', 75, 1, 30),
  ('consistency',       'Consistency',       'Maintain a 30-day learning streak.',
    'consistency', '{"type":"streak","target":30}', 300, 3, 31),
  ('hundred-questions', 'Hundred Questions', 'Answer 100 interview questions.',
    'consistency', '{"type":"count","event":"question_answered","target":100}', 200, 2, 32),
  ('resilient',         'Resilient',         'Resolve 10 weaknesses through re-testing.',
    'consistency', '{"type":"count","event":"weakness_resolved","target":10}', 250, 2, 33),

  -- Career milestones
  ('phase-one-complete','Forge Master',      'Complete Phase 1 — Interview Ready.',
    'career_milestone', '{"type":"phase","phase":"phase1_complete"}', 500, 3, 40),
  ('first-application', 'In The Arena',      'Submit your first job application.',
    'career_milestone', '{"type":"count","event":"application_created","target":1}', 100, 1, 41),
  ('first-interview',   'First Interview',   'Log your first real interview.',
    'career_milestone', '{"type":"count","event":"interview_logged","target":1}', 150, 1, 42),
  ('first-offer',       'Offer',             'Record your first offer.',
    'career_milestone', '{"type":"application_status","status":"offer","target":1}', 1000, 3, 43)
on conflict (slug) do update
  set name = excluded.name,
      description = excluded.description,
      criteria = excluded.criteria,
      xp = excluded.xp;
