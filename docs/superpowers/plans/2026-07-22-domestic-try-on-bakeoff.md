# Domestic Try-On Provider Bake-Off Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Build a credential-safe command that runs identical upper-body and lower-body samples through Tencent Cloud and Volcengine, runs dress samples through Tencent, downloads the outputs, and records comparable evidence without changing production traffic.

**Architecture:** Add a benchmark-only provider contract with Tencent and Volcengine adapters behind injected cloud clients. A manifest-driven CLI validates inputs, runs providers sequentially, downloads expiring results into a gitignored artifact directory, and writes sanitized JSON metrics. The existing production `VirtualTryOnProvider` remains mock until the bake-off is reviewed.

**Tech Stack:** TypeScript, Node.js 20+, Vitest, `tsx`, Tencent Cloud AIArt Node.js SDK, Volcengine OpenAPI client, native `fetch`, Zod.

## Global Constraints

- Scope is upper-body, lower-body, and dress only; hats are excluded.
- Do not send cloud credentials to the browser or include them in logs, fixtures, snapshots, or Git.
- Do not change the production provider from `mock` in this plan.
- Provider calls must be sequential because both candidate accounts start with low/default concurrency.
- Volcengine is limited to the documented upper and bottom categories in this plan; dress returns UNSUPPORTED_CATEGORY without a cloud request.
- Download provider output immediately because returned URLs can expire.
- Unit tests must not call real cloud endpoints.

---

## File Map

- `src/lib/try-on/benchmark/types.ts`: shared manifest, result, and client contracts.
- `src/lib/try-on/benchmark/config.ts`: environment validation with secret-free errors.
- `src/lib/try-on/providers/tencent-change-clothes.ts`: Tencent category mapping and adapter.
- `src/lib/try-on/providers/volcengine-dressing-v2.ts`: Volcengine submit/poll adapter.
- `src/lib/try-on/benchmark/run-benchmark.ts`: sequential orchestration and sanitized result capture.
- `scripts/benchmark-domestic-try-on.ts`: CLI, manifest parsing, artifact download, and JSON output.
- `fixtures/try-on-benchmark/manifest.example.json`: safe example input shape using non-secret example URLs.
- `.env.example`: documented server-only credentials.
- `.gitignore`: local benchmark artifact exclusion.

### Task 1: Define and validate the benchmark contract

**Files:**
- Create: `src/lib/try-on/benchmark/types.ts`
- Create: `src/lib/try-on/benchmark/config.ts`
- Create: `src/lib/try-on/benchmark/config.test.ts`

**Interfaces:**
- Produces: `BenchmarkGarmentCategory`, `BenchmarkCase`, `DomesticTryOnProvider`, `BenchmarkProviderResult`, `loadDomesticTryOnConfig()`.

- [ ] **Step 1: Write the failing configuration tests**

```ts
import { describe, expect, it } from "vitest";
import { loadDomesticTryOnConfig } from "./config";

describe("loadDomesticTryOnConfig", () => {
  it("reports missing Tencent variables without exposing values", () => {
    expect(() => loadDomesticTryOnConfig("tencent", {})).toThrow(
      "Missing try-on environment variables: TENCENT_CLOUD_SECRET_ID, TENCENT_CLOUD_SECRET_KEY"
    );
  });

  it("loads Volcengine credentials and defaults the region", () => {
    expect(
      loadDomesticTryOnConfig("volcengine", {
        VOLCENGINE_ACCESS_KEY_ID: "ak",
        VOLCENGINE_SECRET_ACCESS_KEY: "sk",
      })
    ).toEqual({
      provider: "volcengine",
      accessKeyId: "ak",
      secretAccessKey: "sk",
      region: "cn-beijing",
    });
  });
});
```

- [ ] **Step 2: Run the test and verify that it fails**

Run: `npx vitest run src/lib/try-on/benchmark/config.test.ts`

Expected: FAIL because `./config` does not exist.

- [ ] **Step 3: Add the shared contracts**

