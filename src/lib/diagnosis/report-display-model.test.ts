import { RecommendationSource } from "@prisma/client";
import { describe, expect, it } from "vitest";
import { V2_ARCHETYPE_MANIFEST } from "@/lib/style-archetype/archetype-v2-manifest";
import { buildV2RecommendationSnapshot } from "@/lib/style-archetype/recommendation-snapshot";
import {
  buildReportDisplayModel,
  ReportRecommendationRecord,
} from "./report-display-model";

const archetypes = ["old-money", "business-formal", "streetwear"].map(
  (slug) => V2_ARCHETYPE_MANIFEST.find((row) => row.slug === slug)!
);

function snapshotFor(index: number) {
  return buildV2RecommendationSnapshot({
    archetype: archetypes[index],
    rank: (index + 1) as 1 | 2 | 3,
    matchScore: 91 - index * 8,
    subjectContext: {
      genderPresentation: "MASCULINE",
      bodyTypeHint: "rectangle",
      faceShapeHint: "oval",
      ageBand: "25-34",
    },
  });
}

const marketplaceProducts = ["TOP", "BOTTOM", "OUTERWEAR", "HAT"].map(
  (category, index) => ({
    id: `product-${index + 1}`,
    platform: "TAOBAO" as const,
    category: category as "TOP" | "BOTTOM" | "OUTERWEAR" | "HAT",
    title: `${category} product`,
    imageUrl: `https://assets.example/${category.toLowerCase()}.jpg`,
    purchaseUrl: `https://example.invalid/product/${index + 1}`,
    priceCents: 10_000 + index * 1_000,
    currency: "CNY",
    sellerName: "Mock seller",
    color: "brown",
    variantLabel: "Brown / M",
    isOptional: category === "OUTERWEAR",
    availabilityStatus: "AVAILABLE" as const,
    snapshotAt: new Date("2026-07-20T00:00:00.000Z"),
  })
);

function v2Record(index: number, overrides: Record<string, unknown> = {}) {
  const snapshot = snapshotFor(index);
  return {
    id: `rec-${index + 1}`,
    rank: index + 1,
    isPrimary: index === 0,
    sourceMode: RecommendationSource.ARCHETYPE_V2,
    archetypeVersion: snapshot.archetypeVersion,
    archetypeSnapshot: snapshot,
    archetypeId: snapshot.provenance.archetypeId,
    matchScore: snapshot.selection.matchScore,
    title: "MUTATED LEGACY TITLE",
    description: "MUTATED LEGACY DESCRIPTION",
    summary: "MUTATED LEGACY SUMMARY",
    clothingAdvice: "MUTATED LEGACY CLOTHING",
    hairstyleAdvice: "MUTATED LEGACY HAIR",
    shoesAdvice: "MUTATED LEGACY SHOES",
    colorPalette: ["mutated-color"],
    avoidTips: ["mutated-avoid"],
    items: [
      {
        name: "structured wool blazer",
        category: "outerwear",
        why: "Adds structure.",
        colors: ["navy"],
        fitNotes: "Slim fit.",
        optional: false,
      },
    ],
    previewImageUrl: null,
    previewImageStatus: "PENDING",
    previewImageError: null,
    tryOnImageUrl: null,
    tryOnImageStatus: "PENDING",
    tryOnImageError: null,
    marketplacePlatform: "TAOBAO",
    productTotalCents: 88_600,
    productPlanStatus: "READY",
    products: marketplaceProducts,
    tryOnWorkflowStatus: "COMPLETED",
    tryOnAttemptCount: 1,
    tryOnProvider: "mock",
    identityScore: 0.96,
    productFidelityScore: 0.94,
    tryOnExpiresAt: new Date("2026-08-19T00:00:00.000Z"),
    tryOnProductSnapshotHash: "sha256:products",
    archetype: {
      id: "live-mutated",
      name: "LIVE MUTATED NAME",
      personalityLabel: "LIVE MUTATED PERSONALITY",
      category: "LIVE MUTATED CATEGORY",
    },
    ...overrides,
  } satisfies ReportRecommendationRecord;
}

function legacyRecord(index: number, overrides: Record<string, unknown> = {}) {
  return {
    id: `legacy-${index + 1}`,
    rank: index + 1,
    isPrimary: index === 0,
    sourceMode: RecommendationSource.LEGACY_AI,
    archetypeVersion: null,
    archetypeSnapshot: null,
    archetypeId: index === 0 ? "legacy-arch" : null,
    matchScore: index === 0 ? 72 : null,
    title: `Legacy ${index + 1}`,
    description: `Legacy description ${index + 1}`,
    summary: `Legacy summary ${index + 1}`,
    clothingAdvice: `Legacy clothing ${index + 1}`,
    hairstyleAdvice: `Legacy hair ${index + 1}`,
    shoesAdvice: `Legacy shoes ${index + 1}`,
    colorPalette: ["navy"],
    avoidTips: ["loud logos"],
    items: [
      {
        name: "legacy oxford shirt",
        category: "top",
        why: "Classic base.",
        colors: ["navy", "white"],
        fitNotes: "Tailored.",
        optional: false,
      },
    ],
    previewImageUrl: null,
    previewImageStatus: "PENDING",
    previewImageError: null,
    tryOnImageUrl: null,
    tryOnImageStatus: "PENDING",
    tryOnImageError: null,
    marketplacePlatform: null,
    productTotalCents: null,
    productPlanStatus: "PENDING",
    products: [],
    tryOnWorkflowStatus: "NOT_REQUESTED",
    tryOnAttemptCount: 0,
    tryOnProvider: null,
    identityScore: null,
    productFidelityScore: null,
    tryOnExpiresAt: null,
    tryOnProductSnapshotHash: null,
    archetype:
      index === 0
        ? {
            id: "legacy-arch",
            name: "Legacy Archetype",
            personalityLabel: "Legacy Personality",
            category: "Legacy Category",
          }
        : null,
    ...overrides,
  } satisfies ReportRecommendationRecord;
}

