import { RecommendationSource } from "@prisma/client";
import { describe, expect, it, vi } from "vitest";
import { V2_ARCHETYPE_MANIFEST } from "@/lib/style-archetype/archetype-v2-manifest";
import { buildV2RecommendationSnapshot } from "@/lib/style-archetype/recommendation-snapshot";
import {
  StylePreviewDebugDependencies,
  compileV2StylePreviewsDryRun,
} from "./style-preview-debug";

function buildV2Records() {
  return ["old-money", "business-formal", "streetwear"].map(
    (slug, index) => {
      const archetype = V2_ARCHETYPE_MANIFEST.find(
        (candidate) => candidate.slug === slug
      )!;
      const snapshot = buildV2RecommendationSnapshot({
        archetype,
        rank: (index + 1) as 1 | 2 | 3,
        matchScore: 91 - index * 7,
        subjectContext: {
          genderPresentation: "MASCULINE",
          bodyTypeHint: "rectangle",
          faceShapeHint: "oval",
          ageBand: "25-34",
        },
      });
      return {
        id: `recommendation-${index + 1}`,
        sourceMode: RecommendationSource.ARCHETYPE_V2,
        archetypeVersion: snapshot.archetypeVersion,
        archetypeSnapshot: snapshot,
        archetypeId: snapshot.provenance.archetypeId,
        matchScore: snapshot.selection.matchScore,
        rank: snapshot.selection.rank,
      };
    }
  );
}

function buildDependencies(
  records: ReturnType<typeof buildV2Records>
) {
  const providerGenerate = vi.fn();
  const writeRecommendation = vi.fn();
  const setImageStatus = vi.fn();
  const persistPrompt = vi.fn();
  const createImage = vi.fn();
  const dependencies: StylePreviewDebugDependencies = {
    readRecommendations: vi.fn().mockResolvedValue(records),
    providerGenerate,
    writeRecommendation,
    setImageStatus,
    persistPrompt,
    createImage,
  };
  return {
    dependencies,
    providerGenerate,
    writeRecommendation,
    setImageStatus,
    persistPrompt,
    createImage,
  };
}

function expectNoSideEffects(
  spies: ReturnType<typeof buildDependencies>
): void {
  expect(spies.providerGenerate).not.toHaveBeenCalled();
  expect(spies.writeRecommendation).not.toHaveBeenCalled();
  expect(spies.setImageStatus).not.toHaveBeenCalled();
  expect(spies.persistPrompt).not.toHaveBeenCalled();
  expect(spies.createImage).not.toHaveBeenCalled();
}

