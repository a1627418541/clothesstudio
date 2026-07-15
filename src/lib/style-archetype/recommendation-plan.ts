import { RecommendationSource } from "@prisma/client";
import {
  StyleAiOutput,
  StyleRecommendationOutput,
} from "@/lib/ai/style-ai-provider";
import { V2ArchetypeCandidate } from "./archetype-v2-manifest";
import { rankEligibleArchetypes } from "./v2-affinity";
import { collectEligibleV2Archetypes } from "./v2-eligibility";
import {
  buildV2RecommendationSnapshot,
  SnapshotBuildInput,
  StyleRecommendationSnapshotInput,
  validateV2RecommendationSet,
  V2RecommendationSetValidationResult,
} from "./recommendation-snapshot";
import { selectV2TopThree } from "./v2-selector";
import {
  ArchetypeRecommendationSnapshot,
  SnapshotRank,
  V2CreationFallbackReason,
  V2DiagnosisAnalysisInput,
  V2SelectionDiagnostics,
} from "./v2-types";

export interface MatchedLegacyRecommendation {
  recommendation: StyleRecommendationOutput;
  archetypeId?: string | null;
  matchScore?: number | null;
}

export type LegacyRecommendationCandidate =
  | StyleRecommendationOutput
  | MatchedLegacyRecommendation;

export interface V2RecommendationDraft {
  sourceMode: "ARCHETYPE_V2";
  snapshot: ArchetypeRecommendationSnapshot;
}

export interface LegacyRecommendationDraft {
  sourceMode: "LEGACY_AI";
  rank: SnapshotRank;
  recommendation: StyleRecommendationOutput;
  archetypeId: string | null;
  matchScore: number | null;
}

export type RecommendationPlan =
  | {
      mode: "ARCHETYPE_V2";
      drafts: V2RecommendationDraft[];
      diagnostics: V2SelectionDiagnostics;
    }
  | {
      mode: "LEGACY_AI";
      drafts: LegacyRecommendationDraft[];
      diagnostics: V2SelectionDiagnostics;
    };

export interface RecommendationPlanInput {
  featureFlagValue: string | undefined;
  diagnosisAnalysis: V2DiagnosisAnalysisInput;
  archetypes: readonly V2ArchetypeCandidate[];
  legacyRecommendations: readonly LegacyRecommendationCandidate[];
}

export interface RecommendationPlanDependencies {
  parseFeatureFlag(value: string | undefined): boolean;
  buildSnapshot(input: SnapshotBuildInput): ArchetypeRecommendationSnapshot;
  validateSnapshotSet(
    recommendations: readonly StyleRecommendationSnapshotInput[]
  ): V2RecommendationSetValidationResult;
}

const DEFAULT_DEPENDENCIES: RecommendationPlanDependencies = {
  parseFeatureFlag: isStyleArchetypeV2Enabled,
  buildSnapshot: buildV2RecommendationSnapshot,
  validateSnapshotSet: validateV2RecommendationSet,
};

export function isStyleArchetypeV2Enabled(
  value: string | undefined
): boolean {
  return value === "true";
}

function subjectContextFor(
  input: V2DiagnosisAnalysisInput
): SnapshotBuildInput["subjectContext"] {
  const genderPresentation =
    input.gender === "MALE"
      ? "MASCULINE"
      : input.gender === "FEMALE"
        ? "FEMININE"
        : "ANDROGYNOUS";
  const ageBand =
    input.age < 25
      ? "18-24"
      : input.age < 35
        ? "25-34"
        : input.age < 45
          ? "35-44"
          : input.age < 55
            ? "45-54"
            : "55+";
  return {
    genderPresentation,
    bodyTypeHint: input.bodyType,
    faceShapeHint: input.faceShape,
    ageBand,
  };
}

function isMatchedLegacyRecommendation(
  candidate: LegacyRecommendationCandidate
): candidate is MatchedLegacyRecommendation {
  return (
    typeof candidate === "object" &&
    candidate !== null &&
    "recommendation" in candidate
  );
}

function cloneLegacyDraft(
  candidate: LegacyRecommendationCandidate,
  index: number
): LegacyRecommendationDraft {
  const matched = isMatchedLegacyRecommendation(candidate);
  const recommendation = matched ? candidate.recommendation : candidate;
  return {
    sourceMode: RecommendationSource.LEGACY_AI,
    rank: (index + 1) as SnapshotRank,
    recommendation: {
      ...recommendation,
      colorPalette: [...recommendation.colorPalette],
      avoidTips: [...recommendation.avoidTips],
    },
    archetypeId: matched ? candidate.archetypeId ?? null : null,
    matchScore: matched ? candidate.matchScore ?? null : null,
  };
}

function legacyDrafts(
  candidates: readonly LegacyRecommendationCandidate[]
): LegacyRecommendationDraft[] {
  if (candidates.length !== 3) {
    throw new Error("Legacy recommendation set must contain exactly three entries");
  }
  return candidates.map(cloneLegacyDraft);
}

