/**
 * Comparing a learner's stated complexity against the target.
 *
 * Deliberately loose: it compares the ordered set of big-O terms, so wording
 * and order don't matter but the actual bounds do. Claiming the right answer
 * with the wrong cost is a real, separable gap — and it's the part an
 * interviewer probes after the code works.
 */

export function complexityTerms(value: string): string[] {
  return (value.toLowerCase().match(/o\(\s*[^)]+\s*\)/g) ?? [])
    .map((term) => term.replace(/\s+/g, ""))
    .sort();
}

/** null when there is nothing to compare — no claim, or no target on the problem. */
export function complexityMatches(
  claim: string | undefined | null,
  target: string | undefined | null,
): boolean | null {
  if (!claim?.trim() || !target?.trim()) return null;

  const claimed = complexityTerms(claim);
  const expected = complexityTerms(target);
  if (claimed.length === 0 || expected.length === 0) return null;

  return JSON.stringify(claimed) === JSON.stringify(expected);
}
