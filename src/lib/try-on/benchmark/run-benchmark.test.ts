import { describe, expect, it, vi } from "vitest";
import type { BenchmarkCase, DomesticTryOnProvider } from "./types";
import {
  materializeBenchmarkResults,
  parseBenchmarkManifest,
  runDomesticTryOnBenchmark,
} from "./run-benchmark";

const sample: BenchmarkCase = {
  caseId: "top-01",
  personImageUrl: "https://input.example/person.jpg",
  garmentImageUrl: "https://input.example/top.jpg",
  category: "TOP",
};

describe("runDomesticTryOnBenchmark", () => {
  it("runs every case and provider strictly sequentially and sanitizes failures", async () => {
    let active = 0;
    let maxActive = 0;
    const events: string[] = [];
    const provider = (name: "tencent" | "volcengine", fails = false): DomesticTryOnProvider => ({
      name,
      supports: () => true,
      async generate(input) {
        events.push(`start:${input.caseId}:${name}`);
        active += 1;
        maxActive = Math.max(maxActive, active);
        await Promise.resolve();
        active -= 1;
        events.push(`end:${input.caseId}:${name}`);
        if (fails) throw new Error("secret=never-write-this");
        return { imageUrl: `https://result.example/${name}`, requestId: `${name}-id` };
      },
    });
    let time = 100;

    const results = await runDomesticTryOnBenchmark({
      cases: [sample, { ...sample, caseId: "top-02" }],
      providers: [provider("tencent"), provider("volcengine", true)],
      now: () => time++,
    });

    expect(maxActive).toBe(1);
    expect(events).toEqual([
      "start:top-01:tencent", "end:top-01:tencent",
      "start:top-01:volcengine", "end:top-01:volcengine",
      "start:top-02:tencent", "end:top-02:tencent",
      "start:top-02:volcengine", "end:top-02:volcengine",
    ]);
    expect(results[0]).toEqual(expect.objectContaining({
      caseId: "top-01", provider: "tencent", status: "SUCCEEDED", requestId: "tencent-id",
    }));
    expect(results[1]).toEqual(expect.objectContaining({
      caseId: "top-01", provider: "volcengine", status: "FAILED", errorCode: "PROVIDER_FAILED",
    }));
    expect(JSON.stringify(results)).not.toContain("never-write-this");
  });

  it("records Volcengine dresses as unsupported without invoking generate", async () => {
    const tencentGenerate = vi.fn().mockResolvedValue({ imageUrl: "https://result.example/t", requestId: "t" });
    const volcengineGenerate = vi.fn();
    const cases: BenchmarkCase[] = [
      ...Array.from({ length: 4 }, (_, index) => ({ ...sample, caseId: `top-${index}`, category: "TOP" as const })),
      ...Array.from({ length: 4 }, (_, index) => ({ ...sample, caseId: `bottom-${index}`, category: "BOTTOM" as const })),
      ...Array.from({ length: 2 }, (_, index) => ({ ...sample, caseId: `dress-${index}`, category: "DRESS" as const })),
    ];

    const results = await runDomesticTryOnBenchmark({
      cases,
      providers: [
        { name: "tencent", supports: () => true, generate: tencentGenerate },
        { name: "volcengine", supports: (category) => category !== "DRESS", generate: volcengineGenerate },
      ],
    });

    expect(tencentGenerate).toHaveBeenCalledTimes(10);
    expect(volcengineGenerate).toHaveBeenCalledTimes(8);
    expect(results).toHaveLength(20);
    expect(results.filter((result) => result.status === "UNSUPPORTED")).toEqual([
      expect.objectContaining({ caseId: "dress-0", provider: "volcengine", errorCode: "UNSUPPORTED_CATEGORY" }),
      expect.objectContaining({ caseId: "dress-1", provider: "volcengine", errorCode: "UNSUPPORTED_CATEGORY" }),
    ]);
  });

  it("does not misclassify a result-consumer failure as a provider failure", async () => {
    const provider: DomesticTryOnProvider = {
      name: "tencent",
      supports: () => true,
      generate: vi.fn().mockResolvedValue({
        imageUrl: "https://temporary.example/tencent",
        requestId: "t-1",
      }),
    };
    const onResult = vi.fn().mockRejectedValue(new Error("LOCAL_WRITE_FAILED"));

    await expect(runDomesticTryOnBenchmark({
      cases: [sample],
      providers: [provider],
      onResult,
    })).rejects.toThrow("LOCAL_WRITE_FAILED");

    expect(provider.generate).toHaveBeenCalledTimes(1);
    expect(onResult).toHaveBeenCalledTimes(1);
    expect(onResult).toHaveBeenCalledWith(expect.objectContaining({ status: "SUCCEEDED" }));
  });
});

