import { describe, expect, it } from "vitest";
import { matchOutfitProductPlans } from "./outfit-product-matcher";

const matcherInput = {
  budgetTier: "FROM_500_TO_1000" as const,
  recommendations: [1, 2, 3].map((rank) => ({
    rank,
    title: `Direction ${rank}`,
    colorPalette: ["brown", "cream"],
    requiredItems: ["top", "bottom"],
  })),
};

describe("matchOutfitProductPlans", () => {
  it("returns three generated plans with TOP and BOTTOM", async () => {
    const plans = await matchOutfitProductPlans(matcherInput);

    expect(plans).toHaveLength(3);
    for (const plan of plans) {
      expect(plan.products.map((product) => product.category).sort()).toEqual([
        "BOTTOM",
        "TOP",
      ]);
      expect(plan.totalCents).toBe(0);
      expect(plan.platform).toBe("TAOBAO");
    }
    expect(
      new Set(
        plans.map((plan) =>
          plan.products.map((product) => product.externalSkuId).join("|")
        )
      ).size
    ).toBe(3);
  });

  it("uses the first color in the palette for generated products", async () => {
    const plans = await matchOutfitProductPlans({
      ...matcherInput,
      recommendations: [1, 2, 3].map((rank) => ({
        rank,
        title: `Direction ${rank}`,
        colorPalette: ["navy"],
        requiredItems: ["top", "bottom"],
      })),
    });

    expect(plans[0].products.every((product) => product.color === "navy")).toBe(
      true
    );
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
