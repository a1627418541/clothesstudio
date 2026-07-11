import { describe, expect, it, vi } from "vitest";
import { generateStylePreviewImage } from "./style-preview-service";

const baseInput = {
  diagnosis: {
    id: "diagnosis-1",
    gender: "FEMALE",
    age: 30,
    heightCm: 168,
    weightKg: 58,
    bodyType: "rectangle" as const,
    faceShape: "oval" as const,
  },
  recommendation: {
    id: "recommendation-1",
    rank: 1,
    title: "Soft Minimal",
    description: "Clean lines",
    summary: "A calm style",
    clothingAdvice: "Neutral tailoring",
    hairstyleAdvice: "Soft waves",
    shoesAdvice: "Minimal flats",
    colorPalette: ["ivory", "taupe", "charcoal"],
  },
};

const archetype = {
  name: "Minimal Chic",
  personalityLabel: "Effortless Sophisticate",
  imagePromptTemplate:
    "A full-body fashion editorial photo of a {gender} model embodying the {personalityLabel} style. Outfit: {clothingDNA}. Shoes: {shoesDNA}. Colors: {colorDNA}. Hairstyle: {hairstyleDNA}. Avoid: {avoidDNA}.",
  clothingDNA: "Structured blazers, silk blouses, wide-leg trousers.",
  hairstyleDNA: "Sleek low bun.",
  shoesDNA: "Pointed flats, minimalist ankle boots.",
  colorDNA: ["black", "white", "camel"],
  avoidDNA: "busy prints, excessive jewelry",
};

describe("generateStylePreviewImage persistence", () => {
  it("persists a mock fallback instead of returning its external URL", async () => {
    const storeImage = vi.fn().mockResolvedValue({
      url: "https://r2.example.com/persisted.png",
    });

    const result = await generateStylePreviewImage(baseInput, {
      getProvider: () => ({
        name: "openai",
        provider: {
          generate: vi.fn().mockResolvedValue({
            url: null,
            error: "provider failed",
          }),
        },
      }),
      mockProvider: {
        generate: vi.fn().mockResolvedValue({
          url: "https://images.example.com/fallback.jpg",
        }),
      },
      storeImage,
      shouldFallbackToMock: () => true,
    });

    expect(storeImage).toHaveBeenCalledWith(
      expect.objectContaining({
        url: "https://images.example.com/fallback.jpg",
      })
    );
    expect(result).toEqual(
      expect.objectContaining({
        status: "COMPLETED",
        url: "https://r2.example.com/persisted.png",
      })
    );
  });

  it("fails when durable R2 persistence fails", async () => {
    const result = await generateStylePreviewImage(baseInput, {
      getProvider: () => ({
        name: "openai",
        provider: {
          generate: vi.fn().mockResolvedValue({
            url: "https://provider.example.com/temporary.png",
          }),
        },
      }),
      mockProvider: {
        generate: vi.fn(),
      },
      storeImage: vi.fn().mockResolvedValue({ error: "R2 unavailable" }),
      shouldFallbackToMock: () => false,
    });

    expect(result).toEqual(
      expect.objectContaining({
        status: "FAILED",
        error: "R2 unavailable",
      })
    );
    expect(result.url).toBeUndefined();
  });
});

describe("generateStylePreviewImage archetype prompt", () => {
  it("uses archetype prompt when recommendation has archetype", async () => {
    const storeImage = vi.fn().mockResolvedValue({
      url: "https://r2.example.com/archetype.png",
    });
    const providerGenerate = vi.fn().mockResolvedValue({
      url: "https://provider.example.com/archetype.png",
    });

    const input = {
      ...baseInput,
      recommendation: {
        ...baseInput.recommendation,
        archetype,
      },
    };

    const result = await generateStylePreviewImage(input, {
      getProvider: () => ({ name: "openai", provider: { generate: providerGenerate } }),
      mockProvider: { generate: vi.fn() },
      storeImage,
      shouldFallbackToMock: () => false,
    });

    expect(providerGenerate).toHaveBeenCalledWith(
      expect.objectContaining({
        prompt: expect.stringContaining("Effortless Sophisticate"),
      })
    );
    expect(providerGenerate).toHaveBeenCalledWith(
      expect.objectContaining({
        prompt: expect.stringContaining("Structured blazers"),
      })
    );
    expect(result.status).toBe("COMPLETED");
  });

  it("falls back to generic prompt when recommendation has no archetype", async () => {
    const providerGenerate = vi.fn().mockResolvedValue({
      url: "https://provider.example.com/generic.png",
    });
    const storeImage = vi.fn().mockResolvedValue({
      url: "https://r2.example.com/generic.png",
    });

    const result = await generateStylePreviewImage(baseInput, {
      getProvider: () => ({ name: "openai", provider: { generate: providerGenerate } }),
      mockProvider: { generate: vi.fn() },
      storeImage,
      shouldFallbackToMock: () => false,
    });

    expect(providerGenerate).toHaveBeenCalledWith(
      expect.objectContaining({
        prompt: expect.stringContaining("Soft Minimal"),
      })
    );
    expect(result.status).toBe("COMPLETED");
  });
});
