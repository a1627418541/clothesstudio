import type { ReportRecommendation } from "@/types/diagnosis";

const PLATFORM_LABELS = {
  TAOBAO: "淘宝精选",
  JD: "京东精选",
} as const;

const CATEGORY_LABELS = {
  TOP: "上装",
  BOTTOM: "下装",
  OUTERWEAR: "外套",
  HAT: "帽子",
} as const;

function isMockPurchaseUrl(url: string) {
  try {
    return new URL(url).hostname === "example.invalid";
  } catch {
    return false;
  }
}

export function MarketplaceProductGrid({
  recommendation,
}: {
  recommendation: ReportRecommendation;
}) {
  if (recommendation.products.length === 0) return null;

  const platform = recommendation.marketplacePlatform ?? recommendation.products[0].platform;
  const platformLabel = PLATFORM_LABELS[platform];
  const availableProducts = recommendation.products.filter(
    (product) => product.availabilityStatus === "AVAILABLE"
  );
  const collectionUrl = availableProducts[0]?.purchaseUrl;
  const collectionIsMock = collectionUrl ? isMockPurchaseUrl(collectionUrl) : false;

  return (
    <section className="mt-8 border-t border-[var(--line)] pt-7" aria-label="推荐实际单品">
      <div>
        <p className="text-xs font-semibold uppercase tracking-[0.16em] text-[var(--oxblood)]">
          {platformLabel}
        </p>
        <h3 className="mt-2 font-editorial text-3xl font-medium text-[var(--ink)]">本套实际单品</h3>
      </div>

      <div className="mt-5 grid gap-3 sm:grid-cols-2">
        {recommendation.products.map((product) => {
          const available = product.availabilityStatus === "AVAILABLE";
          const mockPurchase = isMockPurchaseUrl(product.purchaseUrl);

          return (
            <article key={product.id} className="grid grid-cols-[84px_1fr] gap-4 border border-[var(--line)] bg-[var(--paper)] p-3">
              {/* Marketplace snapshots can come from remote product CDNs. */}
              {/* eslint-disable-next-line @next/next/no-img-element */}
              <img
                src={product.imageUrl}
                alt=""
                className="aspect-square h-[84px] w-[84px] object-cover"
              />
              <div className="min-w-0">
                <p className="text-[10px] font-semibold uppercase tracking-[0.14em] text-[var(--oxblood)]">
                  {CATEGORY_LABELS[product.category]}
                  {product.isOptional ? " · 可选" : ""}
                </p>
                <h4 className="mt-1 line-clamp-2 text-sm font-semibold leading-5 text-[var(--ink)]">{product.title}</h4>
                <p className="mt-1 truncate text-xs text-[var(--muted-ink)]">
                  {product.variantLabel} · {product.sellerName}
                </p>
                {available ? (
                  <a
                    href={product.purchaseUrl}
                    target="_blank"
                    rel="noopener noreferrer sponsored"
                    className="mt-2 inline-block text-xs font-semibold text-[var(--oxblood)] hover:underline"
                  >
                    {mockPurchase ? "模拟购买入口" : "查看单品"}
                  </a>
                ) : (
                  <span className="mt-2 inline-block cursor-not-allowed text-xs text-[var(--muted-ink)]" aria-disabled="true">
                    当前不可购买
                  </span>
                )}
              </div>
            </article>
          );
        })}
      </div>

      {collectionUrl ? (
        <a
          href={collectionUrl}
          target="_blank"
          rel="noopener noreferrer sponsored"
          className="editorial-button mt-5 w-full justify-center px-6"
        >
          {collectionIsMock ? "模拟购买入口 · " : ""}查看{platform === "TAOBAO" ? "淘宝" : "京东"}整套购买清单
        </a>
      ) : null}
    </section>
  );
}
