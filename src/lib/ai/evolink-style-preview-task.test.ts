import { describe, expect, it, vi } from "vitest";
import { pollEvoLinkStylePreviewTask } from "./evolink-style-preview-task";

function jsonResponse(body: unknown, status = 200): Response {
  return new Response(JSON.stringify(body), {
    status,
    headers: { "Content-Type": "application/json" },
  });
}

describe("pollEvoLinkStylePreviewTask", () => {
  it("polls until a completed task returns its image URL", async () => {
    const fetchImpl = vi
      .fn()
      .mockResolvedValueOnce(
        jsonResponse({
          id: "task-1",
          object: "image.generation.task",
          status: "processing",
          progress: 50,
        })
      )
      .mockResolvedValueOnce(
        jsonResponse({
          id: "task-1",
          object: "image.generation.task",
          status: "completed",
          progress: 100,
          results: ["https://provider.example.com/result.png"],
        })
      );
    const sleep = vi.fn().mockResolvedValue(undefined);

    const result = await pollEvoLinkStylePreviewTask({
      baseUrl: "https://api.evolink.ai/v1/",
      apiKey: "test-key",
      taskId: "task-1",
      fetchImpl,
      sleep,
      maxAttempts: 3,
      pollIntervalMs: 1,
    });

    expect(result).toEqual({
      url: "https://provider.example.com/result.png",
      base64: null,
    });
    expect(fetchImpl).toHaveBeenCalledTimes(2);
    expect(fetchImpl).toHaveBeenCalledWith(
      "https://api.evolink.ai/v1/tasks/task-1",
      expect.objectContaining({
        headers: expect.objectContaining({
          Authorization: "Bearer test-key",
        }),
      })
    );
    expect(sleep).toHaveBeenCalledTimes(1);
  });

  it("returns an error when EvoLink marks the task failed", async () => {
    const result = await pollEvoLinkStylePreviewTask({
      baseUrl: "https://api.evolink.ai/v1",
      apiKey: "test-key",
      taskId: "task-2",
      fetchImpl: vi.fn().mockResolvedValue(
        jsonResponse({
          id: "task-2",
          object: "image.generation.task",
          status: "failed",
          progress: 100,
        })
      ),
      sleep: vi.fn(),
      maxAttempts: 2,
      pollIntervalMs: 1,
    });

    expect(result).toEqual({
      url: null,
      error: "EvoLink image task failed",
    });
  });

  it("times out after the configured number of attempts", async () => {
    const fetchImpl = vi.fn().mockImplementation(async () =>
      jsonResponse({
        id: "task-3",
        object: "image.generation.task",
        status: "processing",
        progress: 25,
      })
    );

    const result = await pollEvoLinkStylePreviewTask({
      baseUrl: "https://api.evolink.ai/v1",
      apiKey: "test-key",
      taskId: "task-3",
      fetchImpl,
      sleep: vi.fn().mockResolvedValue(undefined),
      maxAttempts: 2,
      pollIntervalMs: 1,
    });

    expect(fetchImpl).toHaveBeenCalledTimes(2);
    expect(result).toEqual({
      url: null,
      error: "EvoLink image task timed out",
    });
  });
});