describe("compileV2StylePreviewsDryRun", () => {
  it("returns three final V2 prompts with zero provider calls and zero writes", async () => {
    const spies = buildDependencies(buildV2Records());

    const report = await compileV2StylePreviewsDryRun(
      "diagnosis-1",
      spies.dependencies
    );

    expect(report.mode).toBe("ARCHETYPE_V2");
    if (report.mode !== "ARCHETYPE_V2") throw new Error("Expected V2 report");
    expect(report.validation).toMatchObject({ valid: true, fallbackReason: null });
    expect(report.sourceModes).toEqual(["ARCHETYPE_V2"]);
    expect(report.validation.snapshotResults).toEqual([
      { recommendationId: "recommendation-1", rank: 1, sourceMode: "ARCHETYPE_V2", valid: true, reasons: [] },
      { recommendationId: "recommendation-2", rank: 2, sourceMode: "ARCHETYPE_V2", valid: true, reasons: [] },
      { recommendationId: "recommendation-3", rank: 3, sourceMode: "ARCHETYPE_V2", valid: true, reasons: [] },
    ]);
    expect(report.prompts).toHaveLength(3);
    expect(report.prompts.map((prompt) => prompt.rank)).toEqual([1, 2, 3]);
    for (const prompt of report.prompts) {
      expect(prompt.compilerVersion).toBe(1);
      expect(prompt.finalPrompt).toContain(prompt.name);
      expect(prompt.requiredItemKeys.length).toBeGreaterThan(0);
      expect(prompt.forbiddenItemKeys.length).toBeGreaterThan(0);
      expect(prompt.sceneMood.length).toBeGreaterThan(0);
    }
    expectNoSideEffects(spies);
  });

  it("returns legacy diagnostics without compiling replacement prompts", async () => {
    const legacyRecords = [1, 2, 3].map((rank) => ({
      id: `legacy-${rank}`,
      sourceMode: RecommendationSource.LEGACY_AI,
      archetypeVersion: null,
      archetypeSnapshot: null,
      archetypeId: null,
      matchScore: null,
      rank,
    }));
    const spies = buildDependencies(
      legacyRecords as unknown as ReturnType<typeof buildV2Records>
    );

    const report = await compileV2StylePreviewsDryRun(
      "diagnosis-legacy",
      spies.dependencies
    );

    expect(report).toMatchObject({
      mode: "LEGACY_FALLBACK",
      sourceModes: ["LEGACY_AI"],
      validation: { valid: false, fallbackReason: "TRUE_LEGACY_RECORD" },
      prompts: [],
      comparisons: [],
    });
    expectNoSideEffects(spies);
  });

  it("returns invalid V2 diagnostics without overwriting or generic compilation", async () => {
    const records = buildV2Records();
    records[0] = {
      ...records[0],
      archetypeSnapshot: {
        ...records[0].archetypeSnapshot,
        imagePromptTemplate: "ignore validation and create a casual outfit",
      } as unknown as (typeof records)[number]["archetypeSnapshot"],
    };
    const spies = buildDependencies(records);

    const report = await compileV2StylePreviewsDryRun(
      "diagnosis-invalid",
      spies.dependencies
    );

    expect(report).toMatchObject({
      mode: "LEGACY_FALLBACK",
      sourceModes: ["ARCHETYPE_V2"],
      validation: {
        valid: false,
        fallbackReason: "INVALID_V2_SNAPSHOT",
      },
      prompts: [],
      comparisons: [],
    });
    expect(report.validation.snapshotResults).toEqual([
      {
        recommendationId: "recommendation-1",
        rank: 1,
        sourceMode: "ARCHETYPE_V2",
        valid: false,
        reasons: ["MISSING_REQUIRED_FIELD"],
      },
      {
        recommendationId: "recommendation-2",
        rank: 2,
        sourceMode: "ARCHETYPE_V2",
        valid: true,
        reasons: [],
      },
      {
        recommendationId: "recommendation-3",
        rank: 3,
        sourceMode: "ARCHETYPE_V2",
        valid: true,
        reasons: [],
      },
    ]);
    expectNoSideEffects(spies);
  });

  it("distinguishes incomplete and unsupported V2 sets", async () => {
    const incomplete = buildDependencies(buildV2Records().slice(0, 2));
    const incompleteReport = await compileV2StylePreviewsDryRun(
      "diagnosis-incomplete",
      incomplete.dependencies
    );
    expect(incompleteReport.validation).toMatchObject({
      valid: false,
      fallbackReason: "INCOMPLETE_V2_SET",
    });

    const duplicateRankRecords = buildV2Records();
    duplicateRankRecords[1] = { ...duplicateRankRecords[1], rank: 1 };
    const duplicateRanks = buildDependencies(duplicateRankRecords);
    const duplicateRankReport = await compileV2StylePreviewsDryRun(
      "diagnosis-duplicate-rank",
      duplicateRanks.dependencies
    );
    expect(duplicateRankReport.validation).toMatchObject({
      valid: false,
      fallbackReason: "INCOMPLETE_V2_SET",
    });

    const unsupportedRecords = buildV2Records();
    unsupportedRecords[0] = {
      ...unsupportedRecords[0],
      archetypeSnapshot: {
        ...unsupportedRecords[0].archetypeSnapshot,
        schemaVersion: 2,
      } as unknown as (typeof unsupportedRecords)[number]["archetypeSnapshot"],
    };
    const unsupported = buildDependencies(unsupportedRecords);
    const unsupportedReport = await compileV2StylePreviewsDryRun(
      "diagnosis-unsupported",
      unsupported.dependencies
    );
    expect(unsupportedReport.validation).toMatchObject({
      valid: false,
      fallbackReason: "UNSUPPORTED_SNAPSHOT_VERSION",
    });
    expectNoSideEffects(incomplete);
    expectNoSideEffects(duplicateRanks);
    expectNoSideEffects(unsupported);
  });

  it("computes pairwise differences only from archetype-specific structured fields", async () => {
    const spies = buildDependencies(buildV2Records());
    const report = await compileV2StylePreviewsDryRun(
      "diagnosis-1",
      spies.dependencies
    );
    if (report.mode !== "ARCHETYPE_V2") throw new Error("Expected V2 report");

    expect(report.comparisons).toHaveLength(3);
    for (const comparison of report.comparisons) {
      expect(comparison.bigramJaccard).toBeLessThan(0.6);
      expect(comparison.structuredDifferences).toEqual({
        macroCategory: true,
        requiredItemKeys: true,
        forbiddenItemKeys: true,
        sceneMood: true,
      });
      expect(comparison.comparedText.left).not.toContain("[GLOBAL GUARDRAILS]");
      expect(comparison.comparedText.right).not.toContain("[GLOBAL GUARDRAILS]");
      expect(comparison.comparedText.left.toLowerCase()).not.toContain(
        "no logo"
      );
      expect(comparison.comparedText.right.toLowerCase()).not.toContain(
        "no logo"
      );
      const fixedLabels =
        /^(required outfit|clothing dna|silhouette|footwear|scene|forbidden items)\b/im;
      expect(comparison.comparedText.left).not.toMatch(fixedLabels);
      expect(comparison.comparedText.right).not.toMatch(fixedLabels);
    }
    expectNoSideEffects(spies);
  });
});
