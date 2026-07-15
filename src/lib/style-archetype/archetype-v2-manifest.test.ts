import { describe, expect, it } from "vitest";
import { findRequiredForbiddenConflicts } from "./canonical-items";
import {
  V2_ARCHETYPE_MANIFEST,
  V2_ARCHETYPE_SLUGS,
  validateV2Manifest,
} from "./archetype-v2-manifest";

describe("Archetype V2 manifest", () => {
  it("contains exactly the approved 20 unique slugs", () => {
    const slugs = V2_ARCHETYPE_MANIFEST.map((row) => row.slug);
    expect(slugs).toHaveLength(20);
    expect(new Set(slugs).size).toBe(20);
    expect(slugs).toEqual(V2_ARCHETYPE_SLUGS);
  });

  it("locks the approved slug, gender, and macro matrix", () => {
    expect(
      V2_ARCHETYPE_MANIFEST.map(({ slug, genderScope, macroCategory }) => [
        slug,
        genderScope,
        macroCategory,
      ])
    ).toEqual([
      ["clean-minimal", "UNISEX", "DAILY_CLEAN"],
      ["smart-casual", "MALE", "DAILY_CLEAN"],
      ["old-money", "MALE", "CLASSIC_PREMIUM"],
      ["japanese-minimal", "UNISEX", "ARTISTIC_MINIMAL"],
      ["streetwear", "UNISEX", "URBAN_STREET"],
      ["business-formal", "MALE", "BUSINESS_FORMAL"],
      ["preppy", "MALE", "CLASSIC_PREMIUM"],
      ["workwear", "MALE", "OUTDOOR_FUNCTIONAL"],
      ["gorpcore", "MALE", "OUTDOOR_FUNCTIONAL"],
      ["french-casual", "MALE", "DAILY_CLEAN"],
      ["minimal-chic", "FEMALE", "DAILY_CLEAN"],
      ["korean-soft-minimal", "FEMALE", "ROMANTIC_SOFT"],
      ["french-chic", "FEMALE", "CLASSIC_PREMIUM"],
      ["old-money-feminine", "FEMALE", "CLASSIC_PREMIUM"],
      ["romantic-feminine", "FEMALE", "ROMANTIC_SOFT"],
      ["street-fashion", "FEMALE", "URBAN_STREET"],
      ["office-professional", "FEMALE", "BUSINESS_FORMAL"],
      ["japanese-natural", "FEMALE", "ARTISTIC_MINIMAL"],
      ["y2k-trend", "FEMALE", "TREND_YOUTH"],
      ["active-lifestyle", "FEMALE", "SPORT_ACTIVE"],
    ]);
  });

  it("passes complete V2 validation", () => {
    expect(validateV2Manifest(V2_ARCHETYPE_MANIFEST)).toEqual({
      valid: true,
      errors: [],
    });
  });

  it("has versioned, populated, non-conflicting rows", () => {
    for (const row of V2_ARCHETYPE_MANIFEST) {
      expect(row.version).toBe(2);
      expect(row.active).toBe(true);
      expect(row.clothingDNA).not.toBe("");
      expect(row.hairstyleDNA).not.toBe("");
      expect(row.shoesDNA).not.toBe("");
      expect(row.colorDNA.length).toBeGreaterThan(0);
      expect(row.avoidDNA).not.toBe("");
      expect(findRequiredForbiddenConflicts(row.requiredItems, row.forbiddenItems)).toEqual([]);

      const scorerTerms = [
        row.vibeAliases,
        row.clothingMatchTerms,
        row.sceneMatchTerms,
        row.personalityTerms,
      ];
      expect(scorerTerms.every((terms) => terms.length > 0)).toBe(true);
      const flattened = scorerTerms.flat().map((term) => term.toLowerCase());
      expect(new Set(flattened).size).toBe(flattened.length);
    }
  });

  it("contains the mandatory visual anchors", () => {
    const bySlug = Object.fromEntries(V2_ARCHETYPE_MANIFEST.map((row) => [row.slug, row]));
    expect(bySlug["old-money"].requiredItems).toEqual(
      expect.arrayContaining(["knit-polo", "cashmere-sweater", "tailored-trousers", "loafers"])
    );
    expect(bySlug["old-money"].forbiddenItems).toEqual(
      expect.arrayContaining(["hoodie", "graphic-t-shirt", "ripped-jeans", "chunky-sneakers"])
    );
    expect(bySlug["business-formal"].requiredItems).toEqual(
      expect.arrayContaining(["suit-jacket", "dress-shirt", "tailored-trousers", "dress-shoes"])
    );
    expect(bySlug["business-formal"].forbiddenItems).toEqual(
      expect.arrayContaining(["t-shirt", "hoodie", "sneakers", "jeans"])
    );
    expect(bySlug.streetwear.requiredItems).toEqual(
      expect.arrayContaining(["hoodie", "cargo-pants", "statement-sneakers"])
    );
    expect(bySlug.streetwear.forbiddenItems).toEqual(
      expect.arrayContaining(["blazer", "loafers", "tailored-trousers", "dress-shirt"])
    );
    expect(bySlug["japanese-minimal"].requiredItems).toEqual(
      expect.arrayContaining([
        "relaxed-layering",
        "oversized-shirt",
        "wide-leg-trousers",
        "minimal-leather-shoes",
      ])
    );
    expect(bySlug["japanese-minimal"].forbiddenItems).toEqual(
      expect.arrayContaining(["tight-polo", "business-suit", "loud-graphics"])
    );
  });
});
