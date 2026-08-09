/**
 * Progress storytelling — docs/02-domain-engines.md §7
 *
 * Numbers do not tell a learner whether they are doing well. 31 mastery in
 * Databases means nothing on its own; "31, up from 12 two weeks ago, and the
 * fastest-moving thing you have" means something. This engine turns the raw
 * state into that second sentence.
 *
 * Two rules hold it honest, because encouragement that isn't true stops being
 * encouragement the first time the learner notices:
 *
 *   1. Every beat cites a real number the learner can go and verify.
 *   2. When the picture is bad, the beat says so. It picks the kindest true
 *      framing available — never a false one. A product that tells you you're
 *      doing great while your recall collapses is worse than a silent one.
 *
 * Pure: `now` is always an argument, no I/O, no formatting decisions that
 * belong to the UI.
 */

import { round } from "@/lib/utils";

/** How loud the beat should be. The UI maps these to colour and weight. */
export type StoryTone = "celebrate" | "encourage" | "steady" | "nudge" | "warn";

export interface StoryBeat {
  /** Stable id so the UI can key and de-duplicate across renders. */
  id: string;
  tone: StoryTone;
  /** The headline. One sentence, past-or-present tense, always with a number. */
  text: string;
  /** Optional second sentence: what it means, or what to do about it. */
  detail?: string;
  /** Higher wins when more beats qualify than the UI has room for. */
  priority: number;
}

export interface SkillDelta {
  skillId: string;
  name: string;
  mastery: number;
  /** Mastery this skill had at the start of the window. */
  masteryBefore: number;
}

export interface StoryInput {
  /** Days since the learner started. 0 on day one. */
  daysActive: number;
  currentStreak: number;
  longestStreak: number;
  /** Study days missed in the last 7 that were scheduled. */
  missedThisWeek: number;

  totalXp: number;
  xpThisWeek: number;
  xpLastWeek: number;

  momentum: number;
  momentumLastWeek: number;

  /** Every skill the learner has touched, with its value a window ago. */
  skills: readonly SkillDelta[];
  /** Skills at or above the "working" threshold. */
  readiness: number;
  readinessBefore: number;

  reviewsDue: number;
  reviewsOverdue: number;
  /** Correct / total on revision in the window. Null when nothing was due. */
  recallRate: number | null;

  weaknessesOpen: number;
  weaknessesResolvedThisWeek: number;

  /** Distinct Forge Loop stages used this week (learn, build, explain, …). */
  stagesUsedThisWeek: number;
}

/** Below this, "improvement" is noise in the estimator rather than learning. */
export const MEANINGFUL_MASTERY_GAIN = 4;

/** A recall rate under this is the signal that matters most, so it outranks everything. */
export const RECALL_CONCERN_THRESHOLD = 0.6;

const pct = (n: number) => `${Math.round(n * 100)}%`;

/**
 * The opening line. Always present, so the page never renders an empty space
 * where the learner expects to be told how they are doing.
 */
export function openingBeat(input: StoryInput): StoryBeat {
  if (input.daysActive === 0) {
    return {
      id: "opening-day-one",
      tone: "encourage",
      text: "Day one. Nothing here is measured against anyone but you.",
      detail:
        "Your mastery numbers start low on purpose — they reflect evidence, and you haven't produced any yet. That changes with the first thing you finish.",
      priority: 100,
    };
  }

  if (input.daysActive < 7) {
    return {
      id: "opening-first-week",
      tone: "encourage",
      text: `Day ${input.daysActive + 1}. You're still in the part where the numbers move slowly.`,
      detail:
        "Mastery is confidence-shrunk early on: with little evidence, the system deliberately holds your score below what one good session suggests. It catches up once there's enough to trust.",
      priority: 100,
    };
  }

  const weeks = Math.floor(input.daysActive / 7);
  return {
    id: "opening-established",
    tone: "steady",
    text: `${weeks} week${weeks === 1 ? "" : "s"} in, ${input.totalXp.toLocaleString()} XP earned.`,
    priority: 100,
  };
}

