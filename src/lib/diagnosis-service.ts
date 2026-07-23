import { prisma } from "@/lib/prisma";
import {
  buildReportDisplayModel,
  ReportRecommendationRecord,
} from "@/lib/diagnosis/report-display-model";
import {
  ReportDisplayModel,
  ReportPersonalTryOnState,
  ReportPersonalTryOnStatus,
  ReportRecommendation,
} from "@/types/diagnosis";
import { DiagnosisPhotoRole } from "@prisma/client";

export interface DiagnosisDetail {
  id: string;
  gender: string;
  age: number;
  heightCm: number;
  weightKg: number;
  budgetTier:
    | "UNDER_500"
    | "FROM_500_TO_1000"
    | "FROM_1000_TO_2000"
    | "ABOVE_2000";
  faceTryOnConsent: boolean;
  status: string;
  bodyType: string | null;
  faceShape: string | null;
  vibeKeywords: string[];
  summary: string | null;
  createdAt: Date;
  photos: {
    role: string;
    url: string | null;
    mimeType: string;
  }[];
  reportMode: ReportDisplayModel["mode"];
  recommendations: ReportRecommendation[];
}

const PHOTO_ORDER: DiagnosisPhotoRole[] = ["FACE_FRONT", "FACE_SIDE", "FULL_BODY"];

// Stable codes the generation service writes itself; anything else stored in
// the error column is raw provider/storage detail and must not reach clients.
const SAFE_PERSONAL_TRY_ON_ERROR_CODES = new Set([
  "OWNER_REQUIRED",
  "OWNER_AMBIGUOUS",
  "GENERATION_ALREADY_CLAIMED",
  "GENERATION_NOT_CLAIMABLE",
  "ATTEMPT_CAP_REACHED",
  "PERSONAL_TRY_ON_PROVIDER_FAILED",
  "PERSONAL_TRY_ON_STORAGE_FAILED",
]);

function sanitizePersonalTryOnErrorCode(error: string | null): string | null {
  if (!error) return null;
  return SAFE_PERSONAL_TRY_ON_ERROR_CODES.has(error)
    ? error
    : "PERSONAL_TRY_ON_PROVIDER_FAILED";
}

function toPersonalTryOnState(
  generation: {
    status: string;
    imageUrl: string | null;
    error: string | null;
    attemptCount: number;
  } | null
): ReportPersonalTryOnState | null {
  if (!generation) return null;
  return {
    status: generation.status as ReportPersonalTryOnStatus,
    imageUrl: generation.imageUrl,
    errorCode: sanitizePersonalTryOnErrorCode(generation.error),
    attemptCount: generation.attemptCount,
  };
}

export async function getDiagnosisDetailForViewer({
  diagnosisId,
  userId,
  anonymousSessionId,
}: {
  diagnosisId: string;
  userId: string | null;
  anonymousSessionId: string | null;
}): Promise<
  | { ok: true; diagnosis: DiagnosisDetail }
  | { ok: false; code: "NOT_FOUND" | "FORBIDDEN" }
