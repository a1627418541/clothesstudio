import { describe, expect, it, vi } from "vitest";
import { generateStylePreviewImage } from "./style-preview-service";

const input = {
  diagnosis: {
    id: "diagnosis-1",
    gender: "FEMALE",
    age: 30,
    heightCm: 168,
    weightKg: 58,
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

describe("generateStylePreviewImage persistence", () => {
  it("persists a mock fallback instead of returning its external URL", async () => {
    const storeImage = vi.fn().mockResolvedValue({
      url: "https://r2.example.com/persisted.png",
    });

    const result = await generateStylePreviewImage(input, {
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
    const result = await generateStylePreviewImage(input, {
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
