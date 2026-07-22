import { mkdir, writeFile } from "node:fs/promises";
import { resolve } from "node:path";
import { loadEnvConfig } from "@next/env";
import { openaiStylePreviewProvider } from "../src/lib/ai/openai-style-preview-provider";
import { uploadBufferToR2 } from "../src/lib/r2";
import type { BenchmarkGarmentCategory } from "../src/lib/try-on/benchmark/types";

export type ImageType = "person" | "garment";

export interface BenchmarkImageDefinition {
  id: string;
  type: ImageType;
  category: BenchmarkGarmentCategory | null;
  prompt: string;
  size: "1024x1024" | "1024x1792" | "1792x1024";
}

export interface GeneratedImageAsset {
  id: string;
  type: ImageType;
  category: BenchmarkGarmentCategory | null;
  url: string;
}

export const BENCHMARK_IMAGE_DEFINITIONS: BenchmarkImageDefinition[] = [
  // --- 5 female person images ---
  {
    id: "person-female-01",
    type: "person",
    category: null,
    size: "1024x1792",
    prompt:
      "Full body portrait of a young East Asian woman standing straight facing the camera, neutral expression, arms relaxed at sides, hands visible. She wears a plain white fitted t-shirt and dark leggings. Clean pure white studio background, soft even lighting, fashion e-commerce photography, sharp focus, photorealistic.",
  },
  {
    id: "person-female-02",
    type: "person",
    category: null,
    size: "1024x1792",
    prompt:
      "Full body portrait of a young East Asian woman standing with weight slightly on one leg, one hand in pocket, facing camera. She wears a plain light gray crewneck sweatshirt and black jeans. Clean white studio background, soft natural lighting, fashion e-commerce lookbook, photorealistic, sharp details.",
  },
  {
    id: "person-female-03",
    type: "person",
    category: null,
    size: "1024x1792",
    prompt:
      "Full body portrait of a young East Asian woman standing straight, front view, arms slightly away from body. She wears a plain beige tank top and light blue skinny jeans. Pure white background, studio lighting, clean fashion photography, photorealistic, no accessories.",
  },
  {
    id: "person-female-04",
    type: "person",
    category: null,
    size: "1024x1792",
    prompt:
      "Full body portrait of a young East Asian woman standing at a slight 3/4 angle toward camera, relaxed posture, arms naturally hanging. She wears a plain black short-sleeve t-shirt and white wide-leg trousers. White studio backdrop, soft even lighting, e-commerce fashion photography, photorealistic.",
  },
  {
    id: "person-female-05",
    type: "person",
    category: null,
    size: "1024x1792",
    prompt:
      "Full body portrait of a young East Asian woman standing straight facing camera, arms relaxed at sides. She wears a plain navy blue fitted long-sleeve top and black leggings. Clean white studio background, natural soft lighting, fashion catalog style, photorealistic, no jewelry.",
  },

  // --- 5 male person images ---
  {
    id: "person-male-01",
    type: "person",
    category: null,
    size: "1024x1792",
    prompt:
      "Full body portrait of a young East Asian man standing straight facing the camera, neutral expression, arms relaxed at sides. He wears a plain white crew neck t-shirt and dark blue jeans. Clean pure white studio background, soft even lighting, fashion e-commerce photography, photorealistic, sharp focus.",
  },
  {
    id: "person-male-02",
    type: "person",
    category: null,
    size: "1024x1792",
    prompt:
      "Full body portrait of a young East Asian man standing with one hand in his pocket, facing camera. He wears a plain light gray henley shirt and black chinos. White studio background, natural soft lighting, fashion lookbook photography, photorealistic, clean minimal style.",
  },
  {
    id: "person-male-03",
    type: "person",
    category: null,
    size: "1024x1792",
    prompt:
      "Full body portrait of a young East Asian man standing straight, front view, arms slightly away from torso. He wears a plain black t-shirt and light blue straight-leg jeans. Pure white background, studio lighting, e-commerce fashion photography, photorealistic, no accessories.",
  },
  {
    id: "person-male-04",
    type: "person",
    category: null,
    size: "1024x1792",
    prompt:
      "Full body portrait of a young East Asian man standing at a slight angle toward camera, relaxed posture. He wears a plain olive green long-sleeve shirt and beige cargo pants. White studio backdrop, soft even lighting, fashion catalog photography, photorealistic, no jewelry.",
  },
  {
    id: "person-male-05",
    type: "person",
    category: null,
    size: "1024x1792",
    prompt:
      "Full body portrait of a young East Asian man standing straight facing camera, arms relaxed at sides. He wears a plain white longline tunic top and black slim trousers. Clean white studio background, soft natural lighting, fashion e-commerce style, photorealistic, minimal.",
  },

  // --- 4 tops ---
  {
    id: "garment-top-01",
    type: "garment",
    category: "TOP",
    size: "1024x1024",
    prompt:
      "Product photography of a plain white crew neck short-sleeve t-shirt, neatly folded flat lay, front view, centered on pure white background, soft shadows, fashion e-commerce, clean minimal, high detail, photorealistic.",
  },
  {
    id: "garment-top-02",
    type: "garment",
    category: "TOP",
    size: "1024x1024",
    prompt:
      "Product photography of a light blue denim jacket, laid flat from the front, sleeves neatly arranged, pure white background, soft even lighting, fashion e-commerce, clean minimal, photorealistic, high detail.",
  },
  {
    id: "garment-top-03",
    type: "garment",
    category: "TOP",
    size: "1024x1024",
    prompt:
      "Product photography of a black turtleneck sweater, folded flat lay showing front neckline, pure white background, soft shadows, fashion e-commerce style, clean minimal, photorealistic, high detail.",
  },
  {
    id: "garment-top-04",
    type: "garment",
    category: "TOP",
    size: "1024x1024",
    prompt:
      "Product photography of a blush pink button-up blouse, flat lay front view, neatly arranged, pure white background, soft natural lighting, fashion e-commerce, clean minimal, photorealistic, high detail.",
  },

  // --- 4 bottoms ---
  {
    id: "garment-bottom-01",
    type: "garment",
    category: "BOTTOM",
    size: "1024x1792",
    prompt:
      "Product photography of blue skinny jeans, flat lay front view, legs straight and parallel, pure white background, soft shadows, fashion e-commerce, clean minimal, photorealistic, high detail.",
  },
  {
    id: "garment-bottom-02",
    type: "garment",
    category: "BOTTOM",
    size: "1024x1792",
    prompt:
      "Product photography of black tailored trousers, flat lay front view, neatly pressed, pure white background, soft even lighting, fashion e-commerce style, clean minimal, photorealistic, high detail.",
  },
  {
    id: "garment-bottom-03",
    type: "garment",
    category: "BOTTOM",
    size: "1024x1792",
    prompt:
      "Product photography of beige cargo pants, flat lay front view, pockets visible, pure white background, soft shadows, fashion e-commerce, clean minimal, photorealistic, high detail.",
  },
  {
    id: "garment-bottom-04",
    type: "garment",
    category: "BOTTOM",
    size: "1024x1792",
    prompt:
      "Product photography of a plaid midi skirt, flat lay front view, pleats visible, pure white background, soft natural lighting, fashion e-commerce, clean minimal, photorealistic, high detail.",
  },

  // --- 2 dresses ---
  {
    id: "garment-dress-01",
    type: "garment",
    category: "DRESS",
    size: "1024x1792",
    prompt:
      "Product photography of a red floral midi dress, flat lay front view, waist defined, skirt spread naturally, pure white background, soft shadows, fashion e-commerce, clean minimal, photorealistic, high detail.",
  },
  {
    id: "garment-dress-02",
    type: "garment",
    category: "DRESS",
    size: "1024x1792",
    prompt:
      "Product photography of a long black evening gown, flat lay front view, elegant silhouette, pure white background, soft even lighting, fashion e-commerce, clean minimal, photorealistic, high detail.",
  },
];