> {
  const diagnosis = await prisma.styleDiagnosis.findUnique({
    where: { id: diagnosisId },
    include: {
      photos: {
        include: {
          mediaAsset: true,
        },
      },
      recommendations: {
        orderBy: { rank: "asc" },
        include: {
          products: { orderBy: { position: "asc" } },
          // recommendationId is unique, so at most one generation exists.
          personalTryOnGenerations: { take: 1 },
        },
      },
    },
  });

  if (!diagnosis) {
    return { ok: false, code: "NOT_FOUND" };
  }

  if (diagnosis.userId) {
    if (!userId || diagnosis.userId !== userId) {
      return { ok: false, code: "FORBIDDEN" };
    }
  } else {
    if (!anonymousSessionId || diagnosis.anonymousSessionId !== anonymousSessionId) {
      return { ok: false, code: "FORBIDDEN" };
    }
  }

  const photoMap = new Map(diagnosis.photos.map((p) => [p.role, p.mediaAsset]));
  const orderedPhotos = PHOTO_ORDER.map((role) => {
    const mediaAsset = photoMap.get(role);
    return {
      role,
      url: mediaAsset?.url ?? null,
      mimeType: mediaAsset?.mimeType ?? "",
    };
  });

  const baseRecommendationRecords: ReportRecommendationRecord[] =
    diagnosis.recommendations.map((rec) => ({
      id: rec.id,
      rank: rec.rank,
      isPrimary: rec.isPrimary,
      sourceMode: rec.sourceMode,
      archetypeVersion: rec.archetypeVersion,
      archetypeSnapshot: rec.archetypeSnapshot,
      archetypeId: rec.archetypeId,
      matchScore: rec.matchScore,
      title: rec.title,
      description: rec.description,
      summary: rec.summary,
      clothingAdvice: rec.clothingAdvice,
      hairstyleAdvice: rec.hairstyleAdvice,
      shoesAdvice: rec.shoesAdvice,
      colorPalette: rec.colorPalette,
      avoidTips: rec.avoidTips,
      items: rec.items,
      previewImageUrl: rec.previewImageUrl,
      previewImageStatus: rec.previewImageStatus,
      previewImageError: rec.previewImageError,
      tryOnImageUrl: rec.tryOnImageUrl,
      tryOnImageStatus: rec.tryOnImageStatus,
      tryOnImageError: rec.tryOnImageError,
      marketplacePlatform: rec.marketplacePlatform,
      productTotalCents: rec.productTotalCents,
      productPlanStatus: rec.productPlanStatus,
      products: rec.products,
      tryOnWorkflowStatus: rec.tryOnWorkflowStatus,
      tryOnAttemptCount: rec.tryOnAttemptCount,
      tryOnProvider: rec.tryOnProvider,
      identityScore: rec.identityScore,
      productFidelityScore: rec.productFidelityScore,
      tryOnExpiresAt: rec.tryOnExpiresAt,
      tryOnProductSnapshotHash: rec.tryOnProductSnapshotHash,
      personalTryOn: toPersonalTryOnState(
        (rec.personalTryOnGenerations ?? [])[0] ?? null
      ),
      archetype: null,
    }));

  let reportProjection = buildReportDisplayModel(baseRecommendationRecords);
  if (reportProjection.fallbackReason === "TRUE_LEGACY_RECORD") {
    const legacyRelations = await prisma.styleRecommendation.findMany({
      where: { diagnosisId: diagnosis.id },
      orderBy: { rank: "asc" },
      include: {
        archetype: {
          select: {
            id: true,
            name: true,
            personalityLabel: true,
            category: true,
          },
        },
      },
    });
    const relationByRecommendationId = new Map(
      legacyRelations.map((recommendation) => [
        recommendation.id,
        recommendation.archetype,
      ])
    );
    reportProjection = buildReportDisplayModel(
      baseRecommendationRecords.map((recommendation) => ({
        ...recommendation,
        archetype:
          relationByRecommendationId.get(recommendation.id) ?? null,
      }))
    );
  }

  const detail: DiagnosisDetail = {
    id: diagnosis.id,
    gender: diagnosis.gender,
    age: diagnosis.age,
    heightCm: diagnosis.heightCm,
    weightKg: diagnosis.weightKg,
    budgetTier: diagnosis.budgetTier,
    faceTryOnConsent:
      diagnosis.faceTryOnConsent && !diagnosis.faceTryOnRevokedAt,
    status: diagnosis.status,
    bodyType: diagnosis.bodyType,
    faceShape: diagnosis.faceShape,
    vibeKeywords: diagnosis.vibeKeywords,
    summary: diagnosis.summary,
    createdAt: diagnosis.createdAt,
    photos: orderedPhotos,
    reportMode: reportProjection.model.mode,
    recommendations: reportProjection.model.recommendations,
  };

  return { ok: true, diagnosis: detail };
}
