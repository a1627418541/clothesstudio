import { NextRequest } from "next/server";
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import { V2_ARCHETYPE_MANIFEST } from "@/lib/style-archetype/archetype-v2-manifest";

const mocks = vi.hoisted(() => ({
  auth: vi.fn(),
  getAnonymousSessionByToken: vi.fn(),
  findAssets: vi.fn(),
  findArchetypes: vi.fn(),
  transaction: vi.fn(),
  analyze: vi.fn(),
  finalizeJob: vi.fn(),
}));

vi.mock("@/lib/auth", () => ({ auth: mocks.auth }));
vi.mock("@/lib/anonymous-session", () => ({
  getAnonymousSessionByToken: mocks.getAnonymousSessionByToken,
}));
vi.mock("@/lib/prisma", () => ({
  prisma: {
    mediaAsset: { findMany: mocks.findAssets },
    styleArchetype: { findMany: mocks.findArchetypes },
    $transaction: mocks.transaction,
  },
}));
vi.mock("@/lib/ai/style-ai-service", () => ({
  StyleAiService: class {
    analyze(input: unknown) {
      return mocks.analyze(input);
    }

    finalizeJob(...args: unknown[]) {
      return mocks.finalizeJob(...args);
    }
  },
}));

import { POST } from "./route";

const analysisOutput = {
  bodyType: "rectangle",
  faceShape: "oval",
  vibeKeywords: ["heritage", "tailoring", "urban street", "artistic"],
  summary: "A structured style profile with room for distinct directions.",
  recommendations: [
    {
      title: "Clean Casual",
      description: "A clean daily direction.",
      summary: "Simple daily dressing.",
      clothingAdvice: "Wear a plain shirt and trousers.",
      hairstyleAdvice: "Keep hair neat.",
      shoesAdvice: "Wear minimal sneakers.",
      colorPalette: ["navy", "white"],
      avoidTips: ["Avoid clutter."],
      items: [
        {
          name: "oxford shirt",
          category: "top",
          why: "Clean base layer.",
          colors: ["white", "navy"],
          fitNotes: "Tailored fit.",
          optional: false,
        },
      ],
    },
    {
      title: "Smart Casual",
      description: "A polished casual direction.",
      summary: "Relaxed polish.",
      clothingAdvice: "Wear a knit and chinos.",
      hairstyleAdvice: "Use a side part.",
      shoesAdvice: "Wear loafers.",
      colorPalette: ["camel", "navy"],
      avoidTips: ["Avoid loud logos."],
      items: [
        {
          name: "knit polo",
          category: "top",
          why: "Adds texture.",
          colors: ["camel"],
          fitNotes: "Fitted.",
          optional: false,
        },
      ],
    },
    {
      title: "Modern Casual",
      description: "A modern casual direction.",
      summary: "Contemporary basics.",
      clothingAdvice: "Wear modern basics.",
      hairstyleAdvice: "Use a textured crop.",
      shoesAdvice: "Wear clean sneakers.",
      colorPalette: ["gray", "black"],
      avoidTips: ["Avoid excess color."],
      items: [
        {
          name: "textured t-shirt",
          category: "top",
          why: "Modern base.",
          colors: ["gray"],
          fitNotes: "Regular.",
          optional: false,
        },
      ],
    },
  ],
};

const diagnosis = {
  id: "diagnosis-1",
  userId: "user-1",
  anonymousSessionId: null,
  gender: "MALE",
  age: 30,
  heightCm: 178,
  weightKg: 74,
  status: "SUBMITTED",
};

const requestBody = {
  gender: "MALE",
  age: 30,
  heightCm: 178,
  weightKg: 74,
  faceTryOnConsent: false,
  photoAssetIds: {
    FACE_FRONT: "asset-front",
    FACE_SIDE: "asset-side",
    FULL_BODY: "asset-body",
  },
};

function makeRequest(): NextRequest {
  return new NextRequest("http://localhost/api/diagnosis", {
    method: "POST",
    headers: { "content-type": "application/json" },
    body: JSON.stringify(requestBody),
  });
}

