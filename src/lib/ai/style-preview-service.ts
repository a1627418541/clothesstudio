import { StyleRecommendation, StyleArchetype } from "@prisma/client";
import { buildStylePreviewPrompt, buildArchetypeStylePreviewPrompt } from "./style-preview-prompt";
import { openaiStylePreviewProvider } from "./openai-style-preview-provider";
import { mockStylePreviewProvider } from "./mock-style-preview-provider";
import { storeImageFromUrlOrBase64 } from "@/lib/r2-image-store";
import { StylePreviewImageProvider } from "./style-preview-image-provider";

export interface GenerateStylePreviewInput {
  diagnosis: {
    id: string;
    gender: string;
    age: number;
    heightCm: number;
    weightKg: number;
    bodyType?: string | null;
    faceShape?: string | null;
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
  > & {
    archetype?: Pick<
      StyleArchetype,
      | "name"
      | "personalityLabel"
      | "imagePromptTemplate"
      | "clothingDNA"
      | "hairstyleDNA"
      | "shoesDNA"
      | "colorDNA"
      | "avoidDNA"
    > | null;
  };
}

export interface GenerateStylePreviewResult {
  status: "COMPLETED" | "FAILED";
  url?: string;
  prompt?: string;
  error?: string;
}

function getProvider(): { provider: StylePreviewImageProvider; name: string } {
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

interface StylePreviewDependencies {
  getProvider: () => { provider: StylePreviewImageProvider; name: string };
  mockProvider: StylePreviewImageProvider;
  storeImage: typeof storeImageFromUrlOrBase64;
  shouldFallbackToMock: () => boolean;
}

const defaultDependencies: StylePreviewDependencies = {
  getProvider,
  mockProvider: mockStylePreviewProvider,
  storeImage: storeImageFromUrlOrBase64,
  shouldFallbackToMock,
};

export async function generateStylePreviewImage(
  input: GenerateStylePreviewInput,
  dependencies: StylePreviewDependencies = defaultDependencies
): Promise<GenerateStylePreviewResult> {
  const { diagnosis, recommendation } = input;

  const prompt = recommendation.archetype
    ? buildArchetypeStylePreviewPrompt({
        gender: diagnosis.gender,
        age: diagnosis.age,
        bodyType: diagnosis.bodyType ?? null,
        faceShape: diagnosis.faceShape ?? null,
        archetype: recommendation.archetype,
      })
    : buildStylePreviewPrompt({
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

  const { provider, name } = dependencies.getProvider();
  let providerResult = await provider.generate({ prompt });

  if (providerResult.error || (!providerResult.url && !providerResult.base64)) {
    const providerError = providerResult.error || "Provider returned no image";

    if (name === "openai" && dependencies.shouldFallbackToMock()) {
      providerResult = await dependencies.mockProvider.generate({ prompt });
      if (
        providerResult.error ||
        (!providerResult.url && !providerResult.base64)
      ) {
        return {
          status: "FAILED",
          prompt,
          error:
            `OpenAI style preview failed: ${providerError}; ` +
            `mock fallback also failed: ${providerResult.error || "no image returned"}`,
        };
      }
    } else {
      return {
        status: "FAILED",
        prompt,
        error: providerError,
      };
    }
  }

  const r2Key = `style-previews/${diagnosis.id}/${recommendation.id}-${Date.now()}.png`;
  const storeResult = await dependencies.storeImage({
    url: providerResult.url,
    base64: providerResult.base64,
    key: r2Key,
  });

  if ("error" in storeResult) {
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
