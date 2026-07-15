import { RecommendationSource } from "@prisma/client";
import { beforeEach, describe, expect, it, vi } from "vitest";
import { StyleAiOutput } from "./style-ai-provider";
import { V2SelectionDiagnostics } from "@/lib/style-archetype/v2-types";

const mocks = vi.hoisted(() => ({
  aiJobUpdate: vi.fn(),
}));

vi.mock("@/lib/prisma", () => ({
  prisma: {
    aiJob: {
      create: vi.fn(),
      update: mocks.aiJobUpdate,
    },
  },
}));

vi.mock("@/lib/ai/style-ai-prompt", () => ({
  ensurePromptVersion: vi.fn(),
  STYLE_DIAGNOSIS_PROMPT_NAME: "style-diagnosis",
  STYLE_DIAGNOSIS_PROMPT_VERSION: 1,
  STYLE_DIAGNOSIS_MODEL: "mock-model",
  STYLE_DIAGNOSIS_SYSTEM_PROMPT: "mock prompt",
}));

import { StyleAiService } from "./style-ai-service";

const output: StyleAiOutput = {
  bodyType: "rectangle",
  faceShape: "oval",
  vibeKeywords: ["quiet luxury"],
  summary: "Refined tailoring.",
  recommendations: [1, 2, 3].map((rank) => ({
    title: `Recommendation ${rank}`,
    description: `Description ${rank}`,
    summary: `Summary ${rank}`,
    clothingAdvice: `Clothing ${rank}`,
    hairstyleAdvice: `Hair ${rank}`,
    shoesAdvice: `Shoes ${rank}`,
    colorPalette: ["navy"],
    avoidTips: ["loud logos"],
  })),
};

const diagnostics: V2SelectionDiagnostics = {
  pipelineVersion: 2,
  selectedMode: RecommendationSource.ARCHETYPE_V2,
  eligibleCount: 10,
  ineligibleReasonsByArchetype: [],
  selected: [
    {
      rank: 1,
      archetypeId: "old-money",
      macroCategory: "CLASSIC_PREMIUM",
      matchScore: 91,
    },
    {
      rank: 2,
      archetypeId: "business-formal",
      macroCategory: "BUSINESS_FORMAL",
      matchScore: 83,
    },
    {
      rank: 3,
      archetypeId: "streetwear",
      macroCategory: "URBAN_STREET",
      matchScore: 78,
    },
  ],
  availableMacroCategoryCount: 6,
  diversityWarning: null,
  fallbackReason: null,
};

describe("StyleAiService recommendation diagnostics", () => {
  beforeEach(() => {
    mocks.aiJobUpdate.mockReset().mockResolvedValue({ id: "job-1" });
  });

  it("preserves the complete AI output and adds recommendationPipeline diagnostics", async () => {
    const service = new StyleAiService();
    await service.finalizeJob(
      "job-1",
      "COMPLETED",
      output,
      null,
      diagnostics
    );

    expect(mocks.aiJobUpdate).toHaveBeenCalledWith({
      where: { id: "job-1" },
      data: expect.objectContaining({
        status: "COMPLETED",
        output: {
          ...output,
          recommendationPipeline: diagnostics,
        },
        errorMessage: null,
      }),
    });
  });

  it("records a stable persistence subtype and correlation id without replacing analysis", async () => {
    const service = new StyleAiService();
    await service.finalizeJob(
      "job-1",
      "PERSISTENCE_FAILED",
      output,
      "Recommendation persistence failed",
      diagnostics,
      {
        errorCode: "RECOMMENDATION_PERSISTENCE_FAILED",
        correlationId: "job-1",
      }
    );

    const call = mocks.aiJobUpdate.mock.calls[0][0];
    expect(call.data.status).toBe("PERSISTENCE_FAILED");
    expect(call.data.output).toEqual({
      ...output,
      recommendationPipeline: {
        ...diagnostics,
        infrastructureFailure: {
          errorCode: "RECOMMENDATION_PERSISTENCE_FAILED",
          correlationId: "job-1",
        },
      },
    });
    expect(JSON.stringify(call.data.output)).not.toMatch(
      /authorization|api[_-]?key|credential|photoUrls/i
    );
  });
});
