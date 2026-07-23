import { describe, expect, it, vi, beforeEach, afterEach } from "vitest";
import {
  generateGarmentImage,
  generateGarmentImagesForPlan,
  type GenerateGarmentImageInput,
  type ProductWithGeneratedImage,
} from "./garment-image-generator";
import type { StylePreviewImageProvider } from "@/lib/ai/style-preview-image-provider";
import type { OutfitProductPlan } from "@/lib/marketplace/outfit-product-matcher";

function makeDependencies(
  overrides: Partial<Parameters<typeof generateGarmentImage>[1]> = {}
) {
  return {
    imageProvider: {
      generate: vi.fn(async () => ({
        url: "https://example.com/generated.png",
        base64: null,
        error: null,
      })),
    } satisfies StylePreviewImageProvider,
    storeImage: vi.fn(async () => ({ url: "https://r2.example.com/garment.png" })),
    ...overrides,
  };
}

function makeInput(overrides: Partial<GenerateGarmentImageInput> = {}): GenerateGarmentImageInput {
  return {
    category: "TOP",
    title: "奶油色日常针织上衣",
    color: "cream",
    keywords: ["clean", "knit"],
    styleDirection: "minimal daily",
    ...overrides,
  };
}

describe("generateGarmentImage", () => {
  beforeEach(() => {
    vi.useFakeTimers({ shouldAdvanceTime: true });
    vi.setSystemTime(new Date("2026-07-23T00:00:00.000Z"));
  });

  afterEach(() => {
    vi.useRealTimers();
    vi.restoreAllMocks();
  });

  it("generates and stores a garment image", async () => {
    const deps = makeDependencies();
    const result = await generateGarmentImage(makeInput(), deps);

    expect("imageUrl" in result).toBe(true);
    expect(result).toEqual({ imageUrl: "https://r2.example.com/garment.png" });
    expect(deps.imageProvider.generate).toHaveBeenCalledWith(
      expect.objectContaining({
        prompt: expect.stringContaining("Professional e-commerce product photography"),
        size: "1024x1024",
      })
    );
    expect(deps.storeImage).toHaveBeenCalledWith(
      expect.objectContaining({
        url: "https://example.com/generated.png",
        base64: null,
        key: expect.stringMatching(/^try-on\/garments\/top\//),
      })
    );
  });

  it("includes category-specific language in the prompt", async () => {
    const deps = makeDependencies();
    await generateGarmentImage(makeInput({ category: "BOTTOM" }), deps);

    const prompt = vi.mocked(deps.imageProvider.generate).mock.calls[0][0].prompt;
    expect(prompt).toContain("A pair of pants or trousers laid flat");
    expect(prompt).not.toContain("upper-body top");
  });

  it("returns an error when the image provider fails", async () => {
    const deps = makeDependencies({
      imageProvider: {
        generate: vi.fn(async () => ({
          url: null,
          base64: null,
          error: "rate limited",
        })),
      },
    });
    const result = await generateGarmentImage(makeInput(), deps);

    expect("error" in result).toBe(true);
    expect(result).toEqual({ error: "rate limited" });
  });

  it("returns an error when storage fails", async () => {
    const deps = makeDependencies({
      storeImage: vi.fn(async () => ({ error: "upload failed" })),
    });
    const result = await generateGarmentImage(makeInput(), deps);

    expect("error" in result).toBe(true);
    expect(result).toEqual({ error: "upload failed" });
  });

  it("supports base64 image output", async () => {
    const deps = makeDependencies({
      imageProvider: {
        generate: vi.fn(async () => ({
          url: null,
          base64: "base64data",
          error: null,
        })),
      },
    });
    const result = await generateGarmentImage(makeInput(), deps);

    expect(result).toEqual({ imageUrl: "https://r2.example.com/garment.png" });
    expect(deps.storeImage).toHaveBeenCalledWith(
      expect.objectContaining({ url: null, base64: "base64data" })
    );
  });
});

describe("generateGarmentImagesForPlan", () => {
  beforeEach(() => {
    vi.useFakeTimers({ shouldAdvanceTime: true });
    vi.setSystemTime(new Date("2026-07-23T00:00:00.000Z"));
  });

  afterEach(() => {
    vi.useRealTimers();
    vi.restoreAllMocks();
  });

  function makePlan(): OutfitProductPlan {
    return {
      rank: 1,
      platform: "TAOBAO",
      totalCents: 100_000,
      products: [
        {
          platform: "TAOBAO",
          externalProductId: "taobao-top-001",
          externalSkuId: "taobao-top-001-cream-m",
          category: "TOP",
          title: "奶油色日常针织上衣",
          imageUrl: "https://example.com/top.png",
          purchaseUrl: "https://example.com/top",
          priceCents: 12_900,
          currency: "CNY",
          sellerName: "淘宝模拟精选店",
          color: "cream",
          variantLabel: "奶油色 / M",
          availabilityStatus: "AVAILABLE",
          snapshotAt: new Date(),
        },
        {
          platform: "TAOBAO",
          externalProductId: "taobao-bottom-001",
          externalSkuId: "taobao-bottom-001-brown-m",
          category: "BOTTOM",
          title: "咖色直筒长裤",
          imageUrl: "https://example.com/bottom.png",
          purchaseUrl: "https://example.com/bottom",
          priceCents: 15_900,
          currency: "CNY",
          sellerName: "淘宝模拟精选店",
          color: "brown",
          variantLabel: "咖色 / M",
          availabilityStatus: "AVAILABLE",
          snapshotAt: new Date(),
        },
        {
          platform: "TAOBAO",
          externalProductId: "taobao-hat-001",
          externalSkuId: "taobao-hat-001-brown-one",
          category: "HAT",
          title: "复古棕灯芯绒帽",
          imageUrl: "https://example.com/hat.png",
          purchaseUrl: "https://example.com/hat",
          priceCents: 5_900,
          currency: "CNY",
          sellerName: "淘宝模拟精选店",
          color: "brown",
          variantLabel: "棕色 / 均码",
          availabilityStatus: "AVAILABLE",
          snapshotAt: new Date(),
        },
      ],
    };
  }

  it("generates images for every product in the plan", async () => {
    const deps = makeDependencies();
    const plan = makePlan();
    const result = await generateGarmentImagesForPlan(plan, { dependencies: deps });

    expect(result.products).toHaveLength(3);
    expect(
      (result.products as ProductWithGeneratedImage[]).every(
        (p) => p.generatedImageUrl === "https://r2.example.com/garment.png"
      )
    ).toBe(true);
  });

  it("throws when any garment fails to generate", async () => {
    const deps = makeDependencies({
      imageProvider: {
        generate: vi.fn(async () => ({
          url: null,
          base64: null,
          error: "provider down",
        })),
      },
    });

    await expect(generateGarmentImagesForPlan(makePlan(), { dependencies: deps })).rejects.toThrow(
      "GARMENT_GENERATION_FAILED"
    );
  });
});
