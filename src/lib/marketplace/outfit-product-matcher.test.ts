import { describe, expect, it, vi } from "vitest";
import { createMockProductProvider } from "./mock-product-provider";
import { matchOutfitProductPlans } from "./outfit-product-matcher";
import type { ProductSearchInput } from "./types";

const completeProviders = [
  createMockProductProvider("TAOBAO"),
  createMockProductProvider("JD"),
];

const matcherInput = {
  budgetTier: "FROM_500_TO_1000" as const,
  providers: completeProviders,
  recommendations: [1, 2, 3].map((rank) => ({
    rank,
    title: `Direction ${rank}`,
    colorPalette: ["brown", "cream"],
    requiredItems: ["top", "bottom", "hat"],
  })),
};

describe("matchOutfitProductPlans", () => {
  it("returns three complete plans without mixing platforms", async () => {
    const plans = await matchOutfitProductPlans(matcherInput);

    expect(plans).toHaveLength(3);
    for (const plan of plans) {
      expect(new Set(plan.products.map((product) => product.platform)).size).toBe(
        1
      );
      expect(plan.products.map((product) => product.category)).toEqual(
        expect.arrayContaining(["TOP", "BOTTOM", "HAT"])
      );
      expect(plan.totalCents).toBeLessThanOrEqual(100_000);
    }
    expect(
      new Set(
        plans.map((plan) =>
          plan.products.map((product) => product.externalSkuId).join("|")
        )
      ).size
    ).toBe(3);
  });

  it("tries the other platform instead of mixing when one is incomplete", async () => {
    const taobao = createMockProductProvider("TAOBAO");
    const incompleteTaobao = {
      ...taobao,
      search: vi.fn(async (input: ProductSearchInput) =>
        input.category === "HAT" ? { products: [] } : taobao.search(input)
      ),
    };
    const plans = await matchOutfitProductPlans({
      ...matcherInput,
      providers: [incompleteTaobao, createMockProductProvider("JD")],
    });

    expect(plans[0].platform).toBe("JD");
    expect(
      plans[0].products.every((product) => product.platform === "JD")
    ).toBe(true);
  });

  it("keeps the lowest tier under 500 yuan and omits outerwear first", async () => {
    const plans = await matchOutfitProductPlans({
      ...matcherInput,
      budgetTier: "UNDER_500",
    });

    for (const plan of plans) {
      expect(plan.totalCents).toBeLessThanOrEqual(50_000);
      expect(plan.products.map((product) => product.category)).toEqual(
        expect.arrayContaining(["TOP", "BOTTOM", "HAT"])
      );
      expect(plan.products.some((product) => product.category === "OUTERWEAR"))
        .toBe(false);
    }
  });

  it("throws a typed error when three complete plans cannot be formed", async () => {
    await expect(
      matchOutfitProductPlans({
        ...matcherInput,
        recommendations: matcherInput.recommendations.slice(0, 2),
      })
    ).rejects.toMatchObject({
      name: "OutfitPlanningError",
      code: "NO_COMPLETE_SINGLE_PLATFORM_PLAN",
    });
  });
});
