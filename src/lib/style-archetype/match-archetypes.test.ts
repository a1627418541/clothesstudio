import { describe, it, expect } from "vitest";
import { matchArchetypes, StyleMatchInput } from "./match-archetypes";
import { StyleArchetype, GenderScope } from "@prisma/client";

function makeArchetype(overrides: Partial<StyleArchetype> & { slug: string; name: string }): StyleArchetype {
  return {
    ...overrides,
    id: overrides.slug,
    slug: overrides.slug,
    name: overrides.name,
    genderScope: overrides.genderScope ?? GenderScope.MALE,
    category: overrides.category ?? "Test",
    description: "",
    personalityLabel: overrides.personalityLabel ?? overrides.name,
    keywords: overrides.keywords ?? [],
    clothingDNA: "",
    hairstyleDNA: "",
    shoesDNA: "",
    colorDNA: [],
    avoidDNA: "",
    imagePromptTemplate: "",
    version: 1,
    active: true,
    createdAt: new Date(),
    updatedAt: new Date(),
  } as StyleArchetype;
}

const baseInput: StyleMatchInput = {
  gender: "MALE",
  age: 30,
  heightCm: 178,
  weightKg: 75,
  bodyType: "rectangle",
  faceShape: "oval",
  vibeKeywords: ["minimal", "clean", "premium"],
};

describe("matchArchetypes", () => {
  it("returns top 3 matches sorted by score", () => {
    const archetypes = [
      makeArchetype({ slug: "clean-minimal", name: "Clean Minimal", category: "Minimal", keywords: ["minimal", "clean", "premium"], genderScope: GenderScope.MALE }),
      makeArchetype({ slug: "smart-casual", name: "Smart Casual", category: "Business Casual", keywords: ["refined", "office"], genderScope: GenderScope.MALE }),
      makeArchetype({ slug: "streetwear", name: "Streetwear", category: "Urban", keywords: ["urban", "oversized"], genderScope: GenderScope.MALE }),
      makeArchetype({ slug: "old-money", name: "Old Money", category: "Luxury Classic", keywords: ["classic", "heritage"], genderScope: GenderScope.MALE }),
    ];

    const results = matchArchetypes(baseInput, archetypes);
    expect(results).toHaveLength(3);
    expect(results[0].slug).toBe("clean-minimal");
    expect(results[0].score).toBeGreaterThanOrEqual(results[1].score);
    expect(results[1].score).toBeGreaterThanOrEqual(results[2].score);
  });

  it("avoids duplicate categories in top 3", () => {
    const archetypes = [
      makeArchetype({ slug: "a", name: "A", category: "Minimal", keywords: ["minimal"], genderScope: GenderScope.MALE }),
      makeArchetype({ slug: "b", name: "B", category: "Minimal", keywords: ["minimal"], genderScope: GenderScope.MALE }),
      makeArchetype({ slug: "c", name: "C", category: "Minimal", keywords: ["minimal"], genderScope: GenderScope.MALE }),
      makeArchetype({ slug: "d", name: "D", category: "Urban", keywords: ["urban"], genderScope: GenderScope.MALE }),
      makeArchetype({ slug: "e", name: "E", category: "Luxury Classic", keywords: ["classic"], genderScope: GenderScope.MALE }),
    ];

    const results = matchArchetypes(baseInput, archetypes);
    const categories = results.map((r) => r.archetype.category);
    expect(new Set(categories).size).toBe(3);
  });

  it("filters out scores below floor", () => {
    const archetypes = [
      makeArchetype({ slug: "match", name: "Match", category: "Minimal", keywords: ["minimal"], genderScope: GenderScope.MALE }),
      makeArchetype({ slug: "miss", name: "Miss", category: "Trend", keywords: ["steampunk"], genderScope: GenderScope.FEMALE }),
    ];

    const results = matchArchetypes({ ...baseInput, bodyType: "hourglass" }, archetypes);
    expect(results.every((r) => r.score >= 30)).toBe(true);
    expect(results.map((r) => r.slug)).not.toContain("miss");
  });

  it("respects configurable weights", () => {
    const archetypes = [
      makeArchetype({ slug: "vibe-match", name: "Vibe Match", category: "A", keywords: ["minimal", "clean", "premium"], genderScope: GenderScope.MALE }),
      makeArchetype({ slug: "body-match", name: "Body Match", category: "Utility", keywords: ["rugged"], genderScope: GenderScope.MALE }),
    ];

    const vibeHeavy = matchArchetypes(baseInput, archetypes, {
      weights: { vibe: 0.9, body: 0.05, age: 0.025, gender: 0.025 },
    });
    expect(vibeHeavy[0].slug).toBe("vibe-match");

    const bodyInput: StyleMatchInput = { ...baseInput, vibeKeywords: ["unknown"], bodyType: "athletic" };
    const bodyHeavy = matchArchetypes(bodyInput, archetypes, {
      weights: { vibe: 0.05, body: 0.9, age: 0.025, gender: 0.025 },
    });
    expect(bodyHeavy[0].slug).toBe("body-match");
  });

  it("does not hard-code style names", () => {
    const archetypes = [
      makeArchetype({ slug: "alpha", name: "Alpha", category: "A", keywords: ["minimal"], genderScope: GenderScope.MALE }),
      makeArchetype({ slug: "beta", name: "Beta", category: "B", keywords: ["classic"], genderScope: GenderScope.MALE }),
      makeArchetype({ slug: "gamma", name: "Gamma", category: "C", keywords: ["urban"], genderScope: GenderScope.MALE }),
    ];

    const results = matchArchetypes(baseInput, archetypes);
    expect(results).toHaveLength(3);
    const slugs = results.map((r) => r.slug);
    expect(slugs).not.toContain("old-money");
    expect(slugs).not.toContain("smart-casual");
  });
});
