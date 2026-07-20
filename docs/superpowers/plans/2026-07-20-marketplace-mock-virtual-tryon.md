# Marketplace Mock Virtual Try-On Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Build a fully testable mock flow that accepts a total-outfit budget, creates three single-platform Taobao/JD product plans, automatically produces the authorized primary try-on, generates alternatives on demand, renders editorial product cards, and expires anonymous face assets after 30 days.

**Architecture:** Keep the existing diagnosis and Archetype V2 pipeline authoritative for style selection, then attach normalized marketplace product snapshots by recommendation rank. Add provider-neutral marketplace and virtual-try-on boundaries with deterministic mock implementations; orchestrate the primary recommendation synchronously in the mock phase while preserving a background-executor boundary for the production phase. Keep legacy style preview fields intact and expose the new product and try-on state through the existing diagnosis detail API.

**Tech Stack:** Next.js 15.5, React 19, TypeScript 5, Prisma 7 with PostgreSQL, Zod 4, Vitest 4, Cloudflare R2 abstractions.

## Global Constraints

- Phase scope is mock end-to-end only; no Taobao/JD network calls and no real image-generation provider calls.
- Every outfit uses exactly one platform: `TAOBAO` or `JD`; products from different platforms must never appear in one recommendation.
- Budget tiers are `UNDER_500`, `FROM_500_TO_1000`, `FROM_1000_TO_2000`, and `ABOVE_2000`, applied to total outfit price.
- Every outfit contains `TOP`, `BOTTOM`, and `HAT`; `OUTERWEAR` is optional.
- The primary recommendation auto-generates only with active face try-on consent; alternative recommendations generate only after an explicit request.
- An unconsented request must never pass face, side-face, or full-body URLs to try-on providers.
- Anonymous uploaded photos and try-on results expire 30 days after diagnosis creation; signed URLs, API keys, and raw face data must not be logged.
- Existing Archetype V2 immutable snapshots remain authoritative for style content.
- Existing untracked workspace files are user-owned and must not be staged or modified.
- Do not add a new runtime dependency for this phase.

---

## File Structure

### New files

- `prisma/migrations/20260720090000_add_marketplace_mock_try_on/migration.sql` — database migration for budgets, product snapshots, workflow state, and retention metadata.
- `src/lib/validators/diagnosis.test.ts` — budget and consent request-contract tests.
- `src/lib/marketplace/types.ts` — provider-neutral product, query, plan, and budget types.
- `src/lib/marketplace/mock-catalog.ts` — deterministic Taobao/JD product fixtures and data-SVG images.
- `src/lib/marketplace/mock-product-provider.ts` — mock provider implementation.
- `src/lib/marketplace/mock-product-provider.test.ts` — provider contract tests.
- `src/lib/marketplace/outfit-product-matcher.ts` — single-platform, budget-aware outfit matcher.
- `src/lib/marketplace/outfit-product-matcher.test.ts` — matcher behavior tests.
- `src/lib/marketplace/recommendation-product-service.ts` — product-plan persistence and snapshot hashing.
- `src/lib/marketplace/recommendation-product-service.test.ts` — persistence mapping and hash tests.
- `src/lib/try-on/types.ts` — virtual try-on, identity restoration, quality, and workflow contracts.
- `src/lib/try-on/mock-providers.ts` — deterministic mock implementations.
- `src/lib/try-on/try-on-orchestrator.ts` — consent-aware workflow state machine and retry policy.
- `src/lib/try-on/try-on-orchestrator.test.ts` — workflow, authorization, and retry tests.
- `src/app/api/diagnosis/[id]/recommendations/[recommendationId]/try-on/route.ts` — on-demand/retry endpoint.
- `src/app/api/diagnosis/[id]/recommendations/[recommendationId]/try-on/route.test.ts` — ownership, consent, and idempotency tests.
- `src/app/api/diagnosis/[id]/try-on-consent/route.ts` — grant/revoke consent endpoint.
- `src/app/api/diagnosis/[id]/try-on-consent/route.test.ts` — consent endpoint tests.
- `src/components/diagnosis/marketplace-product-grid.tsx` — real-product snapshot cards and purchase links.
- `src/components/diagnosis/try-on-status-panel.tsx` — safe user-facing workflow states and actions.
- `src/components/diagnosis/marketplace-report.test.tsx` — static rendering contract tests.
- `src/lib/retention/anonymous-media-retention.ts` — 30-day eligibility and deletion orchestration.
- `src/lib/retention/anonymous-media-retention.test.ts` — retention boundary tests.
- `scripts/cleanup-expired-anonymous-media.ts` — manually runnable cleanup entry point.

### Modified files

- `prisma/schema.prisma` — add enums, diagnosis budget, recommendation product relation, and try-on workflow metadata.
- `src/lib/style-archetype/current-schema-contract.test.ts` — lock the new Prisma contract.
- `src/lib/validators/diagnosis.ts` — require a budget tier.
- `src/app/diagnosis/page.tsx` — collect and submit budget; clarify consent copy.
- `src/app/api/diagnosis/route.ts` — persist the budget, attach three mock product plans, and auto-run the authorized primary mock try-on.
- `src/app/api/diagnosis/route.test.ts` — assert product-plan and automatic-generation integration.
- `src/lib/diagnosis-service.ts` — include product snapshots and try-on metadata in report detail.
- `src/lib/diagnosis-service.test.ts` — assert the new detail projection.
- `src/lib/diagnosis/report-display-model.ts` — project normalized products and new workflow state.
- `src/lib/diagnosis/report-display-model.test.ts` — preserve snapshot authority while adding marketplace data.
- `src/types/diagnosis.ts` — public report product and try-on types.
- `src/app/diagnosis/[id]/page.tsx` — on-demand/retry action handling and refresh behavior.
- `src/components/diagnosis/primary-style-direction.tsx` — editorial primary try-on plus product grid.
- `src/components/diagnosis/alternative-style-card.tsx` — product-first alternatives and generate action.
- `src/components/diagnosis/style-preview-image.tsx` — explicit mock/AI disclosure and workflow-safe fallback copy.
- `src/lib/r2.ts` — add an object-delete function used by retention cleanup.
- `package.json` — add the cleanup script.

---

### Task 1: Lock the database and diagnosis request contracts

**Files:**
- Modify: `prisma/schema.prisma`
- Create: `prisma/migrations/20260720090000_add_marketplace_mock_try_on/migration.sql`
- Modify: `src/lib/style-archetype/current-schema-contract.test.ts`
- Modify: `src/lib/validators/diagnosis.ts`
- Create: `src/lib/validators/diagnosis.test.ts`

