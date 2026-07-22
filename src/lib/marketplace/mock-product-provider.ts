import { MOCK_PRODUCT_CATALOG, type MockCatalogProduct } from "./mock-catalog";
import type {
  MarketplacePlatformValue,
  MarketplaceProductProvider,
  ProductSearchInput,
  ProductSnapshot,
} from "./types";

function normalized(values: string[]): Set<string> {
  return new Set(values.map((value) => value.trim().toLowerCase()).filter(Boolean));
}

function relevanceScore(
  product: MockCatalogProduct,
  colors: Set<string>,
  keywords: Set<string>
): number {
  let score = colors.has(product.color.toLowerCase()) ? 1_000 : 0;
  const searchable = `${product.title} ${product.keywords.join(" ")}`.toLowerCase();

  for (const keyword of keywords) {
    if (searchable.includes(keyword)) {
      score += 10;
    }
  }

  return score;
}

function toSnapshot(product: MockCatalogProduct): ProductSnapshot {
  const { keywords, ...snapshot } = product;
  void keywords;
  return { ...snapshot, snapshotAt: new Date(snapshot.snapshotAt) };
}

function mockPurchaseLink(
  platform: MarketplacePlatformValue,
  externalProductId: string,
  externalSkuId: string
): string {
  return `https://example.invalid/${platform.toLowerCase()}/product/${encodeURIComponent(externalProductId)}?sku=${encodeURIComponent(externalSkuId)}`;
}

export function createMockProductProvider(
  platform: MarketplacePlatformValue
): MarketplaceProductProvider {
  const platformProducts = MOCK_PRODUCT_CATALOG.filter(
    (product) => product.platform === platform
  );

  return {
    platform,

    async search(input: ProductSearchInput) {
      const colors = normalized(input.colors);
      const keywords = normalized(input.keywords);
      const products = platformProducts
        .filter(
          (product) =>
            product.category === input.category &&
            product.availabilityStatus === "AVAILABLE" &&
            product.priceCents >= input.minPriceCents &&
            (input.maxPriceCents === null ||
              product.priceCents <= input.maxPriceCents)
        )
        .sort((left, right) => {
          const scoreDifference =
            relevanceScore(right, colors, keywords) -
            relevanceScore(left, colors, keywords);
          return (
            scoreDifference ||
            left.externalProductId.localeCompare(right.externalProductId) ||
            left.externalSkuId.localeCompare(right.externalSkuId)
          );
        })
        .slice(0, Math.max(0, input.limit))
        .map(toSnapshot);

      return { products };
    },

    async refresh(input) {
      const product = platformProducts.find(
        (candidate) =>
          candidate.externalProductId === input.externalProductId &&
          candidate.externalSkuId === input.externalSkuId
      );
      return product ? toSnapshot(product) : null;
    },

    async buildPurchaseLink(input) {
      return mockPurchaseLink(
        platform,
        input.externalProductId,
        input.externalSkuId
      );
    },
  };
}
