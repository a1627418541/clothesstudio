import { NextRequest, NextResponse } from "next/server";
import { auth } from "@/lib/auth";
import { prisma } from "@/lib/prisma";
import { getAnonymousSessionByToken } from "@/lib/anonymous-session";
import { diagnosisFormSchema } from "@/lib/validators/diagnosis";
import { StyleAiService } from "@/lib/ai/style-ai-service";
import { StyleAiInput } from "@/lib/ai/style-ai-provider";
import { MATCH_WEIGHTS } from "@/lib/style-archetype/match-config";
import { buildMatchedRecommendations, MatchedRecommendation } from "@/lib/style-archetype/diagnosis-matcher";

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

    const roleUrlMap: Record<string, string | undefined> = {};
    for (const asset of assets) {
      const role = (Object.entries(photoAssetIds).find(([, id]) => id === asset.id)?.[0]) as
        | "FACE_FRONT"
        | "FACE_SIDE"
        | "FULL_BODY";
      if (role) {
        roleUrlMap[role] = asset.url ?? undefined;
      }
    }

    if (!roleUrlMap.FACE_FRONT || !roleUrlMap.FACE_SIDE || !roleUrlMap.FULL_BODY) {
      return NextResponse.json({ error: "Missing photo URLs" }, { status: 400 });
    }

    const diagnosis = await prisma.$transaction(async (tx) => {
      const created = await tx.styleDiagnosis.create({
        data: {
          userId,
          anonymousSessionId,
          gender,
          age,
          heightCm,
          weightKg,
          status: "SUBMITTED",
        },
      });

      await tx.diagnosisPhoto.createMany({
        data: [
          { diagnosisId: created.id, mediaAssetId: photoAssetIds.FACE_FRONT, role: "FACE_FRONT" },
          { diagnosisId: created.id, mediaAssetId: photoAssetIds.FACE_SIDE, role: "FACE_SIDE" },
          { diagnosisId: created.id, mediaAssetId: photoAssetIds.FULL_BODY, role: "FULL_BODY" },
        ],
      });

      return created;
    });

    const styleInput: StyleAiInput = {
      userId,
      anonymousSessionId,
      diagnosisId: diagnosis.id,
      gender,
      age,
      heightCm,
      weightKg,
      photoUrls: {
        FACE_FRONT: roleUrlMap.FACE_FRONT,
        FACE_SIDE: roleUrlMap.FACE_SIDE,
        FULL_BODY: roleUrlMap.FULL_BODY,
      },
    };

    const styleAiService = new StyleAiService();
    const { output, jobId, errorMessage } = await styleAiService.analyze(styleInput);

    const archetypes = await prisma.styleArchetype.findMany({
      where: { active: true },
      orderBy: { createdAt: "asc" },
    });

    const matchedRecommendations: MatchedRecommendation[] = buildMatchedRecommendations(
      { gender, age, heightCm, weightKg },
      output,
      archetypes,
      {
        topK: 3,
        weights: MATCH_WEIGHTS,
      }
    );

    let updatedDiagnosis;
    try {
      updatedDiagnosis = await prisma.$transaction(async (tx) => {
        await tx.styleDiagnosis.update({
          where: { id: diagnosis.id },
          data: {
            bodyType: output.bodyType,
            faceShape: output.faceShape,
            vibeKeywords: output.vibeKeywords,
            summary: output.summary,
            status: "PREVIEW_READY",
          },
        });

        await tx.styleRecommendation.createMany({
          data: matchedRecommendations.map((item, index) => ({
            diagnosisId: diagnosis.id,
            title: item.recommendation.title,
            description: item.recommendation.description,
            summary: item.recommendation.summary,
            clothingAdvice: item.recommendation.clothingAdvice,
            hairstyleAdvice: item.recommendation.hairstyleAdvice,
            shoesAdvice: item.recommendation.shoesAdvice,
            colorPalette: item.recommendation.colorPalette,
            avoidTips: item.recommendation.avoidTips,
            rank: index + 1,
            isPrimary: index === 0,
            archetypeId: item.archetypeId ?? null,
            matchScore: item.matchScore ?? null,
          })),
        });

        return tx.styleDiagnosis.findUniqueOrThrow({
          where: { id: diagnosis.id },
        });
      });
    } catch (error) {
      const persistenceErrorMessage = error instanceof Error ? error.message : "Diagnosis persistence failed";
      try {
        await styleAiService.finalizeJob(jobId, "PERSISTENCE_FAILED", output, persistenceErrorMessage);
      } catch (finalizeError) {
        console.error("Failed to finalize AI job after persistence failure:", finalizeError);
      }
      throw error;
    }

    try {
      await styleAiService.finalizeJob(jobId, errorMessage ? "FAILED" : "COMPLETED", output, errorMessage);
    } catch (finalizeError) {
      console.error("Failed to finalize AI job after successful persistence:", finalizeError);
    }

    return NextResponse.json(
      {
        id: updatedDiagnosis.id,
        status: updatedDiagnosis.status,
        primaryRecommendation: output.recommendations[0],
      },
      { status: 201 }
    );
  } catch (error) {
    console.error("Diagnosis submission error:", error);
    const message = error instanceof Error ? error.message : "Diagnosis submission failed";
    return NextResponse.json({ error: message }, { status: 500 });
  }
}
