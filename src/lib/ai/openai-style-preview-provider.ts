import { StylePreviewImageProvider } from "./style-preview-image-provider";

function getBaseUrl(): string {
  const baseUrl = process.env.OPENAI_BASE_URL?.trim();
  if (!baseUrl) return "https://api.openai.com/v1";
  return baseUrl.replace(/\/$/, "");
}

export const openaiStylePreviewProvider: StylePreviewImageProvider = {
  generate: async ({ prompt, size = "1024x1024" }) => {
    const apiKey = process.env.OPENAI_API_KEY;
    if (!apiKey) {
      return { url: null, error: "OPENAI_API_KEY is not configured" };
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
        }),
      });

      if (!res.ok) {
        let detail = `OpenAI image generation failed: ${res.status}`;
        try {
          const errorBody = await res.json();
          const message = errorBody?.error?.message;
          if (message) {
            detail = `${detail} - ${message}`;
          }
        } catch {
          // ignore parse failure
        }
        return { url: null, error: detail };
      }

      const data = await res.json();
      const item = data?.data?.[0];
      const url: string | undefined = item?.url;
      const b64: string | undefined = item?.b64_json;

      if (!url && !b64) {
        return { url: null, error: "OpenAI returned no image data" };
      }

      return { url: url ?? null, base64: b64 ?? null };
    } catch (error) {
      const message = error instanceof Error ? error.message : "Unknown provider error";
      return { url: null, error: message };
    }
  },
};