**Interfaces:**
- Consumes: existing `StyleDiagnosis`, `StyleRecommendation`, `ImageStatus`, and diagnosis form contract.
- Produces: Prisma enums `BudgetTier`, `MarketplacePlatform`, `MarketplaceProductCategory`, `ProductAvailabilityStatus`, `ProductPlanStatus`, `TryOnWorkflowStatus`; model `RecommendationProduct`; Zod field `budgetTier`.

- [ ] **Step 1: Write failing schema and validator tests**

Add this test to `current-schema-contract.test.ts`:

```ts
import {
  BudgetTier,
  MarketplacePlatform,
  MarketplaceProductCategory,
  ProductPlanStatus,
  TryOnWorkflowStatus,
} from "@prisma/client";

it("defines marketplace and mock try-on contracts", () => {
  expect(Object.values(BudgetTier)).toEqual([
    "UNDER_500",
    "FROM_500_TO_1000",
    "FROM_1000_TO_2000",
    "ABOVE_2000",
  ]);
  expect(Object.values(MarketplacePlatform)).toEqual(["TAOBAO", "JD"]);
  expect(Object.values(MarketplaceProductCategory)).toEqual([
    "TOP",
    "BOTTOM",
    "OUTERWEAR",
    "HAT",
  ]);
  expect(Object.values(ProductPlanStatus)).toEqual([
    "PENDING",
    "READY",
    "FAILED",
    "STALE",
  ]);
  expect(Object.values(TryOnWorkflowStatus)).toContain("QUALITY_CHECKING");
  expect(getModel("RecommendationProduct").fields.map((field) => field.name))
    .toEqual(expect.arrayContaining([
      "recommendationId",
      "platform",
      "externalProductId",
      "externalSkuId",
      "category",
      "imageUrl",
      "purchaseUrl",
      "priceCents",
      "snapshotAt",
    ]));
});
```

Create `src/lib/validators/diagnosis.test.ts`:

```ts
import { describe, expect, it } from "vitest";
import { diagnosisFormSchema } from "./diagnosis";

const validInput = {
  gender: "FEMALE" as const,
  age: 28,
  heightCm: 165,
  weightKg: 52,
  budgetTier: "FROM_500_TO_1000" as const,
  faceTryOnConsent: true,
  photoAssetIds: {
    FACE_FRONT: "front",
    FACE_SIDE: "side",
    FULL_BODY: "body",
  },
};

describe("diagnosisFormSchema marketplace fields", () => {
  it("accepts every approved total-outfit budget tier", () => {
    for (const budgetTier of [
      "UNDER_500",
      "FROM_500_TO_1000",
      "FROM_1000_TO_2000",
      "ABOVE_2000",
    ] as const) {
      expect(diagnosisFormSchema.parse({ ...validInput, budgetTier }).budgetTier)
        .toBe(budgetTier);
    }
  });

  it("rejects a missing or arbitrary budget tier", () => {
    const { budgetTier: _removed, ...withoutBudget } = validInput;
    expect(diagnosisFormSchema.safeParse(withoutBudget).success).toBe(false);
    expect(diagnosisFormSchema.safeParse({
      ...validInput,
      budgetTier: "NO_LIMIT",
    }).success).toBe(false);
  });
});
```

- [ ] **Step 2: Run tests and verify the contract is missing**

Run: `npx vitest run src/lib/validators/diagnosis.test.ts src/lib/style-archetype/current-schema-contract.test.ts`

Expected: FAIL because `budgetTier` and the new Prisma enums/model do not exist.

- [ ] **Step 3: Add the Prisma schema and migration**

Add these enums and model to `prisma/schema.prisma`:

```prisma
enum BudgetTier {
  UNDER_500
  FROM_500_TO_1000
  FROM_1000_TO_2000
  ABOVE_2000
}

enum MarketplacePlatform {
  TAOBAO
  JD
}

enum MarketplaceProductCategory {
  TOP
  BOTTOM
  OUTERWEAR
  HAT
}

enum ProductAvailabilityStatus {
  AVAILABLE
  UNAVAILABLE
  UNKNOWN
}

enum ProductPlanStatus {
  PENDING
  READY
  FAILED
  STALE
}

enum TryOnWorkflowStatus {
  NOT_REQUESTED
  QUEUED
  APPLYING_GARMENTS
  APPLYING_HAT
  RESTORING_IDENTITY
  QUALITY_CHECKING
  COMPLETED
  FAILED
  CANCELLED
  EXPIRED
}

model RecommendationProduct {
  id                 String                       @id @default(cuid())
  recommendationId   String
  recommendation     StyleRecommendation          @relation(fields: [recommendationId], references: [id], onDelete: Cascade)
  platform           MarketplacePlatform
  externalProductId  String
  externalSkuId      String
  category           MarketplaceProductCategory
  title              String
  imageUrl           String                       @db.Text
  purchaseUrl        String                       @db.Text
  priceCents         Int
  currency           String                       @default("CNY")
  sellerName         String
  color              String
  variantLabel       String
  isOptional         Boolean                      @default(false)
  availabilityStatus ProductAvailabilityStatus    @default(AVAILABLE)
  snapshotAt         DateTime
  position           Int
  rawSnapshot        Json?
  createdAt          DateTime                     @default(now())
  updatedAt          DateTime                     @updatedAt

  @@unique([recommendationId, position])
  @@index([recommendationId, platform])
  @@index([externalProductId, externalSkuId])
}
```

Add to `StyleDiagnosis`:

```prisma
budgetTier            BudgetTier
faceTryOnRevokedAt    DateTime?
```

Add to `StyleRecommendation`:

```prisma
marketplacePlatform      MarketplacePlatform?
productTotalCents        Int?
productPlanStatus        ProductPlanStatus      @default(PENDING)
products                 RecommendationProduct[]
tryOnWorkflowStatus      TryOnWorkflowStatus    @default(NOT_REQUESTED)
tryOnAttemptCount        Int                    @default(0)
tryOnFailureCode         String?
tryOnProvider            String?
identityScore            Float?
productFidelityScore     Float?
tryOnExpiresAt           DateTime?
tryOnProductSnapshotHash String?
```

Write the migration with explicit `CREATE TYPE`, `ALTER TABLE`, `CREATE TABLE`, foreign key, unique index, and lookup indexes matching those declarations. `budgetTier` must be added with a temporary default of `FROM_500_TO_1000`, existing rows backfilled, and the default removed so future creates must supply it.

- [ ] **Step 4: Add the Zod budget field**

Update `diagnosisFormSchema`:

```ts
budgetTier: z.enum([
  "UNDER_500",
  "FROM_500_TO_1000",
  "FROM_1000_TO_2000",
  "ABOVE_2000",
]),
```

