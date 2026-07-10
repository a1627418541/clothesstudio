import { StyleRecommendation } from "@prisma/client";
import { buildStylePreviewPrompt } from "./style-preview-prompt";
import { openaiStylePreviewProvider } from "./openai-style-preview-provider";
import { mockStylePreviewProvider } from "./mock-style-preview-provider";
import { storeImageFromUrlOrBase64 } from "@/lib/r2-image-store";

export interface GenerateStylePreviewInput {
  diagnosis: {
    id: string;
    gender: string;
    age: number;
    heightCm: number;
    weightKg: number;
  };
  recommendation: Pick<
    StyleRecommendation,
    | "id"
    | "rank"
    | "title"
    | "description"
    | "summary"
    | "clothingAdvice"
    | "hairstyleAdvice"
    | "shoesAdvice"
    | "colorPalette"
  >;
}

export interface GenerateStylePreviewResult {
  status: "COMPLETED" | "FAILED";
  url?: string;
  prompt?: string;
  error?: string;
}

function getProvider() {
  const providerName = process.env.STYLE_PREVIEW_PROVIDER?.toLowerCase().trim() || "mock";

  if (providerName === "openai") {
    return { provider: openaiStylePreviewProvider, name: "openai" };
  }

  return { provider: mockStylePreviewProvider, name: "mock" };
}

function shouldFallbackToMock(): boolean {
  const env = process.env.STYLE_PREVIEW_FALLBACK_TO_MOCK?.toLowerCase().trim();
  if (env === "true") return true;
  if (env === "false") return false;

  const nodeEnv = process.env.NODE_ENV;
  return nodeEnv === "development" || nodeEnv === "test";
}

export async function generateStylePreviewImage(
  input: GenerateStylePreviewInput
): Promise<GenerateStylePreviewResult> {
  const { diagnosis, recommendation } = input;

  const prompt = buildStylePreviewPrompt({
    gender: diagnosis.gender,
    age: diagnosis.age,
    title: recommendation.title,
    description: recommendation.description,
    summary: recommendation.summary,
    clothingAdvice: recommendation.clothingAdvice,
    hairstyleAdvice: recommendation.hairstyleAdvice,
    shoesAdvice: recommendation.shoesAdvice,
    colorPalette: recommendation.colorPalette,
  });

  const { provider, name } = getProvider();
  const providerResult = await provider.generate({ prompt });

  if (providerResult.error || (!providerResult.url && !providerResult.base64)) {
    const providerError = providerResult.error || "Provider returned no image";

    if (name === "openai" && shouldFallbackToMock()) {
      const fallback = await mockStylePreviewProvider.generate({ prompt });
      if (fallback.url) {
        return {
          status: "COMPLETED",
          url: fallback.url,
          prompt,
        };
      }
      return {
        status: "FAILED",
        prompt,
        error: `OpenAI failed: ${providerError}; mock fallback also failed`,
      };
    }

    return {
      status: "FAILED",
      prompt,
      error: providerError,
    };
  }

  const r2Key = `style-previews/${diagnosis.id}/${recommendation.id}-${Date.now()}.png`;
  const storeResult = await storeImageFromUrlOrBase64({
    url: providerResult.url,
    base64: providerResult.base64,
    key: r2Key,
  });

  if ("error" in storeResult) {
    if (providerResult.url && shouldFallbackToMock()) {
      return {
        status: "COMPLETED",
        url: providerResult.url,
        prompt,
      };
    }

    return {
      status: "FAILED",
      prompt,
      error: storeResult.error,
    };
  }

  return {
    status: "COMPLETED",
    url: storeResult.url,
    prompt,
  };
}
