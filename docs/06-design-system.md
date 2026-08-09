# EngForge — Design System

## 1. Principle

A serious developer tool that happens to be motivating — not an education site
that happens to be technical. The reference points are Linear, Vercel, Raycast,
and GitHub, not a course marketplace.

Restraint is the rule. The forge metaphor appears in **language and one accent
colour**, never in illustrations of anvils.

## 2. Tokens

CSS custom properties on `:root`, redefined for dark. Dark is the default;
light is fully supported (§52).

```css
/* Neutrals — slate-cooled, not pure grey */
--bg            /* page */
--surface       /* cards */
--surface-2     /* nested */
--border
--text
--text-muted
--text-subtle

/* Forge accent — heat, used sparingly */
--forge-500     /* primary action, active state */
--forge-400     /* hover */
--forge-glow    /* low-opacity ambient, progress fills */

/* Semantic */
--success  --warn  --danger  --info

/* Heat scale — mastery only. Cold → hot. */
--heat-0 … --heat-5
```

**Forge accent budget:** at most one primary accent element per viewport. If two
things glow, neither reads as important.

**Heat scale is reserved for mastery.** Never use it for status, severity, or
decoration — when the user sees heat, it always means "how hot is this skill".

## 3. Type & density

| Use | Family | Notes |
|---|---|---|
| UI + prose | Geist Sans (scaffold default) | 14px base in app chrome, 16px in reading views |
| Code, metrics, IDs | Geist Mono | all numbers in stat tiles are mono + tabular-nums |

Two densities: **reading** (topics, notebook — max 72ch measure, generous
leading) and **console** (dashboards, tables — compact rows, tight leading).
Never mix them in one panel.

## 4. Layout

```
┌──────────────────────────────────────────────────────┐
│ Top bar: logo · ⌘K search · streak · level · avatar  │
├────────┬─────────────────────────────────────────────┤
│ Rail   │ Content                                     │
│ Today  │  ┌─── Primary column ────┐ ┌── Context ──┐  │
│ Roadmap│  │                       │ │ week, next  │  │
│ Learn  │  │  what matters now     │ │ unlock,     │  │
│ Code   │  │                       │ │ nudge       │  │
│ Arena  │  └───────────────────────┘ └─────────────┘  │
│ Lab    │                                             │
│ Skills │                                             │
│ Career │                                             │
└────────┴─────────────────────────────────────────────┘
```

- Rail collapses to icons ≥ `lg`, becomes a bottom tab bar on mobile.
- The context column is **always** secondary — it can be hidden without breaking
  the page. This is the mechanism that enforces §43 (don't overload).
- Max content width 1440px; reading views 720px.

## 5. Core components

| Component | Behaviour |
|---|---|
| `MissionCard` | the six loop blocks, checkable, minutes + XP per block, one active at a time |
| `StatTile` | mono value, label, delta vs last week, sparkline; delta is coloured only when it is meaningful |
| `HeatBar` | mastery with a **confidence band** — a wide band visibly means "not enough evidence yet" |
| `SkillGraph` | domain → skill map, heat-coloured, prerequisites as edges |
| `EvidenceTable` | every evidence row with difficulty, age, decayed weight, contribution — the §21 "why" |
| `ReadinessRadar` | domain axis radar + dimension bars, with the penalty explained in words |
| `StreakBadge` | days, shields as small pips, at-risk state only when genuinely at risk |
| `LoopStagePill` | learn/build/explain/test/research/apply/interview/review — consistent icon + colour everywhere |
| `ExplanationTabs` | beginner → engineer → enterprise → interview |
| `RubricFeedback` | hit / missed / partial concepts as chips, never a wall of AI prose |
| `CommandPalette` | ⌘K, fuzzy, grouped, action-first |
| `WeaknessCard` | skill, severity, what opened it, what is scheduled, re-test state |

## 6. Motion

Subtle and purposeful. `150ms` for state, `250ms` for layout, `ease-out`.

Only three things animate meaningfully:
1. **Heat fill** when mastery increases — the one moment of delight.
2. **Block completion** in the mission card — a crisp check, not confetti.
3. **Level / achievement unlock** — a single restrained card, dismissible, never blocking.

Everything respects `prefers-reduced-motion`. No confetti. No mascots. No sound.

## 7. Gamification, visually (§16, §53)

| Element | Treatment |
|---|---|
| XP | small mono number, top bar, `+N` floats once on award |
| Level | rank name + progress ring, with the "platform rank, not job title" note on hover |
| Streak | flame glyph at low saturation, shields as pips |
| Momentum | four-band label (Cooling / Warming / Forging / White Hot) + thin bar |
| Achievements | monochrome line-art tiles, colour only when unlocked |
| Boss Battle | full-bleed dark card, `--danger` edge, terminal-styled scenario text |

The test: would a Staff engineer screen-share this in an open-plan office
without minimising it? If not, tone it down.

## 8. Accessibility

- WCAG AA contrast in both themes; the heat scale is validated at AA against
  both backgrounds and is **never** the only carrier of meaning — always paired
  with a number and a rank label.
- Full keyboard operation; visible focus rings; skip links.
- Semantic landmarks; live regions for scoring feedback.
- All charts have an accessible table equivalent behind a toggle.
- Mobile targets ≥ 44px.

## 9. Content presentation

- Code blocks: syntax highlighted, copy button, language label, filename when relevant.
- Mermaid renders inline for architecture and flow content.
- The four explanation levels are visually distinct in density: beginner is airy,
  enterprise is dense and heavier on trade-off callouts.
- Trade-off blocks use a two-column "gain / cost" layout — never a bulleted list,
  because trade-offs are pairs.

## 10. Empty and failure states

Empty states are prescriptive, never decorative:

> **No weaknesses yet.** They appear automatically when you miss something.
> Start today's Test block to generate real signal.

AI failure degrades honestly:

> Couldn't reach the AI grader. Your answer is saved and will be scored
> automatically — the rest of your mission is unaffected.

Never block the daily loop on an AI call.