```ts
export type BenchmarkProviderName = "tencent" | "volcengine";
export type BenchmarkGarmentCategory = "TOP" | "BOTTOM" | "DRESS";

export interface BenchmarkCase {
  caseId: string;
  personImageUrl: string;
  garmentImageUrl: string;
  category: BenchmarkGarmentCategory;
}

export interface BenchmarkProviderResult {
  imageUrl: string;
  requestId: string;
}

export interface DomesticTryOnProvider {
  name: BenchmarkProviderName;
  supports(category: BenchmarkGarmentCategory): boolean;
  generate(input: BenchmarkCase): Promise<BenchmarkProviderResult>;
}
```

- [ ] **Step 4: Implement discriminated environment validation**

```ts
import type { BenchmarkProviderName } from "./types";

type Environment = Record<string, string | undefined>;

export function loadDomesticTryOnConfig(
  provider: BenchmarkProviderName,
  environment: Environment = process.env
) {
  const names = provider === "tencent"
    ? ["TENCENT_CLOUD_SECRET_ID", "TENCENT_CLOUD_SECRET_KEY"] as const
    : ["VOLCENGINE_ACCESS_KEY_ID", "VOLCENGINE_SECRET_ACCESS_KEY"] as const;
  const missing = names.filter((name) => !environment[name]?.trim());
  if (missing.length) {
    throw new Error(`Missing try-on environment variables: ${missing.join(", ")}`);
  }
  if (provider === "tencent") {
    return {
      provider,
      secretId: environment.TENCENT_CLOUD_SECRET_ID!,
      secretKey: environment.TENCENT_CLOUD_SECRET_KEY!,
      region: environment.TENCENT_CLOUD_REGION?.trim() || "ap-guangzhou",
    } as const;
  }
  return {
    provider,
    accessKeyId: environment.VOLCENGINE_ACCESS_KEY_ID!,
    secretAccessKey: environment.VOLCENGINE_SECRET_ACCESS_KEY!,
    region: environment.VOLCENGINE_REGION?.trim() || "cn-beijing",
  } as const;
}
```

- [ ] **Step 5: Run the focused test**

Run: `npx vitest run src/lib/try-on/benchmark/config.test.ts`

Expected: PASS.

- [ ] **Step 6: Commit the contract**

```bash
git add src/lib/try-on/benchmark
git commit -m "test: define domestic try-on benchmark contract"
```

### Task 2: Add the Tencent ChangeClothes adapter

**Files:**
- Modify: `package.json`
- Modify: `package-lock.json`
- Create: `src/lib/try-on/providers/tencent-change-clothes.ts`
- Create: `src/lib/try-on/providers/tencent-change-clothes.test.ts`

**Interfaces:**
- Consumes: `BenchmarkCase`, `DomesticTryOnProvider`, Tencent credentials from Task 1.
- Produces: `createTencentChangeClothesProvider(client)` and `createTencentChangeClothesSdkClient(config)`.

- [ ] **Step 1: Install the focused official SDK**

Run: `npm install tencentcloud-sdk-nodejs-aiart`

Expected: `package.json` and `package-lock.json` include `tencentcloud-sdk-nodejs-aiart`.

- [ ] **Step 2: Write failing adapter tests**

```ts
import { describe, expect, it, vi } from "vitest";
import { createTencentChangeClothesProvider } from "./tencent-change-clothes";

describe("Tencent ChangeClothes provider", () => {
  it("maps internal categories and requests a temporary URL", async () => {
    const ChangeClothes = vi.fn().mockResolvedValue({
      ResultImage: "https://result.example/tencent.jpg",
      RequestId: "tc-1",
    });
    const provider = createTencentChangeClothesProvider({ ChangeClothes });
    await expect(provider.generate({
      caseId: "top-1",
      personImageUrl: "https://input.example/person.jpg",
      garmentImageUrl: "https://input.example/top.jpg",
      category: "TOP",
    })).resolves.toEqual({
      imageUrl: "https://result.example/tencent.jpg",
      requestId: "tc-1",
    });
    expect(ChangeClothes).toHaveBeenCalledWith({
      ModelUrl: "https://input.example/person.jpg",
      ClothesUrl: "https://input.example/top.jpg",
      ClothesType: "Upper-body",
      LogoAdd: 1,
      RspImgType: "url",
    });
  });

  it.each([
    ["BOTTOM", "Lower-body"],
    ["DRESS", "Dress"],
  ] as const)("maps %s to %s", async (category, ClothesType) => {
    const ChangeClothes = vi.fn().mockResolvedValue({ ResultImage: "https://result.example/x", RequestId: "id" });
    const provider = createTencentChangeClothesProvider({ ChangeClothes });
    await provider.generate({ caseId: "x", personImageUrl: "https://input.example/p", garmentImageUrl: "https://input.example/g", category });
    expect(ChangeClothes).toHaveBeenCalledWith(expect.objectContaining({ ClothesType }));
  });
});
```

