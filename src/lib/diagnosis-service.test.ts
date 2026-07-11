import { describe, it, expect, vi } from "vitest";
import { prisma } from "@/lib/prisma";
import { getDiagnosisDetailForViewer } from "@/lib/diagnosis-service";

vi.mock("@/lib/prisma", () => ({
  prisma: {
    styleDiagnosis: {
      findUnique: vi.fn(),
    },
  },
}));

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
    recommendations: [
      {
        id: "rec-1",
        rank: 1,
        isPrimary: true,
        title: "Clean Minimal",
        description: "Description",
        summary: "Summary",
        clothingAdvice: "Clothing",
        hairstyleAdvice: "Hair",
        shoesAdvice: "Shoes",
        colorPalette: ["navy"],
        avoidTips: ["avoid"],
        previewImageUrl: null,
        previewImageStatus: "PENDING",
        previewImageError: null,
        archetype: {
          id: "arch-1",
          name: "Clean Minimal",
          personalityLabel: "Modern Minimalist",
          category: "Minimal",
        },
        matchScore: 87,
      },
      {
        id: "rec-2",
        rank: 2,
        isPrimary: false,
        title: "Fallback",
        description: null,
        summary: "Summary",
        clothingAdvice: "Clothing",
        hairstyleAdvice: "Hair",
        shoesAdvice: "Shoes",
        colorPalette: ["black"],
        avoidTips: [],
        previewImageUrl: null,
        previewImageStatus: "PENDING",
        previewImageError: null,
        archetype: null,
        matchScore: null,
      },
    ],
    ...overrides,
  };
}

describe("getDiagnosisDetailForViewer", () => {
  it("returns archetype name, personalityLabel, category, and matchScore", async () => {
    vi.mocked(prisma.styleDiagnosis.findUnique).mockResolvedValue(
      makeDiagnosis() as unknown as Awaited<ReturnType<typeof prisma.styleDiagnosis.findUnique>>
    );

    const result = await getDiagnosisDetailForViewer({
      diagnosisId: "diag-1",
      userId: "user-1",
      anonymousSessionId: null,
    });

    expect(result.ok).toBe(true);
    if (!result.ok) throw new Error("unexpected failure");

    const primary = result.diagnosis.recommendations[0];
    expect(primary.archetype).toEqual({
      id: "arch-1",
      name: "Clean Minimal",
      personalityLabel: "Modern Minimalist",
      category: "Minimal",
    });
    expect(primary.matchScore).toBe(87);
  });

  it("falls back to null archetype for legacy records", async () => {
    vi.mocked(prisma.styleDiagnosis.findUnique).mockResolvedValue(
      makeDiagnosis() as unknown as Awaited<ReturnType<typeof prisma.styleDiagnosis.findUnique>>
    );

    const result = await getDiagnosisDetailForViewer({
      diagnosisId: "diag-1",
      userId: "user-1",
      anonymousSessionId: null,
    });

    expect(result.ok).toBe(true);
    if (!result.ok) throw new Error("unexpected failure");

    const alternative = result.diagnosis.recommendations[1];
    expect(alternative.archetype).toBeNull();
    expect(alternative.matchScore).toBeNull();
  });

  it("returns FORBIDDEN for wrong user", async () => {
    vi.mocked(prisma.styleDiagnosis.findUnique).mockResolvedValue(
      makeDiagnosis() as unknown as Awaited<ReturnType<typeof prisma.styleDiagnosis.findUnique>>
    );

    const result = await getDiagnosisDetailForViewer({
      diagnosisId: "diag-1",
      userId: "other-user",
      anonymousSessionId: null,
    });

    expect(result.ok).toBe(false);
    if (result.ok) throw new Error("unexpected success");
    expect(result.code).toBe("FORBIDDEN");
  });

  it("returns NOT_FOUND when diagnosis does not exist", async () => {
    vi.mocked(prisma.styleDiagnosis.findUnique).mockResolvedValue(null);

    const result = await getDiagnosisDetailForViewer({
      diagnosisId: "missing",
      userId: "user-1",
      anonymousSessionId: null,
    });

    expect(result.ok).toBe(false);
    if (result.ok) throw new Error("unexpected success");
    expect(result.code).toBe("NOT_FOUND");
  });
});