export interface BenchmarkCasePair {
  caseId: string;
  category: BenchmarkGarmentCategory;
  personImageId: string;
  garmentImageId: string;
}

export const BENCHMARK_CASE_PAIRS: BenchmarkCasePair[] = [
  { caseId: "top-01", category: "TOP", personImageId: "person-female-01", garmentImageId: "garment-top-01" },
  { caseId: "top-02", category: "TOP", personImageId: "person-female-02", garmentImageId: "garment-top-02" },
  { caseId: "top-03", category: "TOP", personImageId: "person-male-01", garmentImageId: "garment-top-03" },
  { caseId: "top-04", category: "TOP", personImageId: "person-male-02", garmentImageId: "garment-top-04" },
  { caseId: "bottom-01", category: "BOTTOM", personImageId: "person-female-03", garmentImageId: "garment-bottom-01" },
  { caseId: "bottom-02", category: "BOTTOM", personImageId: "person-female-04", garmentImageId: "garment-bottom-02" },
  { caseId: "bottom-03", category: "BOTTOM", personImageId: "person-male-03", garmentImageId: "garment-bottom-03" },
  { caseId: "bottom-04", category: "BOTTOM", personImageId: "person-male-04", garmentImageId: "garment-bottom-04" },
  { caseId: "dress-01", category: "DRESS", personImageId: "person-female-05", garmentImageId: "garment-dress-01" },
  { caseId: "dress-02", category: "DRESS", personImageId: "person-male-05", garmentImageId: "garment-dress-02" },
];

