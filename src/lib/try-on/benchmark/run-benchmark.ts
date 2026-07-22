import { join } from "node:path";
import { writeFile } from "node:fs/promises";
import { z } from "zod";
import type {
  BenchmarkCase,
  BenchmarkGarmentCategory,
  BenchmarkProviderName,
  DomesticTryOnProvider,
} from "./types";

export type BenchmarkRunResult = {
  caseId: string;
  category: BenchmarkGarmentCategory;
  provider: BenchmarkProviderName;
  durationMs: number;
} & (
  | { status: "SUCCEEDED"; imageUrl: string; requestId: string }
  | { status: "FAILED"; errorCode: "PROVIDER_FAILED" }
  | { status: "UNSUPPORTED"; errorCode: "UNSUPPORTED_CATEGORY" }
);

export type PersistedBenchmarkResult =
  | (Omit<Extract<BenchmarkRunResult, { status: "SUCCEEDED" }>, "imageUrl"> & {
      imageFile: string;
    })
  | Exclude<BenchmarkRunResult, { status: "SUCCEEDED" }>
  | {
      caseId: string;
      category: BenchmarkGarmentCategory;
      provider: BenchmarkProviderName;
      durationMs: number;
      status: "FAILED";
      errorCode: "RESULT_DOWNLOAD_FAILED";
    };

const benchmarkCaseSchema = z.object({
  caseId: z.string().regex(/^[A-Za-z0-9][A-Za-z0-9_-]{0,79}$/),
  personImageUrl: z.url().refine((url) => /^https?:\/\//i.test(url)),
  garmentImageUrl: z.url().refine((url) => /^https?:\/\//i.test(url)),
  category: z.enum(["TOP", "BOTTOM", "DRESS"]),
}).strict();

const benchmarkManifestSchema = z.object({
  cases: z.array(benchmarkCaseSchema).min(1),
}).strict().superRefine((manifest, context) => {
  const seen = new Set<string>();
  for (const [index, sample] of manifest.cases.entries()) {
    if (seen.has(sample.caseId)) {
      context.addIssue({
        code: "custom",
        message: "Duplicate caseId",
        path: ["cases", index, "caseId"],
      });
    }
    seen.add(sample.caseId);
  }
});

export function parseBenchmarkManifest(input: unknown): { cases: BenchmarkCase[] } {
  const parsed = benchmarkManifestSchema.safeParse(input);
  if (!parsed.success) {
    throw new Error("Invalid benchmark manifest");
  }
  return parsed.data;
}

export async function runDomesticTryOnBenchmark(input: {
  cases: BenchmarkCase[];
  providers: DomesticTryOnProvider[];
  now?: () => number;
  onResult?: (result: BenchmarkRunResult) => void | Promise<void>;
}): Promise<BenchmarkRunResult[]> {
  const now = input.now ?? Date.now;
  const results: BenchmarkRunResult[] = [];

  for (const sample of input.cases) {
    for (const provider of input.providers) {
      const startedAt = now();
      if (!provider.supports(sample.category)) {
        const result: BenchmarkRunResult = {
          caseId: sample.caseId,
          category: sample.category,
          provider: provider.name,
          status: "UNSUPPORTED",
          durationMs: now() - startedAt,
          errorCode: "UNSUPPORTED_CATEGORY",
        };
        results.push(result);
        await input.onResult?.(result);
        continue;
      }

      let result: BenchmarkRunResult;
      try {
        const generated = await provider.generate(sample);
        result = {
          caseId: sample.caseId,
          category: sample.category,
          provider: provider.name,
          status: "SUCCEEDED",
          durationMs: now() - startedAt,
          imageUrl: generated.imageUrl,
          requestId: generated.requestId,
        };
      } catch {
        result = {
          caseId: sample.caseId,
          category: sample.category,
          provider: provider.name,
          status: "FAILED",
          durationMs: now() - startedAt,
          errorCode: "PROVIDER_FAILED",
        };
      }
      results.push(result);
      await input.onResult?.(result);
    }
  }

  return results;
}

async function downloadResult(url: string, destination: string): Promise<void> {
  const response = await fetch(url);
  if (!response.ok) {
    throw new Error("RESULT_DOWNLOAD_FAILED");
  }
  await writeFile(destination, Buffer.from(await response.arrayBuffer()));
}

export async function materializeBenchmarkResults(input: {
  outputDirectory: string;
  results: BenchmarkRunResult[];
  download?: (url: string, destination: string) => Promise<void>;
}): Promise<PersistedBenchmarkResult[]> {
  const download = input.download ?? downloadResult;
  const persisted: PersistedBenchmarkResult[] = [];

  for (const result of input.results) {
    if (result.status !== "SUCCEEDED") {
      persisted.push(result);
      continue;
    }

    const imageFile = `${result.caseId}-${result.provider}.jpg`;
    try {
      await download(result.imageUrl, join(input.outputDirectory, imageFile));
      const { imageUrl: _temporaryUrl, ...safeResult } = result;
      void _temporaryUrl;
      persisted.push({ ...safeResult, imageFile });
    } catch {
      persisted.push({
        caseId: result.caseId,
        category: result.category,
        provider: result.provider,
        status: "FAILED",
        durationMs: result.durationMs,
        errorCode: "RESULT_DOWNLOAD_FAILED",
      });
    }
  }

  return persisted;
}
