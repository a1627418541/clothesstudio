import { describe, it, expect } from "vitest";
import { MATCH_WEIGHTS, validateWeights } from "./match-config";

describe("match-config", () => {
  it("sums to 1", () => {
    const total = MATCH_WEIGHTS.vibe + MATCH_WEIGHTS.body + MATCH_WEIGHTS.age + MATCH_WEIGHTS.gender;
    expect(total).toBeCloseTo(1);
  });

  it("validates correct weights", () => {
    expect(() => validateWeights(MATCH_WEIGHTS)).not.toThrow();
  });

  it("throws when weights do not sum to 1", () => {
    expect(() => validateWeights({ vibe: 0.6, body: 0.5, age: 0, gender: 0 })).toThrow();
  });
});
