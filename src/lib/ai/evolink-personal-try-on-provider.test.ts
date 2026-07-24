import { describe, expect, it, vi, beforeEach, afterEach } from "vitest";
import {
  evolinkPersonalTryOnProvider,
  PERSONAL_TRY_ON_POLL_BUDGET_MS,
  PERSONAL_TRY_ON_POLL_INTERVAL_MS,
  PERSONAL_TRY_ON_POLL_MAX_ATTEMPTS,
} from "./evolink-personal-try-on-provider";

describe("evolinkPersonalTryOnProvider", () => {
  const originalEnv = process.env;

  beforeEach(() => {
    vi.stubEnv("STYLE_PREVIEW_OPENAI_API_KEY", "test-key");
    vi.stubEnv("STYLE_PREVIEW_OPENAI_BASE_URL", "https://api.evolink.ai/v1");
    vi.stubEnv("STYLE_PREVIEW_MODEL", "gpt-image-2");
  });

  afterEach(() => {
    process.env = { ...originalEnv };
    vi.unstubAllGlobals();
  });

  it("sends prompt and reference images in fixed order via image_urls", async () => {
    const fetchMock = vi.fn().mockResolvedValue({
      ok: true,
      json: async () => ({
        data: [{ url: "https://files.evolink.ai/result.png" }],
      }),
    });
    vi.stubGlobal("fetch", fetchMock);

    const result = await evolinkPersonalTryOnProvider.generate({
      prompt: "test prompt",
      fullBodyImage: "https://signed.example/body.jpg",
      frontFaceImage: "https://signed.example/face.jpg",
      size: "1024x1792",
    });

    expect(result.url).toBe("https://files.evolink.ai/result.png");
    expect(fetchMock).toHaveBeenCalledWith(
      "https://api.evolink.ai/v1/images/generations",
      expect.objectContaining({ method: "POST" })
    );
    const body = JSON.parse(fetchMock.mock.calls[0][1].body);
    expect(body).toEqual({
      model: "gpt-image-2",
      prompt: "test prompt",
      n: 1,
      size: "1024x1792",
      image_urls: ["https://signed.example/body.jpg", "https://signed.example/face.jpg"],
    });
    expect(body).not.toHaveProperty("image");
    expect(body.image_urls).toHaveLength(2);
    expect(
      body.image_urls.every(
        (value: unknown) => typeof value === "string" && value.length > 0
      )
    ).toBe(true);
  });

  it("never leaks input image URLs into error results", async () => {
    const fetchMock = vi.fn().mockResolvedValue({
      ok: false,
      status: 400,
      json: async () => ({ error: { message: "bad request" } }),
    });
    vi.stubGlobal("fetch", fetchMock);

    const result = await evolinkPersonalTryOnProvider.generate({
      prompt: "test prompt",
      fullBodyImage: "https://signed.example/body.jpg",
      frontFaceImage: "https://signed.example/face.jpg",
    });

    expect(result.url).toBeNull();
    expect(result.error).not.toContain("https://signed.example/body.jpg");
    expect(result.error).not.toContain("https://signed.example/face.jpg");
    expect(result.error).not.toContain("signed.example");
  });

  it("returns error when API key is missing", async () => {
    vi.stubEnv("STYLE_PREVIEW_OPENAI_API_KEY", "");
    const result = await evolinkPersonalTryOnProvider.generate({
      prompt: "test",
      fullBodyImage: "https://signed.example/body.jpg",
      frontFaceImage: "https://signed.example/face.jpg",
    });
    expect(result.error).toContain("STYLE_PREVIEW_OPENAI_API_KEY is not configured");
  });

  it("bounds async task polling by the configured env budget", async () => {
    vi.stubEnv("PERSONAL_TRY_ON_POLL_MAX_ATTEMPTS", "2");
    vi.stubEnv("PERSONAL_TRY_ON_POLL_INTERVAL_MS", "1");

    const taskResponse = () => ({
      ok: true,
      json: async () => ({ object: "image.generation.task", id: "task-1", status: "processing" }),
    });
    const fetchMock = vi.fn()
      .mockResolvedValueOnce(taskResponse())
      .mockResolvedValue(taskResponse());
    vi.stubGlobal("fetch", fetchMock);

    const result = await evolinkPersonalTryOnProvider.generate({
      prompt: "test prompt",
      fullBodyImage: "https://signed.example/body.jpg",
      frontFaceImage: "https://signed.example/face.jpg",
    });

    expect(result.url).toBeNull();
    expect(result.error).toBe("EvoLink image task timed out");
    expect(fetchMock).toHaveBeenCalledTimes(3);
    expect(fetchMock).toHaveBeenLastCalledWith(
      "https://api.evolink.ai/v1/tasks/task-1",
      expect.objectContaining({ method: "GET" })
    );
  });

  it("exposes a default polling budget compatible with the route duration", () => {
    expect(PERSONAL_TRY_ON_POLL_BUDGET_MS).toBe(
      PERSONAL_TRY_ON_POLL_MAX_ATTEMPTS * PERSONAL_TRY_ON_POLL_INTERVAL_MS
    );
    expect(PERSONAL_TRY_ON_POLL_BUDGET_MS).toBe(150_000);
  });
});
