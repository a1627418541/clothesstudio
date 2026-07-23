import { NextRequest, NextResponse } from "next/server";
import { auth } from "@/lib/auth";
import { getAnonymousSessionByToken } from "@/lib/anonymous-session";
import { prisma } from "@/lib/prisma";
import { runTryOnWorkflow } from "@/lib/try-on/prisma-try-on-workflow";
import { generateGarmentImagesForPlan } from "@/lib/try-on/garment-image-generator";
import type { ProductWithGeneratedImage } from "@/lib/try-on/garment-image-generator";
import type { OutfitProductPlan } from "@/lib/marketplace/outfit-product-matcher";
import type { ProductSnapshot } from "@/lib/marketplace/types";

interface RouteContext {
  params: Promise<{ id: string; recommendationId: string }>;
}

const PROCESSING_STATUSES = new Set([
  "QUEUED",
  "APPLYING_GARMENTS",
  "APPLYING_HAT",
  "RESTORING_IDENTITY",
  "QUALITY_CHECKING",
]);

function needsGeneratedGarmentImage(imageUrl: string): boolean {
  return imageUrl.startsWith("data:") || imageUrl.includes("example.invalid");
}

interface RecommendationWithProducts {
  id: string;
  rank: number;
  isPrimary: boolean;
  title: string;
  marketplacePlatform: string | null;
  productTotalCents: number | null;
  productPlanStatus: string;
  tryOnWorkflowStatus: string;
  tryOnProductSnapshotHash: string | null;
  products: ProductSnapshot[];
}

function buildProductPlanFromRecommendation(
  recommendation: RecommendationWithProducts
): OutfitProductPlan {
  return {
    rank: recommendation.rank,
    platform: (recommendation.marketplacePlatform as "TAOBAO" | "JD") ?? "TAOBAO",
    totalCents: recommendation.productTotalCents ?? 0,
    products: recommendation.products,
  };
}

export async function POST(request: NextRequest, { params }: RouteContext) {
  try {
    const { id, recommendationId } = await params;
    const session = await auth();
    const userId = session?.user?.id ?? null;
    let anonymousSessionId: string | null = null;
    if (!userId) {
      const token = request.cookies.get("aps_anonymous_session")?.value;
      if (token) {
        anonymousSessionId =
          (await getAnonymousSessionByToken(token))?.id ?? null;
      }
    }

    const diagnosis = await prisma.styleDiagnosis.findUnique({
      where: { id },
      include: {
        photos: { include: { mediaAsset: true } },
        recommendations: {
          where: { id: recommendationId },
          include: { products: { orderBy: { position: "asc" } } },
        },
      },
    });
    if (!diagnosis) {
      return NextResponse.json({ error: "NOT_FOUND" }, { status: 404 });
    }
    const owned = diagnosis.userId
      ? diagnosis.userId === userId
      : Boolean(
          anonymousSessionId &&
            diagnosis.anonymousSessionId === anonymousSessionId
        );
    if (!owned) {
      return NextResponse.json({ error: "FORBIDDEN" }, { status: 403 });
    }

    const recommendation = diagnosis.recommendations[0];
    if (!recommendation) {
      return NextResponse.json({ error: "NOT_FOUND" }, { status: 404 });
    }
    if (!diagnosis.faceTryOnConsent || diagnosis.faceTryOnRevokedAt) {
      return NextResponse.json(
        { error: "CONSENT_REQUIRED" },
        { status: 409 }
      );
    }
    const categories = new Set(
      recommendation.products.map((product) => product.category)
    );
    const completeProducts = ["TOP", "BOTTOM", "HAT"].every((category) =>
      categories.has(category as "TOP" | "BOTTOM" | "HAT")
    );
    const productPlanReady =
      recommendation.productPlanStatus === "READY" &&
      Boolean(recommendation.tryOnProductSnapshotHash) &&
      completeProducts &&
      recommendation.products.every(
        (product) => product.availabilityStatus !== "UNAVAILABLE"
      );
    if (!productPlanReady) {
      return NextResponse.json(
        { error: "PRODUCT_PLAN_NOT_READY" },
        { status: 409 }
      );
    }
    if (PROCESSING_STATUSES.has(recommendation.tryOnWorkflowStatus)) {
      return NextResponse.json(
        { error: "TRY_ON_ALREADY_PROCESSING" },
        { status: 409 }
      );
    }
    const expectedStatuses =
      recommendation.tryOnWorkflowStatus === "FAILED"
        ? (["FAILED"] as const)
        : recommendation.tryOnWorkflowStatus === "NOT_REQUESTED"
          ? (["NOT_REQUESTED"] as const)
          : null;
    if (!expectedStatuses) {
      return NextResponse.json(
        { error: "TRY_ON_NOT_REQUESTABLE" },
        { status: 409 }
      );
    }

    const faceImageUrl = diagnosis.photos.find(
      (photo) => photo.role === "FACE_FRONT"
    )?.mediaAsset.url;
    const fullBodyImageUrl = diagnosis.photos.find(
      (photo) => photo.role === "FULL_BODY"
    )?.mediaAsset.url;
    if (!faceImageUrl || !fullBodyImageUrl) {
      return NextResponse.json(
        { error: "REQUIRED_PHOTOS_NOT_READY" },
        { status: 409 }
      );
    }

    let workflowProducts = recommendation.products.map((product) => ({
      category: product.category,
      imageUrl: product.imageUrl,
    }));

    if (recommendation.products.some((product) => needsGeneratedGarmentImage(product.imageUrl))) {
      const plan = buildProductPlanFromRecommendation(recommendation as RecommendationWithProducts);
      const generatedPlan = await generateGarmentImagesForPlan(plan, {
        styleDirection: recommendation.title,
      });

      await prisma.$transaction(async (tx) => {
        for (const product of generatedPlan.products as ProductWithGeneratedImage[]) {
          await tx.recommendationProduct.updateMany({
            where: {
              recommendationId: recommendation.id,
              externalProductId: product.externalProductId,
              externalSkuId: product.externalSkuId,
            },
            data: { imageUrl: product.generatedImageUrl },
          });
        }
      });

      workflowProducts = (generatedPlan.products as ProductWithGeneratedImage[]).map((product) => ({
        category: product.category,
        imageUrl: product.generatedImageUrl,
      }));
    }

    const result = await runTryOnWorkflow({
      diagnosisId: diagnosis.id,
      recommendationId: recommendation.id,
      trigger: "USER_REQUEST",
      isPrimary: recommendation.isPrimary,
      expectedStatuses,
      consent: true,
      fullBodyImageUrl,
      faceImageUrl,
      productSnapshotHash: recommendation.tryOnProductSnapshotHash!,
      products: workflowProducts,
      diagnosisCreatedAt: diagnosis.createdAt,
      isAnonymous: !diagnosis.userId,
    });
    if (result.status === "SKIPPED" || result.status === "CANCELLED") {
      return NextResponse.json({ ok: false, result }, { status: 409 });
    }
    return NextResponse.json({ ok: true, result });
  } catch {
    console.error("Recommendation try-on error: TRY_ON_REQUEST_FAILED");
    return NextResponse.json(
      { error: "TRY_ON_REQUEST_FAILED" },
      { status: 500 }
    );
  }
}