- [ ] **Step 5: Generate Prisma Client and rerun tests**

Run: `npx prisma generate`

Expected: `Generated Prisma Client` with no schema errors.

Run: `npx vitest run src/lib/validators/diagnosis.test.ts src/lib/style-archetype/current-schema-contract.test.ts`

Expected: PASS.

- [ ] **Step 6: Commit the contract**

```bash
git add prisma/schema.prisma prisma/migrations/20260720090000_add_marketplace_mock_try_on/migration.sql src/lib/style-archetype/current-schema-contract.test.ts src/lib/validators/diagnosis.ts src/lib/validators/diagnosis.test.ts
git commit -m "feat: add marketplace try-on data contracts"
```

---

### Task 2: Implement deterministic mock marketplace providers

**Files:**
- Create: `src/lib/marketplace/types.ts`
- Create: `src/lib/marketplace/mock-catalog.ts`
- Create: `src/lib/marketplace/mock-product-provider.ts`
- Create: `src/lib/marketplace/mock-product-provider.test.ts`

**Interfaces:**
- Consumes: Prisma-generated marketplace enum values.
- Produces: `MarketplaceProductProvider.search(input)`, `MarketplaceProductProvider.refresh(input)`, `MarketplaceProductProvider.buildPurchaseLink(input)`, `budgetRangeForTier(tier)`, and deterministic mock product snapshots.

- [ ] **Step 1: Write failing provider tests**

Create tests that instantiate both platforms and assert category, platform, budget, and link behavior:

```ts
import { describe, expect, it } from "vitest";
import { createMockProductProvider } from "./mock-product-provider";

describe("mock marketplace provider", () => {
  it("returns only requested platform and category products", async () => {
    const provider = createMockProductProvider("TAOBAO");
    const result = await provider.search({
      category: "HAT",
      colors: ["brown"],
      keywords: ["retro"],
      minPriceCents: 0,
      maxPriceCents: 20_000,
      limit: 10,
    });
    expect(result.products.length).toBeGreaterThan(0);
    expect(result.products.every((product) =>
      product.platform === "TAOBAO" && product.category === "HAT"
    )).toBe(true);
  });

  it("builds a deterministic mock purchase link", async () => {
    const provider = createMockProductProvider("JD");
    await expect(provider.buildPurchaseLink({
      externalProductId: "jd-top-001",
      externalSkuId: "jd-top-001-cream-m",
    })).resolves.toBe(
      "https://example.invalid/jd/product/jd-top-001?sku=jd-top-001-cream-m"
    );
  });
});
```

- [ ] **Step 2: Run the provider test and verify failure**

Run: `npx vitest run src/lib/marketplace/mock-product-provider.test.ts`

Expected: FAIL because the marketplace modules do not exist.

- [ ] **Step 3: Define provider-neutral types**

In `types.ts`, define exact unions and interfaces:

```ts
export type MarketplacePlatformValue = "TAOBAO" | "JD";
export type ProductCategoryValue = "TOP" | "BOTTOM" | "OUTERWEAR" | "HAT";
export type BudgetTierValue =
  | "UNDER_500"
  | "FROM_500_TO_1000"
  | "FROM_1000_TO_2000"
  | "ABOVE_2000";

export interface ProductSnapshot {
  platform: MarketplacePlatformValue;
  externalProductId: string;
  externalSkuId: string;
  category: ProductCategoryValue;
  title: string;
  imageUrl: string;
  purchaseUrl: string;
  priceCents: number;
  currency: "CNY";
  sellerName: string;
  color: string;
  variantLabel: string;
  availabilityStatus: "AVAILABLE" | "UNAVAILABLE" | "UNKNOWN";
  snapshotAt: Date;
}

export interface ProductSearchInput {
  category: ProductCategoryValue;
  colors: string[];
  keywords: string[];
  minPriceCents: number;
  maxPriceCents: number | null;
  limit: number;
}

export interface MarketplaceProductProvider {
  platform: MarketplacePlatformValue;
  search(input: ProductSearchInput): Promise<{ products: ProductSnapshot[] }>;
  refresh(input: {
    externalProductId: string;
    externalSkuId: string;
  }): Promise<ProductSnapshot | null>;
  buildPurchaseLink(input: {
    externalProductId: string;
    externalSkuId: string;
  }): Promise<string>;
}
```

- [ ] **Step 4: Add a self-contained mock catalog**

Create at least two products per required category and platform. Generate local data-SVG product images with a helper so local development has no image-network dependency:

```ts
function productImageDataUrl(label: string, color: string): string {
  const svg = `<svg xmlns="http://www.w3.org/2000/svg" width="640" height="800" viewBox="0 0 640 800"><rect width="640" height="800" fill="${color}"/><text x="320" y="390" text-anchor="middle" font-family="Arial" font-size="34" fill="#1f1b18">${label}</text><text x="320" y="435" text-anchor="middle" font-family="Arial" font-size="18" fill="#5c5148">Mock product image</text></svg>`;
  return `data:image/svg+xml;base64,${Buffer.from(svg).toString("base64")}`;
}
```

Catalog prices must permit all four budget tiers to form a required `TOP + BOTTOM + HAT` set. Include outerwear at prices that fit at least the three higher tiers.

- [ ] **Step 5: Implement the mock provider**

Filter by provider platform, category, price range, and availability. Prefer exact requested colors, then keyword matches, then stable `externalProductId` order. `refresh` returns the matching current fixture. `buildPurchaseLink` uses the `example.invalid` URL asserted above so mock links cannot be mistaken for real affiliate links.

- [ ] **Step 6: Run tests and commit**

Run: `npx vitest run src/lib/marketplace/mock-product-provider.test.ts`

Expected: PASS.

```bash
git add src/lib/marketplace/types.ts src/lib/marketplace/mock-catalog.ts src/lib/marketplace/mock-product-provider.ts src/lib/marketplace/mock-product-provider.test.ts
git commit -m "feat: add mock marketplace providers"
```

---

### Task 3: Match three complete single-platform outfits

**Files:**
- Create: `src/lib/marketplace/outfit-product-matcher.ts`
- Create: `src/lib/marketplace/outfit-product-matcher.test.ts`

**Interfaces:**
- Consumes: `MarketplaceProductProvider`, style title/colors/required items, and `BudgetTierValue`.
- Produces: `matchOutfitProductPlans(input): Promise<OutfitProductPlan[]>` with exactly three plans or a typed `OutfitPlanningError`.

- [ ] **Step 1: Write failing matching tests**

Cover these exact behaviors:

```ts
const completeProviders = [
  createMockProductProvider("TAOBAO"),
  createMockProductProvider("JD"),
];
const matcherInput = {
  budgetTier: "FROM_500_TO_1000" as const,
  providers: completeProviders,
  recommendations: [1, 2, 3].map((rank) => ({
    rank,
    title: `Direction ${rank}`,
    colorPalette: ["brown", "cream"],
    requiredItems: ["top", "bottom", "hat"],
  })),
};

it("returns three complete plans without mixing platforms", async () => {
  const plans = await matchOutfitProductPlans(matcherInput);
  expect(plans).toHaveLength(3);
  for (const plan of plans) {
    expect(new Set(plan.products.map((product) => product.platform)).size)
      .toBe(1);
    expect(plan.products.map((product) => product.category))
      .toEqual(expect.arrayContaining(["TOP", "BOTTOM", "HAT"]));
    expect(plan.totalCents).toBeLessThanOrEqual(100_000);
  }
});

it("tries the other platform instead of mixing when one is incomplete", async () => {
  const taobao = createMockProductProvider("TAOBAO");
  const incompleteTaobao = {
    ...taobao,
    search: vi.fn(async (input: ProductSearchInput) =>
      input.category === "HAT" ? { products: [] } : taobao.search(input)
    ),
  };
  const plans = await matchOutfitProductPlans({
    ...matcherInput,
    providers: [incompleteTaobao, createMockProductProvider("JD")],
  });
  expect(plans[0].platform).toBe("JD");
  expect(plans[0].products.every((product) => product.platform === "JD"))
    .toBe(true);
});
```

Also test that `UNDER_500` never exceeds 50,000 cents and that outerwear is omitted before a required category is sacrificed.

- [ ] **Step 2: Run tests and verify failure**

Run: `npx vitest run src/lib/marketplace/outfit-product-matcher.test.ts`

Expected: FAIL because the matcher does not exist.

- [ ] **Step 3: Implement budget ranges and matching**

Use these exact ranges:

```ts
export const BUDGET_RANGES = {
  UNDER_500: { minCents: 0, maxCents: 50_000 },
  FROM_500_TO_1000: { minCents: 50_000, maxCents: 100_000 },
  FROM_1000_TO_2000: { minCents: 100_000, maxCents: 200_000 },
  ABOVE_2000: { minCents: 200_000, maxCents: null },
} as const;
```

For each recommendation rank, evaluate Taobao and JD independently. Build required categories first, add outerwear only if the total remains under the maximum, score exact colors before adjacent colors, and choose the highest-scoring complete plan. Rotate catalog candidates by rank so the three plans are distinct. Throw `new OutfitPlanningError("NO_COMPLETE_SINGLE_PLATFORM_PLAN")` if fewer than three complete plans can be formed.

- [ ] **Step 4: Run tests and commit**

Run: `npx vitest run src/lib/marketplace/outfit-product-matcher.test.ts`

Expected: PASS.

```bash
git add src/lib/marketplace/outfit-product-matcher.ts src/lib/marketplace/outfit-product-matcher.test.ts
git commit -m "feat: match budget-aware marketplace outfits"
```

---

### Task 4: Persist immutable product snapshots and attach them to diagnosis creation

**Files:**
- Create: `src/lib/marketplace/recommendation-product-service.ts`
- Create: `src/lib/marketplace/recommendation-product-service.test.ts`
- Modify: `src/app/api/diagnosis/route.ts`
- Modify: `src/app/api/diagnosis/route.test.ts`

**Interfaces:**
- Consumes: three persisted recommendations, three `OutfitProductPlan` values, and diagnosis `budgetTier`.
- Produces: `persistRecommendationProductPlans`, `hashProductSnapshots`, and diagnosis creation with ready product plans.

- [ ] **Step 1: Write failing persistence tests**

Assert that the service maps plans by rank, deletes no historical rows during initial creation, writes ordered child rows, stores platform/total/status, and creates a stable hash independent of object key order:

```ts
expect(hashProductSnapshots(products)).toBe(
  hashProductSnapshots(products.map((product) => ({ ...product })))
);
expect(client.recommendationProduct.createMany).toHaveBeenCalledWith({
  data: expect.arrayContaining([
    expect.objectContaining({
      recommendationId: "rec-1",
      platform: "TAOBAO",
      category: "TOP",
      position: 1,
    }),
  ]),
});
```

- [ ] **Step 2: Run tests and verify failure**

Run: `npx vitest run src/lib/marketplace/recommendation-product-service.test.ts`

Expected: FAIL because the service does not exist.

- [ ] **Step 3: Implement snapshot persistence**

Hash only sorted values that bind the image to the purchase cards:

```ts
const canonical = products
  .slice()
  .sort((a, b) => a.position - b.position)
  .map((product) => ({
    platform: product.platform,
    externalProductId: product.externalProductId,
    externalSkuId: product.externalSkuId,
    color: product.color,
    variantLabel: product.variantLabel,
    position: product.position,
  }));
return `sha256:${createHash("sha256")
  .update(JSON.stringify(canonical), "utf8")
  .digest("hex")}`;
```

Persist all three plans in one Prisma transaction. Update each recommendation with `marketplacePlatform`, `productTotalCents`, `productPlanStatus: "READY"`, and `tryOnProductSnapshotHash`.

- [ ] **Step 4: Integrate product planning into diagnosis submission**

Destructure and persist `budgetTier` in `POST /api/diagnosis`. After `persistRecommendationPlan`, load the three saved recommendations ordered by rank, call the mock matcher with each recommendation's title, colors, required items, and the diagnosis budget, then persist the three plans. If planning fails, mark all three `productPlanStatus: "FAILED"` and still return the diagnosis report; do not replace the style recommendation plan.

Update route tests to assert:

```ts
expect(styleDiagnosisCreate).toHaveBeenCalledWith({
  data: expect.objectContaining({
    budgetTier: "FROM_500_TO_1000",
  }),
});
expect(mocks.matchOutfitProductPlans).toHaveBeenCalledOnce();
expect(mocks.persistRecommendationProductPlans).toHaveBeenCalledOnce();
```

- [ ] **Step 5: Run focused tests and commit**

Run: `npx vitest run src/lib/marketplace/recommendation-product-service.test.ts src/app/api/diagnosis/route.test.ts`

Expected: PASS.

```bash
git add src/lib/marketplace/recommendation-product-service.ts src/lib/marketplace/recommendation-product-service.test.ts src/app/api/diagnosis/route.ts src/app/api/diagnosis/route.test.ts
git commit -m "feat: persist marketplace outfit snapshots"
```

---

### Task 5: Build the consent-aware mock try-on state machine

