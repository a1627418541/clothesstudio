import { openaiStylePreviewProvider } from "@/lib/ai/openai-style-preview-provider";
import type { StylePreviewImageProvider } from "@/lib/ai/style-preview-image-provider";
import { storeImageFromUrlOrBase64 } from "@/lib/r2-image-store";
import type { OutfitProductPlan } from "@/lib/marketplace/outfit-product-matcher";
import type { ProductSnapshot, ProductCategoryValue } from "@/lib/marketplace/types";

export interface GenerateGarmentImageInput {
  category: ProductCategoryValue;
  title: string;
  color: string;
  keywords: string[];
  styleDirection?: string | null;
}

export interface GarmentImageGeneratorDependencies {
  imageProvider: StylePreviewImageProvider;
  storeImage: typeof storeImageFromUrlOrBase64;
}

function garmentPrompt(input: GenerateGarmentImageInput): string {
  const base =
    "Professional e-commerce product photography of a single fashion garment on a clean pure white background. " +
    "No model, no mannequin, no text, no watermark. Soft even studio lighting, high detail, photorealistic. ";

  const categoryDescription: Record<ProductCategoryValue, string> = {
    TOP: "A neatly laid out upper-body top garment shown from the front, fully visible. ",
    BOTTOM: "A pair of pants or trousers laid flat, shown from the front, full length visible. ",
    OUTERWEAR: "A jacket or coat laid flat, shown from the front, fully visible. ",
    HAT: "A hat placed on a white surface, viewed from a slight angle, fully visible. ",
  };

  const stylePhrase = input.styleDirection ? `in a ${input.styleDirection.trim()} aesthetic. ` : ". ";
  const keywordPhrase = input.keywords.length > 0 ? `Key details: ${input.keywords.join(", ")}. ` : "";

  return (
    base +
    categoryDescription[input.category] +
    `Color: ${input.color}. ` +
    `Style: ${input.title}${stylePhrase}` +
    keywordPhrase
  );
}

function r2KeyForGarment(input: GenerateGarmentImageInput, suffix: string): string {
  const timestamp = Date.now();
  const safeTitle = input.title
    .toLowerCase()
    .replace(/[^a-z0-9一-龥]+/g, "-")
    .slice(0, 40);
  return `try-on/garments/${input.category.toLowerCase()}/${safeTitle}-${suffix}-${timestamp}.png`;
}

export async function generateGarmentImage(
  input: GenerateGarmentImageInput,
  dependencies: GarmentImageGeneratorDependencies = {
    imageProvider: openaiStylePreviewProvider,
    storeImage: storeImageFromUrlOrBase64,
  }
): Promise<{ imageUrl: string } | { error: string }> {
  const prompt = garmentPrompt(input);
  const suffix = Math.random().toString(36).slice(2, 8);

  const generated = await dependencies.imageProvider.generate({ prompt, size: "1024x1024" });
  if (generated.error) {
    return { error: generated.error };
  }
  if (!generated.url && !generated.base64) {
    return { error: "Garment image generation returned no image" };
  }

  const storeResult = await dependencies.storeImage({
    url: generated.url ?? null,
    base64: generated.base64 ?? null,
    key: r2KeyForGarment(input, suffix),
  });

  if ("error" in storeResult) {
    return { error: storeResult.error };
  }

  return { imageUrl: storeResult.url };
}

export interface ProductWithGeneratedImage extends ProductSnapshot {
  generatedImageUrl: string;
}

export async function generateGarmentImagesForPlan(
  plan: OutfitProductPlan,
  options: {
    styleDirection?: string | null;
    dependencies?: GarmentImageGeneratorDependencies;
  } = {}
): Promise<OutfitProductPlan & { products: ProductWithGeneratedImage[] }> {
  const dependencies = options.dependencies ?? {
    imageProvider: openaiStylePreviewProvider,
    storeImage: storeImageFromUrlOrBase64,
  };

  const generatedProducts = await Promise.all(
    plan.products.map(async (product) => {
      const result = await generateGarmentImage(
        {
          category: product.category,
          title: product.title,
          color: product.color,
          keywords: [product.variantLabel, product.sellerName].filter(Boolean),
          styleDirection: options.styleDirection,
        },
        dependencies
      );

      if ("error" in result) {
        throw new Error(`GARMENT_GENERATION_FAILED:${product.category}:${result.error}`);
      }

      return { ...product, generatedImageUrl: result.imageUrl };
    })
  );

  return {
    ...plan,
    products: generatedProducts,
  };
}
