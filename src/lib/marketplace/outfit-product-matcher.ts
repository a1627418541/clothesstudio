import {
  budgetRangeForTier,
  type BudgetTierValue,
  type MarketplacePlatformValue,
  type MarketplaceProductProvider,
  type ProductCategoryValue,
  type ProductSnapshot,
} from "./types";

const REQUIRED_CATEGORIES = ["TOP", "BOTTOM", "HAT"] as const;

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
  providers: MarketplaceProductProvider[];
  recommendations: OutfitRecommendationInput[];
}

interface ScoredPlan extends OutfitProductPlan {
  score: number;
  sequence: number;
}

function productScore(product: ProductSnapshot, colors: Set<string>): number {
  return colors.has(product.color.toLowerCase()) ? 100 : 0;
}

async function planForProvider(input: {
  provider: MarketplaceProductProvider;
  recommendation: OutfitRecommendationInput;
  budgetTier: BudgetTierValue;
}): Promise<ScoredPlan | null> {
  const { provider, recommendation, budgetTier } = input;
  const budget = budgetRangeForTier(budgetTier);
  const searchInput = (category: ProductCategoryValue) =>
    provider.search({
      category,
      colors: recommendation.colorPalette,
      keywords: [recommendation.title, ...recommendation.requiredItems],
      minPriceCents: 0,
      maxPriceCents: budget.maxCents,
      limit: 20,
    });
  const [topsResult, bottomsResult, hatsResult, outerwearResult] =
    await Promise.all([
      searchInput("TOP"),
      searchInput("BOTTOM"),
      searchInput("HAT"),
      searchInput("OUTERWEAR"),
    ]);
  const offset = Math.max(0, recommendation.rank - 1);
  const onlyProviderProducts = (products: ProductSnapshot[]) =>
    products.filter((product) => product.platform === provider.platform);
  const tops = onlyProviderProducts(topsResult.products);
  const bottoms = onlyProviderProducts(bottomsResult.products);
  const hats = onlyProviderProducts(hatsResult.products);
  const outerwear = onlyProviderProducts(outerwearResult.products);

  if ([tops, bottoms, hats].some((products) => products.length === 0)) {
    return null;
  }

  const colors = new Set(
    recommendation.colorPalette.map((color) => color.trim().toLowerCase())
  );
  const candidates: ScoredPlan[] = [];
  let sequence = 0;

  for (const top of tops) {
    for (const bottom of bottoms) {
      for (const hat of hats) {
        for (const optionalOuterwear of [undefined, ...outerwear]) {
          const products = [
            top,
            bottom,
            ...(optionalOuterwear ? [optionalOuterwear] : []),
            hat,
          ];
          const totalCents = products.reduce(
            (total, product) => total + product.priceCents,
            0
          );
          const withinMaximum =
            budget.maxCents === null || totalCents <= budget.maxCents;
          if (totalCents < budget.minCents || !withinMaximum) continue;

          candidates.push({
            rank: recommendation.rank,
            platform: provider.platform,
            products,
            totalCents,
            score:
              products.reduce(
                (total, product) => total + productScore(product, colors),
                0
              ) + (optionalOuterwear ? 5 : 0),
            sequence: sequence++,
          });
        }
      }
    }
  }

  candidates.sort(
    (left, right) => right.score - left.score || left.sequence - right.sequence
  );
  return candidates[offset % candidates.length] ?? null;
}

export async function matchOutfitProductPlans(
  input: MatchOutfitProductPlansInput
): Promise<OutfitProductPlan[]> {
  if (input.recommendations.length !== 3) {
    throw new OutfitPlanningError("NO_COMPLETE_SINGLE_PLATFORM_PLAN");
  }

  const plans: OutfitProductPlan[] = [];
  for (const recommendation of [...input.recommendations].sort(
    (left, right) => left.rank - right.rank
  )) {
    const candidates = (
      await Promise.all(
        input.providers.map((provider) =>
          planForProvider({
            provider,
            recommendation,
            budgetTier: input.budgetTier,
          })
        )
      )
    ).filter((candidate): candidate is ScoredPlan => candidate !== null);
    candidates.sort((left, right) => right.score - left.score);
    const selected = candidates[0];
    if (!selected) {
      throw new OutfitPlanningError("NO_COMPLETE_SINGLE_PLATFORM_PLAN");
    }
    plans.push({
      rank: selected.rank,
      platform: selected.platform,
      products: selected.products,
      totalCents: selected.totalCents,
    });
  }

  if (plans.length !== 3) {
    throw new OutfitPlanningError("NO_COMPLETE_SINGLE_PLATFORM_PLAN");
  }
  return plans;
}

export { REQUIRED_CATEGORIES };
