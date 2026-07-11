import { describe, expect, it } from "vitest";
import { parseStylePreviewResponse } from "./style-preview-response";

describe("parseStylePreviewResponse", () => {
  it("parses the documented OpenAI base64 response", () => {
    expect(
      parseStylePreviewResponse({
        data: [{ b64_json: "base64-image" }],
      })
    ).toEqual({ url: null, base64: "base64-image" });
  });

  it("parses documented URL and compatible aliases", () => {
    expect(
      parseStylePreviewResponse({
        data: [{ url: "https://example.com/image.png" }],
      })
    ).toEqual({ url: "https://example.com/image.png", base64: null });

    expect(
      parseStylePreviewResponse({
        data: [{ base64: "compatible-base64" }],
      })
    ).toEqual({ url: null, base64: "compatible-base64" });

    expect(
      parseStylePreviewResponse({
        images: [{ b64_json: "images-base64" }],
      })
    ).toEqual({ url: null, base64: "images-base64" });
  });

  it("parses an EvoLink asynchronous task response", () => {
    expect(
      parseStylePreviewResponse({
        id: "task-unified-123",
        object: "image.generation.task",
        status: "pending",
        progress: 0,
        task_info: { estimated_time: 100 },
      })
    ).toEqual({
      taskId: "task-unified-123",
      taskStatus: "pending",
    });
  });

  it("parses a completed EvoLink task result URL", () => {
    expect(
      parseStylePreviewResponse({
        id: "task-unified-123",
        object: "image.generation.task",
        status: "completed",
        progress: 100,
        results: ["https://provider.example.com/generated.png"],
      })
    ).toEqual({
      url: "https://provider.example.com/generated.png",
      base64: null,
    });
  });

  it("returns shape-only diagnostics without response values", () => {
    const secretValue = "secret-provider-value";
    const result = parseStylePreviewResponse({
      request_id: secretValue,
      data: [{ revised_prompt: secretValue }],
    });

    expect(result).toEqual({
      error:
        "Image response contained no image data (top-level keys: data, request_id; item keys: revised_prompt)",
    });
    expect(JSON.stringify(result)).not.toContain(secretValue);
  });

  it("handles non-object responses safely", () => {
    expect(parseStylePreviewResponse(null)).toEqual({
      error: "Image response contained no image data (response type: null)",
    });
    expect(parseStylePreviewResponse("unexpected")).toEqual({
      error: "Image response contained no image data (response type: string)",
    });
  });
});
