import { describe, expect, it } from "vitest";

import { complexityMatches, complexityTerms } from "./complexity";

describe("complexityTerms", () => {
  it("extracts and normalises big-O terms", () => {
    expect(complexityTerms("O(n) time, O(n) space")).toEqual(["o(n)", "o(n)"]);
    expect(complexityTerms("O( n log n ) time")).toEqual(["o(nlogn)"]);
  });

  it("returns nothing for prose without a big-O term", () => {
    expect(complexityTerms("linear time")).toEqual([]);
  });
});

describe("complexityMatches", () => {
  it("ignores wording and order", () => {
    expect(complexityMatches("O(n) time, O(n) space", "O(n) space and O(n) time")).toBe(true);
    expect(complexityMatches("o(n) TIME, O(N) space", "O(n) time, O(n) space")).toBe(true);
  });

  it("catches a genuinely wrong bound", () => {
    expect(complexityMatches("O(n log n) time, O(1) space", "O(n) time, O(n) space")).toBe(false);
    expect(complexityMatches("O(n^2) time, O(1) space", "O(n) time, O(n) space")).toBe(false);
  });

  it("catches a claim that omits a term", () => {
    expect(complexityMatches("O(n) time", "O(n) time, O(n) space")).toBe(false);
  });

  it("returns null when there is nothing to compare", () => {
    expect(complexityMatches("", "O(n) time")).toBeNull();
    expect(complexityMatches("O(n) time", null)).toBeNull();
    expect(complexityMatches("   ", "O(n) time")).toBeNull();
  });

  it("returns null rather than false for prose with no big-O term", () => {
    // "linear time" may well be right; we just can't compare it, and marking
    // an unparseable claim wrong would penalise the wrong thing.
    expect(complexityMatches("linear time and linear space", "O(n) time, O(n) space")).toBeNull();
  });
});
