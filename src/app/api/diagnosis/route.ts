import { NextRequest, NextResponse } from "next/server";
import { auth } from "@/lib/auth";
import { prisma } from "@/lib/prisma";
import { getAnonymousSessionByToken } from "@/lib/anonymous-session";
import { diagnosisFormSchema } from "@/lib/validators/diagnosis";
import { generateMockStyleRecommendation } from "@/lib/mock-style-engine";
import { StyleDiagnosisStatus } from "@prisma/client";

export async function POST(request: NextRequest) {
  try {
    const session = await auth();
    const userId = session?.user?.id ?? null;

    let anonymousSessionId: string | null = null;
    if (!userId) {
      const anonymousToken = request.cookies.get("aps_anonymous_session")?.value;
      if (!anonymousToken) {
        return NextResponse.json({ error: "Anonymous session required" }, { status: 401 });
      }
      const anonymousSession = await getAnonymousSessionByToken(anonymousToken);
      if (!anonymousSession) {
        return NextResponse.json({ error: "Invalid or expired anonymous session" }, { status: 401 });
      }
      anonymousSessionId = anonymousSession.id;
    }

    const body = await request.json();
    const parsed = diagnosisFormSchema.safeParse(body);

    if (!parsed.success) {
      return NextResponse.json(
        { error: "Invalid diagnosis form data", issues: parsed.error.issues },
        { status: 400 }
      );
    }

    const { gender, age, heightCm, weightKg, photoAssetIds } = parsed.data;

    const assetIds = Object.values(photoAssetIds);
    const assets = await prisma.mediaAsset.findMany({
      where: { id: { in: assetIds } },
    });

    if (assets.length !== assetIds.length) {
      return NextResponse.json({ error: "One or more photo assets not found" }, { status: 403 });
    }

    for (const asset of assets) {
      const ownedByUser = userId && asset.userId === userId;
      const ownedByAnonymous = anonymousSessionId && asset.anonymousSessionId === anonymousSessionId;
      if (!ownedByUser && !ownedByAnonymous) {
        return NextResponse.json(
          { error: "Photo asset not owned by current session" },
          { status: 403 }
        );
      }
    }

    const primaryRecommendation = generateMockStyleRecommendation({
      gender,
      age,
      heightCm,
      weightKg,
    });

    const diagnosis = await prisma.$transaction(async (tx) => {
      const created = await tx.styleDiagnosis.create({
        data: {
          userId,
          anonymousSessionId,
          gender,
          age,
          heightCm,
          weightKg,
          status: StyleDiagnosisStatus.SUBMITTED,
        },
      });

      await tx.diagnosisPhoto.createMany({
        data: [
          { diagnosisId: created.id, mediaAssetId: photoAssetIds.FACE_FRONT, role: "FACE_FRONT" },
          { diagnosisId: created.id, mediaAssetId: photoAssetIds.FACE_SIDE, role: "FACE_SIDE" },
          { diagnosisId: created.id, mediaAssetId: photoAssetIds.FULL_BODY, role: "FULL_BODY" },
        ],
      });

      await tx.styleRecommendation.create({
        data: {
          diagnosisId: created.id,
          title: primaryRecommendation.title,
          summary: primaryRecommendation.summary,
          clothingAdvice: primaryRecommendation.clothingAdvice,
          hairstyleAdvice: primaryRecommendation.hairstyleAdvice,
          shoesAdvice: primaryRecommendation.shoesAdvice,
          colorPalette: primaryRecommendation.colorPalette,
          avoidTips: primaryRecommendation.avoidTips,
          rank: 1,
          isPrimary: true,
        },
      });

      return tx.styleDiagnosis.update({
        where: { id: created.id },
        data: { status: StyleDiagnosisStatus.PREVIEW_READY },
      });
    });

    return NextResponse.json(
      {
        id: diagnosis.id,
        status: diagnosis.status,
        primaryRecommendation,
      },
      { status: 201 }
    );
  } catch (error) {
    console.error("Diagnosis submission error:", error);
    const message = error instanceof Error ? error.message : "Diagnosis submission failed";
    return NextResponse.json({ error: message }, { status: 500 });
  }
}
