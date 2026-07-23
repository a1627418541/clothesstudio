import { renderToStaticMarkup } from "react-dom/server";
import { describe, expect, it, vi } from "vitest";
import type { ReportRecommendation } from "@/types/diagnosis";
import { AlternativeStyleCard } from "./alternative-style-card";
import { PrimaryStyleDirection } from "./primary-style-direction";

function v2Recommendation(
  overrides: Partial<ReportRecommendation> = {}
): ReportRecommendation {
  return {
    id: "rec-1",
    rank: 1,
    isPrimary: true,
    displayMode: "ARCHETYPE_V2",
    sourceMode: "ARCHETYPE_V2",
    title: "Old Money",
    description: "Quiet luxury",
    summary: "summary",
    clothingAdvice: "",
    hairstyleAdvice: "",
    shoesAdvice: "",
    colorPalette: ["cream"],
    avoidTips: [],
    items: [],
    previewImageUrl: "https://assets.example/preview.jpg",
    previewImageStatus: "COMPLETED",
    previewImageError: null,
    tryOnImageUrl: null,
    tryOnImageStatus: "PENDING",
    tryOnImageError: null,
    products: [],
    marketplacePlatform: null,
    productTotalCents: null,
    productPlanStatus: "PENDING",
    tryOnWorkflowStatus: "NOT_REQUESTED",
    tryOnAttemptCount: 0,
    tryOnProvider: null,
    identityScore: null,
    productFidelityScore: null,
    tryOnExpiresAt: null,
    tryOnProductSnapshotHash: null,
    archetype: { id: "arch-1", name: "Old Money", personalityLabel: "Refined", category: "Classic" },
    matchScore: 90,
    personalityLabel: "Refined",
    category: "Classic",
    macroCategory: "CLASSIC_PREMIUM",
    requiredItems: [],
    forbiddenItems: [],
    silhouette: "straight",
    sceneMood: "studio",
    canGeneratePreview: true,
    canRetryPreview: true,
    personalTryOn: null,
    ...overrides,
  } as ReportRecommendation;
}

function renderPrimary(recommendation: ReportRecommendation) {
  return renderToStaticMarkup(
    <PrimaryStyleDirection
      recommendation={recommendation}
      faceTryOnConsent
      isGeneratingTryOn={false}
      onGenerateTryOn={vi.fn()}
      onAuthorizeAndGenerate={vi.fn()}
    />
  );
}

describe("personal try-on report slots", () => {
  it("shows the completed personal try-on image and keeps the style preview in its own slot", () => {
    const html = renderPrimary(
      v2Recommendation({
        personalTryOn: {
          status: "COMPLETED",
          imageUrl: "https://r2.example/personal.png",
          errorCode: null,
          attemptCount: 1,
        },
      })
    );

    expect(html).toContain("https://r2.example/personal.png");
    expect(html).toContain("https://assets.example/preview.jpg");
    expect(html).toContain("AI 本人试穿效果，仅供风格与搭配参考");
    expect(html).toContain("本人试穿已完成");
  });

  it("shows in-progress copy without a clickable button while PROCESSING", () => {
    const html = renderPrimary(
      v2Recommendation({
        personalTryOn: { status: "PROCESSING", imageUrl: null, errorCode: null, attemptCount: 1 },
      })
    );

    expect(html).toContain("本人试穿生成中");
    expect(html).not.toContain(">生成本人试穿<");
    expect(html).not.toContain("生成这套试穿");
    expect(html).not.toContain("重新生成本人试穿");
  });

  it("shows safe failure copy and an explicit retry for a FAILED generation", () => {
    const html = renderPrimary(
      v2Recommendation({
        personalTryOn: {
          status: "FAILED",
          imageUrl: null,
          errorCode: "ATTEMPT_CAP_REACHED",
          attemptCount: 3,
        },
      })
    );

    expect(html).toContain("本人试穿生成次数已达上限，请稍后再试");
    expect(html).toContain("重新生成本人试穿");
    expect(html).not.toContain("ATTEMPT_CAP_REACHED");
  });

  it("shows the generate CTA when no generation exists and never fills the slot with the preview image", () => {
    const html = renderPrimary(v2Recommendation());

    expect(html).toContain(">生成本人试穿<");
    expect(html).not.toContain("本人试穿 搭配预览");
  });

  it("treats a completed generation without an image as unavailable, never as preview", () => {
    const html = renderPrimary(
      v2Recommendation({
        personalTryOn: { status: "COMPLETED", imageUrl: null, errorCode: null, attemptCount: 1 },
      })
    );

    expect(html).toContain("本人试穿暂不可用");
    expect(html).not.toContain("本人试穿 搭配预览");
  });

  it("keeps legacy try-on images for old reports without a generation", () => {
    const html = renderPrimary(
      v2Recommendation({
        tryOnImageUrl: "https://assets.example/legacy-try-on.jpg",
        tryOnImageStatus: "COMPLETED",
        tryOnWorkflowStatus: "COMPLETED",
      })
    );

    expect(html).toContain("https://assets.example/legacy-try-on.jpg");
    expect(html).toContain("本人试穿为 AI 生成效果，仅供搭配参考");
  });

  it("never treats a style-preview-written tryOnImageUrl as a personal try-on", () => {
    const html = renderPrimary(
      v2Recommendation({
        tryOnImageUrl: "https://assets.example/preview-written.jpg",
        tryOnImageStatus: "COMPLETED",
        tryOnWorkflowStatus: "NOT_REQUESTED",
      })
    );

    expect(html).toContain(">生成本人试穿<");
    expect(html).not.toContain("https://assets.example/preview-written.jpg");
  });

  it("shows in-progress copy on alternative cards while PROCESSING", () => {
    const html = renderToStaticMarkup(
      <AlternativeStyleCard
        recommendation={v2Recommendation({
          id: "rec-2",
          rank: 2,
          isPrimary: false,
          personalTryOn: { status: "PROCESSING", imageUrl: null, errorCode: null, attemptCount: 1 },
        })}
        rank={1}
        faceTryOnConsent
        isGeneratingTryOn={false}
        onGenerateTryOn={vi.fn()}
      />
    );

    expect(html).toContain("本人试穿生成中");
    expect(html).not.toContain("生成这套试穿");
  });
});
