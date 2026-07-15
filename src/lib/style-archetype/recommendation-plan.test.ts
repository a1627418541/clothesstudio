import { RecommendationSource } from "@prisma/client";
import { describe, expect, it, vi } from "vitest";
import { StyleRecommendationOutput } from "@/lib/ai/style-ai-provider";
import { V2_ARCHETYPE_MANIFEST } from "./archetype-v2-manifest";
import {
  buildRecommendationPlan,
  isStyleArchetypeV2Enabled,
} from "./recommendation-plan";

const diagnosisAnalysis = {
  gender: "MALE" as const,
  age: 31,
  heightCm: 178,
  weightKg: 72,
  bodyType: "rectangle",
  faceShape: "oval",
  vibeKeywords: ["quiet luxury", "business formal", "streetwear"],
  diagnosisSummary:
    "Refined old money tailoring, executive boardroom structure, and urban street energy.",
};

function legacyRecommendations(label = "Legacy"): StyleRecommendationOutput[] {
  return [1, 2, 3].map((rank) => ({
    title: `${label} ${rank}`,
    description: `${label} description ${rank}`,
    summary: `${label} summary ${rank}`,
    clothingAdvice: `${label} clothing ${rank}`,
    hairstyleAdvice: `${label} hair ${rank}`,
    shoesAdvice: `${label} shoes ${rank}`,
    colorPalette: ["black", "white"],
    avoidTips: [`${label} avoid ${rank}`],
  }));
}

function input(overrides: Record<string, unknown> = {}) {
  return {
    featureFlagValue: "true",
    diagnosisAnalysis,
    archetypes: V2_ARCHETYPE_MANIFEST,
    legacyRecommendations: legacyRecommendations(),
    ...overrides,
  };
}

describe("RecommendationPlan", () => {
  it("enables V2 only for the exact string true", () => {
    expect(isStyleArchetypeV2Enabled("true")).toBe(true);
    for (const value of [undefined, "", "TRUE", "1", " true ", "false"]) {
      expect(isStyleArchetypeV2Enabled(value)).toBe(false);
    }
  });

  it("uses the injected feature flag parser without reading process environment", () => {
    const parseFeatureFlag = vi.fn(() => true);
    const plan = buildRecommendationPlan(
      input({ featureFlagValue: "deployment-controlled" }),
      { parseFeatureFlag }
    );

    expect(parseFeatureFlag).toHaveBeenCalledWith("deployment-controlled");
    expect(plan.mode).toBe(RecommendationSource.ARCHETYPE_V2);
  });

  it("builds exactly three validated V2 drafts and controlled diagnostics", () => {
    const plan = buildRecommendationPlan(input());

    expect(plan.mode).toBe(RecommendationSource.ARCHETYPE_V2);
    if (plan.mode !== RecommendationSource.ARCHETYPE_V2) {
      throw new Error("Expected V2 plan");
    }
    expect(plan.drafts).toHaveLength(3);
    expect(plan.drafts.map((draft) => draft.sourceMode)).toEqual([
      RecommendationSource.ARCHETYPE_V2,
      RecommendationSource.ARCHETYPE_V2,
      RecommendationSource.ARCHETYPE_V2,
    ]);
    expect(plan.drafts.map((draft) => draft.snapshot.selection.rank)).toEqual([
      1, 2, 3,
    ]);
    expect(new Set(plan.drafts.map((draft) => draft.snapshot.provenance.archetypeId)).size)
      .toBe(3);
    expect(plan.diagnostics).toMatchObject({
      pipelineVersion: 2,
      selectedMode: RecommendationSource.ARCHETYPE_V2,
      fallbackReason: null,
      eligibleCount: expect.any(Number),
      availableMacroCategoryCount: expect.any(Number),
    });
    expect(plan.diagnostics.selected).toHaveLength(3);
    expect(JSON.stringify(plan.diagnostics)).not.toMatch(
      /photo|https?:|authorization|credential|prompt/i
    );
  });

  it("does not let legacy recommendation content influence a successful V2 plan", () => {
    const first = buildRecommendationPlan(
      input({ legacyRecommendations: legacyRecommendations("Clean Casual") })
    );
    const second = buildRecommendationPlan(
      input({ legacyRecommendations: legacyRecommendations("Neon Cyberpunk") })
    );

    expect(first.mode).toBe(RecommendationSource.ARCHETYPE_V2);
    expect(second.mode).toBe(RecommendationSource.ARCHETYPE_V2);
    expect(first.drafts).toEqual(second.drafts);
  });

  it("falls back as a whole report when disabled or fewer than three are eligible", () => {
    const disabled = buildRecommendationPlan(input({ featureFlagValue: "TRUE" }));
    expect(disabled).toMatchObject({
      mode: RecommendationSource.LEGACY_AI,
      diagnostics: { fallbackReason: "V2_DISABLED" },
    });
    expect(disabled.drafts).toHaveLength(3);
    expect(disabled.drafts.every((draft) => draft.sourceMode === "LEGACY_AI")).toBe(true);

    const insufficient = buildRecommendationPlan(
      input({ archetypes: V2_ARCHETYPE_MANIFEST.slice(0, 2) })
    );
    expect(insufficient).toMatchObject({
      mode: RecommendationSource.LEGACY_AI,
      diagnostics: { fallbackReason: "INSUFFICIENT_ELIGIBLE_ARCHETYPES" },
    });
    expect(insufficient.drafts).toHaveLength(3);
  });

  it("turns snapshot and set validation domain failures into stable legacy plans", () => {
    const snapshotFailure = buildRecommendationPlan(input(), {
      buildSnapshot() {
        throw new Error("invalid snapshot fixture");
      },
    });
    expect(snapshotFailure).toMatchObject({
      mode: RecommendationSource.LEGACY_AI,
      diagnostics: { fallbackReason: "SNAPSHOT_VALIDATION_FAILED" },
    });
    expect(snapshotFailure.diagnostics.selected).toHaveLength(3);
    expect(snapshotFailure.diagnostics.selected[0]).toEqual(
      expect.objectContaining({
        rank: 1,
        archetypeId: expect.any(String),
        macroCategory: expect.any(String),
        matchScore: expect.any(Number),
      })
    );

    const invalidSet = buildRecommendationPlan(input(), {
      validateSnapshotSet() {
        return { valid: false, reason: "DUPLICATE_RANK" };
      },
    });
    expect(invalidSet).toMatchObject({
      mode: RecommendationSource.LEGACY_AI,
      diagnostics: { fallbackReason: "INVALID_V2_RECOMMENDATION_SET" },
    });
    expect(invalidSet.drafts).toHaveLength(3);
  });
});
