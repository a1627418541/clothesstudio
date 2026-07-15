import { NextRequest } from "next/server";
import { beforeEach, describe, expect, it, vi } from "vitest";
import { V2_ARCHETYPE_MANIFEST } from "@/lib/style-archetype/archetype-v2-manifest";
import { buildV2RecommendationSnapshot } from "@/lib/style-archetype/recommendation-snapshot";
import {
  buildCompiledStylePrompt,
  compileStylePreviewPrompt,
  STYLE_PREVIEW_COMPILER_VERSION,
} from "@/lib/ai/style-preview-compiler";

const mocks = vi.hoisted(() => ({
  auth: vi.fn(),
  findDiagnosis: vi.fn(),
  runAttempt: vi.fn(),
  legacyGenerate: vi.fn(),
  updateMany: vi.fn(),
  update: vi.fn(),
}));

vi.mock("@/lib/auth", () => ({ auth: mocks.auth }));
vi.mock("@/lib/prisma", () => ({
  prisma: {
    styleDiagnosis: { findUnique: mocks.findDiagnosis },
    styleRecommendation: {
      updateMany: mocks.updateMany,
      update: mocks.update,
    },
  },
}));
vi.mock("@/lib/ai/style-preview-attempt-service", () => ({
  runStylePreviewAttempt: mocks.runAttempt,
}));
vi.mock("@/lib/ai/style-preview-service", () => ({
  generateStylePreviewImage: mocks.legacyGenerate,
}));

import { POST } from "./route";

const selectedArchetypes = ["old-money", "streetwear", "business-formal"].map(
  (slug) => V2_ARCHETYPE_MANIFEST.find((row) => row.slug === slug)!
);

function v2Recommendation(
  index: number,
  previewImageStatus: "PENDING" | "FAILED" | "PROCESSING" | "COMPLETED"
) {
  const archetype = selectedArchetypes[index];
  const snapshot = buildV2RecommendationSnapshot({
    archetype,
    rank: (index + 1) as 1 | 2 | 3,
    matchScore: 90 - index,
    subjectContext: {
      genderPresentation: "MASCULINE",
      bodyTypeHint: "rectangle",
      faceShapeHint: "oval",
      ageBand: "25-34",
    },
  });
  return {
    id: `rec-v2-${index + 1}`,
    diagnosisId: "diagnosis-1",
    sourceMode: "ARCHETYPE_V2",
    archetypeVersion: snapshot.archetypeVersion,
    archetypeSnapshot: snapshot,
    archetypeId: snapshot.provenance.archetypeId,
    matchScore: snapshot.selection.matchScore,
    rank: snapshot.selection.rank,
    previewImageStatus,
    previewImageUrl: null,
    previewImagePrompt: null,
    title: `legacy mirror ${index + 1}`,
    description: "legacy mirror description",
    summary: "legacy mirror summary",
    clothingAdvice: "legacy mirror clothing",
    hairstyleAdvice: "legacy mirror hair",
    shoesAdvice: "legacy mirror shoes",
    colorPalette: ["black"],
  };
}

function legacyRecommendation(
  index: number,
  previewImageStatus: "PENDING" | "FAILED" | "PROCESSING" | "COMPLETED"
) {
  return {
    id: `rec-legacy-${index + 1}`,
    diagnosisId: "diagnosis-1",
    sourceMode: "LEGACY_AI",
    archetypeVersion: null,
    archetypeSnapshot: null,
    archetypeId: null,
    matchScore: null,
    rank: index + 1,
    previewImageStatus,
    previewImageUrl: null,
    previewImagePrompt: null,
    title: `Legacy direction ${index + 1}`,
    description: "Legacy description",
    summary: "Legacy summary",
    clothingAdvice: "Legacy clothing advice",
    hairstyleAdvice: "Legacy hairstyle advice",
    shoesAdvice: "Legacy shoes advice",
    colorPalette: ["navy", "white"],
  };
}

function diagnosis(recommendations: unknown[]) {
  return {
    id: "diagnosis-1",
    userId: "user-1",
    anonymousSessionId: null,
    gender: "MALE",
    age: 30,
    heightCm: 178,
    weightKg: 72,
    bodyType: "rectangle",
    faceShape: "oval",
    recommendations,
  };
}

function request(retryFailed = false) {
  return new NextRequest(
    `http://localhost/api/diagnosis/diagnosis-1/style-previews${
      retryFailed ? "?retryFailed=true" : ""
    }`,
    { method: "POST" }
  );
}

const context = { params: Promise.resolve({ id: "diagnosis-1" }) };