/** The one skill worth naming — biggest genuine gain in the window. */
export function fastestMover(input: StoryInput, minGain = MEANINGFUL_MASTERY_GAIN): StoryBeat | null {
  let best: SkillDelta | null = null;
  let bestGain = 0;

  for (const s of input.skills) {
    const gain = s.mastery - s.masteryBefore;
    if (gain > bestGain) {
      best = s;
      bestGain = gain;
    }
  }

  if (!best || bestGain < minGain) return null;

  return {
    id: `mover-${best.skillId}`,
    tone: "celebrate",
    text: `${best.name} moved from ${Math.round(best.masteryBefore)} to ${Math.round(best.mastery)}.`,
    detail: `That's your fastest-moving skill — ${round(bestGain, 1)} points of mastery, backed by real evidence rather than time spent.`,
    priority: 70,
  };
}

/** Skills sliding backwards. Decay is silent, which is exactly why it needs saying. */
export function decayBeat(input: StoryInput, minLoss = MEANINGFUL_MASTERY_GAIN): StoryBeat | null {
  const slipping = input.skills.filter((s) => s.masteryBefore - s.mastery >= minLoss);
  if (slipping.length === 0) return null;

  const worst = slipping.reduce((a, b) =>
    a.masteryBefore - a.mastery > b.masteryBefore - b.mastery ? a : b,
  );

  return {
    id: "decay",
    tone: "nudge",
    text:
      slipping.length === 1
        ? `${worst.name} has drifted down to ${Math.round(worst.mastery)}.`
        : `${slipping.length} skills have drifted down, ${worst.name} the most.`,
    detail:
      "Mastery decays on a 45-day half-life, so this isn't a penalty — it's evidence going stale. One revision session reverses it.",
    priority: 55,
  };
}

/** Recall is the load-bearing signal: it's the difference between learned and read. */
export function recallBeat(input: StoryInput): StoryBeat | null {
  if (input.recallRate === null) return null;

  if (input.recallRate < RECALL_CONCERN_THRESHOLD) {
    return {
      id: "recall-low",
      tone: "warn",
      text: `You're recalling ${pct(input.recallRate)} of what you revise.`,
      detail:
        "That usually means you're covering new ground faster than it's sticking. Slowing intake for a few days and clearing the review queue fixes it faster than pushing on.",
      priority: 95,
    };
  }

  if (input.recallRate >= 0.85) {
    return {
      id: "recall-strong",
      tone: "celebrate",
      text: `${pct(input.recallRate)} recall on revision this week.`,
      detail: "This is the number that separates knowing a thing from having read it.",
      priority: 60,
    };
  }

  return null;
}

/** Streaks matter, but only when the truth about them is useful. */
export function streakBeat(input: StoryInput): StoryBeat | null {
  if (input.currentStreak >= 7 && input.currentStreak === input.longestStreak) {
    return {
      id: "streak-record",
      tone: "celebrate",
      text: `${input.currentStreak}-day streak — your longest yet.`,
      priority: 65,
    };
  }

  if (input.currentStreak >= 3) {
    return {
      id: "streak-running",
      tone: "steady",
      text: `${input.currentStreak} days in a row.`,
      priority: 30,
    };
  }

  if (input.currentStreak === 0 && input.longestStreak >= 5) {
    return {
      id: "streak-broken",
      tone: "encourage",
      text: `Your streak reset, but you've held ${input.longestStreak} days before.`,
      detail: "Streaks measure consistency, not capability. Nothing you've learned was lost.",
      priority: 50,
    };
  }

  return null;
}

/** The queue, framed by whether it's actually a problem yet. */
export function reviewBeat(input: StoryInput): StoryBeat | null {
  if (input.reviewsOverdue >= 10) {
    return {
      id: "review-backlog",
      tone: "warn",
      text: `${input.reviewsOverdue} reviews are overdue.`,
      detail:
        "Overdue items are the ones decaying fastest. Clearing these is worth more mastery than starting anything new.",
      priority: 90,
    };
  }

  if (input.reviewsDue > 0 && input.reviewsOverdue === 0) {
    return {
      id: "review-current",
      tone: "steady",
      text: `${input.reviewsDue} due for review, none overdue.`,
      priority: 20,
    };
  }

  return null;
}