- [ ] **Step 3: Run the tests and verify failure**

Run: `npx vitest run src/lib/try-on/providers/tencent-change-clothes.test.ts`

Expected: FAIL because the adapter does not exist.

- [ ] **Step 4: Implement the adapter and SDK client factory**

```ts
import tencentcloud from "tencentcloud-sdk-nodejs-aiart";
import type { BenchmarkGarmentCategory, DomesticTryOnProvider } from "../benchmark/types";

const CATEGORY: Record<BenchmarkGarmentCategory, "Upper-body" | "Lower-body" | "Dress"> = {
  TOP: "Upper-body",
  BOTTOM: "Lower-body",
  DRESS: "Dress",
};

export interface TencentChangeClothesClient {
  ChangeClothes(input: {
    ModelUrl: string;
    ClothesUrl: string;
    ClothesType: "Upper-body" | "Lower-body" | "Dress";
    LogoAdd: number;
    RspImgType: "url";
  }): Promise<{ ResultImage?: string; RequestId?: string }>;
}

export function createTencentChangeClothesProvider(
  client: TencentChangeClothesClient
): DomesticTryOnProvider {
  return {
    name: "tencent",
    async generate(input) {
      const response = await client.ChangeClothes({
        ModelUrl: input.personImageUrl,
        ClothesUrl: input.garmentImageUrl,
        ClothesType: CATEGORY[input.category],
        LogoAdd: 1,
        RspImgType: "url",
      });
      if (!response.ResultImage || !response.RequestId) {
        throw new Error("TENCENT_EMPTY_RESULT");
      }
      return { imageUrl: response.ResultImage, requestId: response.RequestId };
    },
  };
}

export function createTencentChangeClothesSdkClient(config: {
  secretId: string;
  secretKey: string;
  region: string;
}): TencentChangeClothesClient {
  const Client = tencentcloud.aiart.v20221229.Client;
  return new Client({
    credential: { secretId: config.secretId, secretKey: config.secretKey },
    region: config.region,
    profile: { httpProfile: { endpoint: "aiart.tencentcloudapi.com" } },
  });
}
```

- [ ] **Step 5: Run focused tests and type checking**

Run: `npx vitest run src/lib/try-on/providers/tencent-change-clothes.test.ts`

Expected: PASS.

Run: `npx tsc --noEmit`

Expected: exit 0.

- [ ] **Step 6: Commit the Tencent adapter**

```bash
git add package.json package-lock.json src/lib/try-on/providers/tencent-change-clothes.ts src/lib/try-on/providers/tencent-change-clothes.test.ts
git commit -m "feat: add Tencent clothes benchmark provider"
```

### Task 3: Add the Volcengine DressingDiffusionV2 adapter

**Files:**
- Modify: `package.json`
- Modify: `package-lock.json`
- Create: `src/lib/try-on/providers/volcengine-dressing-v2.ts`
- Create: `src/lib/try-on/providers/volcengine-dressing-v2.test.ts`

**Interfaces:**
- Consumes: `BenchmarkCase`, `DomesticTryOnProvider`, Volcengine credentials from Task 1.
- Produces: `createVolcengineDressingProvider(client, options)` and an SDK-backed client with `submit()` and `getResult()`.

- [ ] **Step 1: Install the official OpenAPI client**

Run: `npm install @volcengine/openapi`

Expected: dependency and lockfile update succeed.

- [ ] **Step 2: Write failing async polling tests**

