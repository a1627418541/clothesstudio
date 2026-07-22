import type {
  MarketplacePlatformValue,
  ProductCategoryValue,
  ProductSnapshot,
} from "./types";

export interface MockCatalogProduct extends ProductSnapshot {
  keywords: string[];
}

type ProductDefinition = readonly [
  platform: MarketplacePlatformValue,
  category: ProductCategoryValue,
  externalProductId: string,
  color: string,
  priceCents: number,
  title: string,
  variantLabel: string,
  imageColor: string,
  keywords: readonly string[],
];

const PRODUCT_DEFINITIONS: readonly ProductDefinition[] = [
  ["TAOBAO", "TOP", "taobao-top-001", "cream", 12_900, "奶油色日常针织上衣", "奶油色 / M", "#eadfce", ["clean", "knit", "daily"]],
  ["TAOBAO", "TOP", "taobao-top-002", "brown", 89_900, "复古棕羊绒上衣", "焦糖棕 / M", "#a77b5b", ["retro", "premium", "cashmere"]],
  ["TAOBAO", "BOTTOM", "taobao-bottom-001", "brown", 15_900, "咖色直筒长裤", "咖色 / M", "#9a765f", ["straight", "daily", "clean"]],
  ["TAOBAO", "BOTTOM", "taobao-bottom-002", "cream", 99_900, "象牙白羊毛阔腿裤", "象牙白 / M", "#e8e0d3", ["premium", "wide-leg", "wool"]],
  ["TAOBAO", "OUTERWEAR", "taobao-outerwear-001", "brown", 29_900, "复古棕短款夹克", "棕色 / M", "#8d6248", ["retro", "jacket", "urban"]],
  ["TAOBAO", "OUTERWEAR", "taobao-outerwear-002", "cream", 79_900, "米白羊毛大衣", "米白 / M", "#ddd2c2", ["classic", "coat", "wool"]],
  ["TAOBAO", "HAT", "taobao-hat-001", "brown", 5_900, "复古棕灯芯绒帽", "棕色 / 均码", "#9b7257", ["retro", "corduroy", "casual"]],
  ["TAOBAO", "HAT", "taobao-hat-002", "cream", 29_900, "奶油色羊毛礼帽", "奶油色 / 均码", "#e6d8c4", ["classic", "premium", "wool"]],
  ["JD", "TOP", "jd-top-001", "cream", 14_900, "奶油白精梳棉上衣", "奶油白 / M", "#efe4d2", ["clean", "cotton", "daily"]],
  ["JD", "TOP", "jd-top-002", "brown", 92_900, "深棕精纺羊毛上衣", "深棕 / M", "#79533e", ["premium", "wool", "classic"]],
  ["JD", "BOTTOM", "jd-bottom-001", "brown", 16_900, "摩卡棕通勤长裤", "摩卡棕 / M", "#92705c", ["business", "straight", "daily"]],
  ["JD", "BOTTOM", "jd-bottom-002", "cream", 96_900, "奶油白精纺阔腿裤", "奶油白 / M", "#e4d9c9", ["premium", "wide-leg", "wool"]],
  ["JD", "OUTERWEAR", "jd-outerwear-001", "brown", 31_900, "焦糖棕工装外套", "焦糖棕 / M", "#99694c", ["workwear", "urban", "jacket"]],
  ["JD", "OUTERWEAR", "jd-outerwear-002", "cream", 82_900, "燕麦色双面呢大衣", "燕麦色 / M", "#d6c8b5", ["classic", "coat", "premium"]],
  ["JD", "HAT", "jd-hat-001", "brown", 6_900, "复古咖色棒球帽", "咖色 / 均码", "#9c755c", ["retro", "baseball", "casual"]],
  ["JD", "HAT", "jd-hat-002", "cream", 28_900, "米白羊毛贝雷帽", "米白 / 均码", "#e1d5c4", ["artistic", "premium", "wool"]],
];

function productImageDataUrl(label: string, color: string): string {
  const svg = `<svg xmlns="http://www.w3.org/2000/svg" width="640" height="800" viewBox="0 0 640 800"><rect width="640" height="800" fill="${color}"/><text x="320" y="390" text-anchor="middle" font-family="Arial" font-size="34" fill="#1f1b18">${label}</text><text x="320" y="435" text-anchor="middle" font-family="Arial" font-size="18" fill="#5c5148">Mock product image</text></svg>`;
  return `data:image/svg+xml;base64,${Buffer.from(svg).toString("base64")}`;
}

function purchaseLink(
  platform: MarketplacePlatformValue,
  externalProductId: string,
  externalSkuId: string
): string {
  return `https://example.invalid/${platform.toLowerCase()}/product/${encodeURIComponent(externalProductId)}?sku=${encodeURIComponent(externalSkuId)}`;
}

export const MOCK_PRODUCT_CATALOG: MockCatalogProduct[] =
  PRODUCT_DEFINITIONS.map(
    ([platform, category, externalProductId, color, priceCents, title, variantLabel, imageColor, keywords]) => {
      const externalSkuId = `${externalProductId}-${color}-m`;
      return {
        platform,
        externalProductId,
        externalSkuId,
        category,
        title,
        imageUrl: productImageDataUrl(title, imageColor),
        purchaseUrl: purchaseLink(platform, externalProductId, externalSkuId),
        priceCents,
        currency: "CNY",
        sellerName: platform === "TAOBAO" ? "淘宝模拟精选店" : "京东模拟自营店",
        color,
        variantLabel,
        availabilityStatus: "AVAILABLE",
        snapshotAt: new Date("2026-07-20T00:00:00.000Z"),
        keywords: [...keywords],
      };
    }
  );
