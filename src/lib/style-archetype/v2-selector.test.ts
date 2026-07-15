import { MacroCategory } from "@prisma/client";
import { describe, expect, it } from "vitest";
import { V2_ARCHETYPE_MANIFEST } from "./archetype-v2-manifest";
import { ScoredEligibleArchetype } from "./v2-affinity";
import { selectV2TopThree } from "./v2-selector";

const base = V2_ARCHETYPE_MANIFEST[0];

function scored(slug: string, macroCategory: MacroCategory, total: number): ScoredEligibleArchetype {
  return {
    archetype: { ...base, id: slug, slug, macroCategory },
    breakdown: {
      vibe: 0, body: 0, face: 0, age: 0, clothing: 0, scene: 0,
      personality: 0, total, matchedPhrases: [], matchedAliases: [],
    },
    matchScore: Math.round(total),
    completePhraseCount: 0,
    aliasMatchCount: 0,
  };
}

describe("hard macro diversity selector", () => {
  const rows = [
    scored("primary", MacroCategory.DAILY_CLEAN, 100),
    scored("same-macro", MacroCategory.DAILY_CLEAN, 99),
    scored("classic", MacroCategory.CLASSIC_PREMIUM, 98),
    scored("formal", MacroCategory.BUSINESS_FORMAL, 97),
  ];

  it("keeps global rank 1 primary and chooses two new macros", () => {
    const result = selectV2TopThree(rows);
    expect(result.selected.map((row) => row.archetype.slug)).toEqual([
      "primary", "classic", "formal",
    ]);
    expect(result.availableMacroCategoryCount).toBe(3);
    expect(result.diversityWarning).toBeNull();
    expect(result.fallbackReason).toBeNull();
  });

  it("covers two macros before reusing one and warns", () => {
    const result = selectV2TopThree(rows.slice(0, 3));
    expect(result.selected.map((row) => row.archetype.slug)).toEqual([
      "primary", "classic", "same-macro",
    ]);
    expect(result.diversityWarning).toBe("ONLY_TWO_MACRO_CATEGORIES");
  });

  it("selects the top three from one macro and warns", () => {
    const result = selectV2TopThree([
      scored("c", MacroCategory.DAILY_CLEAN, 80),
      scored("a", MacroCategory.DAILY_CLEAN, 90),
      scored("b", MacroCategory.DAILY_CLEAN, 85),
    ]);
    expect(result.selected.map((row) => row.archetype.slug)).toEqual(["a", "b", "c"]);
    expect(result.diversityWarning).toBe("ONLY_ONE_MACRO_CATEGORY");
  });

  it("returns stable fallback only when fewer than three are eligible", () => {
    expect(selectV2TopThree(rows.slice(0, 2))).toMatchObject({
      selected: [],
      fallbackReason: "INSUFFICIENT_ELIGIBLE_ARCHETYPES",
    });
  });

  it("is invariant to input order", () => {
    const expected = selectV2TopThree(rows).selected.map((row) => row.archetype.slug);
    const shuffled = selectV2TopThree([rows[3], rows[1], rows[0], rows[2]]);
    expect(shuffled.selected.map((row) => row.archetype.slug)).toEqual(expected);
  });
});