describe("POST /api/diagnosis/[id]/style-previews", () => {
  beforeEach(() => {
    vi.clearAllMocks();
    mocks.auth.mockResolvedValue({ user: { id: "user-1" } });
    mocks.runAttempt.mockResolvedValue({
      status: "COMPLETED",
      url: "https://example.com/preview.png",
      correlationId: "attempt-1",
      attemptNumber: 1,
    });
    mocks.legacyGenerate.mockResolvedValue({
      status: "COMPLETED",
      url: "https://example.com/old-route.png",
      prompt: "old route prompt",
    });
    mocks.updateMany.mockResolvedValue({ count: 1 });
    mocks.update.mockResolvedValue({});
  });

  it("compiles each valid V2 snapshot and starts an exact PENDING attempt", async () => {
    const recommendations = [0, 1, 2].map((index) =>
      v2Recommendation(index, "PENDING")
    );
    mocks.findDiagnosis.mockResolvedValue(diagnosis(recommendations));

    const response = await POST(request(), context);

    expect(response.status).toBe(200);
    expect(mocks.runAttempt).toHaveBeenCalledTimes(3);
    expect(mocks.legacyGenerate).not.toHaveBeenCalled();
    recommendations.forEach((recommendation, index) => {
      const expectedPrompt = compileStylePreviewPrompt(
        buildCompiledStylePrompt(recommendation.archetypeSnapshot)
      );
      expect(mocks.runAttempt).toHaveBeenNthCalledWith(
        index + 1,
        expect.objectContaining({
          client: expect.any(Object),
          recommendation,
          owner: { userId: "user-1", anonymousSessionId: null },
          expectedStatus: "PENDING",
          finalPrompt: expectedPrompt,
          compilerVersion: STYLE_PREVIEW_COMPILER_VERSION,
        })
      );
    });
    expect(await response.json()).toEqual({
      ok: true,
      data: { updated: 3, skipped: 0, failed: 0 },
    });
  });

  it("uses the exact FAILED status only for an explicit V2 retry", async () => {
    const recommendations = [0, 1, 2].map((index) =>
      v2Recommendation(index, "FAILED")
    );
    mocks.findDiagnosis.mockResolvedValue(diagnosis(recommendations));

    await POST(request(true), context);

    expect(mocks.runAttempt).toHaveBeenCalledTimes(3);
    expect(mocks.runAttempt).toHaveBeenCalledWith(
      expect.objectContaining({ expectedStatus: "FAILED" })
    );
  });

  it("keeps true legacy records on the generic legacy prompt pipeline", async () => {
    const recommendations = [0, 1, 2].map((index) =>
      legacyRecommendation(index, "PENDING")
    );
    mocks.findDiagnosis.mockResolvedValue(diagnosis(recommendations));

    await POST(request(), context);

    expect(mocks.runAttempt).toHaveBeenCalledTimes(3);
    expect(mocks.runAttempt).toHaveBeenCalledWith(
      expect.objectContaining({
        expectedStatus: "PENDING",
        compilerVersion: null,
        finalPrompt: expect.stringContaining("Legacy direction 1"),
      })
    );
  });

  it("never generates or retries an incomplete V2 set", async () => {
    const recommendations = [
      {
        ...v2Recommendation(0, "FAILED"),
        previewImageUrl: "https://example.com/existing.png",
        previewImagePrompt: "preserved historical prompt",
      },
      v2Recommendation(1, "FAILED"),
    ];
    mocks.findDiagnosis.mockResolvedValue(diagnosis(recommendations));

    const response = await POST(request(true), context);

    expect(mocks.runAttempt).not.toHaveBeenCalled();
    expect(mocks.updateMany).not.toHaveBeenCalled();
    expect(mocks.update).not.toHaveBeenCalled();
    expect(recommendations[0]).toMatchObject({
      previewImageUrl: "https://example.com/existing.png",
      previewImagePrompt: "preserved historical prompt",
    });
    expect(await response.json()).toEqual({
      ok: true,
      data: { updated: 0, skipped: 2, failed: 0 },
    });
  });

  it("skips completed and processing records before any attempt", async () => {
    const recommendations = [
      v2Recommendation(0, "COMPLETED"),
      v2Recommendation(1, "PROCESSING"),
      v2Recommendation(2, "COMPLETED"),
    ];
    mocks.findDiagnosis.mockResolvedValue(diagnosis(recommendations));

    const response = await POST(request(), context);

    expect(mocks.runAttempt).not.toHaveBeenCalled();
    expect(await response.json()).toEqual({
      ok: true,
      data: { updated: 0, skipped: 3, failed: 0 },
    });
  });
});