**Files:**
- Create: `src/lib/try-on/types.ts`
- Create: `src/lib/try-on/mock-providers.ts`
- Create: `src/lib/try-on/try-on-orchestrator.ts`
- Create: `src/lib/try-on/try-on-orchestrator.test.ts`

**Interfaces:**
- Consumes: diagnosis ownership-independent data, full-body URL, front-face URL, ordered product snapshots, active consent, and expected workflow status.
- Produces: `runTryOnWorkflow(input, dependencies)` with `COMPLETED`, `FAILED`, `CANCELLED`, or `SKIPPED` result.

- [ ] **Step 1: Write failing workflow tests**

Test these cases with dependency spies:

```ts
const virtualTryOn = {
  name: "mock-vton",
  applyGarment: vi.fn(async ({ personImageUrl }: { personImageUrl: string }) => ({ imageUrl: personImageUrl })),
  applyHat: vi.fn(async ({ personImageUrl }: { personImageUrl: string }) => ({ imageUrl: personImageUrl })),
};
const identityRestore = {
  name: "mock-identity",
  restore: vi.fn(async ({ composedImageUrl }: { composedImageUrl: string }) => ({ imageUrl: composedImageUrl })),
};
const quality = {
  evaluate: vi.fn(async () => ({ passed: true, identityScore: 1, productFidelityScore: 1 })),
};
const persistence = {
  claimAttempt: vi.fn(async () => ({ claimed: true, attemptNumber: 1 })),
  readConsent: vi.fn(async () => true),
  setStatus: vi.fn(async () => undefined),
  persistCompleted: vi.fn(async () => undefined),
  persistFailed: vi.fn(async () => undefined),
  persistCancelled: vi.fn(async () => undefined),
};
const deps = { virtualTryOn, identityRestore, quality, persistence };

function makeInput({ consent = true }: { consent?: boolean } = {}) {
  return {
    diagnosisId: "diag-1",
    recommendationId: "rec-1",
    trigger: "AUTO_PRIMARY" as const,
    expectedStatuses: ["NOT_REQUESTED"] as const,
    consent,
    fullBodyImageUrl: "https://assets.example/body.jpg",
    faceImageUrl: "https://assets.example/face.jpg",
    productSnapshotHash: "sha256:products",
    products: [
      { category: "TOP" as const, imageUrl: "https://assets.example/top.jpg" },
      { category: "BOTTOM" as const, imageUrl: "https://assets.example/bottom.jpg" },
      { category: "HAT" as const, imageUrl: "https://assets.example/hat.jpg" },
    ],
  };
}

it("never calls providers without active consent", async () => {
  const result = await runTryOnWorkflow(makeInput({ consent: false }), deps);
  expect(result).toEqual({ status: "CANCELLED", reason: "CONSENT_REQUIRED" });
  expect(deps.virtualTryOn.applyGarment).not.toHaveBeenCalled();
  expect(deps.identityRestore.restore).not.toHaveBeenCalled();
});

it("auto-retries one failed quality check and then completes", async () => {
  deps.quality.evaluate
    .mockResolvedValueOnce({ passed: false, identityScore: 0.71, productFidelityScore: 0.68 })
    .mockResolvedValueOnce({ passed: true, identityScore: 0.96, productFidelityScore: 0.94 });
  const result = await runTryOnWorkflow(makeInput(), deps);
  expect(result.status).toBe("COMPLETED");
  expect(deps.quality.evaluate).toHaveBeenCalledTimes(2);
});
```

Also assert primary-only automatic eligibility, required `TOP/BOTTOM/HAT`, snapshot-hash equality, compare-and-set claim behavior, and failure after exactly two total attempts.

- [ ] **Step 2: Run tests and verify failure**

Run: `npx vitest run src/lib/try-on/try-on-orchestrator.test.ts`

Expected: FAIL because try-on modules do not exist.

- [ ] **Step 3: Define the Provider contracts**

Use separate contracts:

```ts
export interface VirtualTryOnProvider {
  name: string;
  applyGarment(input: {
    personImageUrl: string;
    productImageUrl: string;
    category: "TOP" | "BOTTOM" | "OUTERWEAR";
  }): Promise<{ imageUrl: string }>;
  applyHat(input: {
    personImageUrl: string;
    productImageUrl: string;
  }): Promise<{ imageUrl: string }>;
}

export interface IdentityRestoreProvider {
  name: string;
  restore(input: {
    composedImageUrl: string;
    faceImageUrl: string;
  }): Promise<{ imageUrl: string }>;
}

export interface TryOnQualityProvider {
  evaluate(input: {
    imageUrl: string;
    faceImageUrl: string;
    productImageUrls: string[];
  }): Promise<{
    passed: boolean;
    identityScore: number;
    productFidelityScore: number;
  }>;
}

export interface TryOnWorkflowPersistence {
  claimAttempt(input: { recommendationId: string; expectedStatuses: readonly string[] }): Promise<{ claimed: boolean; attemptNumber: number }>;
  readConsent(diagnosisId: string): Promise<boolean>;
  setStatus(recommendationId: string, status: string): Promise<void>;
  persistCompleted(input: { recommendationId: string; imageUrl: string; identityScore: number; productFidelityScore: number; providerName: string }): Promise<void>;
  persistFailed(input: { recommendationId: string; failureCode: string }): Promise<void>;
  persistCancelled(input: { recommendationId: string; reason: string }): Promise<void>;
}
```

- [ ] **Step 4: Implement deterministic mock providers**

The mock virtual try-on returns the current person URL while recording each requested layer; the mock identity provider returns that URL unchanged; the mock quality provider returns scores from environment-independent constructor inputs, defaulting to `{ passed: true, identityScore: 1, productFidelityScore: 1 }`. The result disclosure must remain `MOCK`; never label an unchanged photo as a real garment transformation.

- [ ] **Step 5: Implement the orchestrator**

The orchestrator must:

1. Load current consent and recommendation state inside the attempt claim.
2. Return `CANCELLED` before reading photo URLs when consent is inactive.
3. Claim only `NOT_REQUESTED` or `FAILED` via `updateMany` compare-and-set.
4. Set stage states before each provider call.
5. Apply garments in `TOP`, `BOTTOM`, `OUTERWEAR` order and `HAT` last.
6. Re-read consent before identity restoration.
7. Run quality evaluation.
8. Retry the full composition once when quality fails.
9. Persist only a passing result and its scores.
10. Persist `FAILED` with a stable safe code after two attempts.

For anonymous diagnoses, calculate `tryOnExpiresAt` as `diagnosis.createdAt + 30 days`; authenticated diagnoses use `null`.

- [ ] **Step 6: Run tests and commit**

