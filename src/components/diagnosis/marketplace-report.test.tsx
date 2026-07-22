import { renderToStaticMarkup } from "react-dom/server";
import { describe, expect, it, vi } from "vitest";
import type { ReportRecommendation } from "@/types/diagnosis";
import { AlternativeStyleCard } from "./alternative-style-card";
import { PrimaryStyleDirection } from "./primary-style-direction";
import { TRY_ON_STATUS_LABELS } from "./try-on-status-panel";

function recommendation(
  overrides: Partial<ReportRecommendation> = {}
): ReportRecommendation {
  return {
    id: "rec-1",
    rank: 1,
    isPrimary: true,
    displayMode: "LEGACY",
    sourceMode: "LEGACY_AI",
    title: "复古通勤",
    description: "克制的暖色搭配",
    summary: "适合日常通勤的完整造型。",
    clothingAdvice: "",
    hairstyleAdvice: "",
    shoesAdvice: "",
    colorPalette: ["brown", "cream"],
    avoidTips: [],
    items: [],
    previewImageUrl: null,
    previewImageStatus: "COMPLETED",
    previewImageError: null,
    tryOnImageUrl: "https://assets.example/try-on.jpg",
    tryOnImageStatus: "COMPLETED",
    tryOnImageError: null,
    products: ["TOP", "BOTTOM", "OUTERWEAR", "HAT"].map(
      (category, index) => ({
        id: `product-${index}`,
        platform: "TAOBAO",
        category: category as "TOP" | "BOTTOM" | "OUTERWEAR" | "HAT",
        title: `${category} 单品`,
        imageUrl: `data:image/svg+xml,${category}`,
        purchaseUrl: `https://example.invalid/taobao/product/${index}`,
        priceCents: index === 0 ? 88_600 : 0,
        currency: "CNY",
        sellerName: "模拟精选店",
        color: "brown",
        variantLabel: "棕色 / M",
        isOptional: category === "OUTERWEAR",
        availabilityStatus: "AVAILABLE",
        snapshotAt: "2026-07-20T00:00:00.000Z",
      })
    ),
    marketplacePlatform: "TAOBAO",
    productTotalCents: 88_600,
    productPlanStatus: "READY",
    tryOnWorkflowStatus: "COMPLETED",
    tryOnAttemptCount: 1,
    tryOnProvider: "mock",
    identityScore: 1,
    productFidelityScore: 1,
    tryOnExpiresAt: "2026-08-19T00:00:00.000Z",
    tryOnProductSnapshotHash: "sha256:products",
    archetype: null,
    matchScore: null,
    personalityLabel: null,
    category: null,
    macroCategory: null,
    requiredItems: [],
    forbiddenItems: [],
    silhouette: null,
    sceneMood: null,
    canGeneratePreview: true,
    canRetryPreview: true,
    ...overrides,
  } as ReportRecommendation;
}

describe("marketplace try-on report", () => {
  it("uses customer-safe copy for every workflow state", () => {
    expect(TRY_ON_STATUS_LABELS).toEqual({
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
    });
  });

  it("renders a completed primary with product purchase context", () => {
    const html = renderToStaticMarkup(
      <PrimaryStyleDirection
        recommendation={recommendation()}
        faceTryOnConsent
        isGeneratingTryOn={false}
        onGenerateTryOn={vi.fn()}
        onAuthorizeAndGenerate={vi.fn()}
      />
    );

    expect(html).toContain("淘宝精选");
    expect(html).toContain("¥886.00");
    expect(html).toContain("查看淘宝整套购买清单");
    expect(html).toContain("模拟购买入口");
    expect(html).toContain('rel="noopener noreferrer sponsored"');
    expect(html).toContain("模拟试穿流程");
    expect(html).toContain("本人试穿已完成");
  });

  it("offers a safe retry without exposing provider failures", () => {
    const html = renderToStaticMarkup(
      <PrimaryStyleDirection
        recommendation={recommendation({
          tryOnImageUrl: null,
          tryOnImageStatus: "FAILED",
          tryOnImageError: "provider-secret-stack",
          tryOnWorkflowStatus: "FAILED",
        })}
        faceTryOnConsent
        onGenerateTryOn={vi.fn()}
      />
    );

    expect(html).toContain("本人试穿暂不可用");
    expect(html).toContain("重新生成本人试穿");
    expect(html).not.toContain("provider-secret-stack");
  });

  it("offers explicit generation for an untouched alternative", () => {
    const html = renderToStaticMarkup(
      <AlternativeStyleCard
        recommendation={recommendation({
          id: "rec-2",
          rank: 2,
          isPrimary: false,
          tryOnImageUrl: null,
          tryOnImageStatus: "PENDING",
          tryOnWorkflowStatus: "NOT_REQUESTED",
          tryOnProvider: null,
        })}
        rank={1}
        faceTryOnConsent
        isGeneratingTryOn={false}
        onGenerateTryOn={vi.fn()}
      />
    );

    expect(html).toContain("生成这套试穿");
    expect(html).not.toContain("本人试穿已完成");
  });

  it("shows authorization instead of claiming a personal try-on", () => {
    const html = renderToStaticMarkup(
      <PrimaryStyleDirection
        recommendation={recommendation({
          tryOnImageUrl: null,
          tryOnImageStatus: "PENDING",
          tryOnWorkflowStatus: "NOT_REQUESTED",
          tryOnProvider: null,
        })}
        faceTryOnConsent={false}
        isGeneratingTryOn={false}
        onGenerateTryOn={vi.fn()}
        onAuthorizeAndGenerate={vi.fn()}
      />
    );

    expect(html).toContain("授权并生成本人试穿");
    expect(html).not.toContain("本人试穿已完成");
  });
});
