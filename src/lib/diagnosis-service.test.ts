import { RecommendationSource } from "@prisma/client";
import { beforeEach, describe, expect, it, vi } from "vitest";
import { prisma } from "@/lib/prisma";
import { getDiagnosisDetailForViewer } from "@/lib/diagnosis-service";
import { V2_ARCHETYPE_MANIFEST } from "@/lib/style-archetype/archetype-v2-manifest";
import { buildV2RecommendationSnapshot } from "@/lib/style-archetype/recommendation-snapshot";

vi.mock("@/lib/prisma", () => ({
  prisma: {
    styleDiagnosis: {
      findUnique: vi.fn(),
    },
    styleRecommendation: {
      findMany: vi.fn(),
    },
  },
}));

function legacyRecommendations(withRelation = false) {
  return [0, 1, 2].map((index) => ({
    id: `rec-${index + 1}`,
    rank: index + 1,
    isPrimary: index === 0,
    sourceMode: RecommendationSource.LEGACY_AI,
    archetypeVersion: null,
    archetypeSnapshot: null,
    archetypeId: index === 0 ? "arch-1" : null,
    matchScore: index === 0 ? 87 : null,
    title: index === 0 ? "Clean Minimal" : `Fallback ${index}`,
    description: index === 0 ? "Description" : null,
    summary: "Summary",
    clothingAdvice: "Clothing",
    hairstyleAdvice: "Hair",
    shoesAdvice: "Shoes",
    colorPalette: ["navy"],
    avoidTips: ["avoid"],
    items: [
      {
        name: "oxford shirt",
        category: "top",
        why: "Clean base layer.",
        colors: ["white", "navy"],
        fitNotes: "Tailored through shoulders.",
        optional: false,
      },
    ],
    previewImageUrl: null,
    previewImageStatus: "PENDING",
    previewImageError: null,
    ...(withRelation
      ? {
          archetype:
            index === 0
              ? {
                  id: "arch-1",
                  name: "Clean Minimal",
                  personalityLabel: "Modern Minimalist",
                  category: "Minimal",
                }
              : null,
        }
      : {}),
  }));
}

function v2Recommendations() {
  const slugs = ["old-money", "business-formal", "streetwear"];
  return slugs.map((slug, index) => {
    const archetype = V2_ARCHETYPE_MANIFEST.find((row) => row.slug === slug)!;
    const snapshot = buildV2RecommendationSnapshot({
      archetype,
      rank: (index + 1) as 1 | 2 | 3,
      matchScore: 90 - index * 7,
      subjectContext: {
        genderPresentation: "MASCULINE",
        bodyTypeHint: "rectangle",
        faceShapeHint: "oval",
        ageBand: "25-34",
      },
    });
    return {
      id: `v2-${index + 1}`,
      rank: index + 1,
      isPrimary: index === 0,
      sourceMode: RecommendationSource.ARCHETYPE_V2,
      archetypeVersion: snapshot.archetypeVersion,
      archetypeSnapshot: snapshot,
      archetypeId: snapshot.provenance.archetypeId,
      matchScore: snapshot.selection.matchScore,
      title: "Legacy mirror mutation",
      description: "Legacy mirror mutation",
      summary: "Legacy mirror mutation",
      clothingAdvice: "Legacy mirror mutation",
      hairstyleAdvice: "Legacy mirror mutation",
      shoesAdvice: "Legacy mirror mutation",
      colorPalette: ["mutated"],
      avoidTips: ["mutated"],
      items: [
        {
          name: "v2 tailored blazer",
          category: "outerwear",
          why: "Structured silhouette.",
          colors: ["charcoal"],
          fitNotes: "Slim cut.",
          optional: false,
        },
      ],
      previewImageUrl: null,
      previewImageStatus: "PENDING",
      previewImageError: null,
    };
  });
}

function makeDiagnosis(overrides: Record<string, unknown> = {}) {
  return {
    id: "diag-1",
    userId: "user-1",
    anonymousSessionId: null,
    gender: "MALE",
    age: 30,
    heightCm: 178,
    weightKg: 75,
    bodyType: "rectangle",
    faceShape: "oval",
    vibeKeywords: ["minimal"],
    summary: "Summary",
    status: "PREVIEW_READY",
    createdAt: new Date("2026-07-11T00:00:00.000Z"),
    photos: [],
    recommendations: legacyRecommendations(),
    ...overrides,
  };
}

