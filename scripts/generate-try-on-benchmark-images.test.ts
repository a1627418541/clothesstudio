import { describe, expect, it, vi } from "vitest";
import {
  BENCHMARK_CASE_PAIRS,
  BENCHMARK_IMAGE_DEFINITIONS,
  buildManifest,
  downloadImageBuffer,
  generateImageFromDefinition,
  isDirectExecution,
  type GeneratedImageAsset,
} from "./generate-try-on-benchmark-images";

describe("generate-try-on-benchmark-images helpers", () => {
  it("has exactly 10 person images, 10 garment images, and 10 case pairs", () => {
    const persons = BENCHMARK_IMAGE_DEFINITIONS.filter((d) => d.type === "person");
    const garments = BENCHMARK_IMAGE_DEFINITIONS.filter((d) => d.type === "garment");
    expect(persons).toHaveLength(10);
    expect(garments).toHaveLength(10);
    expect(BENCHMARK_CASE_PAIRS).toHaveLength(10);
  });

  it("pairs every case with one person and one garment asset that exist", () => {
    const ids = new Set(BENCHMARK_IMAGE_DEFINITIONS.map((d) => d.id));
    for (const pair of BENCHMARK_CASE_PAIRS) {
      expect(ids.has(pair.personImageId)).toBe(true);
      expect(ids.has(pair.garmentImageId)).toBe(true);
    }
  });

  it("builds a manifest from generated assets", () => {
    const personIds = BENCHMARK_IMAGE_DEFINITIONS.filter((d) => d.type === "person").map((d) => d.id);
    const garmentIds = BENCHMARK_IMAGE_DEFINITIONS.filter((d) => d.type === "garment").map((d) => d.id);
    const assets: GeneratedImageAsset[] = [
      ...personIds.map((id) => ({ id, type: "person" as const, category: null, url: `https://r2.example/${id}.png` })),
      ...garmentIds.map((id) => {
        const category = BENCHMARK_IMAGE_DEFINITIONS.find((d) => d.id === id)?.category ?? "TOP";
        return { id, type: "garment" as const, category, url: `https://r2.example/${id}.png` };
      }),
    ];
    const manifest = buildManifest(assets);
    expect(manifest.cases).toHaveLength(10);
    expect(manifest.cases).toContainEqual({
      caseId: "top-01",
      category: "TOP",
      personImageUrl: "https://r2.example/person-female-01.png",
      garmentImageUrl: "https://r2.example/garment-top-01.png",
    });
  });

  it("throws when a case is missing an asset", () => {
    const assets: GeneratedImageAsset[] = [
      { id: "person-female-01", type: "person", category: null, url: "https://r2.example/person-female-01.png" },
    ];
    expect(() => buildManifest(assets)).toThrow("Missing generated asset for case top-01");
  });

  it("downloads an image buffer and validates content type", async () => {
    const array = new Uint8Array([0x89, 0x50]);
    global.fetch = vi.fn().mockResolvedValue({
      ok: true,
      status: 200,
      statusText: "OK",
      headers: new Headers({ "content-type": "image/png" }),
      arrayBuffer: async () => array.buffer,
    } as Response);

    const buffer = await downloadImageBuffer("https://example.com/img.png");
    expect(Buffer.isBuffer(buffer)).toBe(true);
    expect(buffer.length).toBe(2);
  });

  it("throws on non-image content type", async () => {
    global.fetch = vi.fn().mockResolvedValue({
      ok: true,
      headers: new Headers({ "content-type": "text/html" }),
      arrayBuffer: async () => new ArrayBuffer(0),
    } as Response);

    await expect(downloadImageBuffer("https://example.com/img.png")).rejects.toThrow("Unexpected content type");
  });

  it("throws on failed download", async () => {
    global.fetch = vi.fn().mockResolvedValue({
      ok: false,
      status: 404,
      statusText: "Not Found",
      headers: new Headers(),
      arrayBuffer: async () => new ArrayBuffer(0),
    } as Response);

    await expect(downloadImageBuffer("https://example.com/img.png")).rejects.toThrow("Failed to download image");
  });

  it("generates, downloads, uploads, and returns an R2 asset", async () => {
    const array = new Uint8Array([0x89, 0x50]);
    global.fetch = vi.fn().mockResolvedValue({
      ok: true,
      status: 200,
      statusText: "OK",
      headers: new Headers({ "content-type": "image/png" }),
      arrayBuffer: async () => array.buffer,
    } as Response);

    const definition = BENCHMARK_IMAGE_DEFINITIONS[0];
    const generate = vi.fn().mockResolvedValue({ url: "https://openai.example/img.png" });
    const upload = vi.fn().mockResolvedValue({ url: "https://r2.example/generated.png" });

    const asset = await generateImageFromDefinition(definition, { generate, upload });

    expect(asset.id).toBe(definition.id);
    expect(asset.url).toBe("https://r2.example/generated.png");
    expect(generate).toHaveBeenCalledWith({ prompt: definition.prompt, size: definition.size });
    expect(upload).toHaveBeenCalledWith(expect.objectContaining({
      key: `try-on-benchmark/${definition.id}.png`,
      contentType: "image/png",
    }));
  });

  it("distinguishes direct execution from test imports", () => {
    expect(isDirectExecution("file:///repo/script.ts", "C:/repo/other.ts")).toBe(false);
    expect(isDirectExecution("file:///C:/repo/script.ts", "C:/repo/script.ts")).toBe(true);
  });
});