describe("parseBenchmarkManifest", () => {
  it("accepts a valid manifest and rejects unsafe IDs, duplicate IDs, non-http URLs, and unknown categories", () => {
    expect(parseBenchmarkManifest({ cases: [sample] })).toEqual({ cases: [sample] });
    for (const manifest of [
      { cases: [{ ...sample, caseId: "../escape" }] },
      { cases: [sample, sample] },
      { cases: [{ ...sample, personImageUrl: "file:///secret.jpg" }] },
      { cases: [{ ...sample, category: "HAT" }] },
    ]) {
      expect(() => parseBenchmarkManifest(manifest)).toThrow("Invalid benchmark manifest");
    }
  });
});

describe("materializeBenchmarkResults", () => {
  it("downloads each success before the next provider call starts", async () => {
    const events: string[] = [];
    const provider = (name: "tencent" | "volcengine"): DomesticTryOnProvider => ({
      name,
      supports: () => true,
      async generate() {
        events.push(`generate:${name}`);
        return { imageUrl: `https://temporary.example/${name}`, requestId: `${name}-1` };
      },
    });
    const persisted: unknown[] = [];

    await runDomesticTryOnBenchmark({
      cases: [sample],
      providers: [provider("tencent"), provider("volcengine")],
      async onResult(result) {
        persisted.push(...await materializeBenchmarkResults({
          outputDirectory: "C:/benchmark/run-1",
          results: [result],
          download: async (url) => {
            events.push(`download:${url.split("/").at(-1)}`);
          },
        }));
      },
    });

    expect(events).toEqual([
      "generate:tencent",
      "download:tencent",
      "generate:volcengine",
      "download:volcengine",
    ]);
    expect(JSON.stringify(persisted)).not.toContain("temporary.example");
  });

  it("downloads successful temporary URLs and persists local relative filenames only", async () => {
    const download = vi.fn().mockResolvedValue(undefined);
    const result = await materializeBenchmarkResults({
      outputDirectory: "C:/benchmark/run-1",
      results: [{
        caseId: "top-01", category: "TOP", provider: "tencent", status: "SUCCEEDED",
        durationMs: 5, imageUrl: "https://temporary.example/signed?secret=never", requestId: "tc-1",
      }],
      download,
    });

    expect(download).toHaveBeenCalledWith(
      "https://temporary.example/signed?secret=never",
      expect.stringMatching(/top-01-tencent\.jpg$/)
    );
    expect(result).toEqual([expect.objectContaining({
      status: "SUCCEEDED", imageFile: "top-01-tencent.jpg", requestId: "tc-1",
    })]);
    expect(JSON.stringify(result)).not.toContain("temporary.example");
  });

  it("turns download failures into sanitized records without retaining temporary URLs", async () => {
    const result = await materializeBenchmarkResults({
      outputDirectory: "C:/benchmark/run-1",
      results: [{
        caseId: "top-01", category: "TOP", provider: "tencent", status: "SUCCEEDED",
        durationMs: 5, imageUrl: "https://temporary.example/secret", requestId: "tc-1",
      }],
      download: vi.fn().mockRejectedValue(new Error("credential=never-write-this")),
    });

    expect(result).toEqual([{ caseId: "top-01", category: "TOP", provider: "tencent", status: "FAILED", durationMs: 5, errorCode: "RESULT_DOWNLOAD_FAILED" }]);
    expect(JSON.stringify(result)).not.toContain("never-write-this");
    expect(JSON.stringify(result)).not.toContain("temporary.example");
  });
});
