const RETENTION_DAYS = 30;
const DAY_IN_MS = 24 * 60 * 60 * 1000;

interface RetentionMediaAsset {
  id: string;
  bucket: string;
  key: string;
  deletedAt: Date | null;
}

interface RetentionRecommendation {
  id: string;
  tryOnImageUrl: string | null;
}

interface RetentionPersonalTryOnGeneration {
  id: string;
  imageObjectKey: string | null;
}

interface RetentionDiagnosis {
  id: string;
  photos: Array<{ mediaAsset: RetentionMediaAsset }>;
  recommendations: RetentionRecommendation[];
  personalTryOnGenerations: RetentionPersonalTryOnGeneration[];
}

interface FindManyArgs {
  where: {
    userId: null;
    anonymousSessionId: { not: null };
    deletedAt: null;
    createdAt: { lte: Date };
  };
  include: {
    photos: { include: { mediaAsset: true } };
    recommendations: {
      select: { id: true; tryOnImageUrl: true };
    };
    personalTryOnGenerations: {
      select: { id: true; imageObjectKey: true };
    };
  };
}

export interface AnonymousMediaRetentionClient {
  styleDiagnosis: {
    findMany(args: FindManyArgs): Promise<RetentionDiagnosis[]>;
    update(args: {
      where: { id: string };
      data: { deletedAt: Date };
    }): Promise<unknown>;
  };
  mediaAsset: {
    update(args: {
      where: { id: string };
      data: { deletedAt: Date };
    }): Promise<unknown>;
  };
  diagnosisPhoto: {
    count(args: {
      where: {
        mediaAssetId: string;
        diagnosis: {
          OR: Array<
            | { userId: { not: null } }
            | { anonymousSessionId: null }
            | {
                deletedAt: null;
                createdAt: { gt: Date };
              }
          >;
        };
      };
    }): Promise<number>;
  };
  styleRecommendation: {
    updateMany(args: {
      where: { diagnosisId: string };
      data: {
        tryOnImageUrl: null;
        tryOnImageStatus: "PENDING";
        tryOnImageError: null;
        tryOnWorkflowStatus: "EXPIRED";
        tryOnFailureCode: null;
        tryOnProvider: null;
        identityScore: null;
        productFidelityScore: null;
        tryOnExpiresAt: null;
      };
    }): Promise<unknown>;
  };
  personalTryOnGeneration: {
    deleteMany(args: {
      where: { diagnosisId: string };
    }): Promise<unknown>;
  };
}

export type AnonymousMediaCleanupError =
  | { mediaAssetId: string; errorCode: "R2_DELETE_FAILED" }
  | {
      recommendationId: string;
      errorCode: "R2_DELETE_FAILED" | "R2_KEY_UNRESOLVED";
    }
  | {
      personalTryOnGenerationId: string;
      errorCode: "R2_DELETE_FAILED";
    };

export interface AnonymousMediaCleanupResult {
  diagnosesScanned: number;
  diagnosesExpired: number;
  objectsDeleted: number;
  errors: AnonymousMediaCleanupError[];
}

function r2ObjectFromTryOnUrl(
  tryOnImageUrl: string
): { bucket: string; key: string } | null | "UNRESOLVED" {
  if (tryOnImageUrl.startsWith("data:")) return null;

  const publicBaseUrl = process.env.CLOUDFLARE_R2_PUBLIC_BASE_URL?.trim();
  const bucket = process.env.CLOUDFLARE_R2_BUCKET_NAME?.trim();
  if (!publicBaseUrl || !bucket) return "UNRESOLVED";

  try {
    const base = new URL(publicBaseUrl);
    const image = new URL(tryOnImageUrl);
    const normalizedBasePath = base.pathname.replace(/\/+$/, "");
    if (base.origin !== image.origin) return "UNRESOLVED";
    if (
      normalizedBasePath &&
      image.pathname !== normalizedBasePath &&
      !image.pathname.startsWith(`${normalizedBasePath}/`)
    ) {
      return "UNRESOLVED";
    }
    const encodedKey = image.pathname
      .slice(normalizedBasePath.length)
      .replace(/^\/+/, "");
    if (!encodedKey) return "UNRESOLVED";
    return { bucket, key: decodeURIComponent(encodedKey) };
  } catch {
    return "UNRESOLVED";
  }
}

