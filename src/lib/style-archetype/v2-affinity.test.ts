import { describe, expect, it } from "vitest";
import { V2_ARCHETYPE_MANIFEST } from "./archetype-v2-manifest";
import { EligibleV2Archetype } from "./v2-eligibility";
import {
  rankEligibleArchetypes,
  scoreEligibleArchetype,
} from "./v2-affinity";

const oldMoney = V2_ARCHETYPE_MANIFEST.find((row) => row.slug === "old-money")!;
const cleanMinimal = V2_ARCHETYPE_MANIFEST.find((row) => row.slug === "clean-minimal")!;
const input = {
  gender: "MALE" as const,
  age: 32,
  heightCm: 178,
  weightKg: 72,
  bodyType: "rectangle",
  faceShape: "oval",
  vibeKeywords: ["quiet luxury"],
  diagnosisSummary: "heritage tailoring in a discreet club setting",
};

function withVibe(slug: string, vibeAliases: string[]): EligibleV2Archetype {
  return { ...oldMoney, id: slug, slug, vibeAliases };
}

describe("Archetype V2 affinity scorer", () => {
  it("orders exact phrase above alias, multi-token, and partial token", () => {
    const scores = [
      withVibe("exact", ["quiet luxury"]),
      withVibe("alias", ["old money"]),
      withVibe("multi", ["luxury quiet"]),
      withVibe("partial", ["quiet heritage"]),
    ].map((archetype) => scoreEligibleArchetype(input, archetype).breakdown.vibe);

    expect(scores[0]).toBeGreaterThan(scores[1]);
    expect(scores[1]).toBeGreaterThan(scores[2]);
    expect(scores[2]).toBeGreaterThan(scores[3]);
  });

  it("caps a generic-only match at 25 percent of the dimension", () => {
    const result = scoreEligibleArchetype(
      { ...input, vibeKeywords: ["clean"], diagnosisSummary: "" },
      withVibe("generic", ["clean"])
    );
    expect(result.breakdown.vibe).toBeLessThanOrEqual(30 * 0.25);
  });

  it("makes quiet luxury Old Money beat generic Clean Minimal", () => {
    const ranked = rankEligibleArchetypes(input, [cleanMinimal, oldMoney]);
    expect(ranked.map((item) => item.archetype.slug)).toEqual([
      "old-money",
      "clean-minimal",
    ]);
    expect(ranked[0].breakdown.matchedPhrases).toContain("quiet luxury");
  });

  it("classifies one summary evidence into only one channel", () => {
    const archetype = {
      ...oldMoney,
      clothingMatchTerms: ["heritage"],
      sceneMatchTerms: ["heritage"],
      personalityTerms: ["heritage"],
    };
    const result = scoreEligibleArchetype(
      { ...input, vibeKeywords: [], diagnosisSummary: "heritage" },
      archetype
    );
    expect(
      [result.breakdown.clothing, result.breakdown.scene, result.breakdown.personality].filter(
        (score) => score > 0
      )
    ).toHaveLength(1);
  });

  it("does not score height, weight, or legacy recommendation copy", () => {
    const firstInput = {
      ...input,
      heightCm: 150,
      weightKg: 45,
      legacyRecommendations: ["Clean Casual"],
    };
    const secondInput = {
      ...input,
      heightCm: 200,
      weightKg: 110,
      legacyRecommendations: ["Streetwear"],
    };
    const first = rankEligibleArchetypes(firstInput, [cleanMinimal, oldMoney]);
    const second = rankEligibleArchetypes(secondInput, [cleanMinimal, oldMoney]);
    expect(first.map((item) => [item.archetype.slug, item.matchScore])).toEqual(
      second.map((item) => [item.archetype.slug, item.matchScore])
    );
  });

  it("keeps total and rounded matchScore in the 0 to 100 range", () => {
    const result = scoreEligibleArchetype(input, oldMoney);
    expect(result.breakdown.total).toBeGreaterThanOrEqual(0);
    expect(result.breakdown.total).toBeLessThanOrEqual(100);
    expect(result.matchScore).toBe(Math.round(result.breakdown.total));
  });
});
