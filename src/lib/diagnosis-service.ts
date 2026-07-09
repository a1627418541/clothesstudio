import { prisma } from "@/lib/prisma";
import { DiagnosisPhotoRole } from "@prisma/client";

export interface DiagnosisDetail {
  id: string;
  gender: string;
  age: number;
  heightCm: number;
  weightKg: number;
  status: string;
  createdAt: Date;
  photos: {
    role: string;
    url: string | null;
    mimeType: string;
  }[];
  primaryRecommendation: {
    title: string;
    summary: string;
    clothingAdvice: string;
    hairstyleAdvice: string;
    shoesAdvice: string;
    colorPalette: string[];
    avoidTips: string[];
  } | null;
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
        where: { isPrimary: true },
        orderBy: { rank: "asc" },
        take: 1,
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

  const primary = diagnosis.recommendations[0] ?? null;

  const detail: DiagnosisDetail = {
    id: diagnosis.id,
    gender: diagnosis.gender,
    age: diagnosis.age,
    heightCm: diagnosis.heightCm,
    weightKg: diagnosis.weightKg,
    status: diagnosis.status,
    createdAt: diagnosis.createdAt,
    photos: orderedPhotos,
    primaryRecommendation: primary
      ? {
          title: primary.title,
          summary: primary.summary,
          clothingAdvice: primary.clothingAdvice,
          hairstyleAdvice: primary.hairstyleAdvice,
          shoesAdvice: primary.shoesAdvice,
          colorPalette: primary.colorPalette,
          avoidTips: primary.avoidTips,
        }
      : null,
  };

  return { ok: true, diagnosis: detail };
}