describe("snapshot-authoritative report display model", () => {
  it("maps every V2 content field from snapshots and ignores live/legacy mutations", () => {
    const records = [v2Record(0), v2Record(1), v2Record(2)];
    const projection = buildReportDisplayModel(records);

    expect(projection.fallbackReason).toBeNull();
    expect(projection.model.mode).toBe("ARCHETYPE_V2");
    if (projection.model.mode !== "ARCHETYPE_V2") {
      throw new Error("Expected V2 display model");
    }

    const primary = projection.model.recommendations[0];
    const snapshot = snapshotFor(0);
    expect(primary).toMatchObject({
      sourceMode: RecommendationSource.ARCHETYPE_V2,
      title: snapshot.identity.name,
      description: snapshot.identity.description,
      summary: snapshot.identity.description,
      personalityLabel: snapshot.identity.personalityLabel,
      category: snapshot.identity.category,
      macroCategory: snapshot.selection.macroCategory,
      matchScore: snapshot.selection.matchScore,
      clothingAdvice: snapshot.styleDNA.clothingDNA,
      requiredItems: snapshot.styleDNA.requiredItems,
      silhouette: snapshot.styleDNA.silhouetteDNA,
      hairstyleAdvice: snapshot.styleDNA.hairstyleDNA,
      shoesAdvice: snapshot.styleDNA.shoesDNA,
      colorPalette: snapshot.styleDNA.colorDNA,
      forbiddenItems: snapshot.styleDNA.forbiddenItems,
      sceneMood: snapshot.styleDNA.sceneMood,
      canGeneratePreview: true,
      canRetryPreview: true,
      archetype: {
        id: snapshot.provenance.archetypeId,
        name: snapshot.identity.name,
        personalityLabel: snapshot.identity.personalityLabel,
        category: snapshot.identity.category,
      },
    });
    expect(primary.avoidTips).toEqual([
      snapshot.styleDNA.avoidDNA,
      ...snapshot.styleDNA.forbiddenItems,
    ]);
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
    expect(primary.products[0].snapshotAt).toBe("2026-07-20T00:00:00.000Z");
    expect(JSON.stringify(primary)).not.toContain("MUTATED");
  });

  it("keeps true legacy content and relation metadata generatable", () => {
    const projection = buildReportDisplayModel([
      legacyRecord(0),
      legacyRecord(1),
      legacyRecord(2),
    ]);

    expect(projection.fallbackReason).toBe("TRUE_LEGACY_RECORD");
    expect(projection.model.mode).toBe("LEGACY");
    expect(projection.model.recommendations[0]).toMatchObject({
      title: "Legacy 1",
      archetype: {
        id: "legacy-arch",
        name: "Legacy Archetype",
      },
      canGeneratePreview: true,
      canRetryPreview: true,
      previewImageStatus: "PENDING",
    });
  });

  it("uses stable fallback precedence for unsupported and incomplete V2 sets", () => {
    const unsupported = {
      ...v2Record(0),
      archetypeSnapshot: { ...snapshotFor(0), schemaVersion: 2 },
    };
    const unsupportedMixed = buildReportDisplayModel([
      unsupported,
      legacyRecord(1),
      legacyRecord(2),
    ]);
    expect(unsupportedMixed.fallbackReason).toBe(
      "UNSUPPORTED_SNAPSHOT_VERSION"
    );

    const mixed = buildReportDisplayModel([
      v2Record(0),
      legacyRecord(1),
      legacyRecord(2),
    ]);
    expect(mixed.fallbackReason).toBe("INCOMPLETE_V2_SET");
    expect(buildReportDisplayModel([v2Record(0), v2Record(1)]).fallbackReason)
      .toBe("INCOMPLETE_V2_SET");
  });

  it("uses compatibility mirrors for invalid V2 and blocks preview generation", () => {
    const invalid = {
      ...v2Record(0, {
        title: "Compatibility title",
        previewImageUrl: "https://cdn.example/existing.webp",
        previewImageStatus: "FAILED",
      }),
      archetypeSnapshot: {
        ...snapshotFor(0),
        identity: { ...snapshotFor(0).identity, name: "" },
      },
    };
    const withImage = buildReportDisplayModel([
      invalid,
      v2Record(1),
      v2Record(2),
    ]);
    expect(withImage.fallbackReason).toBe("INVALID_V2_SNAPSHOT");
    expect(withImage.model.mode).toBe("LEGACY");
    expect(withImage.model.recommendations[0]).toMatchObject({
      title: "Compatibility title",
      previewImageUrl: "https://cdn.example/existing.webp",
      previewImageStatus: "COMPLETED",
      canGeneratePreview: false,
      canRetryPreview: false,
      archetype: null,
    });

    const withoutImage = buildReportDisplayModel([
      { ...invalid, previewImageUrl: null, previewImageStatus: "PENDING" },
      v2Record(1),
      v2Record(2),
    ]);
    expect(withoutImage.model.recommendations[0]).toMatchObject({
      previewImageUrl: null,
      previewImageStatus: "FAILED",
      canGeneratePreview: false,
      canRetryPreview: false,
    });
    expect(
      withoutImage.model.recommendations.every(
        (recommendation) => !recommendation.canGeneratePreview
      )
    ).toBe(true);
    expect(
      withoutImage.model.recommendations.every(
        (recommendation) => !recommendation.canRetryPreview
      )
    ).toBe(true);
  });
});
