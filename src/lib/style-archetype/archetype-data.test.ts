import { describe, it, expect } from "vitest";
import { ALL_ARCHETYPES, MALE_ARCHETYPES, FEMALE_ARCHETYPES } from "./archetype-data";

describe("archetype-data", () => {
  it("has 10 male and 10 female archetypes", () => {
    expect(MALE_ARCHETYPES).toHaveLength(10);
    expect(FEMALE_ARCHETYPES).toHaveLength(10);
    expect(ALL_ARCHETYPES).toHaveLength(20);
  });

  it("has unique slugs", () => {
    const slugs = ALL_ARCHETYPES.map((a) => a.slug);
    expect(new Set(slugs).size).toBe(slugs.length);
  });

  it("has no cleafit archetype", () => {
    const slugs = ALL_ARCHETYPES.map((a) => a.slug);
    expect(slugs).not.toContain("cleafit");
  });
});
