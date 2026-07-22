import { NextRequest, NextResponse } from "next/server";
import { auth } from "@/lib/auth";
import { prisma } from "@/lib/prisma";
import { getAnonymousSessionByToken } from "@/lib/anonymous-session";
import { diagnosisFormSchema } from "@/lib/validators/diagnosis";
import { StyleAiService } from "@/lib/ai/style-ai-service";
import { StyleAiInput } from "@/lib/ai/style-ai-provider";
import {
  buildDiagnosisAnalysisInput,
  buildRecommendationPlan,
} from "@/lib/style-archetype/recommendation-plan";
import { persistRecommendationPlan } from "@/lib/style-archetype/recommendation-persistence";
import { createMockProductProvider } from "@/lib/marketplace/mock-product-provider";
import { matchOutfitProductPlans } from "@/lib/marketplace/outfit-product-matcher";
import {
  hashProductSnapshots,
  persistRecommendationProductPlans,
} from "@/lib/marketplace/recommendation-product-service";
import { runTryOnWorkflow } from "@/lib/try-on/prisma-try-on-workflow";

function requiredItemNames(items: unknown): string[] {
  if (!Array.isArray(items)) return [];
  return items.flatMap((item) => {
    if (
      typeof item === "object" &&
      item !== null &&
      "category" in item &&
      typeof item.category === "string"
    ) {
      return [item.category];
    }
    return [];
  });
}

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

    const {
      gender,
      age,
      heightCm,
      weightKg,
      budgetTier,
      photoAssetIds,
      faceTryOnConsent,
    } = parsed.data;

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
          budgetTier,
          status: "SUBMITTED",
          faceTryOnConsent,
          faceTryOnConsentAt: faceTryOnConsent ? new Date() : null,
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

    const recommendationPlan = buildRecommendationPlan({
      featureFlagValue: process.env.STYLE_ARCHETYPE_V2_ENABLED,
      diagnosisAnalysis: buildDiagnosisAnalysisInput(output, {
        gender,
        age,
        heightCm,
        weightKg,
      }),
      archetypes,
      legacyRecommendations: output.recommendations,
    });

    let updatedDiagnosis;
    try {
      updatedDiagnosis = await persistRecommendationPlan({
        client: prisma,
        diagnosisId: diagnosis.id,
        analysisOutput: output,
        plan: recommendationPlan,
      });
    } catch (error) {
      const persistenceErrorMessage = error instanceof Error ? error.message : "Diagnosis persistence failed";
      try {
        await styleAiService.finalizeJob(
          jobId,
          "PERSISTENCE_FAILED",
          output,
          persistenceErrorMessage,
          recommendationPlan.diagnostics,
          {
            errorCode: "RECOMMENDATION_PERSISTENCE_FAILED",
            correlationId: jobId,
          }
        );
      } catch (finalizeError) {
        console.error("Failed to finalize AI job after persistence failure:", finalizeError);
      }
      throw error;
    }

    const savedRecommendations = await prisma.styleRecommendation.findMany({
      where: { diagnosisId: diagnosis.id },
      orderBy: { rank: "asc" },
      select: {
        id: true,
        rank: true,
        isPrimary: true,
        title: true,
        colorPalette: true,
        items: true,
      },
    });
    let productPlans: Awaited<
      ReturnType<typeof matchOutfitProductPlans>
    > | null = null;
    try {
      productPlans = await matchOutfitProductPlans({
        budgetTier,
        providers: [
          createMockProductProvider("TAOBAO"),
          createMockProductProvider("JD"),
        ],
        recommendations: savedRecommendations.map((recommendation) => ({
          rank: recommendation.rank,
          title: recommendation.title,
          colorPalette: recommendation.colorPalette,
          requiredItems: requiredItemNames(recommendation.items),
        })),
      });
      await persistRecommendationProductPlans({
        client: prisma,
        recommendations: savedRecommendations.map(({ id, rank }) => ({
          id,
          rank,
        })),
        plans: productPlans,
      });
    } catch {
      await prisma.styleRecommendation.updateMany({
        where: { id: { in: savedRecommendations.map(({ id }) => id) } },
        data: { productPlanStatus: "FAILED" },
      });
    }

    if (faceTryOnConsent && productPlans) {
      const primary = savedRecommendations.find(
        (recommendation) => recommendation.isPrimary
      );
      const primaryPlan = primary
        ? productPlans.find((plan) => plan.rank === primary.rank)
        : null;
      if (primary && primaryPlan) {
        const productSnapshotHash = hashProductSnapshots(
          primaryPlan.products.map((product, index) => ({
            ...product,
            position: index + 1,
          }))
        );
        try {
          await runTryOnWorkflow({
            diagnosisId: diagnosis.id,
            recommendationId: primary.id,
            trigger: "AUTO_PRIMARY",
            isPrimary: true,
            expectedStatuses: ["NOT_REQUESTED"],
            consent: true,
            fullBodyImageUrl: roleUrlMap.FULL_BODY,
            faceImageUrl: roleUrlMap.FACE_FRONT,
            productSnapshotHash,
            products: primaryPlan.products.map((product) => ({
              category: product.category,
              imageUrl: product.imageUrl,
            })),
            diagnosisCreatedAt: diagnosis.createdAt,
            isAnonymous: !diagnosis.userId,
          });
        } catch {
          try {
            await prisma.styleRecommendation.update({
              where: { id: primary.id },
              data: {
                tryOnImageStatus: "FAILED",
                tryOnWorkflowStatus: "FAILED",
                tryOnFailureCode: "AUTO_TRY_ON_FAILED",
              },
            });
          } catch {
            // Diagnosis creation remains successful even if failure recording fails.
          }
        }
      }
    }

    try {
      await styleAiService.finalizeJob(
        jobId,
        errorMessage ? "FAILED" : "COMPLETED",
        output,
        errorMessage,
        recommendationPlan.diagnostics
      );
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
