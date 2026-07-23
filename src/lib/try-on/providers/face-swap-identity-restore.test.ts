import { describe, expect, it, vi, beforeEach, afterEach } from "vitest";
import { createFaceSwapIdentityRestoreProvider } from "./face-swap-identity-restore";
import type { FaceSwapProvider } from "@/lib/ai/face-swap-provider";
import * as r2ImageStore from "@/lib/r2-image-store";

vi.mock("@/lib/r2-image-store", () => ({
  storeImageFromUrlOrBase64: vi.fn(),
}));

const mockFaceSwapProvider: FaceSwapProvider = {
  swap: vi.fn(),
};

const mockStoreImage = vi.mocked(r2ImageStore.storeImageFromUrlOrBase64);

describe("createFaceSwapIdentityRestoreProvider", () => {
  beforeEach(() => {
    vi.useFakeTimers({ shouldAdvanceTime: true });
    vi.setSystemTime(new Date("2026-07-23T00:00:00.000Z"));
  });

  afterEach(() => {
    vi.useRealTimers();
    vi.clearAllMocks();
  });

  it("swaps face and stores the result in R2", async () => {
    vi.mocked(mockFaceSwapProvider.swap).mockResolvedValue({
      url: "https://replicate.example/output.png",
      base64: null,
      error: null,
    });
    mockStoreImage.mockResolvedValue({ url: "https://r2.example/final.png" });

    const provider = createFaceSwapIdentityRestoreProvider(mockFaceSwapProvider);
    const result = await provider.restore({
      composedImageUrl: "https://example.com/composed.png",
      faceImageUrl: "https://example.com/face.png",
    });

    expect(mockFaceSwapProvider.swap).toHaveBeenCalledWith({
      faceImageUrl: "https://example.com/face.png",
      sourceImageUrl: "https://example.com/composed.png",
    });
    expect(mockStoreImage).toHaveBeenCalledWith({
      url: "https://replicate.example/output.png",
      base64: null,
      key: expect.stringMatching(/^try-on\/identity-restore\/\d+-[a-z0-9]+\.png$/),
    });
    expect(result.imageUrl).toBe("https://r2.example/final.png");
  });

  it("supports base64 output from face swap", async () => {
    vi.mocked(mockFaceSwapProvider.swap).mockResolvedValue({
      url: null,
      base64: "base64data",
      error: null,
    });
    mockStoreImage.mockResolvedValue({ url: "https://r2.example/final.png" });

    const provider = createFaceSwapIdentityRestoreProvider(mockFaceSwapProvider);
    const result = await provider.restore({
      composedImageUrl: "https://example.com/composed.png",
      faceImageUrl: "https://example.com/face.png",
    });

    expect(mockStoreImage).toHaveBeenCalledWith({
      url: null,
      base64: "base64data",
      key: expect.stringMatching(/^try-on\/identity-restore\//),
    });
    expect(result.imageUrl).toBe("https://r2.example/final.png");
  });

  it("throws when face swap returns an error", async () => {
    vi.mocked(mockFaceSwapProvider.swap).mockResolvedValue({
      url: null,
      base64: null,
      error: "rate limited",
    });

    const provider = createFaceSwapIdentityRestoreProvider(mockFaceSwapProvider);

    await expect(
      provider.restore({
        composedImageUrl: "https://example.com/composed.png",
        faceImageUrl: "https://example.com/face.png",
      })
    ).rejects.toThrow("IDENTITY_RESTORE_FAILED: rate limited");
  });

  it("throws when face swap returns no image", async () => {
    vi.mocked(mockFaceSwapProvider.swap).mockResolvedValue({
      url: null,
      base64: null,
      error: null,
    });

    const provider = createFaceSwapIdentityRestoreProvider(mockFaceSwapProvider);

    await expect(
      provider.restore({
        composedImageUrl: "https://example.com/composed.png",
        faceImageUrl: "https://example.com/face.png",
      })
    ).rejects.toThrow("IDENTITY_RESTORE_FAILED: no image returned");
  });

  it("throws when R2 storage fails", async () => {
    vi.mocked(mockFaceSwapProvider.swap).mockResolvedValue({
      url: "https://replicate.example/output.png",
      base64: null,
      error: null,
    });
    mockStoreImage.mockResolvedValue({ error: "upload failed" });

    const provider = createFaceSwapIdentityRestoreProvider(mockFaceSwapProvider);

    await expect(
      provider.restore({
        composedImageUrl: "https://example.com/composed.png",
        faceImageUrl: "https://example.com/face.png",
      })
    ).rejects.toThrow("IDENTITY_RESTORE_STORAGE_FAILED: upload failed");
  });
});