```ts
import { describe, expect, it, vi } from "vitest";
import { createVolcengineDressingProvider } from "./volcengine-dressing-v2";

describe("Volcengine DressingDiffusionV2 provider", () => {
  it("submits one garment and polls until completion", async () => {
    const client = {
      submit: vi.fn().mockResolvedValue({ taskId: "ve-1", requestId: "req-1" }),
      getResult: vi.fn()
        .mockResolvedValueOnce({ status: "running" as const })
        .mockResolvedValueOnce({ status: "done" as const, imageUrl: "https://result.example/volc.jpg" }),
    };
    const provider = createVolcengineDressingProvider(client, { pollIntervalMs: 0, timeoutMs: 100 });
    await expect(provider.generate({
      caseId: "bottom-1",
      personImageUrl: "https://input.example/person.jpg",
      garmentImageUrl: "https://input.example/bottom.jpg",
      category: "BOTTOM",
    })).resolves.toEqual({ imageUrl: "https://result.example/volc.jpg", requestId: "req-1" });
    expect(client.submit).toHaveBeenCalledWith(expect.objectContaining({
      reqKey: "dressing_diffusionV2",
      personImageUrl: "https://input.example/person.jpg",
      garments: [{ type: "lower", imageUrl: "https://input.example/bottom.jpg" }],
    }));
  });

  it("stops polling at the configured timeout", async () => {
    const client = {
      submit: vi.fn().mockResolvedValue({ taskId: "ve-2", requestId: "req-2" }),
      getResult: vi.fn().mockResolvedValue({ status: "running" as const }),
    };
    const provider = createVolcengineDressingProvider(client, { pollIntervalMs: 0, timeoutMs: 0 });
    await expect(provider.generate({ caseId: "x", personImageUrl: "https://input.example/p", garmentImageUrl: "https://input.example/g", category: "TOP" }))
      .rejects.toThrow("VOLCENGINE_TIMEOUT");
  });
});
```

- [ ] **Step 3: Run the test and verify failure**

Run: `npx vitest run src/lib/try-on/providers/volcengine-dressing-v2.test.ts`

Expected: FAIL because the adapter does not exist.

- [ ] **Step 4: Implement category mapping and bounded polling**

```ts
import type { BenchmarkGarmentCategory, DomesticTryOnProvider } from "../benchmark/types";

const CATEGORY: Record<BenchmarkGarmentCategory, "upper" | "lower" | "dress"> = {
  TOP: "upper",
  BOTTOM: "lower",
  DRESS: "dress",
};

export interface VolcengineDressingClient {
  submit(input: {
    reqKey: "dressing_diffusionV2";
    personImageUrl: string;
    garments: Array<{ type: "upper" | "lower" | "dress"; imageUrl: string }>;
  }): Promise<{ taskId: string; requestId: string }>;
  getResult(taskId: string): Promise<
    | { status: "running" }
    | { status: "done"; imageUrl: string }
    | { status: "failed"; code: string }
  >;
}

const wait = (milliseconds: number) => new Promise((resolve) => setTimeout(resolve, milliseconds));

export function createVolcengineDressingProvider(
  client: VolcengineDressingClient,
  options: { pollIntervalMs: number; timeoutMs: number } = { pollIntervalMs: 2000, timeoutMs: 120000 }
): DomesticTryOnProvider {
  return {
    name: "volcengine",
    async generate(input) {
      const submitted = await client.submit({
        reqKey: "dressing_diffusionV2",
        personImageUrl: input.personImageUrl,
        garments: [{ type: CATEGORY[input.category], imageUrl: input.garmentImageUrl }],
      });
      const deadline = Date.now() + options.timeoutMs;
      do {
        const result = await client.getResult(submitted.taskId);
        if (result.status === "done") return { imageUrl: result.imageUrl, requestId: submitted.requestId };
        if (result.status === "failed") throw new Error(`VOLCENGINE_${result.code}`);
        await wait(options.pollIntervalMs);
      } while (Date.now() <= deadline);
      throw new Error("VOLCENGINE_TIMEOUT");
    },
  };
}
```

- [ ] **Step 5: Add the SDK-backed client wrapper using the exact request keys from API Explorer**

Create the exported factory `createVolcengineDressingSdkClient({ accessKeyId, secretAccessKey, region })`. It must submit action `DressingDiffusionV2SubmitTask`, query action `DressingDiffusionV2GetResult`, use service code `cv`, version `2024-06-06`, host `visual.volcengineapi.com`, and translate only these fields into the narrow `VolcengineDressingClient` contract above. Keep the raw SDK response inside this module so cloud-specific shapes cannot leak into benchmark output.

