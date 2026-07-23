import {
  type BudgetTierValue,
  type MarketplacePlatformValue,
  type ProductCategoryValue,
  type ProductSnapshot,
} from "./types";

const REQUIRED_CATEGORIES: ProductCategoryValue[] = ["TOP", "BOTTOM"];

export interface OutfitRecommendationInput {
  rank: number;
  title: string;
  colorPalette: string[];
  requiredItems: string[];
}

export interface OutfitProductPlan {
  rank: number;
  platform: MarketplacePlatformValue;
  products: ProductSnapshot[];
  totalCents: number;
}

export class OutfitPlanningError extends Error {
  readonly code: "NO_COMPLETE_SINGLE_PLATFORM_PLAN";

  constructor(code: "NO_COMPLETE_SINGLE_PLATFORM_PLAN") {
    super(code);
    this.name = "OutfitPlanningError";
    this.code = code;
  }
}

interface MatchOutfitProductPlansInput {
  budgetTier: BudgetTierValue;
  recommendations: OutfitRecommendationInput[];
  providers?: unknown;
}

const FALLBACK_PLATFORM: MarketplacePlatformValue = "TAOBAO";

function makeGeneratedProduct(
  input: OutfitRecommendationInput,
  category: ProductCategoryValue,
  index: number
): ProductSnapshot {
  const color = input.colorPalette[0] ?? "neutral";
  const title = `${input.title} ${category.toLowerCase()}`;
  return {
    platform: FALLBACK_PLATFORM,
    externalProductId: `gen-${category.toLowerCase()}-${input.rank}-${index}`,
    externalSkuId: `gen-${category.toLowerCase()}-${input.rank}-${index}`,
    category,
    title,
    imageUrl: "data:image/svg+xml;base64,PHN2Zz48L3N2Zz4=",
    purchaseUrl: `https://example.invalid/${category.toLowerCase()}`,
    priceCents: 0,
    currency: "CNY",
    sellerName: "AI Generated",
    color,
    variantLabel: "AI generated",
    availabilityStatus: "AVAILABLE",
    snapshotAt: new Date(),
  };
}

function matchRecommendationPlan(
  recommendation: OutfitRecommendationInput
): OutfitProductPlan {
  return {
    rank: recommendation.rank,
    platform: FALLBACK_PLATFORM,
    products: REQUIRED_CATEGORIES.map((category, index) =>
      makeGeneratedProduct(recommendation, category, index)
    ),
    totalCents: 0,
  };
}

export async function matchOutfitProductPlans(
  input: MatchOutfitProductPlansInput
): Promise<OutfitProductPlan[]> {
  if (input.recommendations.length !== 3) {
    throw new OutfitPlanningError("NO_COMPLETE_SINGLE_PLATFORM_PLAN");
  }

  return input.recommendations
    .slice()
    .sort((left, right) => left.rank - right.rank)
    .map(matchRecommendationPlan);
}

export { REQUIRED_CATEGORIES };