function createDiagnostics(
  input: {
    selectedMode: RecommendationSource;
    eligibleCount?: number;
    ineligible?: Array<{
      archetypeId: string;
      reasons: V2SelectionDiagnostics["ineligibleReasonsByArchetype"][number]["reasonCodes"];
    }>;
    selected?: V2SelectionDiagnostics["selected"];
    availableMacroCategoryCount?: number;
    diversityWarning?: V2SelectionDiagnostics["diversityWarning"];
    fallbackReason: V2CreationFallbackReason | null;
  }
): V2SelectionDiagnostics {
  return {
    pipelineVersion: 2,
    selectedMode: input.selectedMode,
    eligibleCount: input.eligibleCount ?? 0,
    ineligibleReasonsByArchetype: (input.ineligible ?? []).map((row) => ({
      archetypeId: row.archetypeId,
      reasonCodes: [...row.reasons],
    })),
    selected: (input.selected ?? []).map((row) => ({
      rank: row.rank,
      archetypeId: row.archetypeId,
      macroCategory: row.macroCategory,
      matchScore: row.matchScore,
    })),
    availableMacroCategoryCount: input.availableMacroCategoryCount ?? 0,
    diversityWarning: input.diversityWarning ?? null,
    fallbackReason: input.fallbackReason,
  };
}

function legacyPlan(
  input: RecommendationPlanInput,
  diagnostics: Omit<Parameters<typeof createDiagnostics>[0], "selectedMode">
): RecommendationPlan {
  return {
    mode: RecommendationSource.LEGACY_AI,
    drafts: legacyDrafts(input.legacyRecommendations),
    diagnostics: createDiagnostics({
      ...diagnostics,
      selectedMode: RecommendationSource.LEGACY_AI,
    }),
  };
}

function setValidationInput(
  snapshots: readonly ArchetypeRecommendationSnapshot[]
): StyleRecommendationSnapshotInput[] {
  return snapshots.map((snapshot) => ({
    sourceMode: RecommendationSource.ARCHETYPE_V2,
    archetypeVersion: snapshot.archetypeVersion,
    archetypeSnapshot: snapshot,
    archetypeId: snapshot.provenance.archetypeId,
    matchScore: snapshot.selection.matchScore,
    rank: snapshot.selection.rank,
  }));
}

export function buildRecommendationPlan(
  input: RecommendationPlanInput,
  dependencies: Partial<RecommendationPlanDependencies> = {}
): RecommendationPlan {
  const deps = { ...DEFAULT_DEPENDENCIES, ...dependencies };
  if (!deps.parseFeatureFlag(input.featureFlagValue)) {
    return legacyPlan(input, { fallbackReason: "V2_DISABLED" });
  }

  const eligibility = collectEligibleV2Archetypes(
    input.archetypes,
    input.diagnosisAnalysis.gender
  );
  const scored = rankEligibleArchetypes(
    input.diagnosisAnalysis,
    eligibility.eligible.map((row) => row.archetype)
  );
  const selection = selectV2TopThree(scored);
  const commonDiagnostics = {
    eligibleCount: eligibility.eligible.length,
    ineligible: eligibility.ineligible,
    availableMacroCategoryCount: selection.availableMacroCategoryCount,
    diversityWarning: selection.diversityWarning,
    selected: selection.selected.map((row, index) => ({
      rank: (index + 1) as SnapshotRank,
      archetypeId: row.archetype.id,
      macroCategory: row.archetype.macroCategory,
      matchScore: row.matchScore,
    })),
  };
  if (selection.fallbackReason) {
    return legacyPlan(input, {
      ...commonDiagnostics,
      fallbackReason: selection.fallbackReason,
    });
  }

  let snapshots: ArchetypeRecommendationSnapshot[];
  try {
    snapshots = selection.selected.map((row, index) =>
      deps.buildSnapshot({
        archetype: row.archetype,
        rank: (index + 1) as SnapshotRank,
        matchScore: row.matchScore,
        subjectContext: subjectContextFor(input.diagnosisAnalysis),
      })
    );
  } catch {
    return legacyPlan(input, {
      ...commonDiagnostics,
      fallbackReason: "SNAPSHOT_VALIDATION_FAILED",
    });
  }

  const setValidation = deps.validateSnapshotSet(
    setValidationInput(snapshots)
  );
  if (!setValidation.valid) {
    return legacyPlan(input, {
      ...commonDiagnostics,
      fallbackReason: "INVALID_V2_RECOMMENDATION_SET",
    });
  }

  const validatedSnapshots = setValidation.snapshots;
  return {
    mode: RecommendationSource.ARCHETYPE_V2,
    drafts: validatedSnapshots.map((snapshot) => ({
      sourceMode: RecommendationSource.ARCHETYPE_V2,
      snapshot,
    })),
    diagnostics: createDiagnostics({
      ...commonDiagnostics,
      selectedMode: RecommendationSource.ARCHETYPE_V2,
      fallbackReason: null,
    }),
  };
}

export function buildDiagnosisAnalysisInput(output: StyleAiOutput, input: {
  gender: V2DiagnosisAnalysisInput["gender"];
  age: number;
  heightCm: number;
  weightKg: number;
}): V2DiagnosisAnalysisInput {
  return {
    ...input,
    bodyType: output.bodyType,
    faceShape: output.faceShape,
    vibeKeywords: [...output.vibeKeywords],
    diagnosisSummary: output.summary,
  };
}
