import { afterEach, describe, expect, it, vi } from "vitest";
import { cleanupExpiredAnonymousMedia } from "./anonymous-media-retention";

function createClient(diagnoses: unknown[]) {
  return {
    styleDiagnosis: {
      findMany: vi.fn().mockResolvedValue(diagnoses),
      update: vi.fn().mockResolvedValue({}),
    },
    mediaAsset: {
      update: vi.fn().mockResolvedValue({}),
    },
    styleRecommendation: {
      updateMany: vi.fn().mockResolvedValue({ count: 1 }),
    },
  };
}

function expiredDiagnosis() {
  return {
    id: "diagnosis-1",
    photos: [
      {
        mediaAsset: {
          id: "asset-face",
          bucket: "bucket",
          key: "face/front.jpg",
          deletedAt: null as Date | null,
        },
      },
    ],
    recommendations: [
      {
        id: "recommendation-1",
        tryOnImageUrl: "https://media.example/try-on/generated.png",
      },
    ],
  };
}

describe("anonymous media retention", () => {
  afterEach(() => {
    vi.unstubAllEnvs();
  });

  it("expires anonymous media at 30 days but preserves authenticated media", async () => {
    vi.stubEnv("CLOUDFLARE_R2_PUBLIC_BASE_URL", "https://media.example");
    vi.stubEnv("CLOUDFLARE_R2_BUCKET_NAME", "bucket");
    const now = new Date("2026-08-20T00:00:00.000Z");
    const client = createClient([expiredDiagnosis()]);
    const deleteObject = vi.fn().mockResolvedValue(undefined);

    const result = await cleanupExpiredAnonymousMedia({
      client,
      deleteObject,
      now,
    });

    expect(client.styleDiagnosis.findMany).toHaveBeenCalledWith(
      expect.objectContaining({
        where: expect.objectContaining({
          userId: null,
          anonymousSessionId: { not: null },
          deletedAt: null,
          createdAt: { lte: new Date("2026-07-21T00:00:00.000Z") },
        }),
      })
    );
    expect(deleteObject).toHaveBeenCalledWith({
      bucket: "bucket",
      key: "face/front.jpg",
    });
    expect(deleteObject).toHaveBeenCalledWith({
      bucket: "bucket",
      key: "try-on/generated.png",
    });
    expect(client.mediaAsset.update).toHaveBeenCalledWith({
      where: { id: "asset-face" },
      data: { deletedAt: now },
    });
    expect(client.styleRecommendation.updateMany).toHaveBeenCalledWith({
      where: { diagnosisId: "diagnosis-1" },
      data: expect.objectContaining({
        tryOnImageUrl: null,
        tryOnImageStatus: "PENDING",
        tryOnWorkflowStatus: "EXPIRED",
      }),
    });
    expect(client.styleDiagnosis.update).toHaveBeenCalledWith({
      where: { id: "diagnosis-1" },
      data: { deletedAt: now },
    });
    expect(result).toEqual({
      diagnosesScanned: 1,
      diagnosesExpired: 1,
      objectsDeleted: 2,
      errors: [],
    });
  });

  it("keeps a failed asset and diagnosis retryable without exposing URLs", async () => {
    vi.stubEnv("CLOUDFLARE_R2_PUBLIC_BASE_URL", "https://media.example");
    vi.stubEnv("CLOUDFLARE_R2_BUCKET_NAME", "bucket");
    const diagnosis = expiredDiagnosis();
    diagnosis.recommendations = [];
    diagnosis.photos.push({
      mediaAsset: {
        id: "asset-body",
        bucket: "bucket",
        key: "body/full.jpg",
        deletedAt: null,
      },
    });
    const client = createClient([diagnosis]);
    const deleteObject = vi.fn(async ({ key }: { key: string }) => {
      if (key === "body/full.jpg") throw new Error("signed-url-secret");
    });

    const result = await cleanupExpiredAnonymousMedia({
      client,
      deleteObject,
      now: new Date("2026-08-20T00:00:00.000Z"),
    });

    expect(client.mediaAsset.update).toHaveBeenCalledTimes(1);
    expect(client.mediaAsset.update).toHaveBeenCalledWith({
      where: { id: "asset-face" },
      data: { deletedAt: new Date("2026-08-20T00:00:00.000Z") },
    });
    expect(client.styleRecommendation.updateMany).not.toHaveBeenCalled();
    expect(client.styleDiagnosis.update).not.toHaveBeenCalled();
    expect(result.errors).toEqual([
      { mediaAssetId: "asset-body", errorCode: "R2_DELETE_FAILED" },
    ]);
    expect(JSON.stringify(result)).not.toContain("signed-url-secret");
    expect(JSON.stringify(result)).not.toContain("media.example");
  });

  it("does not delete an object again after its asset was marked deleted", async () => {
    const diagnosis = expiredDiagnosis();
    diagnosis.recommendations = [];
    diagnosis.photos[0].mediaAsset.deletedAt = new Date("2026-08-19T00:00:00.000Z");
    const client = createClient([diagnosis]);
    const deleteObject = vi.fn();

    const result = await cleanupExpiredAnonymousMedia({
      client,
      deleteObject,
      now: new Date("2026-08-20T00:00:00.000Z"),
    });

    expect(deleteObject).not.toHaveBeenCalled();
    expect(client.mediaAsset.update).not.toHaveBeenCalled();
    expect(result.diagnosesExpired).toBe(1);
  });
});