export function buildManifest(
  assets: GeneratedImageAsset[]
): { cases: { caseId: string; personImageUrl: string; garmentImageUrl: string; category: BenchmarkGarmentCategory }[] } {
  const urlById = new Map(assets.map((asset) => [asset.id, asset.url]));
  const cases = BENCHMARK_CASE_PAIRS.map((pair) => {
    const personUrl = urlById.get(pair.personImageId);
    const garmentUrl = urlById.get(pair.garmentImageId);
    if (!personUrl || !garmentUrl) {
      throw new Error(`Missing generated asset for case ${pair.caseId}`);
    }
    return {
      caseId: pair.caseId,
      personImageUrl: personUrl,
      garmentImageUrl: garmentUrl,
      category: pair.category,
    };
  });
  return { cases };
}

export async function downloadImageBuffer(url: string): Promise<Buffer> {
  const response = await fetch(url, { redirect: "follow" });
  if (!response.ok) {
    throw new Error(`Failed to download image: ${response.status} ${response.statusText}`);
  }
  const contentType = response.headers.get("content-type") ?? "";
  if (!contentType.startsWith("image/")) {
    throw new Error(`Unexpected content type: ${contentType}`);
  }
  return Buffer.from(await response.arrayBuffer());
}

export type GenerateImage = (input: { prompt: string; size?: "1024x1024" | "1024x1792" | "1792x1024" }) => Promise<{ url: string | null; base64?: string | null; error?: string | null }>;

export type UploadImage = (input: { key: string; body: Buffer; contentType: string }) => Promise<{ url: string }>;

export async function generateImageFromDefinition(
  definition: BenchmarkImageDefinition,
  dependencies: {
    generate?: GenerateImage;
    upload?: UploadImage;
  } = {}
): Promise<GeneratedImageAsset> {
  const generate = dependencies.generate ?? openaiStylePreviewProvider.generate.bind(openaiStylePreviewProvider);
  const upload = dependencies.upload ?? uploadBufferToR2;

  process.stdout.write(`[generate] ${definition.id} ... `);
  const result = await generate({ prompt: definition.prompt, size: definition.size });
  if (result.error || !result.url) {
    throw new Error(result.error ?? "Image generation returned no URL");
  }
  process.stdout.write("done\n");

  process.stdout.write(`[download] ${definition.id} ... `);
  const buffer = await downloadImageBuffer(result.url);
  process.stdout.write("done\n");

  process.stdout.write(`[upload] ${definition.id} ... `);
  const r2Result = await upload({
    key: `try-on-benchmark/${definition.id}.png`,
    body: buffer,
    contentType: "image/png",
  });
  process.stdout.write("done\n");

  return {
    id: definition.id,
    type: definition.type,
    category: definition.category,
    url: r2Result.url,
  };
}

export async function main(): Promise<void> {
  loadEnvConfig(process.cwd());

  const outputDirectory = resolve("artifacts", "try-on-benchmark-manifest");
  await mkdir(outputDirectory, { recursive: true });

  const assets: GeneratedImageAsset[] = [];
  for (const definition of BENCHMARK_IMAGE_DEFINITIONS) {
    try {
      const asset = await generateImageFromDefinition(definition);
      assets.push(asset);
    } catch (error) {
      const message = error instanceof Error ? error.message : String(error);
      console.error(`\nFailed at ${definition.id}: ${message}`);
      process.exitCode = 1;
      return;
    }
  }

  const manifest = buildManifest(assets);
  const manifestPath = resolve(outputDirectory, "manifest.json");
  await writeFile(manifestPath, `${JSON.stringify(manifest, null, 2)}\n`, "utf8");

  console.log(JSON.stringify({ manifestPath, generatedCount: assets.length, caseCount: manifest.cases.length }));
}

export function isDirectExecution(
  moduleUrl = import.meta.url,
  executablePath = process.argv[1]
): boolean {
  return Boolean(executablePath) && moduleUrl === new URL(`file://${resolve(executablePath)}`).href;
}

if (isDirectExecution()) {
  void main().catch((error: unknown) => {
    console.error(error instanceof Error ? error.message : "Benchmark image generation failed");
    process.exitCode = 1;
  });
}
