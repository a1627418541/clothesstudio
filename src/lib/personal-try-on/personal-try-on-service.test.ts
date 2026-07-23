import { describe, expect, it, vi } from "vitest";
import { Prisma } from "@prisma/client";
import { runPersonalTryOnGeneration } from "./personal-try-on-service";
import { V2_ARCHETYPE_MANIFEST } from "@/lib/style-archetype/archetype-v2-manifest";
import { buildV2RecommendationSnapshot } from "@/lib/style-archetype/recommendation-snapshot";

const snapshot = buildV2RecommendationSnapshot({
  archetype: V2_ARCHETYPE_MANIFEST.find((a) => a.slug === "old-money")!,
  rank: 1,
  matchScore: 88,
  subjectContext: {
    genderPresentation: "MASCULINE",
    bodyTypeHint: "rectangle",
    faceShapeHint: "oval",
    ageBand: "25-34",
  },
});

const baseInput = {
  diagnosisId: "diagnosis-1",
  recommendationId: "rec-1",
  userId: "user-1",
  anonymousSessionId: null,
  snapshot,
  fullBody: { bucket: "bucket", key: "uploads/body.jpg" },
  frontFace: { bucket: "bucket", key: "uploads/face.jpg" },
};

function makeDependencies(overrides: Record<string, unknown> = {}) {
  return {
    provider: {
      name: "mock",
      generate: vi.fn(async () => ({
        url: "https://provider.example/result.png",
        base64: null,
        error: null,
      })),
    },
    storeImage: vi.fn(async () => ({ url: "https://r2.example/stored.png" })),
    buildImageInput: vi.fn(async () => ({ kind: "signed-url", value: "https://signed.example/img.jpg" })),
    client: {
      personalTryOnGeneration: {
        findUnique: vi.fn(),
        create: vi.fn(),
        updateMany: vi.fn(),
        update: vi.fn(),
      },
      $transaction: vi.fn(async (fn) => fn({
        personalTryOnGeneration: {
          findUnique: vi.fn(),
          create: vi.fn(),
          updateMany: vi.fn(),
          update: vi.fn(),
        },
      })),
    },
    ...overrides,
  };
}

describe("runPersonalTryOnGeneration", () => {
  it("creates a new generation and completes", async () => {
    const deps = makeDependencies();
    deps.client.personalTryOnGeneration.findUnique.mockResolvedValue(null);
    deps.client.personalTryOnGeneration.create.mockResolvedValue({
      id: "gen-1",
      status: "PROCESSING",
      attemptCount: 1,
    });

    const result = await runPersonalTryOnGeneration(baseInput, deps as any);

    expect(result.status).toBe("COMPLETED");
    expect(deps.provider.generate).toHaveBeenCalledWith({
      prompt: expect.stringContaining("PERSONAL VIRTUAL TRY-ON SPECIFICATION"),
      fullBodyImage: "https://signed.example/img.jpg",
      frontFaceImage: "https://signed.example/img.jpg",
      size: "1024x1792",
    });
    expect(deps.client.personalTryOnGeneration.update).toHaveBeenCalledWith({
      where: { id: "gen-1" },
      data: expect.objectContaining({
        status: "COMPLETED",
        imageUrl: "https://r2.example/stored.png",
        imageObjectKey: expect.stringMatching(/^personal-try-on\//),
        provider: "mock",
      }),
    });
  });

  it("claims an existing PENDING generation with exact CAS", async () => {
    const deps = makeDependencies();
    deps.client.personalTryOnGeneration.findUnique.mockResolvedValue({
      id: "gen-1",
      status: "PENDING",
      attemptCount: 0,
    });
    deps.client.personalTryOnGeneration.updateMany.mockResolvedValue({ count: 1 });
    deps.client.personalTryOnGeneration.update.mockResolvedValue({});

    const result = await runPersonalTryOnGeneration(baseInput, deps as any);

    expect(deps.client.personalTryOnGeneration.updateMany).toHaveBeenCalledWith({
      where: { id: "gen-1", status: "PENDING" },
      data: { status: "PROCESSING", attemptCount: { increment: 1 } },
    });
    expect(result.status).toBe("COMPLETED");
  });

  it("rejects when attempt cap is reached", async () => {
    const deps = makeDependencies();
    deps.client.personalTryOnGeneration.findUnique.mockResolvedValue({
      id: "gen-1",
      status: "FAILED",
      attemptCount: 3,
    });

    const result = await runPersonalTryOnGeneration(baseInput, deps as any);

    expect(result.status).toBe("FAILED");
    if (result.status === "FAILED") {
      expect(result.error).toBe("ATTEMPT_CAP_REACHED");
    }
    expect(deps.provider.generate).not.toHaveBeenCalled();
  });

  it("fails XOR validation when both owner identifiers are null", async () => {
    const deps = makeDependencies();

    const result = await runPersonalTryOnGeneration(
      { ...baseInput, userId: null, anonymousSessionId: null },
      deps as any
    );

    expect(result.status).toBe("FAILED");
    if (result.status === "FAILED") {
      expect(result.error).toBe("OWNER_REQUIRED");
    }
    expect(deps.provider.generate).not.toHaveBeenCalled();
  });

  it("fails XOR validation when both owner identifiers are present", async () => {
    const deps = makeDependencies();

    const result = await runPersonalTryOnGeneration(
      { ...baseInput, userId: "user-1", anonymousSessionId: "session-1" },
      deps as any
    );

    expect(result.status).toBe("FAILED");
    if (result.status === "FAILED") {
      expect(result.error).toBe("OWNER_AMBIGUOUS");
    }
    expect(deps.provider.generate).not.toHaveBeenCalled();
  });

  it("claims and retries a FAILED generation with CAS", async () => {
    const deps = makeDependencies();
    deps.client.personalTryOnGeneration.findUnique.mockResolvedValue({
      id: "gen-1",
      status: "FAILED",
      attemptCount: 1,
    });
    deps.client.personalTryOnGeneration.updateMany.mockResolvedValue({ count: 1 });
    deps.client.personalTryOnGeneration.update.mockResolvedValue({});

    const result = await runPersonalTryOnGeneration(baseInput, deps as any);

    expect(deps.client.personalTryOnGeneration.updateMany).toHaveBeenCalledWith({
      where: { id: "gen-1", status: "FAILED" },
      data: { status: "PROCESSING", attemptCount: { increment: 1 } },
    });
    expect(result.status).toBe("COMPLETED");
  });

  it("fails with GENERATION_ALREADY_CLAIMED when create races on unique key", async () => {
    const deps = makeDependencies();
    deps.client.personalTryOnGeneration.findUnique.mockResolvedValue(null);
    deps.client.personalTryOnGeneration.create.mockRejectedValue(
      new Prisma.PrismaClientKnownRequestError("Unique constraint failed", {
        code: "P2002",
        clientVersion: "test",
      })
    );

    const result = await runPersonalTryOnGeneration(baseInput, deps as any);

    expect(result.status).toBe("FAILED");
    if (result.status === "FAILED") {
      expect(result.error).toBe("GENERATION_ALREADY_CLAIMED");
    }
    expect(deps.provider.generate).not.toHaveBeenCalled();
  });
});