Run: `npx vitest run src/lib/try-on/try-on-orchestrator.test.ts`

Expected: PASS.

```bash
git add src/lib/try-on/types.ts src/lib/try-on/mock-providers.ts src/lib/try-on/try-on-orchestrator.ts src/lib/try-on/try-on-orchestrator.test.ts
git commit -m "feat: add mock virtual try-on workflow"
```

---

### Task 6: Auto-run the primary and expose consent/on-demand APIs

**Files:**
- Modify: `src/app/api/diagnosis/route.ts`
- Modify: `src/app/api/diagnosis/route.test.ts`
- Create: `src/app/api/diagnosis/[id]/recommendations/[recommendationId]/try-on/route.ts`
- Create: `src/app/api/diagnosis/[id]/recommendations/[recommendationId]/try-on/route.test.ts`
- Create: `src/app/api/diagnosis/[id]/try-on-consent/route.ts`
- Create: `src/app/api/diagnosis/[id]/try-on-consent/route.test.ts`

**Interfaces:**
- Consumes: existing auth/anonymous ownership resolution and `runTryOnWorkflow`.
- Produces: automatic primary generation, explicit alternative/retry generation, and consent grant/revoke.

- [ ] **Step 1: Write failing route tests**

For diagnosis creation, assert active consent calls the orchestrator for only rank 1, while inactive consent calls it zero times.

For the recommendation endpoint, assert:

```ts
const request = new NextRequest(
  "http://localhost/api/diagnosis/diag-1/recommendations/rec-2/try-on",
  { method: "POST" }
);
const response = await POST(request, {
  params: Promise.resolve({ id: "diag-1", recommendationId: "rec-2" }),
});
expect(response.status).toBe(200);
expect(mocks.runTryOnWorkflow).toHaveBeenCalledWith(
  expect.objectContaining({ recommendationId: "rec-2", trigger: "USER_REQUEST" })
);
```

Also cover 403 for wrong owner, 409 for inactive consent, 409 for non-ready product plan, 409 for an already processing workflow, and success for retrying `FAILED`.

For consent, test `{ consent: true }` sets `faceTryOnConsentAt` and clears `faceTryOnRevokedAt`; `{ consent: false, deleteGenerated: true }` sets revoked time, cancels pending workflows, and clears try-on URLs.

- [ ] **Step 2: Run route tests and verify failure**

Run: `npx vitest run src/app/api/diagnosis/route.test.ts 'src/app/api/diagnosis/[id]/recommendations/[recommendationId]/try-on/route.test.ts' 'src/app/api/diagnosis/[id]/try-on-consent/route.test.ts'`

Expected: FAIL because the endpoints and integration are missing.

- [ ] **Step 3: Auto-run only the authorized primary recommendation**

After product persistence in the diagnosis route, call:

```ts
if (faceTryOnConsent) {
  const primary = savedRecommendations.find((item) => item.isPrimary);
  if (primary) {
    await runTryOnWorkflow({
      diagnosisId: diagnosis.id,
      recommendationId: primary.id,
      trigger: "AUTO_PRIMARY",
      expectedStatuses: ["NOT_REQUESTED"],
    });
  }
}
```

Mock generation failure must not turn a successful diagnosis submission into HTTP 500. Record the safe workflow failure and return the report ID.

- [ ] **Step 4: Implement the owned recommendation endpoint**

Resolve the viewer exactly as the existing diagnosis detail route does. Load the diagnosis, requested recommendation, products, and photos in one query. Verify ownership before returning any state. Reject inactive consent or stale/incomplete product plans. Pass only the full-body URL, front-face URL, and selected product image URLs into the orchestrator after authorization succeeds.

- [ ] **Step 5: Implement consent grant/revoke**

Validate with:

```ts
const consentBodySchema = z.object({
  consent: z.boolean(),
  deleteGenerated: z.boolean().default(false),
});
```

Granting consent updates timestamps but does not automatically generate alternatives. Revoking consent atomically changes eligible `QUEUED`/`FAILED` workflows to `CANCELLED`; when `deleteGenerated` is true, clear `tryOnImageUrl`, set `tryOnImageStatus: "PENDING"`, and set `tryOnWorkflowStatus: "CANCELLED"`.

- [ ] **Step 6: Run tests and commit**

Run: `npx vitest run src/app/api/diagnosis/route.test.ts 'src/app/api/diagnosis/[id]/recommendations/[recommendationId]/try-on/route.test.ts' 'src/app/api/diagnosis/[id]/try-on-consent/route.test.ts'`

Expected: PASS.

```bash
git add src/app/api/diagnosis/route.ts src/app/api/diagnosis/route.test.ts 'src/app/api/diagnosis/[id]/recommendations/[recommendationId]/try-on/route.ts' 'src/app/api/diagnosis/[id]/recommendations/[recommendationId]/try-on/route.test.ts' 'src/app/api/diagnosis/[id]/try-on-consent/route.ts' 'src/app/api/diagnosis/[id]/try-on-consent/route.test.ts'
git commit -m "feat: expose automatic and on-demand try-on APIs"
```

---

### Task 7: Project marketplace products into the report API

**Files:**
- Modify: `src/types/diagnosis.ts`
- Modify: `src/lib/diagnosis/report-display-model.ts`
- Modify: `src/lib/diagnosis/report-display-model.test.ts`
- Modify: `src/lib/diagnosis-service.ts`
- Modify: `src/lib/diagnosis-service.test.ts`

**Interfaces:**
- Consumes: `RecommendationProduct[]` and recommendation workflow metadata.
- Produces: `ReportMarketplaceProduct`, `ReportTryOnState`, and public recommendation fields used by result components.

- [ ] **Step 1: Write failing projection tests**

Extend record fixtures with normalized products. Assert V2 content still comes from immutable archetype snapshots, while marketplace products come from the new relation:

```ts
expect(primary).toMatchObject({
  marketplacePlatform: "TAOBAO",
  productTotalCents: 88_600,
  productPlanStatus: "READY",
  tryOnWorkflowStatus: "COMPLETED",
});
expect(primary.products.map((product) => product.category)).toEqual([
  "TOP",
  "BOTTOM",
  "OUTERWEAR",
  "HAT",
]);
```

Assert `getDiagnosisDetailForViewer` includes `budgetTier` and orders products by `position`.

- [ ] **Step 2: Run tests and verify failure**

Run: `npx vitest run src/lib/diagnosis/report-display-model.test.ts src/lib/diagnosis-service.test.ts`

Expected: FAIL because report types and query relations do not include marketplace data.

- [ ] **Step 3: Add public report types**

Define:

```ts
export interface ReportMarketplaceProduct {
  id: string;
  platform: "TAOBAO" | "JD";
  category: "TOP" | "BOTTOM" | "OUTERWEAR" | "HAT";
  title: string;
  imageUrl: string;
  purchaseUrl: string;
  priceCents: number;
  currency: string;
  sellerName: string;
  color: string;
  variantLabel: string;
  isOptional: boolean;
  availabilityStatus: "AVAILABLE" | "UNAVAILABLE" | "UNKNOWN";
  snapshotAt: string;
}
```

Add `products`, `marketplacePlatform`, `productTotalCents`, `productPlanStatus`, `tryOnWorkflowStatus`, `tryOnAttemptCount`, `identityScore`, `productFidelityScore`, `tryOnExpiresAt`, and `tryOnProductSnapshotHash` to `BaseReportRecommendation`. Add `budgetTier` and `faceTryOnConsent` to `DiagnosisDetail`.

- [ ] **Step 4: Include and map products**

Update the Prisma query to include:

```ts
recommendations: {
  orderBy: { rank: "asc" },
  include: { products: { orderBy: { position: "asc" } } },
},
```

Map `snapshotAt` to ISO text at the public API boundary. Preserve the existing legacy relation fallback query only for archetype metadata; product data must remain from the first owned diagnosis query.

- [ ] **Step 5: Run tests and commit**

Run: `npx vitest run src/lib/diagnosis/report-display-model.test.ts src/lib/diagnosis-service.test.ts`

Expected: PASS.

```bash
git add src/types/diagnosis.ts src/lib/diagnosis/report-display-model.ts src/lib/diagnosis/report-display-model.test.ts src/lib/diagnosis-service.ts src/lib/diagnosis-service.test.ts
git commit -m "feat: expose marketplace try-on report data"
```

---

### Task 8: Add budget input and editorial marketplace result UI

**Files:**
- Modify: `src/app/diagnosis/page.tsx`
- Modify: `src/app/diagnosis/[id]/page.tsx`
- Create: `src/components/diagnosis/marketplace-product-grid.tsx`
- Create: `src/components/diagnosis/try-on-status-panel.tsx`
- Modify: `src/components/diagnosis/primary-style-direction.tsx`
- Modify: `src/components/diagnosis/alternative-style-card.tsx`
- Modify: `src/components/diagnosis/style-preview-image.tsx`
- Create: `src/components/diagnosis/marketplace-report.test.tsx`
- Modify: `src/components/diagnosis/diagnosis-workspace.test.tsx`

**Interfaces:**
- Consumes: report product/workflow types and recommendation try-on endpoint.
- Produces: budget form input, editorial product cards, safe mock disclosure, primary status, and alternative generate/retry actions.

- [ ] **Step 1: Write failing static rendering tests**

Render a completed primary product grid and a not-requested alternative. Assert:

```ts
expect(primaryHtml).toContain("淘宝精选");
expect(primaryHtml).toContain("¥886.00");
expect(primaryHtml).toContain("查看淘宝整套购买清单");
expect(primaryHtml).toContain("模拟试穿流程");
expect(alternativeHtml).toContain("生成这套试穿");
expect(alternativeHtml).not.toContain("本人试穿已完成");
```

Extend the diagnosis workspace source test to require all four budget labels and `budgetTier` in the submitted payload.

- [ ] **Step 2: Run component tests and verify failure**

Run: `npx vitest run src/components/diagnosis/marketplace-report.test.tsx src/components/diagnosis/diagnosis-workspace.test.tsx`

Expected: FAIL because budget and marketplace components are missing.

- [ ] **Step 3: Add budget selection to the diagnosis form**

Add `budgetTier` to form state with an empty initial value. Render four buttons with labels `500 元以内`, `500–1000 元`, `1000–2000 元`, and `2000 元以上`. Include it in `validateForm` and `canSubmit`. Keep consent optional and update the disclosure so it says authorized users automatically receive the primary personal try-on while unconsented users still receive the report and product plan.

- [ ] **Step 4: Build the editorial product grid**

`MarketplaceProductGrid` must:

- render ordered product images, categories, title, selected variant, seller, and formatted CNY price;
- display the plan platform once at section level;
- mark unavailable products and disable only their individual links;
- use `target="_blank"` and `rel="noopener noreferrer sponsored"` for purchase links;
- show `价格与库存以平台页面为准` next to the snapshot time;
- label `example.invalid` links as `模拟购买入口`.

Use `new Intl.NumberFormat("zh-CN", { style: "currency", currency: "CNY" })` for prices.

- [ ] **Step 5: Build safe workflow states**

Map internal statuses to these exact user messages:

```ts
export const TRY_ON_STATUS_COPY = {
  NOT_REQUESTED: "尚未生成本人试穿",
  QUEUED: "本人试穿已进入队列",
  APPLYING_GARMENTS: "正在换上推荐服装",
  APPLYING_HAT: "正在搭配推荐帽子",
  RESTORING_IDENTITY: "正在保留你的面部特征",
  QUALITY_CHECKING: "正在检查试穿效果",
  COMPLETED: "本人试穿已完成",
  FAILED: "本人试穿暂不可用",
  CANCELLED: "本人试穿授权已撤回",
  EXPIRED: "图片已过期，请重新上传后生成",
} as const;
```

Do not show Provider errors. Display `模拟试穿流程：当前图片用于验证产品流程，不代表真实换装效果` whenever `tryOnProvider === "mock"`.

- [ ] **Step 6: Wire primary and alternative interactions**

Pass an `onGenerateTryOn(recommendationId)` callback from the report page. POST to the recommendation try-on endpoint, disable the clicked card while the request runs, then call `fetchDiagnosis`. Primary `FAILED` shows `重新生成本人试穿`; alternatives `NOT_REQUESTED` show `生成这套试穿`; alternatives must not auto-post in a React effect. When `faceTryOnConsent` is false, show `授权并生成本人试穿`; that action first POSTs `{ consent: true, deleteGenerated: false }` to the consent endpoint, refreshes the diagnosis, and then POSTs only the primary recommendation try-on endpoint. Add a component test asserting an unconsented report renders the authorization action and does not render a completed-personal-try-on label.

- [ ] **Step 7: Run tests and commit**

Run: `npx vitest run src/components/diagnosis/marketplace-report.test.tsx src/components/diagnosis/diagnosis-workspace.test.tsx src/components/diagnosis/report-components.test.tsx`

Expected: PASS.

