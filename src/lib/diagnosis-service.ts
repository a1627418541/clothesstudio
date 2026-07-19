import { prisma } from "@/lib/prisma";
import {
  buildReportDisplayModel,
  ReportRecommendationRecord,
} from "@/lib/diagnosis/report-display-model";
import { ReportDisplayModel, ReportRecommendation } from "@/types/diagnosis";
import { DiagnosisPhotoRole } from "@prisma/client";

export interface DiagnosisDetail {
  id: string;
  gender: string;
  age: number;
  heightCm: number;
  weightKg: number;
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
