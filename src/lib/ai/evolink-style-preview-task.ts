import { parseStylePreviewResponse } from "./style-preview-response";

type PollEvoLinkStylePreviewTaskOptions = {
  baseUrl: string;
  apiKey: string;
  taskId: string;
  fetchImpl?: typeof fetch;
  sleep?: (milliseconds: number) => Promise<void>;
  maxAttempts?: number;
  pollIntervalMs?: number;
};

type StylePreviewTaskResult =
  | { url: string | null; base64: string | null }
  | { url: null; error: string };

const defaultSleep = (milliseconds: number) =>
  new Promise<void>((resolve) => setTimeout(resolve, milliseconds));

export async function pollEvoLinkStylePreviewTask({
  baseUrl,
  apiKey,
  taskId,
  fetchImpl = fetch,
  sleep = defaultSleep,
  maxAttempts = 75,
  pollIntervalMs = 2_000,
}: PollEvoLinkStylePreviewTaskOptions): Promise<StylePreviewTaskResult> {
  const normalizedBaseUrl = baseUrl.replace(/\/$/, "");
  const taskUrl = `${normalizedBaseUrl}/tasks/${encodeURIComponent(taskId)}`;

  for (let attempt = 0; attempt < maxAttempts; attempt += 1) {
    try {
      const response = await fetchImpl(taskUrl, {
        method: "GET",
        headers: {
          Authorization: `Bearer ${apiKey}`,
          Accept: "application/json",
        },
      });

      if (!response.ok) {
        return {
          url: null,
          error: `EvoLink task query failed: ${response.status}`,
        };
      }

      const parsed = parseStylePreviewResponse(await response.json());
      if ("error" in parsed) {
        return { url: null, error: parsed.error };
      }
      if ("url" in parsed) {
        return parsed;
      }

      const status = parsed.taskStatus.toLowerCase();
      if (status === "failed") {
        return { url: null, error: "EvoLink image task failed" };
      }
      if (status === "cancelled" || status === "canceled") {
        return { url: null, error: "EvoLink image task cancelled" };
      }
      if (status === "completed" || status === "succeeded") {
        return {
          url: null,
          error: "EvoLink image task completed without image data",
        };
      }
      if (status !== "pending" && status !== "processing" && status !== "queued") {
        return { url: null, error: "EvoLink image task returned unsupported status" };
      }

      if (attempt < maxAttempts - 1) {
        await sleep(pollIntervalMs);
      }
    } catch {
      return { url: null, error: "EvoLink task query failed" };
    }
  }

  return { url: null, error: "EvoLink image task timed out" };
}
