import { describe, expect, it, vi } from "vitest";
import {
  hashProductSnapshots,
  persistRecommendationProductPlans,
} from "./recommendation-product-service";
import type { OutfitProductPlan } from "./outfit-product-matcher";
import type { ProductSnapshot } from "./types";

function product(
  externalProductId: string,
  category: ProductSnapshot["category"]
): ProductSnapshot {
  return {
    platform: "TAOBAO",
    externalProductId,
    externalSkuId: `${externalProductId}-sku`,
    category,
    title: externalProductId,
    imageUrl: `data:image/svg+xml,${externalProductId}`,
    purchaseUrl: `https://example.invalid/taobao/product/${externalProductId}`,
    priceCents: 10_000,
    currency: "CNY",
    sellerName: "Mock seller",
    color: "brown",
    variantLabel: "Brown / M",
    availabilityStatus: "AVAILABLE",
    snapshotAt: new Date("2026-07-20T00:00:00.000Z"),
  };
}

const plans: OutfitProductPlan[] = [1, 2, 3].map((rank) => ({
  rank,
  platform: "TAOBAO",
  products: [
    product(`top-${rank}`, "TOP"),
    product(`bottom-${rank}`, "BOTTOM"),
    product(`hat-${rank}`, "HAT"),
  ],
  totalCents: 30_000,
}));

describe("recommendation product persistence", () => {
  it("hashes the ordered product identity fields deterministically", () => {
    const positioned = plans[0].products.map((item, index) => ({
      ...item,
      position: index + 1,
    }));

    expect(hashProductSnapshots(positioned)).toBe(
      hashProductSnapshots(positioned.map((item) => ({ ...item })))
    );
    expect(hashProductSnapshots([...positioned].reverse())).toBe(
      hashProductSnapshots(positioned)
    );
  });

  it("maps plans by rank and writes ordered snapshots in one transaction", async () => {
    const createMany = vi.fn().mockResolvedValue({ count: 9 });
    const update = vi.fn().mockResolvedValue({});
    const deleteMany = vi.fn();
    const transaction = vi.fn(async (operation) =>
      operation({
        recommendationProduct: { createMany, deleteMany },
        styleRecommendation: { update },
      })
    );

    await persistRecommendationProductPlans({
      client: { $transaction: transaction },
      recommendations: [
        { id: "rec-3", rank: 3 },
        { id: "rec-1", rank: 1 },
        { id: "rec-2", rank: 2 },
      ],
      plans,
    });

    expect(transaction).toHaveBeenCalledOnce();
    expect(deleteMany).not.toHaveBeenCalled();
    expect(createMany).toHaveBeenCalledWith({
      data: expect.arrayContaining([
        expect.objectContaining({
          recommendationId: "rec-1",
          platform: "TAOBAO",
          category: "TOP",
          position: 1,
        }),
      ]),
    });
    expect(update).toHaveBeenCalledTimes(3);
    expect(update).toHaveBeenCalledWith({
      where: { id: "rec-1" },
      data: expect.objectContaining({
        marketplacePlatform: "TAOBAO",
        productTotalCents: 30_000,
        productPlanStatus: "READY",
        tryOnProductSnapshotHash: expect.stringMatching(/^sha256:/),
      }),
    });
  });
});
