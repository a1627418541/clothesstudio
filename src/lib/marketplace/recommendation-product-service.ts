import { createHash } from "node:crypto";
import { Prisma } from "@prisma/client";
import type { OutfitProductPlan } from "./outfit-product-matcher";
import type { ProductSnapshot } from "./types";

export type PositionedProductSnapshot = ProductSnapshot & { position: number };

export interface RecommendationProductPersistenceClient {
  $transaction<T>(
    operation: (tx: Prisma.TransactionClient) => Promise<T>
  ): Promise<T>;
}

interface PersistRecommendationProductPlansInput {
  client: RecommendationProductPersistenceClient;
  recommendations: Array<{ id: string; rank: number }>;
  plans: OutfitProductPlan[];
}

export function hashProductSnapshots(
  products: PositionedProductSnapshot[]
): string {
  const canonical = products
    .slice()
    .sort((left, right) => left.position - right.position)
    .map((product) => ({
      platform: product.platform,
      externalProductId: product.externalProductId,
      externalSkuId: product.externalSkuId,
      color: product.color,
      variantLabel: product.variantLabel,
      position: product.position,
    }));

  return `sha256:${createHash("sha256")
    .update(JSON.stringify(canonical), "utf8")
    .digest("hex")}`;
}

function rawSnapshot(product: ProductSnapshot): Prisma.InputJsonValue {
  return {
    platform: product.platform,
    externalProductId: product.externalProductId,
    externalSkuId: product.externalSkuId,
    category: product.category,
    title: product.title,
    imageUrl: product.imageUrl,
    purchaseUrl: product.purchaseUrl,
    priceCents: product.priceCents,
    currency: product.currency,
    sellerName: product.sellerName,
    color: product.color,
    variantLabel: product.variantLabel,
    availabilityStatus: product.availabilityStatus,
    snapshotAt: product.snapshotAt.toISOString(),
  };
}

export async function persistRecommendationProductPlans(
  input: PersistRecommendationProductPlansInput
): Promise<void> {
  const recommendationByRank = new Map(
    input.recommendations.map((recommendation) => [
      recommendation.rank,
      recommendation,
    ])
  );
  const prepared = input.plans.map((plan) => {
    const recommendation = recommendationByRank.get(plan.rank);
    if (!recommendation) {
      throw new Error("RECOMMENDATION_PLAN_RANK_MISMATCH");
    }
    const products = plan.products.map((product, index) => ({
      ...product,
      position: index + 1,
    }));
    return { recommendation, plan, products };
  });

  if (
    prepared.length !== 3 ||
    new Set(prepared.map((item) => item.recommendation.id)).size !== 3
  ) {
    throw new Error("RECOMMENDATION_PLAN_RANK_MISMATCH");
  }

  await input.client.$transaction(async (tx) => {
    const rows: Prisma.RecommendationProductCreateManyInput[] = prepared.flatMap(
      ({ recommendation, products }) =>
        products.map((product) => ({
          recommendationId: recommendation.id,
          platform: product.platform,
          externalProductId: product.externalProductId,
          externalSkuId: product.externalSkuId,
          category: product.category,
          title: product.title,
          imageUrl: product.imageUrl,
          purchaseUrl: product.purchaseUrl,
          priceCents: product.priceCents,
          currency: product.currency,
          sellerName: product.sellerName,
          color: product.color,
          variantLabel: product.variantLabel,
          availabilityStatus: product.availabilityStatus,
          snapshotAt: product.snapshotAt,
          position: product.position,
          rawSnapshot: rawSnapshot(product),
        }))
    );
    await tx.recommendationProduct.createMany({ data: rows });

    for (const { recommendation, plan, products } of prepared) {
      await tx.styleRecommendation.update({
        where: { id: recommendation.id },
        data: {
          marketplacePlatform: plan.platform,
          productTotalCents: plan.totalCents,
          productPlanStatus: "READY",
          tryOnProductSnapshotHash: hashProductSnapshots(products),
        },
      });
    }
  });
}