describe("getDiagnosisDetailForViewer", () => {
  beforeEach(() => {
    vi.clearAllMocks();
    vi.mocked(prisma.styleRecommendation.findMany).mockResolvedValue(
      legacyRecommendations(true) as unknown as Awaited<
        ReturnType<typeof prisma.styleRecommendation.findMany>
      >
    );
  });

  it("conditionally loads live archetype metadata only for true legacy records", async () => {
    vi.mocked(prisma.styleDiagnosis.findUnique).mockResolvedValue(
      makeDiagnosis() as unknown as Awaited<
        ReturnType<typeof prisma.styleDiagnosis.findUnique>
      >
    );

    const result = await getDiagnosisDetailForViewer({
      diagnosisId: "diag-1",
      userId: "user-1",
      anonymousSessionId: null,
    });

    expect(result.ok).toBe(true);
    if (!result.ok) throw new Error("unexpected failure");
    expect(prisma.styleRecommendation.findMany).toHaveBeenCalledWith(
      expect.objectContaining({
        where: { diagnosisId: "diag-1" },
        include: expect.objectContaining({ archetype: expect.any(Object) }),
      })
    );
    expect(result.diagnosis.reportMode).toBe("LEGACY");
    expect(result.diagnosis.recommendations[0]).toMatchObject({
      title: "Clean Minimal",
      archetype: {
        id: "arch-1",
        name: "Clean Minimal",
        personalityLabel: "Modern Minimalist",
        category: "Minimal",
      },
      matchScore: 87,
      canGeneratePreview: true,
    });
  });

  it("maps valid V2 exclusively from snapshots and never queries live relations", async () => {
    const recommendations = v2Recommendations();
    vi.mocked(prisma.styleDiagnosis.findUnique).mockResolvedValue(
      makeDiagnosis({ recommendations }) as unknown as Awaited<
        ReturnType<typeof prisma.styleDiagnosis.findUnique>
      >
    );

    const result = await getDiagnosisDetailForViewer({
      diagnosisId: "diag-1",
      userId: "user-1",
      anonymousSessionId: null,
    });

    expect(result.ok).toBe(true);
    if (!result.ok) throw new Error("unexpected failure");
    expect(prisma.styleRecommendation.findMany).not.toHaveBeenCalled();
    expect(result.diagnosis.reportMode).toBe("ARCHETYPE_V2");
    expect(result.diagnosis.recommendations[0]).toMatchObject({
      title: "Old Money",
      macroCategory: "CLASSIC_PREMIUM",
      requiredItems: ["knit-polo", "cashmere-sweater", "tailored-trousers", "loafers"],
      canGeneratePreview: true,
    });
    expect(result.diagnosis.recommendations[0].title).not.toContain("mutation");
  });

  it("does not query live relations or allow generation for invalid V2", async () => {
    const recommendations = v2Recommendations();
    recommendations[0] = {
      ...recommendations[0],
      matchScore: 1,
      title: "Compatibility fallback",
    };
    vi.mocked(prisma.styleDiagnosis.findUnique).mockResolvedValue(
      makeDiagnosis({ recommendations }) as unknown as Awaited<
        ReturnType<typeof prisma.styleDiagnosis.findUnique>
      >
    );

    const result = await getDiagnosisDetailForViewer({
      diagnosisId: "diag-1",
      userId: "user-1",
      anonymousSessionId: null,
    });

    expect(result.ok).toBe(true);
    if (!result.ok) throw new Error("unexpected failure");
    expect(prisma.styleRecommendation.findMany).not.toHaveBeenCalled();
    expect(result.diagnosis.reportMode).toBe("LEGACY");
    expect(result.diagnosis.recommendations[0]).toMatchObject({
      title: "Compatibility fallback",
      archetype: null,
      previewImageStatus: "FAILED",
      canGeneratePreview: false,
    });
  });

  it("returns FORBIDDEN without loading legacy relation data", async () => {
    vi.mocked(prisma.styleDiagnosis.findUnique).mockResolvedValue(
      makeDiagnosis() as unknown as Awaited<
        ReturnType<typeof prisma.styleDiagnosis.findUnique>
      >
    );

    const result = await getDiagnosisDetailForViewer({
      diagnosisId: "diag-1",
      userId: "other-user",
      anonymousSessionId: null,
    });

    expect(result).toEqual({ ok: false, code: "FORBIDDEN" });
    expect(prisma.styleRecommendation.findMany).not.toHaveBeenCalled();
  });

  it("returns NOT_FOUND when diagnosis does not exist", async () => {
    vi.mocked(prisma.styleDiagnosis.findUnique).mockResolvedValue(null);

    const result = await getDiagnosisDetailForViewer({
      diagnosisId: "missing",
      userId: "user-1",
      anonymousSessionId: null,
    });

    expect(result).toEqual({ ok: false, code: "NOT_FOUND" });
    expect(prisma.styleRecommendation.findMany).not.toHaveBeenCalled();
  });
});
