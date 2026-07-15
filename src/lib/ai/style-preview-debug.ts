import { MacroCategory, RecommendationSource } from "@prisma/client";
import type { LegacyDisplayFallbackReason } from "@/lib/diagnosis/report-display-model";
import {
  parseV2RecommendationSet,
  StyleRecommendationSnapshotInput,
  validateV2RecommendationSnapshot,
} from "@/lib/style-archetype/recommendation-snapshot";
import {
  ArchetypeRecommendationSnapshot,
  V2SnapshotValidationReason,
} from "@/lib/style-archetype/v2-types";
import {
  STYLE_PREVIEW_COMPILER_VERSION,
  buildCompiledStylePrompt,
  compileStylePreviewPrompt,
} from "./style-preview-compiler";

export interface StylePreviewDebugRecommendation
  extends StyleRecommendationSnapshotInput {
  id: string;
}

type ForbiddenDryRunOperation = (...args: unknown[]) => unknown;

export interface StylePreviewDebugDependencies {
  readRecommendations(
    diagnosisId: string
  ): Promise<readonly StylePreviewDebugRecommendation[]>;
  providerGenerate?: ForbiddenDryRunOperation;
  writeRecommendation?: ForbiddenDryRunOperation;
  setImageStatus?: ForbiddenDryRunOperation;
  persistPrompt?: ForbiddenDryRunOperation;
  createImage?: ForbiddenDryRunOperation;
}

export interface V2PromptDebugEntry {
  recommendationId: string;
  rank: 1 | 2 | 3;
  name: string;
  macroCategory: MacroCategory;
  matchScore: number;
  compilerVersion: typeof STYLE_PREVIEW_COMPILER_VERSION;
  finalPrompt: string;
  requiredItemKeys: string[];
  forbiddenItemKeys: string[];
  sceneMood: string;
}

export interface V2PromptPairwiseComparison {
  leftRank: 1 | 2 | 3;
  rightRank: 1 | 2 | 3;
  bigramJaccard: number;
  structuredDifferences: {
    macroCategory: boolean;
    requiredItemKeys: boolean;
    forbiddenItemKeys: boolean;
    sceneMood: boolean;
  };
  comparedText: {
    left: string;
    right: string;
  };
}

export interface V2SnapshotDebugValidation {
  recommendationId: string;
  rank: number;
  sourceMode: string | null;
  valid: boolean;
  reasons: V2SnapshotValidationReason[];
}

export type V2PromptDebugReport =
  | {
      diagnosisId: string;
      mode: "ARCHETYPE_V2";
      sourceModes: Array<string | null>;
      validation: {
        valid: true;
        fallbackReason: null;
        snapshotResults: V2SnapshotDebugValidation[];
      };
      prompts: V2PromptDebugEntry[];
      comparisons: V2PromptPairwiseComparison[];
    }
  | {
      diagnosisId: string;
      mode: "LEGACY_FALLBACK";
      sourceModes: Array<string | null>;
      validation: {
        valid: false;
        fallbackReason: LegacyDisplayFallbackReason;
        snapshotResults: V2SnapshotDebugValidation[];
      };
      prompts: [];
      comparisons: [];
    };

function isRecord(value: unknown): value is Record<string, unknown> {
  return typeof value === "object" && value !== null && !Array.isArray(value);
}

function hasUnsupportedSnapshotVersion(
  recommendations: readonly StylePreviewDebugRecommendation[]
): boolean {
  return recommendations.some((recommendation) => {
    if (
      recommendation.sourceMode !== RecommendationSource.ARCHETYPE_V2 ||
      !isRecord(recommendation.archetypeSnapshot)
    ) {
      return false;
    }
    const version = recommendation.archetypeSnapshot.schemaVersion;
    return typeof version === "number" && version !== 1;
  });
}

