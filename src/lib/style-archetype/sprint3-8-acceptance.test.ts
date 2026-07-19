import { RecommendationSource } from "@prisma/client";
import { describe, expect, it, vi } from "vitest";
import { buildReportDisplayModel, ReportRecommendationRecord } from "@/lib/diagnosis/report-display-model";
import {
  buildCompiledStylePrompt,
  compileStylePreviewPrompt,
  STYLE_PREVIEW_COMPILER_VERSION,
} from "@/lib/ai/style-preview-compiler";
import {
  runStylePreviewAttempt,
  StylePreviewAttemptClient,
} from "@/lib/ai/style-preview-attempt-service";
import {
  compileV2StylePreviewsDryRun,
  StylePreviewDebugDependencies,
} from "@/lib/ai/style-preview-debug";
import { StyleRecommendationOutput } from "@/lib/ai/style-ai-provider";
import { V2_ARCHETYPE_MANIFEST } from "./archetype-v2-manifest";
import { buildRecommendationPlan } from "./recommendation-plan";
import { buildV2RecommendationSnapshot } from "./recommendation-snapshot";
import { getV2ReadinessReport } from "./v2-readiness";

const maleAnalysis = {
  gender: "MALE" as const,
  age: 31,
  heightCm: 178,
  weightKg: 72,
  bodyType: "rectangle",
  faceShape: "oval",
  vibeKeywords: ["quiet luxury", "business formal", "streetwear"],
  diagnosisSummary:
    "Quiet luxury tailoring, executive structure, and urban street energy.",
};

function legacyRecommendations(): StyleRecommendationOutput[] {
  return [1, 2, 3].map((rank) => ({
    title: `Legacy direction ${rank}`,
    description: `Legacy description ${rank}`,
    summary: `Legacy summary ${rank}`,
    clothingAdvice: `Legacy clothing ${rank}`,
    hairstyleAdvice: `Legacy hair ${rank}`,
    shoesAdvice: `Legacy shoes ${rank}`,
    colorPalette: ["navy", "white"],
    avoidTips: [`Legacy avoid ${rank}`],
    items: [
      {
        name: `legacy item ${rank}`,
        category: "top" as const,
        why: `Why item ${rank}`,
        colors: ["navy"],
        fitNotes: "Regular fit.",
        optional: false,
      },
    ],
  }));
}

function buildPlan(overrides: Record<string, unknown> = {}) {
  return buildRecommendationPlan({
    featureFlagValue: "true",
    diagnosisAnalysis: maleAnalysis,
    archetypes: V2_ARCHETYPE_MANIFEST,
    legacyRecommendations: legacyRecommendations(),
    ...overrides,
  });
}

function v2RecordsFromPlan(
  plan: ReturnType<typeof buildPlan>
): ReportRecommendationRecord[] {
  if (plan.mode !== RecommendationSource.ARCHETYPE_V2) {
    throw new Error("Expected an Archetype V2 plan");
  }
  return plan.drafts.map(({ snapshot }, index) => ({
    id: `recommendation-${index + 1}`,
    rank: snapshot.selection.rank,
    isPrimary: snapshot.selection.rank === 1,
    sourceMode: RecommendationSource.ARCHETYPE_V2,
    archetypeVersion: snapshot.archetypeVersion,
    archetypeSnapshot: snapshot,
    archetypeId: snapshot.provenance.archetypeId,
    matchScore: snapshot.selection.matchScore,
    title: "legacy mirror must not win",
    description: "legacy mirror must not win",
    summary: "legacy mirror must not win",
    clothingAdvice: "legacy mirror must not win",
    hairstyleAdvice: "legacy mirror must not win",
    shoesAdvice: "legacy mirror must not win",
    colorPalette: ["legacy-mirror"],
    avoidTips: ["legacy-mirror"],
    items: [
      {
        name: "v2 blazer",
        category: "outerwear",
        why: "Structured.",
        colors: ["charcoal"],
        fitNotes: "Slim.",
        optional: false,
      },
    ],
    previewImageUrl: null,
    previewImageStatus: "PENDING",
    previewImageError: null,
    tryOnImageUrl: null,
    tryOnImageStatus: "PENDING",
    tryOnImageError: null,
    archetype: null,
  }));
}

