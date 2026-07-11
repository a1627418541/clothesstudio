import { afterEach, describe, expect, it, vi } from "vitest";
import { openaiStylePreviewProvider } from "./openai-style-preview-provider";

function jsonResponse(body: unknown): Response {
  return new Response(JSON.stringify(body), {
    status: 200,
    headers: { "Content-Type": "application/json" },
  });
}

describe("openaiStylePreviewProvider", () => {
  afterEach(() => {
    vi.unstubAllEnvs();
    vi.unstubAllGlobals();
  });

  it("polls an EvoLink async image task and returns the completed URL", async () => {
    vi.stubEnv("STYLE_PREVIEW_OPENAI_API_KEY", "test-key");
    vi.stubEnv("STYLE_PREVIEW_OPENAI_BASE_URL", "https://api.evolink.ai/v1/");
    vi.stubEnv("STYLE_PREVIEW_MODEL", "gpt-image-2");

    const fetchMock = vi.fn()
      .mockResolvedValueOnce(jsonResponse({
        id: "task-1",
        object: "image.generation.task",
        status: "pending",
        progress: 0,
      }))
      .mockResolvedValueOnce(jsonResponse({
        id: "task-1",
        object: "image.generation.task",
        status: "completed",
        progress: 100,
        results: ["https://provider.example.com/result.png"],
      }));
    vi.stubGlobal("fetch", fetchMock);

    const result = await openaiStylePreviewProvider.generate({
      prompt: "A clean casual outfit",
    });

    expect(result).toEqual({
      url: "https://provider.example.com/result.png",
      base64: null,
    });
    expect(fetchMock).toHaveBeenNthCalledWith(
      2,
      "https://api.evolink.ai/v1/tasks/task-1",
      expect.objectContaining({ method: "GET" })
    );
  });
});