function fallbackReasonFor(
  recommendations: readonly StylePreviewDebugRecommendation[]
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

function comparisonText(snapshot: ArchetypeRecommendationSnapshot): string {
  return [
    snapshot.styleDNA.requiredItems.join(" "),
    snapshot.styleDNA.clothingDNA,
    snapshot.styleDNA.silhouetteDNA,
    snapshot.styleDNA.shoesDNA,
    snapshot.styleDNA.sceneMood,
    snapshot.styleDNA.forbiddenItems.join(" "),
  ].join("\n");
}

function bigrams(text: string): Set<string> {
  const tokens = text.toLowerCase().match(/[a-z0-9]+/g) ?? [];
  const result = new Set<string>();
  for (let index = 0; index < tokens.length - 1; index += 1) {
    result.add(`${tokens[index]} ${tokens[index + 1]}`);
  }
  return result;
}

function bigramJaccard(leftText: string, rightText: string): number {
  const left = bigrams(leftText);
  const right = bigrams(rightText);
  const union = new Set([...left, ...right]);
  if (union.size === 0) return 0;
  let intersection = 0;
  for (const value of left) {
    if (right.has(value)) intersection += 1;
  }
  return Number((intersection / union.size).toFixed(6));
}

function listSignature(items: readonly string[]): string {
  return [...items].sort().join("|");
}

function buildComparisons(
  snapshots: readonly ArchetypeRecommendationSnapshot[]
): V2PromptPairwiseComparison[] {
  const comparisons: V2PromptPairwiseComparison[] = [];
  for (let leftIndex = 0; leftIndex < snapshots.length; leftIndex += 1) {
    for (
      let rightIndex = leftIndex + 1;
      rightIndex < snapshots.length;
      rightIndex += 1
    ) {
      const left = snapshots[leftIndex];
      const right = snapshots[rightIndex];
      const leftText = comparisonText(left);
      const rightText = comparisonText(right);
      comparisons.push({
        leftRank: left.selection.rank,
        rightRank: right.selection.rank,
        bigramJaccard: bigramJaccard(leftText, rightText),
        structuredDifferences: {
          macroCategory:
            left.selection.macroCategory !== right.selection.macroCategory,
          requiredItemKeys:
            listSignature(left.styleDNA.requiredItems) !==
            listSignature(right.styleDNA.requiredItems),
          forbiddenItemKeys:
            listSignature(left.styleDNA.forbiddenItems) !==
            listSignature(right.styleDNA.forbiddenItems),
          sceneMood: left.styleDNA.sceneMood !== right.styleDNA.sceneMood,
        },
        comparedText: { left: leftText, right: rightText },
      });
    }
  }
  return comparisons;
}

function fallbackReport(
  diagnosisId: string,
  fallbackReason: LegacyDisplayFallbackReason,
  sourceModes: Array<string | null>,
  snapshotResults: V2SnapshotDebugValidation[]
): V2PromptDebugReport {
  return {
    diagnosisId,
    mode: "LEGACY_FALLBACK",
    sourceModes,
    validation: { valid: false, fallbackReason, snapshotResults },
    prompts: [],
    comparisons: [],
  };
}

export async function compileV2StylePreviewsDryRun(
  diagnosisId: string,
  dependencies: StylePreviewDebugDependencies
): Promise<V2PromptDebugReport> {
  const recommendations = await dependencies.readRecommendations(diagnosisId);
  const sourceModes = [...new Set(
    recommendations.map((recommendation) => recommendation.sourceMode)
  )].sort((left, right) => String(left).localeCompare(String(right)));
  const snapshotResults: V2SnapshotDebugValidation[] = recommendations.map(
    (recommendation) => {
      const validation = validateV2RecommendationSnapshot(recommendation);
      return {
        recommendationId: recommendation.id,
        rank: recommendation.rank,
        sourceMode: recommendation.sourceMode,
        valid: validation.valid,
        reasons: validation.valid ? [] : validation.reasons,
      };
    }
  );
  const fallbackReason = fallbackReasonFor(recommendations);
  if (fallbackReason) {
    return fallbackReport(
      diagnosisId,
      fallbackReason,
      sourceModes,
      snapshotResults
    );
  }

  const snapshots = parseV2RecommendationSet(recommendations);
  if (!snapshots) {
    return fallbackReport(
      diagnosisId,
      "INVALID_V2_SNAPSHOT",
      sourceModes,
      snapshotResults
    );
  }
  const recordsByRank = new Map(
    recommendations.map((recommendation) => [
      recommendation.rank,
      recommendation,
    ])
  );
  const prompts = snapshots.map((snapshot): V2PromptDebugEntry => {
    const compiled = buildCompiledStylePrompt(snapshot);
    return {
      recommendationId: recordsByRank.get(snapshot.selection.rank)!.id,
      rank: snapshot.selection.rank,
      name: snapshot.identity.name,
      macroCategory: snapshot.selection.macroCategory,
      matchScore: snapshot.selection.matchScore,
      compilerVersion: STYLE_PREVIEW_COMPILER_VERSION,
      finalPrompt: compileStylePreviewPrompt(compiled),
      requiredItemKeys: [...snapshot.styleDNA.requiredItems],
      forbiddenItemKeys: [...snapshot.styleDNA.forbiddenItems],
      sceneMood: snapshot.styleDNA.sceneMood,
    };
  });

  return {
    diagnosisId,
    mode: "ARCHETYPE_V2",
    sourceModes,
    validation: { valid: true, fallbackReason: null, snapshotResults },
    prompts,
    comparisons: buildComparisons(snapshots),
  };
}