function legacyRecords(): ReportRecommendationRecord[] {
  return legacyRecommendations().map((recommendation, index) => ({
    id: `legacy-${index + 1}`,
    rank: index + 1,
    isPrimary: index === 0,
    sourceMode: RecommendationSource.LEGACY_AI,
    archetypeVersion: null,
    archetypeSnapshot: null,
    archetypeId: null,
    matchScore: null,
    ...recommendation,
    previewImageUrl: null,
    previewImageStatus: "PENDING",
    previewImageError: null,
    tryOnImageUrl: null,
    tryOnImageStatus: "PENDING",
    tryOnImageError: null,
    archetype: null,
  }));
}

function snapshotFor(slug: string) {
  const archetype = V2_ARCHETYPE_MANIFEST.find((row) => row.slug === slug)!;
  return buildV2RecommendationSnapshot({
    archetype,
    rank: 1,
    matchScore: 88,
    subjectContext: {
      genderPresentation: "MASCULINE",
      bodyTypeHint: "rectangle",
      faceShapeHint: "oval",
      ageBand: "25-34",
    },
  });
}

describe("Sprint 3.8 Archetype V2 acceptance gate", () => {
  it("selects three deterministic macro-diverse snapshots and aligns report and prompt identity", () => {
    const readiness = getV2ReadinessReport(V2_ARCHETYPE_MANIFEST);
    expect(readiness.ready).toBe(true);

    const first = buildPlan();
    const second = buildPlan();
    expect(second).toEqual(first);
    expect(first.mode).toBe(RecommendationSource.ARCHETYPE_V2);
    if (first.mode !== RecommendationSource.ARCHETYPE_V2) {
      throw new Error("Expected an Archetype V2 plan");
    }

    const snapshots = first.drafts.map((draft) => draft.snapshot);
    expect(snapshots).toHaveLength(3);
    expect(snapshots.every(Boolean)).toBe(true);
    expect(first.diagnostics.availableMacroCategoryCount).toBeGreaterThanOrEqual(3);
    expect(new Set(snapshots.map((row) => row.selection.macroCategory)).size)
      .toBe(3);

    const projection = buildReportDisplayModel(v2RecordsFromPlan(first));
    expect(projection.fallbackReason).toBeNull();
    expect(projection.model.mode).toBe("ARCHETYPE_V2");
    if (projection.model.mode !== "ARCHETYPE_V2") {
      throw new Error("Expected a V2 report model");
    }

    snapshots.forEach((snapshot, index) => {
      const report = projection.model.recommendations[index];
      const prompt = compileStylePreviewPrompt(
        buildCompiledStylePrompt(snapshot)
      );
      expect(report).toMatchObject({
        title: snapshot.identity.name,
        personalityLabel: snapshot.identity.personalityLabel,
        macroCategory: snapshot.selection.macroCategory,
        clothingAdvice: snapshot.styleDNA.clothingDNA,
        hairstyleAdvice: snapshot.styleDNA.hairstyleDNA,
        shoesAdvice: snapshot.styleDNA.shoesDNA,
        colorPalette: snapshot.styleDNA.colorDNA,
      });
      expect(prompt).toContain(`Style name: ${report.title}`);
      expect(prompt).toContain(`Personality: ${report.personalityLabel}`);
      expect(prompt).toContain(`Macro category: ${report.macroCategory}`);
      expect(prompt).not.toContain("legacy mirror must not win");
    });
  });

  it.each([
    ["old-money", ["knit polo", "cashmere sweater", "tailored trousers", "loafers"]],
    ["business-formal", ["suit jacket", "dress shirt", "tailored trousers", "dress shoes"]],
    ["streetwear", ["oversized", "cargo pants", "statement sneakers"]],
    ["japanese-minimal", ["relaxed layering", "wide leg trousers", "oversized shirt"]],
  ])("keeps %s visually anchored in the centralized prompt", (slug, anchors) => {
    const prompt = compileStylePreviewPrompt(
      buildCompiledStylePrompt(snapshotFor(slug))
    ).toLowerCase();
    anchors.forEach((anchor) => expect(prompt).toContain(anchor));
    expect(prompt).toContain("no generic casual outfit");
    expect(prompt).toContain("no uploaded user photo");
  });

  it("keeps flag-off and incomplete-seed diagnoses wholly legacy and readable", () => {
    const flagOff = buildPlan({ featureFlagValue: "false" });
    expect(flagOff).toMatchObject({
      mode: RecommendationSource.LEGACY_AI,
      diagnostics: { fallbackReason: "V2_DISABLED" },
    });

    const incompleteRows = V2_ARCHETYPE_MANIFEST.slice(0, 2);
    expect(getV2ReadinessReport(incompleteRows).ready).toBe(false);
    const incomplete = buildPlan({ archetypes: incompleteRows });
    expect(incomplete).toMatchObject({
      mode: RecommendationSource.LEGACY_AI,
      diagnostics: { fallbackReason: "INSUFFICIENT_ELIGIBLE_ARCHETYPES" },
    });
    expect(incomplete.drafts).toHaveLength(3);

    const legacyReport = buildReportDisplayModel(legacyRecords());
    expect(legacyReport.fallbackReason).toBe("TRUE_LEGACY_RECORD");
    expect(legacyReport.model.recommendations[0]).toMatchObject({
      title: "Legacy direction 1",
      canGeneratePreview: true,
      canRetryPreview: true,
    });
  });

  it("blocks regeneration for invalid V2 and keeps dry-run free of writes and provider calls", async () => {
    const validRecords = v2RecordsFromPlan(buildPlan());
    const invalidRecords = validRecords.map((record, index) =>
      index === 0 ? { ...record, matchScore: 1 } : record
    );
    const projection = buildReportDisplayModel(invalidRecords);
    expect(projection.fallbackReason).toBe("INVALID_V2_SNAPSHOT");
    expect(
      projection.model.recommendations.every(
        (row) => !row.canGeneratePreview && !row.canRetryPreview
      )
    ).toBe(true);

    const providerGenerate = vi.fn();
    const writeRecommendation = vi.fn();
    const persistPrompt = vi.fn();
    const dependencies: StylePreviewDebugDependencies = {
      readRecommendations: vi.fn().mockResolvedValue(invalidRecords),
      providerGenerate,
      writeRecommendation,
      persistPrompt,
    };
    const report = await compileV2StylePreviewsDryRun(
      "diagnosis-invalid",
      dependencies
    );
    expect(report).toMatchObject({
      mode: "LEGACY_FALLBACK",
      validation: { valid: false, fallbackReason: "INVALID_V2_SNAPSHOT" },
      prompts: [],
    });
    expect(providerGenerate).not.toHaveBeenCalled();
    expect(writeRecommendation).not.toHaveBeenCalled();
    expect(persistPrompt).not.toHaveBeenCalled();
  });

  it("does not call the provider when an exact PENDING CAS loses to FAILED state", async () => {
    const snapshot = snapshotFor("old-money");
    const finalPrompt = compileStylePreviewPrompt(
      buildCompiledStylePrompt(snapshot)
    );
    const updateMany = vi.fn(async (args: { where: { previewImageStatus: string } }) => ({
      count: args.where.previewImageStatus === "FAILED" ? 1 : 0,
    }));
    const createJob = vi.fn();
    const tx = {
      styleRecommendation: {
        updateMany,
        findUniqueOrThrow: vi.fn(),
        update: vi.fn(),
      },
      aiJob: { create: createJob, update: vi.fn() },
    };
    const client = {
      $transaction: vi.fn(async (operation: (value: typeof tx) => Promise<unknown>) =>
        operation(tx)
      ),
      aiJob: { update: vi.fn() },
    } as unknown as StylePreviewAttemptClient;
    const providerGenerate = vi.fn();

    const result = await runStylePreviewAttempt(
      {
        client,
        recommendation: {
          id: "recommendation-1",
          diagnosisId: "diagnosis-1",
          sourceMode: RecommendationSource.ARCHETYPE_V2,
          archetypeVersion: snapshot.archetypeVersion,
          archetypeSnapshot: snapshot,
          archetypeId: snapshot.provenance.archetypeId,
          matchScore: snapshot.selection.matchScore,
          rank: snapshot.selection.rank,
          previewImageStatus: "FAILED",
        },
        owner: { userId: "user-1", anonymousSessionId: null },
        expectedStatus: "PENDING",
        finalPrompt,
        compilerVersion: STYLE_PREVIEW_COMPILER_VERSION,
      },
      { generateImage: providerGenerate }
    );

    expect(result).toEqual({ status: "SKIPPED", reason: "CLAIM_LOST" });
    expect(updateMany).toHaveBeenCalledWith(
      expect.objectContaining({
        where: expect.objectContaining({ previewImageStatus: "PENDING" }),
      })
    );
    expect(createJob).not.toHaveBeenCalled();
    expect(providerGenerate).not.toHaveBeenCalled();
  });
});