describe("POST /api/diagnosis Archetype V2 integration", () => {
  let createdRecommendations: Array<Record<string, unknown>>;
  let transactionCount: number;
  let failPersistence: boolean;

  beforeEach(() => {
    vi.clearAllMocks();
    delete process.env.STYLE_ARCHETYPE_V2_ENABLED;
    createdRecommendations = [];
    transactionCount = 0;
    failPersistence = false;

    mocks.auth.mockResolvedValue({ user: { id: "user-1" } });
    mocks.findAssets.mockResolvedValue([
      { id: "asset-front", userId: "user-1", anonymousSessionId: null, url: "https://assets/front.jpg" },
      { id: "asset-side", userId: "user-1", anonymousSessionId: null, url: "https://assets/side.jpg" },
      { id: "asset-body", userId: "user-1", anonymousSessionId: null, url: "https://assets/body.jpg" },
    ]);
    mocks.findArchetypes.mockResolvedValue(V2_ARCHETYPE_MANIFEST);
    mocks.analyze.mockResolvedValue({
      output: analysisOutput,
      jobId: "diagnosis-job-1",
      errorMessage: null,
    });
    mocks.finalizeJob.mockResolvedValue(undefined);

    const tx = {
      styleDiagnosis: {
        create: vi.fn().mockResolvedValue(diagnosis),
        update: vi.fn().mockResolvedValue({
          ...diagnosis,
          status: "PREVIEW_READY",
          bodyType: analysisOutput.bodyType,
          faceShape: analysisOutput.faceShape,
        }),
        findUniqueOrThrow: vi.fn().mockResolvedValue({
          ...diagnosis,
          status: "PREVIEW_READY",
        }),
      },
      diagnosisPhoto: {
        createMany: vi.fn().mockResolvedValue({ count: 3 }),
      },
      styleRecommendation: {
        create: vi.fn(async ({ data }: { data: Record<string, unknown> }) => {
          createdRecommendations.push(data);
          return data;
        }),
        createMany: vi.fn(async ({ data }: { data: Array<Record<string, unknown>> }) => {
          createdRecommendations.push(...data);
          return { count: data.length };
        }),
      },
    };
    mocks.transaction.mockImplementation(
      async (operation: (client: typeof tx) => Promise<unknown>) => {
        transactionCount += 1;
        if (failPersistence && transactionCount === 2) {
          throw new Error("Neon persistence failed");
        }
        return operation(tx);
      }
    );
  });

  afterEach(() => {
    delete process.env.STYLE_ARCHETYPE_V2_ENABLED;
  });

  it("writes one whole legacy plan when the feature flag is disabled", async () => {
    process.env.STYLE_ARCHETYPE_V2_ENABLED = "false";

    const response = await POST(makeRequest());

    expect(response.status).toBe(201);
    expect(mocks.analyze).toHaveBeenCalledOnce();
    expect(createdRecommendations).toHaveLength(3);
    expect(createdRecommendations).toEqual(
      expect.arrayContaining([
        expect.objectContaining({
          sourceMode: "LEGACY_AI",
          archetypeVersion: null,
          promptCompilerVersion: null,
        }),
      ])
    );
    expect(
      createdRecommendations.every((row) => row.sourceMode === "LEGACY_AI")
    ).toBe(true);
  });

  it("writes three immutable V2 snapshots when the flag and candidates are ready", async () => {
    process.env.STYLE_ARCHETYPE_V2_ENABLED = "true";

    const response = await POST(makeRequest());

    expect(response.status).toBe(201);
    expect(mocks.analyze).toHaveBeenCalledOnce();
    expect(createdRecommendations).toHaveLength(3);
    expect(
      createdRecommendations.every((row) => row.sourceMode === "ARCHETYPE_V2")
    ).toBe(true);
    const snapshots = createdRecommendations.map(
      (row) => row.archetypeSnapshot as {
        schemaVersion: number;
        selection: { macroCategory: string };
      }
    );
    expect(snapshots.every((snapshot) => snapshot.schemaVersion === 1)).toBe(true);
    expect(new Set(snapshots.map((snapshot) => snapshot.selection.macroCategory)).size).toBe(3);
  });

  it("falls back as a whole to legacy when fewer than three V2 candidates are eligible", async () => {
    process.env.STYLE_ARCHETYPE_V2_ENABLED = "true";
    mocks.findArchetypes.mockResolvedValue(V2_ARCHETYPE_MANIFEST.slice(0, 2));

    const response = await POST(makeRequest());

    expect(response.status).toBe(201);
    expect(createdRecommendations).toHaveLength(3);
    expect(
      createdRecommendations.every((row) => row.sourceMode === "LEGACY_AI")
    ).toBe(true);
    expect(mocks.analyze).toHaveBeenCalledOnce();
  });

  it("marks the existing AI job PERSISTENCE_FAILED without writing legacy replacements", async () => {
    process.env.STYLE_ARCHETYPE_V2_ENABLED = "true";
    failPersistence = true;

    const response = await POST(makeRequest());

    expect(response.status).toBe(500);
    expect(createdRecommendations).toEqual([]);
    expect(mocks.analyze).toHaveBeenCalledOnce();
    expect(mocks.finalizeJob).toHaveBeenCalledWith(
      "diagnosis-job-1",
      "PERSISTENCE_FAILED",
      analysisOutput,
      "Neon persistence failed",
      expect.objectContaining({ selectedMode: "ARCHETYPE_V2" }),
      {
        errorCode: "RECOMMENDATION_PERSISTENCE_FAILED",
        correlationId: "diagnosis-job-1",
      }
    );
  });
});
