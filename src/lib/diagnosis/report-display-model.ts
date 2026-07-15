import { RecommendationSource } from "@prisma/client";
import {
  parseV2RecommendationSet,
  StyleRecommendationSnapshotInput,
} from "@/lib/style-archetype/recommendation-snapshot";
import {
  LegacyReportRecommendation,
  ReportArchetypeMetadata,
  ReportDisplayModel,
  V2ReportRecommendation,
} from "@/types/diagnosis";

export type LegacyDisplayFallbackReason =
  | "TRUE_LEGACY_RECORD"
  | "INVALID_V2_SNAPSHOT"
  | "INCOMPLETE_V2_SET"
  | "UNSUPPORTED_SNAPSHOT_VERSION";

export interface ReportRecommendationRecord
  extends StyleRecommendationSnapshotInput {
  id: string;
  isPrimary: boolean;
  title: string;
  description: string | null;
  summary: string;
  clothingAdvice: string;
  hairstyleAdvice: string;
  shoesAdvice: string;
  colorPalette: string[];
  avoidTips: string[];
  previewImageUrl: string | null;
  previewImageStatus: string;
  previewImageError: string | null;
  archetype?: ReportArchetypeMetadata | null;
}

export interface ReportProjectionResult {
  model: ReportDisplayModel;
  fallbackReason: LegacyDisplayFallbackReason | null;
}

function isRecord(value: unknown): value is Record<string, unknown> {
  return typeof value === "object" && value !== null && !Array.isArray(value);
}

function hasUnsupportedSnapshotVersion(
  recommendations: readonly ReportRecommendationRecord[]
): boolean {
  return recommendations.some((recommendation) => {
    if (
      recommendation.sourceMode !== RecommendationSource.ARCHETYPE_V2 ||
      !isRecord(recommendation.archetypeSnapshot)
    ) {
      return false;
    }
    const schemaVersion = recommendation.archetypeSnapshot.schemaVersion;
    return typeof schemaVersion === "number" && schemaVersion !== 1;
  });
}

function fallbackReasonFor(
  recommendations: readonly ReportRecommendationRecord[]
): LegacyDisplayFallbackReason | null {
  if (
    recommendations.length > 0 &&
    recommendations.every(
      (recommendation) =>
        recommendation.sourceMode === RecommendationSource.LEGACY_AI
    )
  ) {
    return "TRUE_LEGACY_RECORD";
  }
  if (hasUnsupportedSnapshotVersion(recommendations)) {
    return "UNSUPPORTED_SNAPSHOT_VERSION";
  }
  if (
    recommendations.length !== 3 ||
    !recommendations.every(
      (recommendation) =>
        recommendation.sourceMode === RecommendationSource.ARCHETYPE_V2
    )
  ) {
    return "INCOMPLETE_V2_SET";
  }
  const ranks = recommendations.map((recommendation) => recommendation.rank);
  if (
    new Set(ranks).size !== 3 ||
    ![1, 2, 3].every((rank) => ranks.includes(rank))
  ) {
    return "INCOMPLETE_V2_SET";
  }
  return null;
}

function buildV2Model(
  recommendations: readonly ReportRecommendationRecord[]
): ReportProjectionResult | null {
  const snapshots = parseV2RecommendationSet(recommendations);
  if (!snapshots) return null;
  const byRank = new Map(
    recommendations.map((recommendation) => [
      recommendation.rank,
      recommendation,
    ])
  );
  const projected: V2ReportRecommendation[] = snapshots.map((snapshot) => {
    const record = byRank.get(snapshot.selection.rank)!;
    return {
      id: record.id,
      rank: snapshot.selection.rank,
      isPrimary: snapshot.selection.rank === 1,
      displayMode: "ARCHETYPE_V2",
      sourceMode: RecommendationSource.ARCHETYPE_V2,
      title: snapshot.identity.name,
      description: snapshot.identity.description,
      summary: snapshot.identity.description,
      clothingAdvice: snapshot.styleDNA.clothingDNA,
      hairstyleAdvice: snapshot.styleDNA.hairstyleDNA,
      shoesAdvice: snapshot.styleDNA.shoesDNA,
      colorPalette: [...snapshot.styleDNA.colorDNA],
      avoidTips: [
        snapshot.styleDNA.avoidDNA,
        ...snapshot.styleDNA.forbiddenItems,
      ],
      previewImageUrl: record.previewImageUrl,
      previewImageStatus: record.previewImageStatus,
      previewImageError: record.previewImageError,
      archetype: {
        id: snapshot.provenance.archetypeId,
        name: snapshot.identity.name,
        personalityLabel: snapshot.identity.personalityLabel,
        category: snapshot.identity.category,
      },
      matchScore: snapshot.selection.matchScore,
      personalityLabel: snapshot.identity.personalityLabel,
      category: snapshot.identity.category,
      macroCategory: snapshot.selection.macroCategory,
      requiredItems: [...snapshot.styleDNA.requiredItems],
      forbiddenItems: [...snapshot.styleDNA.forbiddenItems],
      silhouette: snapshot.styleDNA.silhouetteDNA,
      sceneMood: snapshot.styleDNA.sceneMood,
      canGeneratePreview: true,
      canRetryPreview: true,
    };
  });
  return {
    model: { mode: "ARCHETYPE_V2", recommendations: projected },
    fallbackReason: null,
  };
}

function buildLegacyModel(
  recommendations: readonly ReportRecommendationRecord[],
  fallbackReason: LegacyDisplayFallbackReason
): ReportProjectionResult {
  const isTrueLegacy = fallbackReason === "TRUE_LEGACY_RECORD";
  const projected: LegacyReportRecommendation[] = recommendations.map(
    (record) => ({
      id: record.id,
      rank: record.rank,
      isPrimary: record.isPrimary,
      displayMode: "LEGACY",
      sourceMode:
        record.sourceMode === RecommendationSource.ARCHETYPE_V2
          ? RecommendationSource.ARCHETYPE_V2
          : RecommendationSource.LEGACY_AI,
      title: record.title,
      description: record.description,
      summary: record.summary,
      clothingAdvice: record.clothingAdvice,
      hairstyleAdvice: record.hairstyleAdvice,
      shoesAdvice: record.shoesAdvice,
      colorPalette: [...record.colorPalette],
      avoidTips: [...record.avoidTips],
      previewImageUrl: record.previewImageUrl,
      previewImageStatus:
        isTrueLegacy
          ? record.previewImageStatus
          : record.previewImageUrl
            ? "COMPLETED"
            : "FAILED",
      previewImageError: record.previewImageError,
      archetype: isTrueLegacy ? record.archetype ?? null : null,
      matchScore: record.matchScore,
      personalityLabel: isTrueLegacy
        ? record.archetype?.personalityLabel ?? null
        : null,
      category: isTrueLegacy ? record.archetype?.category ?? null : null,
      macroCategory: null,
      requiredItems: [],
      forbiddenItems: [],
      silhouette: null,
      sceneMood: null,
      canGeneratePreview: isTrueLegacy,
      canRetryPreview: isTrueLegacy,
    })
  );
  return {
    model: { mode: "LEGACY", recommendations: projected },
    fallbackReason,
  };
}

export function buildReportDisplayModel(
  recommendations: readonly ReportRecommendationRecord[]
): ReportProjectionResult {
  const fallbackReason = fallbackReasonFor(recommendations);
  if (fallbackReason) {
    return buildLegacyModel(recommendations, fallbackReason);
  }
  const v2 = buildV2Model(recommendations);
  return (
    v2 ??
    buildLegacyModel(recommendations, "INVALID_V2_SNAPSHOT")
  );
}
