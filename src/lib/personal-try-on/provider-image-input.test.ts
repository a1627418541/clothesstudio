import { describe, expect, it, vi, beforeEach, afterEach } from "vitest";
import { buildProviderImageInput } from "./provider-image-input";

vi.mock("@/lib/r2", () => ({
  getR2Client: vi.fn(() => ({})),
}));

vi.mock("@aws-sdk/s3-request-presigner", () => ({
  getSignedUrl: vi.fn(async () => "https://signed.example/image.jpg?sig=abc"),
}));

describe("buildProviderImageInput", () => {
  const originalEnv = process.env;

  beforeEach(() => {
    vi.stubEnv("PERSONAL_TRY_ON_IMAGE_INPUT_MODE", "signed-url");
  });

  afterEach(() => {
    process.env = { ...originalEnv };
  });

  it("returns a signed URL in signed-url mode", async () => {
    const result = await buildProviderImageInput({
      bucket: "bucket",
      key: "uploads/face.jpg",
    });
    expect(result).toEqual({ kind: "signed-url", value: "https://signed.example/image.jpg?sig=abc" });
  });

  it("returns base64 in base64 mode", async () => {
    vi.stubEnv("PERSONAL_TRY_ON_IMAGE_INPUT_MODE", "base64");
    const fetchMock = vi.fn().mockResolvedValue({
      ok: true,
      arrayBuffer: async () => new TextEncoder().encode("fake-image").buffer,
    });
    vi.stubGlobal("fetch", fetchMock);

    const result = await buildProviderImageInput({
      bucket: "bucket",
      key: "uploads/face.jpg",
    });
    expect(result.kind).toBe("base64");
    expect(result.value).toBe(Buffer.from("fake-image").toString("base64"));
    vi.unstubAllGlobals();
  });
});
