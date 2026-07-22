import { describe, expect, it } from "vitest";
import { createMockProductProvider } from "./mock-product-provider";
import { budgetRangeForTier } from "./types";

describe("mock marketplace provider", () => {
  it("returns only requested platform and category products", async () => {
    const provider = createMockProductProvider("TAOBAO");
    const result = await provider.search({
      category: "HAT",
      colors: ["brown"],
      keywords: ["retro"],
      minPriceCents: 0,
      maxPriceCents: 20_000,
      limit: 10,
    });

    expect(result.products.length).toBeGreaterThan(0);
    expect(
      result.products.every(
        (product) =>
          product.platform === "TAOBAO" && product.category === "HAT"
      )
    ).toBe(true);
  });

  it("builds a deterministic mock purchase link", async () => {
    const provider = createMockProductProvider("JD");
    await expect(
      provider.buildPurchaseLink({
        externalProductId: "jd-top-001",
        externalSkuId: "jd-top-001-cream-m",
      })
    ).resolves.toBe(
      "https://example.invalid/jd/product/jd-top-001?sku=jd-top-001-cream-m"
    );
  });

  it("filters by price and ranks an exact color match first", async () => {
    const provider = createMockProductProvider("JD");
    const result = await provider.search({
      category: "TOP",
      colors: ["brown"],
      keywords: ["wool"],
      minPriceCents: 15_000,
      maxPriceCents: 95_000,
      limit: 10,
    });

    expect(result.products.map((product) => product.externalProductId)).toEqual([
      "jd-top-002",
    ]);
    expect(
      result.products.every(
        (product) =>
          product.priceCents >= 15_000 && product.priceCents <= 95_000
      )
    ).toBe(true);
  });

  it("exposes the approved total-outfit budget ranges", () => {
    expect(budgetRangeForTier("UNDER_500")).toEqual({
      minCents: 0,
      maxCents: 50_000,
    });
    expect(budgetRangeForTier("FROM_500_TO_1000")).toEqual({
      minCents: 50_000,
      maxCents: 100_000,
    });
    expect(budgetRangeForTier("FROM_1000_TO_2000")).toEqual({
      minCents: 100_000,
      maxCents: 200_000,
    });
    expect(budgetRangeForTier("ABOVE_2000")).toEqual({
      minCents: 200_000,
      maxCents: null,
    });
  });
});