/** Breadth: a week spent only reading scores badly however many hours it took. */
export function breadthBeat(input: StoryInput): StoryBeat | null {
  if (input.daysActive < 7) return null;

  if (input.stagesUsedThisWeek <= 1 && input.xpThisWeek > 0) {
    return {
      id: "breadth-narrow",
      tone: "nudge",
      text: "Everything this week came from one kind of work.",
      detail:
        "Reading produces the weakest evidence in the model. An explanation or a build on the same material is worth several times more, for the same hour.",
      priority: 75,
    };
  }

  if (input.stagesUsedThisWeek >= 4) {
    return {
      id: "breadth-wide",
      tone: "celebrate",
      text: `You closed the loop ${input.stagesUsedThisWeek} different ways this week.`,
      detail: "Breadth is 15% of momentum specifically because this is the hard part to sustain.",
      priority: 45,
    };
  }

  return null;
}

/** Weaknesses turning into resolutions is the loop working as designed. */
export function weaknessBeat(input: StoryInput): StoryBeat | null {
  if (input.weaknessesResolvedThisWeek > 0) {
    return {
      id: "weakness-resolved",
      tone: "celebrate",
      text: `You closed ${input.weaknessesResolvedThisWeek} open weakness${
        input.weaknessesResolvedThisWeek === 1 ? "" : "es"
      } this week.`,
      detail: "Each one was found by you failing something, then proving you'd fixed it.",
      priority: 68,
    };
  }

  if (input.weaknessesOpen >= 5) {
    return {
      id: "weakness-piling",
      tone: "nudge",
      text: `${input.weaknessesOpen} weaknesses are open.`,
      detail:
        "These were each opened by a specific failure, and they close on evidence rather than time. They're the highest-value work available to you.",
      priority: 72,
    };
  }

  return null;
}

/** Trajectory across weeks — the thing a single snapshot can never show. */
export function trajectoryBeat(input: StoryInput): StoryBeat | null {
  if (input.daysActive < 14) return null;

  const readinessGain = input.readiness - input.readinessBefore;
  if (readinessGain >= 3) {
    return {
      id: "trajectory-up",
      tone: "celebrate",
      text: `Readiness is up ${round(readinessGain, 1)} points, now ${Math.round(input.readiness)}.`,
      detail: "This is the number a hiring manager would care about, and it only moves on evidence.",
      priority: 80,
    };
  }

  if (input.momentum < 35 && input.momentumLastWeek >= 35) {
    return {
      id: "trajectory-cooling",
      tone: "nudge",
      text: `Momentum dropped from ${Math.round(input.momentumLastWeek)} to ${Math.round(input.momentum)}.`,
      detail:
        "Momentum is a 7-day window, so it recovers as fast as it fell. Two solid days brings it back.",
      priority: 62,
    };
  }

  if (input.xpThisWeek > input.xpLastWeek * 1.5 && input.xpLastWeek > 0) {
    return {
      id: "trajectory-accelerating",
      tone: "celebrate",
      text: `${input.xpThisWeek.toLocaleString()} XP this week, against ${input.xpLastWeek.toLocaleString()} last.`,
      priority: 58,
    };
  }

  return null;
}

/**
 * The full story, highest-priority first.
 *
 * The opening beat is always index 0 regardless of priority — it sets the frame
 * the rest is read in, so it cannot be outranked by a warning that would
 * otherwise open the page with bad news and no context.
 */
export function buildStory(input: StoryInput, limit = 4): StoryBeat[] {
  const opening = openingBeat(input);

  const rest = [
    recallBeat(input),
    reviewBeat(input),
    trajectoryBeat(input),
    breadthBeat(input),
    weaknessBeat(input),
    fastestMover(input),
    streakBeat(input),
    decayBeat(input),
  ]
    .filter((b): b is StoryBeat => b !== null)
    .sort((a, b) => b.priority - a.priority);

  return [opening, ...rest].slice(0, Math.max(1, limit));
}
