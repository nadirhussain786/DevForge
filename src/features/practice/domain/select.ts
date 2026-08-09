/**
 * Interview question selection — docs/02-domain-engines.md §9
 *
 * Deterministic rather than random: quota-based sampling with a stable
 * tie-break. The same inputs always produce the same drill, which makes the
 * selection reviewable ("why was I asked this?") and testable.
 */

export const POOLS = ["weakness", "lowConfidence", "jd", "breadth"] as const;
export type Pool = (typeof POOLS)[number];

/** Shares from §9. They sum to 1; quotas are computed against the request size. */
export const POOL_SHARES: Record<Pool, number> = {
  weakness: 0.5,
  lowConfidence: 0.25,
  jd: 0.15,
  breadth: 0.1,
};

/** A question already seen this recently is not asked again — unless it's due revision. */
export const REPEAT_COOLDOWN_DAYS = 21;

export interface Candidate {
  questionId: string;
  skillId: string;
  difficulty: number;
  /** Higher is more urgent within its own pool. */
  priority: number;
  lastSeenAt: Date | null;
  /** Due revision items bypass the cooldown — being re-asked *is* the point. */
  isDueRevision?: boolean;
}

export interface SelectedQuestion extends Candidate {
  pool: Pool;
  /** Rendered in the UI so the drill can say why it picked this. */
  reason: string;
}

const POOL_REASONS: Record<Pool, string> = {
  weakness: "From an open weakness",
  lowConfidence: "Low confidence for your target role",
  jd: "Required by a job description you saved",
  breadth: "Breadth — keeping you honest outside your comfort zone",
};

function ageInDays(from: Date, now: Date): number {
  return (now.getTime() - from.getTime()) / 86_400_000;
}

export function isEligible(candidate: Candidate, now: Date): boolean {
  if (candidate.isDueRevision) return true;
  if (!candidate.lastSeenAt) return true;
  return ageInDays(candidate.lastSeenAt, now) >= REPEAT_COOLDOWN_DAYS;
}

/** Priority desc, then id — never depends on input array order. */
function byPriority(a: Candidate, b: Candidate): number {
  if (b.priority !== a.priority) return b.priority - a.priority;
  return a.questionId.localeCompare(b.questionId);
}

export interface SelectionInput {
  pools: Partial<Record<Pool, readonly Candidate[]>>;
  count: number;
  now: Date;
}

/**
 * Fills each pool to its quota in priority order, then redistributes whatever
 * the thin pools could not supply. A new user has no weaknesses and no saved
 * job descriptions, so without redistribution their drill would be 10% full.
 */
export function selectQuestions(input: SelectionInput): SelectedQuestion[] {
  const { count, now } = input;
  if (count <= 0) return [];

  const eligible = new Map<Pool, Candidate[]>();
  for (const pool of POOLS) {
    eligible.set(
      pool,
      [...(input.pools[pool] ?? [])].filter((c) => isEligible(c, now)).sort(byPriority),
    );
  }

  const chosen: SelectedQuestion[] = [];
  const taken = new Set<string>();

  const take = (pool: Pool, limit: number) => {
    if (limit <= 0) return;
    let added = 0;
    for (const candidate of eligible.get(pool) ?? []) {
      if (added >= limit || chosen.length >= count) break;
      if (taken.has(candidate.questionId)) continue;
      taken.add(candidate.questionId);
      chosen.push({ ...candidate, pool, reason: POOL_REASONS[pool] });
      added++;
    }
  };

  // Pass 1 — each pool up to its quota, in the documented priority order.
  for (const pool of POOLS) {
    take(pool, Math.round(count * POOL_SHARES[pool]));
  }

  // Pass 2 — redistribute the shortfall to whichever pools still have material.
  for (const pool of POOLS) {
    if (chosen.length >= count) break;
    take(pool, count - chosen.length);
  }

  return chosen;
}

/**
 * Mix of difficulties for a session. Opening on the hardest question is a good
 * way to make someone close the tab, so lead with something winnable and
 * escalate.
 */
export function orderForSession(questions: readonly SelectedQuestion[]): SelectedQuestion[] {
  return [...questions].sort(
    (a, b) => a.difficulty - b.difficulty || a.questionId.localeCompare(b.questionId),
  );
}
