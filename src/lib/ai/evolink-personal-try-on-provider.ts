import { PersonalTryOnImageProvider } from "./personal-try-on-image-provider";
import { pollEvoLinkStylePreviewTask } from "./evolink-style-preview-task";
import { parseStylePreviewResponse } from "./style-preview-response";

// Worst-case async polling budget, kept below the API route's maxDuration
// (enforced by the route test) so R2 storage and DB writes still fit.
export const PERSONAL_TRY_ON_POLL_MAX_ATTEMPTS = 75;
export const PERSONAL_TRY_ON_POLL_INTERVAL_MS = 2_000;
export const PERSONAL_TRY_ON_POLL_BUDGET_MS =
  PERSONAL_TRY_ON_POLL_MAX_ATTEMPTS * PERSONAL_TRY_ON_POLL_INTERVAL_MS;

function positiveIntFromEnv(value: string | undefined): number | null {
  if (!value) return null;
  const parsed = Number.parseInt(value, 10);
  return Number.isFinite(parsed) && parsed > 0 ? parsed : null;
}

function getBaseUrl(): string {
  const baseUrl = process.env.STYLE_PREVIEW_OPENAI_BASE_URL?.trim();
  if (!baseUrl) return "https://api.openai.com/v1";
  return baseUrl.replace(/\/$/, "");
}

export const evolinkPersonalTryOnProvider: PersonalTryOnImageProvider = {
  generate: async ({ prompt, fullBodyImage, frontFaceImage, size = "1024x1792" }) => {
    const apiKey = process.env.STYLE_PREVIEW_OPENAI_API_KEY;
    if (!apiKey) {
      return { url: null, error: "STYLE_PREVIEW_OPENAI_API_KEY is not configured" };
    }

    const model = process.env.STYLE_PREVIEW_MODEL?.trim() || "gpt-image-2";
    const baseUrl = getBaseUrl();

    try {
      const res = await fetch(`${baseUrl}/images/generations`, {
        method: "POST",
        headers: {
          Authorization: `Bearer ${apiKey}`,
          "Content-Type": "application/json",
        },
        body: JSON.stringify({
          model,
          prompt,
          n: 1,
          size,
          image_urls: [fullBodyImage, frontFaceImage],
        }),
      });

      if (!res.ok) {
        let detail = `EvoLink personal try-on failed: ${res.status}`;
        try {
          const errorBody = await res.json();
          const message = errorBody?.error?.message;
          if (message) detail = `${detail} - ${message}`;
        } catch {
          // ignore parse failure
        }
        return { url: null, error: detail };
      }

      const data: unknown = await res.json();
      const parsed = parseStylePreviewResponse(data);
      if ("error" in parsed) {
        return { url: null, error: parsed.error };
      }
      if ("taskId" in parsed) {
        const maxAttempts =
          positiveIntFromEnv(process.env.PERSONAL_TRY_ON_POLL_MAX_ATTEMPTS) ??
          PERSONAL_TRY_ON_POLL_MAX_ATTEMPTS;
        const pollIntervalMs =
          positiveIntFromEnv(process.env.PERSONAL_TRY_ON_POLL_INTERVAL_MS) ??
          PERSONAL_TRY_ON_POLL_INTERVAL_MS;
        return pollEvoLinkStylePreviewTask({
          baseUrl,
          apiKey,
          taskId: parsed.taskId,
          maxAttempts,
          pollIntervalMs,
        });
      }
      return parsed;
    } catch (error) {
      const message = error instanceof Error ? error.message : "Unknown provider error";
      return { url: null, error: message };
    }
  },
};
