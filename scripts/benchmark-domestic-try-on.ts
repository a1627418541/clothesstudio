import { readFile, mkdir, writeFile } from "node:fs/promises";
import { resolve, join } from "node:path";
import { loadEnvConfig } from "@next/env";
import { loadDomesticTryOnConfig } from "../src/lib/try-on/benchmark/config";
import {
  materializeBenchmarkResults,
  parseBenchmarkManifest,
  runDomesticTryOnBenchmark,
} from "../src/lib/try-on/benchmark/run-benchmark";
import type { PersistedBenchmarkResult } from "../src/lib/try-on/benchmark/run-benchmark";
import type { BenchmarkProviderName, DomesticTryOnProvider } from "../src/lib/try-on/benchmark/types";
import {
  createTencentChangeClothesProvider,
  createTencentChangeClothesSdkClient,
} from "../src/lib/try-on/providers/tencent-change-clothes";
import {
  createVolcengineDressingProvider,
  createVolcengineDressingSdkClient,
} from "../src/lib/try-on/providers/volcengine-dressing-v2";

type ProviderSelection = BenchmarkProviderName | "all";

function parseArguments(argv: string[]): { manifest: string; provider: ProviderSelection } {
  let manifest: string | undefined;
  let provider: ProviderSelection | undefined;
  for (let index = 0; index < argv.length; index += 1) {
    const argument = argv[index];
    if (argument === "--manifest") manifest = argv[++index];
    else if (argument === "--provider") provider = argv[++index] as ProviderSelection;
    else throw new Error(`Unknown argument: ${argument}`);
  }
  if (!manifest || !provider || !["tencent", "volcengine", "all"].includes(provider)) {
    throw new Error("Usage: npm run benchmark:try-on -- --manifest <json> --provider tencent|volcengine|all");
  }
  return { manifest, provider };
}

function selectedProviderNames(selection: ProviderSelection): BenchmarkProviderName[] {
  return selection === "all" ? ["tencent", "volcengine"] : [selection];
}

function assertCredentials(names: BenchmarkProviderName[], environment: NodeJS.ProcessEnv): void {
  const required = names.flatMap((name) => name === "tencent"
    ? ["TENCENT_CLOUD_SECRET_ID", "TENCENT_CLOUD_SECRET_KEY"]
    : ["VOLCENGINE_ACCESS_KEY_ID", "VOLCENGINE_SECRET_ACCESS_KEY"]);
  const missing = required.filter((name) => !environment[name]?.trim());
  if (missing.length > 0) {
    throw new Error(`Missing try-on environment variables: ${missing.join(", ")}`);
  }
}

function createProviders(names: BenchmarkProviderName[]): DomesticTryOnProvider[] {
  return names.map((name) => {
    const config = loadDomesticTryOnConfig(name);
    if (config.provider === "tencent") {
      return createTencentChangeClothesProvider(createTencentChangeClothesSdkClient(config));
    }
    return createVolcengineDressingProvider(createVolcengineDressingSdkClient(config));
  });
}

export async function main(argv = process.argv.slice(2)): Promise<void> {
  loadEnvConfig(process.cwd());
  const arguments_ = parseArguments(argv);
  const manifestPath = resolve(arguments_.manifest);
  const manifest = parseBenchmarkManifest(JSON.parse(await readFile(manifestPath, "utf8")));
  const providerNames = selectedProviderNames(arguments_.provider);

  // This gate intentionally precedes provider construction, network calls, and artifact creation.
  assertCredentials(providerNames, process.env);
  const providers = createProviders(providerNames);
  const runId = new Date().toISOString().replace(/[:.]/g, "-");
  const outputDirectory = resolve("artifacts", "try-on-benchmark", runId);
  await mkdir(outputDirectory, { recursive: true });

  const results: PersistedBenchmarkResult[] = [];
  await runDomesticTryOnBenchmark({
    cases: manifest.cases,
    providers,
    async onResult(result) {
      const [persisted] = await materializeBenchmarkResults({
        outputDirectory,
        results: [result],
      });
      results.push(persisted);
    },
  });
  await writeFile(join(outputDirectory, "results.json"), `${JSON.stringify(results, null, 2)}\n`, "utf8");

  const succeeded = results.filter((result) => result.status === "SUCCEEDED").length;
  const failed = results.filter((result) => result.status === "FAILED").length;
  const unsupported = results.filter((result) => result.status === "UNSUPPORTED").length;
  console.log(JSON.stringify({ outputDirectory, succeeded, failed, unsupported }));
  if (succeeded === 0) process.exitCode = 1;
}

void main().catch((error: unknown) => {
  console.error(error instanceof Error ? error.message : "Benchmark failed");
  process.exitCode = 1;
});
