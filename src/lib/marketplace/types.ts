export type MarketplacePlatformValue = "TAOBAO" | "JD";
export type ProductCategoryValue = "TOP" | "BOTTOM" | "OUTERWEAR" | "HAT";
export type BudgetTierValue =
  | "UNDER_500"
  | "FROM_500_TO_1000"
  | "FROM_1000_TO_2000"
  | "ABOVE_2000";

export const BUDGET_RANGES = {
  UNDER_500: { minCents: 0, maxCents: 50_000 },
  FROM_500_TO_1000: { minCents: 50_000, maxCents: 100_000 },
  FROM_1000_TO_2000: { minCents: 100_000, maxCents: 200_000 },
  ABOVE_2000: { minCents: 200_000, maxCents: null },
} as const satisfies Record<
  BudgetTierValue,
  { minCents: number; maxCents: number | null }
>;

export function budgetRangeForTier(tier: BudgetTierValue) {
  return BUDGET_RANGES[tier];
}

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