```bash
git add src/app/diagnosis/page.tsx 'src/app/diagnosis/[id]/page.tsx' src/components/diagnosis/marketplace-product-grid.tsx src/components/diagnosis/try-on-status-panel.tsx src/components/diagnosis/primary-style-direction.tsx src/components/diagnosis/alternative-style-card.tsx src/components/diagnosis/style-preview-image.tsx src/components/diagnosis/marketplace-report.test.tsx src/components/diagnosis/diagnosis-workspace.test.tsx
git commit -m "feat: render editorial marketplace try-on report"
```

---

### Task 9: Add the 30-day anonymous media cleanup path

**Files:**
- Modify: `src/lib/r2.ts`
- Create: `src/lib/retention/anonymous-media-retention.ts`
- Create: `src/lib/retention/anonymous-media-retention.test.ts`
- Create: `scripts/cleanup-expired-anonymous-media.ts`
- Modify: `package.json`

**Interfaces:**
- Consumes: anonymous diagnoses older than 30 days, related media keys, and try-on URLs.
- Produces: `cleanupExpiredAnonymousMedia({ client, deleteObject, now })` and `npm run cleanup:anonymous-media`.

- [ ] **Step 1: Write failing retention tests**

Use a fixed clock and assert the boundary:

```ts
it("expires anonymous media at 30 days but preserves authenticated media", async () => {
  const now = new Date("2026-08-20T00:00:00.000Z");
  await cleanupExpiredAnonymousMedia({ client, deleteObject, now });
  expect(client.styleDiagnosis.findMany).toHaveBeenCalledWith(
    expect.objectContaining({
      where: expect.objectContaining({
        userId: null,
        anonymousSessionId: { not: null },
        createdAt: { lte: new Date("2026-07-21T00:00:00.000Z") },
      }),
    })
  );
  expect(deleteObject).toHaveBeenCalledWith({ bucket: "bucket", key: "face/front.jpg" });
});
```

Also assert one object deletion failure does not mark that asset deleted, successful rows set `MediaAsset.deletedAt`, recommendation try-on fields become `EXPIRED`/null, and no signed/public URL is logged.

- [ ] **Step 2: Run tests and verify failure**

Run: `npx vitest run src/lib/retention/anonymous-media-retention.test.ts`

Expected: FAIL because cleanup functions do not exist.

- [ ] **Step 3: Add R2 deletion**

Import `DeleteObjectCommand` and add:

```ts
export async function deleteObjectFromR2(input: {
  bucket: string;
  key: string;
}): Promise<void> {
  await getR2Client().send(new DeleteObjectCommand({
    Bucket: input.bucket,
    Key: input.key,
  }));
}
```

- [ ] **Step 4: Implement idempotent cleanup**

Query anonymous diagnoses at or older than `now - 30 days`, include uploaded media assets and recommendations with try-on URLs. For every undeleted asset, delete the R2 key first, then set `deletedAt`; if deletion fails, record only `{ mediaAssetId, errorCode: "R2_DELETE_FAILED" }` and continue. After all related object operations succeed, clear recommendation try-on URLs, set image status `PENDING`, workflow status `EXPIRED`, and set diagnosis `deletedAt`. A second run must make no delete calls for already deleted assets.

- [ ] **Step 5: Add the script entry point**

Create a script that calls the cleanup function with `prisma`, `deleteObjectFromR2`, and `new Date()`, prints only aggregate counts, disconnects Prisma in `finally`, and exits nonzero only for a top-level failure. Add:

```json
"cleanup:anonymous-media": "tsx scripts/cleanup-expired-anonymous-media.ts"
```

- [ ] **Step 6: Run tests and commit**

Run: `npx vitest run src/lib/retention/anonymous-media-retention.test.ts`

Expected: PASS.

```bash
git add src/lib/r2.ts src/lib/retention/anonymous-media-retention.ts src/lib/retention/anonymous-media-retention.test.ts scripts/cleanup-expired-anonymous-media.ts package.json
git commit -m "feat: expire anonymous try-on media"
```

---

### Task 10: Run the complete mock-flow verification gate

**Files:**
- Modify only files required to resolve failures caused by Tasks 1–9.

**Interfaces:**
- Consumes: all preceding deliverables.
- Produces: a clean typecheck, lint, full test suite, production build, migration validation, and manual mock-flow evidence.

- [ ] **Step 1: Validate the migration and generated client**

Run: `npx prisma validate`

Expected: `The schema at prisma/schema.prisma is valid`.

Run: `npx prisma generate`

Expected: Prisma Client generation succeeds.

- [ ] **Step 2: Run all automated checks**

Run: `npm test`

Expected: all Vitest files pass.

Run: `npx tsc --noEmit`

Expected: exit code 0 and no diagnostics.

Run: `npm run lint`

Expected: exit code 0 and no ESLint errors.

Run: `npm run build`

Expected: Next.js production build completes successfully.

- [ ] **Step 3: Apply the migration in the configured local/test database**

Run: `npx prisma migrate deploy`

Expected: migration `20260720090000_add_marketplace_mock_try_on` is applied or reported as already applied.

- [ ] **Step 4: Perform an authorized manual smoke test**

Run: `npm run dev`

Expected flow:

1. Open `/diagnosis` in a fresh anonymous session.
2. Upload three valid images.
3. Select `500–1000 元` and grant face try-on consent.
4. Submit and open the report.
5. Verify three complete product plans exist and each plan has one platform only.
6. Verify the primary is automatically `COMPLETED` with an explicit mock disclosure.
7. Verify alternatives show product cards but no completed try-on.
8. Click one alternative's generate button and verify only that recommendation completes.
9. Verify every displayed mock link uses `example.invalid` and is labeled as simulated.

- [ ] **Step 5: Perform an unconsented manual smoke test**

Expected flow:

1. Create a second diagnosis without consent.
2. Verify the style report and three product plans still appear.
3. Verify no recommendation has a completed personal try-on.
4. Grant consent from the result flow.
5. Generate the primary and verify the report refreshes safely.

- [ ] **Step 6: Verify cleanup in dry fixture data**

Create an anonymous diagnosis fixture older than 30 days in the test database with test-only R2 keys, run `npm run cleanup:anonymous-media`, and verify aggregate counts and `EXPIRED` workflow state. Do not point this command at production credentials during this phase.

- [ ] **Step 7: Commit verification-only fixes**

If verification changes a file, return to the task that owns that file, rerun that task's focused test command, and use that task's exact staging and commit command. If no files changed, do not create an empty commit.

---

## Phase Completion Boundary

This plan is complete when the mock flow passes Task 10. Real virtual try-on/identity/quality Providers and real Taobao/JD affiliate adapters require separate implementation plans based on measured mock-flow behavior and available credentials. The mock disclosure must remain visible until a real Provider passes its own controlled end-to-end acceptance run.