- [ ] **Step 6: Run focused tests and type checking**

Run: `npx vitest run src/lib/try-on/providers/volcengine-dressing-v2.test.ts`

Expected: PASS.

Run: `npx tsc --noEmit`

Expected: exit 0.

- [ ] **Step 7: Commit the Volcengine adapter**

```bash
git add package.json package-lock.json src/lib/try-on/providers/volcengine-dressing-v2.ts src/lib/try-on/providers/volcengine-dressing-v2.test.ts
git commit -m "feat: add Volcengine clothes benchmark provider"
```

### Task 4: Build the manifest-driven benchmark runner

**Files:**
- Create: `src/lib/try-on/benchmark/run-benchmark.ts`
- Create: `src/lib/try-on/benchmark/run-benchmark.test.ts`
- Create: `scripts/benchmark-domestic-try-on.ts`
- Create: `fixtures/try-on-benchmark/manifest.example.json`
- Modify: `package.json`
- Modify: `.gitignore`
- Modify: `.env.example`

**Interfaces:**
- Consumes: provider factories from Tasks 2 and 3.
- Produces: `runDomesticTryOnBenchmark()` and `npm run benchmark:try-on`.

- [ ] **Step 1: Write failing runner tests**

```ts
import { describe, expect, it, vi } from "vitest";
import { runDomesticTryOnBenchmark } from "./run-benchmark";

describe("runDomesticTryOnBenchmark", () => {
  it("runs providers sequentially and sanitizes failures", async () => {
    const tencent = { name: "tencent" as const, generate: vi.fn().mockResolvedValue({ imageUrl: "https://result.example/t", requestId: "t-1" }) };
    const volcengine = { name: "volcengine" as const, generate: vi.fn().mockRejectedValue(new Error("secret=never-write-this")) };
    const results = await runDomesticTryOnBenchmark({
      cases: [{ caseId: "case-1", personImageUrl: "https://input.example/p", garmentImageUrl: "https://input.example/g", category: "TOP" }],
      providers: [tencent, volcengine],
      now: () => 100,
    });
    expect(results).toEqual([
      expect.objectContaining({ caseId: "case-1", provider: "tencent", status: "SUCCEEDED", requestId: "t-1" }),
      expect.objectContaining({ caseId: "case-1", provider: "volcengine", status: "FAILED", errorCode: "PROVIDER_FAILED" }),
    ]);
    expect(JSON.stringify(results)).not.toContain("never-write-this");
  });
});
```

- [ ] **Step 2: Run the test and verify failure**

Run: `npx vitest run src/lib/try-on/benchmark/run-benchmark.test.ts`

Expected: FAIL because the runner does not exist.

- [ ] **Step 3: Implement sequential execution and sanitized metrics**

```ts
import type { BenchmarkCase, DomesticTryOnProvider } from "./types";

export async function runDomesticTryOnBenchmark(input: {
  cases: BenchmarkCase[];
  providers: DomesticTryOnProvider[];
  now?: () => number;
}) {
  const now = input.now ?? Date.now;
  const results = [];
  for (const sample of input.cases) {
    for (const provider of input.providers) {
      const startedAt = now();
      try {
        const generated = await provider.generate(sample);
        results.push({ caseId: sample.caseId, category: sample.category, provider: provider.name, status: "SUCCEEDED" as const, durationMs: now() - startedAt, ...generated });
      } catch {
        results.push({ caseId: sample.caseId, category: sample.category, provider: provider.name, status: "FAILED" as const, durationMs: now() - startedAt, errorCode: "PROVIDER_FAILED" });
      }
    }
  }
  return results;
}
```

- [ ] **Step 4: Implement the CLI and immediate image download**

The CLI must accept `--manifest <absolute-or-relative-json>` and `--provider tencent|volcengine|all`, validate the manifest with Zod, create `artifacts/try-on-benchmark/<ISO timestamp without colons>/`, download every successful `imageUrl` as `<caseId>-<provider>.jpg`, replace the temporary URL in persisted `results.json` with the relative filename, and exit non-zero only for invalid configuration or an entirely failed run. It must never print environment variable values.

- [ ] **Step 5: Add safe fixtures and configuration documentation**

