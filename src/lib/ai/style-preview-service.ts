import { StyleRecommendation, StyleArchetype } from "@prisma/client";
import {
  buildArchetypeStylePreviewPrompt,
} from "./style-preview-prompt";
import { openaiStylePreviewProvider } from "./openai-style-preview-provider";
import { mockStylePreviewProvider } from "./mock-style-preview-provider";
import { storeImageFromUrlOrBase64 } from "@/lib/r2-image-store";
import { StylePreviewImageProvider } from "./style-preview-image-provider";
import { FaceSwapProvider } from "./face-swap-provider";
import { replicateFaceSwapProvider } from "./replicate-face-swap-provider";
import { mockFaceSwapProvider } from "./mock-face-swap-provider";

export interface GenerateStylePreviewInput {
  diagnosis: {
    id: string;
    gender: string;
    age: number;
    heightCm: number;
    weightKg: number;
    bodyType?: string | null;
    faceShape?: string | null;
    faceTryOnConsent?: boolean;
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
    | "items"
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
  faceImageUrl?: string;
}

export interface GenerateStylePreviewResult {
  status: "COMPLETED" | "FAILED";
  url?: string;
  tryOnUrl?: string;
  prompt: string;
  providerName: string;
  failureKind?: "PROVIDER" | "PERSISTENCE";
  error?: string;
}

export interface GenerateStylePreviewFromPromptInput {
  diagnosisId: string;
  recommendationId: string;
  prompt: string;
  faceImageUrl?: string;
  faceTryOnConsent?: boolean;
}

function getProvider(): { provider: StylePreviewImageProvider; name: string } {
  const providerName =
    process.env.STYLE_PREVIEW_PROVIDER?.toLowerCase().trim() || "mock";

  if (providerName === "openai") {
    return { provider: openaiStylePreviewProvider, name: "openai" };
  }

  return { provider: mockStylePreviewProvider, name: "mock" };
}

function getFaceSwapProvider(): {
  provider: FaceSwapProvider;
  name: string;
} {
  const providerName =
    process.env.FACE_SWAP_PROVIDER?.toLowerCase().trim() || "mock";

  if (providerName === "replicate") {
    return { provider: replicateFaceSwapProvider, name: "replicate" };
  }

  return { provider: mockFaceSwapProvider, name: "mock" };
}

function shouldFallbackToMock(): boolean {
  const env = process.env.STYLE_PREVIEW_FALLBACK_TO_MOCK?.toLowerCase().trim();
  if (env === "true") return true;
  if (env === "false") return false;

  const nodeEnv = process.env.NODE_ENV;
  return nodeEnv === "development" || nodeEnv === "test";
}

export interface StylePreviewDependencies {
  getProvider: () => { provider: StylePreviewImageProvider; name: string };
  getFaceSwapProvider: () => { provider: FaceSwapProvider; name: string };
  mockProvider: StylePreviewImageProvider;
  storeImage: typeof storeImageFromUrlOrBase64;
  shouldFallbackToMock: () => boolean;
}

const defaultDependencies: StylePreviewDependencies = {
  getProvider,
  getFaceSwapProvider,
  mockProvider: mockStylePreviewProvider,
  storeImage: storeImageFromUrlOrBase64,
  shouldFallbackToMock,
};

export async function generateStylePreviewImage(
  input: GenerateStylePreviewInput,
  dependencies: StylePreviewDependencies = defaultDependencies
): Promise<GenerateStylePreviewResult> {
  const { diagnosis, recommendation, faceImageUrl } = input;

  const prompt = recommendation.archetype
    ? buildArchetypeStylePreviewPrompt({
        gender: diagnosis.gender,
        age: diagnosis.age,
        bodyType: diagnosis.bodyType ?? null,
        faceShape: diagnosis.faceShape ?? null,
        archetype: recommendation.archetype,
      })
    : buildItemizedStylePreviewPrompt({
        gender: diagnosis.gender,
        age: diagnosis.age,
        title: recommendation.title,
        description: recommendation.description,
        summary: recommendation.summary,
        clothingAdvice: recommendation.clothingAdvice,
        hairstyleAdvice: recommendation.hairstyleAdvice,
        shoesAdvice: recommendation.shoesAdvice,
        colorPalette: recommendation.colorPalette,
        items: recommendation.items,
      });

  return generateStylePreviewImageFromPrompt(
    {
      diagnosisId: diagnosis.id,
      recommendationId: recommendation.id,
      prompt,
      faceImageUrl,
      faceTryOnConsent: diagnosis.faceTryOnConsent,
    },
    dependencies
  );
}

export async function generateStylePreviewImageFromPrompt(
  input: GenerateStylePreviewFromPromptInput,
  dependencies: StylePreviewDependencies = defaultDependencies
): Promise<GenerateStylePreviewResult> {
  const { prompt } = input;
  const { provider, name } = dependencies.getProvider();
  let activeProviderName = name;
  let providerResult = await provider.generate({ prompt });

  if (providerResult.error || (!providerResult.url && !providerResult.base64)) {
    const providerError = providerResult.error || "Provider returned no image";

    if (name === "openai" && dependencies.shouldFallbackToMock()) {
      activeProviderName = "mock";
      providerResult = await dependencies.mockProvider.generate({ prompt });
      if (
        providerResult.error ||
        (!providerResult.url && !providerResult.base64)
      ) {
        return {
          status: "FAILED",
          prompt,
          providerName: activeProviderName,
          failureKind: "PROVIDER",
          error:
            `OpenAI style preview failed: ${providerError}; ` +
            `mock fallback also failed: ${providerResult.error || "no image returned"}`,
        };
      }
    } else {
      return {
        status: "FAILED",
        prompt,
        providerName: activeProviderName,
        failureKind: "PROVIDER",
        error: providerError,
      };
    }
  }

  const r2Key = `style-previews/${input.diagnosisId}/${input.recommendationId}-${Date.now()}.png`;
  const storeResult = await dependencies.storeImage({
    url: providerResult.url,
    base64: providerResult.base64,
    key: r2Key,
  });

  if ("error" in storeResult) {
    return {
      status: "FAILED",
      prompt,
      providerName: activeProviderName,
      failureKind: "PERSISTENCE",
      error: storeResult.error,
    };
  }

  const previewUrl = storeResult.url;
  let tryOnUrl: string | undefined;

  if (input.faceTryOnConsent && input.faceImageUrl) {
    const faceSwap = await runFaceSwap(
      {
        faceImageUrl: input.faceImageUrl,
        sourceImageUrl: previewUrl,
      },
      dependencies.getFaceSwapProvider(),
      dependencies.storeImage
    );
    tryOnUrl = faceSwap?.url ?? previewUrl;
  }

  return {
    status: "COMPLETED",
    url: previewUrl,
    tryOnUrl,
    prompt,
    providerName: activeProviderName,
  };
}

async function runFaceSwap(
  input: { faceImageUrl: string; sourceImageUrl: string },
  provider: { provider: FaceSwapProvider; name: string },
  storeImage: typeof storeImageFromUrlOrBase64
): Promise<{ url: string } | null> {
  try {
    const result = await provider.provider.swap(input);
    if (!result.url && !result.base64) {
      return null;
    }
    const r2Key = `style-previews/face-swap/${Date.now()}.png`;
    const storeResult = await storeImage({
      url: result.url,
      base64: result.base64,
      key: r2Key,
    });
    if ("error" in storeResult) {
      return null;
    }
    return { url: storeResult.url };
  } catch {
    return null;
  }
}

export function buildItemizedStylePreviewPrompt(input: {
  gender: string;
  age: number;
  title: string;
  description?: string | null;
  summary?: string | null;
  clothingAdvice?: string | null;
  hairstyleAdvice?: string | null;
  shoesAdvice?: string | null;
  colorPalette: string[];
  items?: unknown;
}): string {
  const clothing = input.clothingAdvice?.trim() ?? "Modern, well-fitted clothing.";
  const hair = input.hairstyleAdvice?.trim() ?? "Clean, modern hairstyle.";
  const shoes = input.shoesAdvice?.trim() ?? "Clean, modern shoes.";
  const colors = input.colorPalette?.length
    ? input.colorPalette.join(", ")
    : "neutral, versatile tones";
  const itemList = buildItemDescription(input.items);

  return `
Create a clean fashion style preview image for a ${input.age}-year-old ${input.gender.toLowerCase()}.
Show a full-body model standing in a minimal studio background with soft, even lighting.
Style direction: ${input.title}.
${input.description ? `Description: ${input.description}` : ""}
${input.summary ? `Summary: ${input.summary}` : ""}
Outfit direction: ${clothing}
${itemList ? `Specific items to include: ${itemList}` : ""}
Hairstyle direction: ${hair}
Shoe direction: ${shoes}
Use the following color palette: ${colors}.
The image should look like a polished style recommendation card illustration for a fashion app.
Editorial, modern, premium, clean, aspirational.
No text inside the image.
Do not include the face of any identifiable real person; use an anonymous, idealized model face.
The model face will later be replaced with the user's own face, so keep the pose front-facing and evenly lit.
  `.trim();
}

function buildItemDescription(items: unknown): string {
  if (!Array.isArray(items) || items.length === 0) return "";
  return items
    .map((item) => {
      if (typeof item !== "object" || item === null) return "";
      const record = item as Record<string, unknown>;
      const name =
        typeof record.name === "string" ? record.name : "garment";
      const category =
        typeof record.category === "string" ? record.category : "";
      const colors = Array.isArray(record.colors)
        ? record.colors.join("/")
        : "";
      const parts = [name, category, colors].filter(Boolean);
      return parts.join(" ");
    })
    .filter(Boolean)
    .join("; ");
}

export { buildArchetypeStylePreviewPrompt } from "./style-preview-prompt";