export async function cleanupExpiredAnonymousMedia(input: {
  client: AnonymousMediaRetentionClient;
  deleteObject: (input: { bucket: string; key: string }) => Promise<void>;
  now: Date;
}): Promise<AnonymousMediaCleanupResult> {
  const cutoff = new Date(input.now.getTime() - RETENTION_DAYS * DAY_IN_MS);
  const diagnoses = await input.client.styleDiagnosis.findMany({
    where: {
      userId: null,
      anonymousSessionId: { not: null },
      deletedAt: null,
      createdAt: { lte: cutoff },
    },
    include: {
      photos: { include: { mediaAsset: true } },
      recommendations: {
        select: { id: true, tryOnImageUrl: true },
      },
      personalTryOnGenerations: {
        select: { id: true, imageObjectKey: true },
      },
    },
  });

  const result: AnonymousMediaCleanupResult = {
    diagnosesScanned: diagnoses.length,
    diagnosesExpired: 0,
    objectsDeleted: 0,
    errors: [],
  };
  const deletedMediaAssetIds = new Set<string>();

  for (const diagnosis of diagnoses) {
    let allObjectsSucceeded = true;
    const deletedObjects = new Set<string>();
    const assets = new Map<string, RetentionMediaAsset>();
    for (const photo of diagnosis.photos) {
      assets.set(photo.mediaAsset.id, photo.mediaAsset);
    }

    for (const asset of assets.values()) {
      if (asset.deletedAt || deletedMediaAssetIds.has(asset.id)) continue;
      const retainedReferenceCount = await input.client.diagnosisPhoto.count({
        where: {
          mediaAssetId: asset.id,
          diagnosis: {
            OR: [
              { userId: { not: null } },
              { anonymousSessionId: null },
              {
                deletedAt: null,
                createdAt: { gt: cutoff },
              },
            ],
          },
        },
      });
      if (retainedReferenceCount > 0) continue;

      const objectId = `${asset.bucket}/${asset.key}`;
      try {
        if (!deletedObjects.has(objectId)) {
          await input.deleteObject({ bucket: asset.bucket, key: asset.key });
          deletedObjects.add(objectId);
          result.objectsDeleted += 1;
        }
        await input.client.mediaAsset.update({
          where: { id: asset.id },
          data: { deletedAt: input.now },
        });
        deletedMediaAssetIds.add(asset.id);
      } catch {
        allObjectsSucceeded = false;
        result.errors.push({
          mediaAssetId: asset.id,
          errorCode: "R2_DELETE_FAILED",
        });
      }
    }

    for (const recommendation of diagnosis.recommendations) {
      if (!recommendation.tryOnImageUrl) continue;
      const object = r2ObjectFromTryOnUrl(recommendation.tryOnImageUrl);
      if (object === null) continue;
      if (object === "UNRESOLVED") {
        allObjectsSucceeded = false;
        result.errors.push({
          recommendationId: recommendation.id,
          errorCode: "R2_KEY_UNRESOLVED",
        });
        continue;
      }
      const objectId = `${object.bucket}/${object.key}`;
      if (deletedObjects.has(objectId)) continue;
      try {
        await input.deleteObject(object);
        deletedObjects.add(objectId);
        result.objectsDeleted += 1;
      } catch {
        allObjectsSucceeded = false;
        result.errors.push({
          recommendationId: recommendation.id,
          errorCode: "R2_DELETE_FAILED",
        });
      }
    }

    const bucket = process.env.CLOUDFLARE_R2_BUCKET_NAME?.trim();
    for (const generation of diagnosis.personalTryOnGenerations) {
      if (!generation.imageObjectKey || !bucket) continue;
      const object = { bucket, key: generation.imageObjectKey };
      const objectId = `${object.bucket}/${object.key}`;
      if (deletedObjects.has(objectId)) continue;
      try {
        await input.deleteObject(object);
        deletedObjects.add(objectId);
        result.objectsDeleted += 1;
      } catch {
        allObjectsSucceeded = false;
        result.errors.push({
          personalTryOnGenerationId: generation.id,
          errorCode: "R2_DELETE_FAILED",
        });
      }
    }

    if (!allObjectsSucceeded) continue;

    await input.client.personalTryOnGeneration.deleteMany({
      where: { diagnosisId: diagnosis.id },
    });
    await input.client.styleRecommendation.updateMany({
      where: { diagnosisId: diagnosis.id },
      data: {
        tryOnImageUrl: null,
        tryOnImageStatus: "PENDING",
        tryOnImageError: null,
        tryOnWorkflowStatus: "EXPIRED",
        tryOnFailureCode: null,
        tryOnProvider: null,
        identityScore: null,
        productFidelityScore: null,
        tryOnExpiresAt: null,
      },
    });
    await input.client.styleDiagnosis.update({
      where: { id: diagnosis.id },
      data: { deletedAt: input.now },
    });
    result.diagnosesExpired += 1;
  }

  return result;
}
