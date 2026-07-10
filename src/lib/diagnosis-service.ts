import { prisma } from "@/lib/prisma";
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
  recommendations: {
    rank: number;
    isPrimary: boolean;
    title: string;
    description: string | null;
    summary: string;
    clothingAdvice: string;
    hairstyleAdvice: string;
    shoesAdvice: string;
    colorPalette: string[];
    avoidTips: string[];
  }[];
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
    recommendations: diagnosis.recommendations.map((rec) => ({
      rank: rec.rank,
      isPrimary: rec.isPrimary,
      title: rec.title,
      description: rec.description,
      summary: rec.summary,
      clothingAdvice: rec.clothingAdvice,
      hairstyleAdvice: rec.hairstyleAdvice,
      shoesAdvice: rec.shoesAdvice,
      colorPalette: rec.colorPalette,
      avoidTips: rec.avoidTips,
    })),
  };

  return { ok: true, diagnosis: detail };
}
