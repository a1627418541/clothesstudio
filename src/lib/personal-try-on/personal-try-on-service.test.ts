import { describe, expect, it, vi } from "vitest";
import { Prisma, PersonalTryOnGeneration } from "@prisma/client";
import { runPersonalTryOnGeneration } from "./personal-try-on-service";
import { V2_ARCHETYPE_MANIFEST } from "@/lib/style-archetype/archetype-v2-manifest";
import { buildV2RecommendationSnapshot } from "@/lib/style-archetype/recommendation-snapshot";
import { PersonalTryOnGenerationDependencies } from "./personal-try-on-service";

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
  action: "GENERATE" as const,
  snapshot,
  fullBody: { bucket: "bucket", key: "uploads/body.jpg" },
  frontFace: { bucket: "bucket", key: "uploads/face.jpg" },
};

function makeDependencies(overrides: Record<string, unknown> = {}) {
  return {
    provider: {
      name: "mock",
      generate: vi.fn<
        () => Promise<{
          url: string | null;
          base64?: string | null;
          error?: string | null;
        }>
      >(async () => ({
        url: "https://provider.example/result.png",
        base64: null,
        error: null,
      })),
    },
    storeImage: vi.fn(async () => ({ url: "https://r2.example/stored.png" })),
    buildImageInput: vi.fn(async () => ({ kind: "signed-url", value: "https://signed.example/img.jpg" })),
    deleteObject: vi.fn<(input: { key: string }) => Promise<void>>(async () => undefined),
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

const personalTryOnGeneration = (partial: {
  id: string;
  status: string;
  attemptCount: number;
  imageObjectKey?: string | null;
  imageUrl?: string | null;
}): PersonalTryOnGeneration => partial as unknown as PersonalTryOnGeneration;

describe("runPersonalTryOnGeneration", () => {
  it("creates a new generation and completes", async () => {
    const deps = makeDependencies();
    deps.client.personalTryOnGeneration.findUnique.mockResolvedValue(null);
    deps.client.personalTryOnGeneration.create.mockResolvedValue(
      personalTryOnGeneration({
        id: "gen-1",
        status: "PROCESSING",
        attemptCount: 1,
      })
    );

    const result = await runPersonalTryOnGeneration(
      baseInput,
      deps as unknown as PersonalTryOnGenerationDependencies
    );

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
    deps.client.personalTryOnGeneration.findUnique.mockResolvedValue(
      personalTryOnGeneration({
        id: "gen-1",
        status: "PENDING",
        attemptCount: 0,
      })
    );
    deps.client.personalTryOnGeneration.updateMany.mockResolvedValue({ count: 1 });
    deps.client.personalTryOnGeneration.update.mockResolvedValue(
      personalTryOnGeneration({ id: "gen-1", status: "PROCESSING", attemptCount: 1 })
    );

    const result = await runPersonalTryOnGeneration(
      baseInput,
      deps as unknown as PersonalTryOnGenerationDependencies
    );

    expect(deps.client.personalTryOnGeneration.updateMany).toHaveBeenCalledWith({
      where: { id: "gen-1", status: "PENDING" },
      data: expect.objectContaining({
        status: "PROCESSING",
        attemptCount: { increment: 1 },
        promptCompilerVersion: 2,
      }),
    });
    expect(result.status).toBe("COMPLETED");
  });

  it("rejects when attempt cap is reached", async () => {
    const deps = makeDependencies();
    deps.client.personalTryOnGeneration.findUnique.mockResolvedValue(
      personalTryOnGeneration({
        id: "gen-1",
        status: "FAILED",
        attemptCount: 3,
      })
    );

    const result = await runPersonalTryOnGeneration(
      baseInput,
      deps as unknown as PersonalTryOnGenerationDependencies
    );

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
      deps as unknown as PersonalTryOnGenerationDependencies
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
      deps as unknown as PersonalTryOnGenerationDependencies
    );

    expect(result.status).toBe("FAILED");
    if (result.status === "FAILED") {
      expect(result.error).toBe("OWNER_AMBIGUOUS");
    }
    expect(deps.provider.generate).not.toHaveBeenCalled();
  });

  it("claims and retries a FAILED generation with CAS", async () => {
    const deps = makeDependencies();
    deps.client.personalTryOnGeneration.findUnique.mockResolvedValue(
      personalTryOnGeneration({
        id: "gen-1",
        status: "FAILED",
        attemptCount: 1,
      })
    );
    deps.client.personalTryOnGeneration.updateMany.mockResolvedValue({ count: 1 });
    deps.client.personalTryOnGeneration.update.mockResolvedValue(
      personalTryOnGeneration({ id: "gen-1", status: "PROCESSING", attemptCount: 2 })
    );

    const result = await runPersonalTryOnGeneration(
      { ...baseInput, action: "RETRY_FAILED" },
      deps as unknown as PersonalTryOnGenerationDependencies
    );

    expect(deps.client.personalTryOnGeneration.updateMany).toHaveBeenCalledWith({
      where: { id: "gen-1", status: "FAILED" },
      data: expect.objectContaining({
        status: "PROCESSING",
        attemptCount: { increment: 1 },
        promptCompilerVersion: 2,
      }),
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

    const result = await runPersonalTryOnGeneration(
      baseInput,
      deps as unknown as PersonalTryOnGenerationDependencies
    );

    expect(result.status).toBe("FAILED");
    if (result.status === "FAILED") {
      expect(result.error).toBe("GENERATION_ALREADY_CLAIMED");
    }
    expect(deps.provider.generate).not.toHaveBeenCalled();
  });

  it("regenerates a COMPLETED generation with exact-status CAS and deletes the old object after commit", async () => {
    const deps = makeDependencies();
    deps.client.personalTryOnGeneration.findUnique.mockResolvedValue(
      personalTryOnGeneration({
        id: "gen-1",
        status: "COMPLETED",
        attemptCount: 1,
        imageObjectKey: "personal-try-on/old.png",
        imageUrl: "https://r2.example/old.png",
      })
    );
    deps.client.personalTryOnGeneration.updateMany.mockResolvedValue({ count: 1 });
    deps.client.personalTryOnGeneration.update.mockResolvedValue({});

    const result = await runPersonalTryOnGeneration(
      { ...baseInput, action: "REGENERATE_COMPLETED" },
      deps as unknown as PersonalTryOnGenerationDependencies
    );

    expect(deps.client.personalTryOnGeneration.updateMany).toHaveBeenCalledWith({
      where: { id: "gen-1", status: "COMPLETED" },
      data: expect.objectContaining({
        status: "PROCESSING",
        attemptCount: { increment: 1 },
        promptCompilerVersion: 2,
      }),
    });
    expect(result.status).toBe("COMPLETED");
    expect(deps.deleteObject).toHaveBeenCalledTimes(1);
    expect(deps.deleteObject).toHaveBeenCalledWith({ key: "personal-try-on/old.png" });
    const persistOrder =
      deps.client.personalTryOnGeneration.update.mock.invocationCallOrder[0];
    const deleteOrder = deps.deleteObject.mock.invocationCallOrder[0];
    expect(persistOrder).toBeLessThan(deleteOrder);
  });

  it("rejects REGENERATE_COMPLETED on a FAILED row with an exact status match", async () => {
    const deps = makeDependencies();
    deps.client.personalTryOnGeneration.findUnique.mockResolvedValue(
      personalTryOnGeneration({ id: "gen-1", status: "FAILED", attemptCount: 1 })
    );

    const result = await runPersonalTryOnGeneration(
      { ...baseInput, action: "REGENERATE_COMPLETED" },
      deps as unknown as PersonalTryOnGenerationDependencies
    );

    expect(result.status).toBe("FAILED");
    if (result.status === "FAILED") {
      expect(result.error).toBe("GENERATION_NOT_CLAIMABLE");
    }
    expect(deps.client.personalTryOnGeneration.updateMany).not.toHaveBeenCalled();
    expect(deps.provider.generate).not.toHaveBeenCalled();
  });

  it("rejects RETRY_FAILED on a COMPLETED row with an exact status match", async () => {
    const deps = makeDependencies();
    deps.client.personalTryOnGeneration.findUnique.mockResolvedValue(
      personalTryOnGeneration({ id: "gen-1", status: "COMPLETED", attemptCount: 1 })
    );

    const result = await runPersonalTryOnGeneration(
      { ...baseInput, action: "RETRY_FAILED" },
      deps as unknown as PersonalTryOnGenerationDependencies
    );

    expect(result.status).toBe("FAILED");
    if (result.status === "FAILED") {
      expect(result.error).toBe("GENERATION_NOT_CLAIMABLE");
    }
    expect(deps.provider.generate).not.toHaveBeenCalled();
  });

  it("rejects RETRY_FAILED when no generation exists", async () => {
    const deps = makeDependencies();
    deps.client.personalTryOnGeneration.findUnique.mockResolvedValue(null);

    const result = await runPersonalTryOnGeneration(
      { ...baseInput, action: "RETRY_FAILED" },
      deps as unknown as PersonalTryOnGenerationDependencies
    );

    expect(result.status).toBe("FAILED");
    if (result.status === "FAILED") {
      expect(result.error).toBe("GENERATION_NOT_CLAIMABLE");
    }
    expect(deps.client.personalTryOnGeneration.create).not.toHaveBeenCalled();
    expect(deps.provider.generate).not.toHaveBeenCalled();
  });

  it("rejects GENERATE on a COMPLETED row with an exact status match", async () => {
    const deps = makeDependencies();
    deps.client.personalTryOnGeneration.findUnique.mockResolvedValue(
      personalTryOnGeneration({ id: "gen-1", status: "COMPLETED", attemptCount: 1 })
    );

    const result = await runPersonalTryOnGeneration(
      baseInput,
      deps as unknown as PersonalTryOnGenerationDependencies
    );

    expect(result.status).toBe("FAILED");
    if (result.status === "FAILED") {
      expect(result.error).toBe("GENERATION_NOT_CLAIMABLE");
    }
    expect(deps.provider.generate).not.toHaveBeenCalled();
  });

  it("keeps the previous image untouched when a regeneration fails", async () => {
    const deps = makeDependencies();
    deps.provider.generate.mockResolvedValue({ url: null, base64: null, error: "boom" });
    deps.client.personalTryOnGeneration.findUnique.mockResolvedValue(
      personalTryOnGeneration({
        id: "gen-1",
        status: "COMPLETED",
        attemptCount: 1,
        imageObjectKey: "personal-try-on/old.png",
        imageUrl: "https://r2.example/old.png",
      })
    );
    deps.client.personalTryOnGeneration.updateMany.mockResolvedValue({ count: 1 });
    deps.client.personalTryOnGeneration.update.mockResolvedValue({});

    const result = await runPersonalTryOnGeneration(
      { ...baseInput, action: "REGENERATE_COMPLETED" },
      deps as unknown as PersonalTryOnGenerationDependencies
    );

    expect(result.status).toBe("FAILED");
    const failureUpdate = deps.client.personalTryOnGeneration.update.mock.calls[0][0];
    expect(failureUpdate.where).toEqual({ id: "gen-1" });
    expect(failureUpdate.data).toMatchObject({ status: "FAILED" });
    expect(failureUpdate.data).not.toHaveProperty("imageUrl");
    expect(failureUpdate.data).not.toHaveProperty("imageObjectKey");
    expect(deps.deleteObject).not.toHaveBeenCalled();
  });

  it("cleans up the orphan new object and keeps the old one when the final persist fails", async () => {
    const deps = makeDependencies();
    deps.client.personalTryOnGeneration.findUnique.mockResolvedValue(
      personalTryOnGeneration({
        id: "gen-1",
        status: "COMPLETED",
        attemptCount: 1,
        imageObjectKey: "personal-try-on/old.png",
        imageUrl: "https://r2.example/old.png",
      })
    );
    deps.client.personalTryOnGeneration.updateMany.mockResolvedValue({ count: 1 });
    deps.client.personalTryOnGeneration.update
      .mockRejectedValueOnce(new Error("db down"))
      .mockResolvedValueOnce({});

    const result = await runPersonalTryOnGeneration(
      { ...baseInput, action: "REGENERATE_COMPLETED" },
      deps as unknown as PersonalTryOnGenerationDependencies
    );

    expect(result.status).toBe("FAILED");
    if (result.status === "FAILED") {
      expect(result.error).toBe("PERSONAL_TRY_ON_STORAGE_FAILED");
    }
    expect(deps.provider.generate).toHaveBeenCalledTimes(1);
    expect(deps.deleteObject).toHaveBeenCalledTimes(1);
    const deletedKey = deps.deleteObject.mock.calls[0][0].key;
    expect(deletedKey).toMatch(/^personal-try-on\//);
    expect(deletedKey).not.toBe("personal-try-on/old.png");
    expect(deps.client.personalTryOnGeneration.update).toHaveBeenLastCalledWith({
      where: { id: "gen-1" },
      data: expect.objectContaining({ status: "FAILED" }),
    });
  });

  it("does not delete anything when a regenerated row had no previous object", async () => {
    const deps = makeDependencies();
    deps.client.personalTryOnGeneration.findUnique.mockResolvedValue(
      personalTryOnGeneration({
        id: "gen-1",
        status: "COMPLETED",
        attemptCount: 1,
        imageObjectKey: null,
        imageUrl: null,
      })
    );
    deps.client.personalTryOnGeneration.updateMany.mockResolvedValue({ count: 1 });
    deps.client.personalTryOnGeneration.update.mockResolvedValue({});

    const result = await runPersonalTryOnGeneration(
      { ...baseInput, action: "REGENERATE_COMPLETED" },
      deps as unknown as PersonalTryOnGenerationDependencies
    );

    expect(result.status).toBe("COMPLETED");
    expect(deps.deleteObject).not.toHaveBeenCalled();
  });
});