Add this example manifest:

```json
{
  "cases": [
    {
      "caseId": "top-01",
      "personImageUrl": "https://example.com/person.jpg",
      "garmentImageUrl": "https://example.com/top.jpg",
      "category": "TOP"
    }
  ]
}
```

Add `artifacts/try-on-benchmark/` to `.gitignore`, add script `"benchmark:try-on": "tsx scripts/benchmark-domestic-try-on.ts"`, and document these empty values in `.env.example`:

```dotenv
TENCENT_CLOUD_SECRET_ID=""
TENCENT_CLOUD_SECRET_KEY=""
TENCENT_CLOUD_REGION="ap-guangzhou"
VOLCENGINE_ACCESS_KEY_ID=""
VOLCENGINE_SECRET_ACCESS_KEY=""
VOLCENGINE_REGION="cn-beijing"
```

- [ ] **Step 6: Run runner tests and a no-secret CLI canary**

Run: `npx vitest run src/lib/try-on/benchmark/run-benchmark.test.ts`

Expected: PASS.

Run: `npm run benchmark:try-on -- --manifest fixtures/try-on-benchmark/manifest.example.json --provider all`

Expected: exits before any request with a missing-variable error that lists names only.

- [ ] **Step 7: Commit the benchmark command**

```bash
git add .gitignore .env.example package.json scripts/benchmark-domestic-try-on.ts fixtures/try-on-benchmark/manifest.example.json src/lib/try-on/benchmark
git commit -m "feat: add domestic try-on bake-off command"
```

### Task 5: Verify locally, then perform the authorized real bake-off

**Files:**
- Create locally only: `.env.local`
- Create locally only: `fixtures/try-on-benchmark/manifest.local.json`
- Generated locally only: `artifacts/try-on-benchmark/<runId>/`

**Interfaces:**
- Consumes: real Tencent and Volcengine credentials plus consented public image URLs.
- Produces: downloaded result images and sanitized `results.json` for human scoring.

- [ ] **Step 1: Run the complete offline verification suite**

Run: `npm test`

Expected: all Vitest files pass without cloud calls.

Run: `npx tsc --noEmit`

Expected: exit 0.

Run: `npm run lint`

Expected: exit 0.

Run: `npm run build`

Expected: production build succeeds.

- [ ] **Step 2: Configure credentials locally without echoing them**

Put the six documented variables into `.env.local`. Confirm only variable presence with the benchmark config loader; do not print values.

- [ ] **Step 3: Create the consented ten-case local manifest**

Use unique IDs, public HTTPS URLs, and a balanced set containing at least three tops, three bottoms, and two dresses. Use the remaining two cases for difficult inputs such as patterned fabric and dark clothing. Do not use minors, group photos, side-profile photos, or images without explicit try-on consent.

- [ ] **Step 4: Run Tencent and Volcengine on the same manifest**

Run: `npm run benchmark:try-on -- --manifest fixtures/try-on-benchmark/manifest.local.json --provider all`

Expected: twenty attempted generations, local images downloaded for successful calls, and no secret material in `results.json`.

- [ ] **Step 5: Score the anonymized images**

For each downloaded image, add four integer fields from 1 to 5 in a separate local scoring copy: `identity`, `garmentFidelity`, `anatomy`, and `realism`. Select a production candidate only if it has at least 90% technical success, no severe identity replacement in the ten cases, and a mean garment-fidelity score of at least 4.0.

- [ ] **Step 6: Review repository safety**

Run: `git status --short`

Expected: no `.env.local`, `manifest.local.json`, downloaded images, or result JSON appears.

Run: `git diff --check`

Expected: exit 0.

- [ ] **Step 7: Commit documentation adjustments only if verification changed them**

```bash
git add docs .env.example
git commit -m "docs: record domestic try-on bake-off procedure"
```

## Self-Review

- Spec coverage: both providers, three garment categories, sequential calls, expiring-image download, error redaction, local-only artifacts, and no production switch all have tasks.
- Placeholder scan: implementation steps name concrete files, commands, inputs, outputs, and required request identifiers.
- Type consistency: both adapters implement `DomesticTryOnProvider.generate(BenchmarkCase)` and return `BenchmarkProviderResult`; the runner consumes exactly those types.
