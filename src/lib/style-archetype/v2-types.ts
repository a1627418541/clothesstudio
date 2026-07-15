import { MacroCategory, RecommendationSource } from "@prisma/client";

export const ARCHETYPE_V2_VERSION = 2 as const;
export const SNAPSHOT_SCHEMA_VERSION = 1 as const;
export const V2_RECOMMENDATION_SOURCE: RecommendationSource =
  RecommendationSource.ARCHETYPE_V2;

export type ArchetypeMacroCategory = MacroCategory;

export const SNAPSHOT_V1_LIMITS = {
  name: 80,
  category: 60,
  personalityLabel: 120,
  description: 600,
  dna: 1_200,
  silhouette: 600,
  scene: 600,
  arrayItems: 12,
  colors: 10,
  item: 120,
  serializedBytes: 32 * 1024,
} as const;

export const V2_INELIGIBILITY_REASON_ORDER = [
  "INACTIVE",
  "UNSUPPORTED_VERSION",
  "GENDER_INCOMPATIBLE",
  "INVALID_GENDER_SCOPE",
  "INVALID_MACRO_CATEGORY",
  "INVALID_SLUG",
  "INVALID_NAME",
  "INVALID_CATEGORY",
  "INVALID_PERSONALITY",
  "INVALID_DESCRIPTION",
  "INVALID_CLOTHING_DNA",
  "INVALID_HAIRSTYLE_DNA",
  "INVALID_SHOES_DNA",
  "INVALID_COLOR_DNA",
  "INVALID_AVOID_DNA",
  "INVALID_SILHOUETTE",
  "INVALID_SCENE_MOOD",
  "INVALID_REQUIRED_ITEMS",
  "INVALID_FORBIDDEN_ITEMS",
  "REQUIRED_FORBIDDEN_CONFLICT",
  "INVALID_SCORER_TERMS",
  "SCORER_TERMS_OVERLAP",
  "INVALID_KEYWORDS",
  "INVALID_BODY_PREFERENCES",
  "INVALID_FACE_PREFERENCES",
  "INVALID_AGE_RANGE",
  "INVALID_LEGACY_PROMPT_TEMPLATE",
] as const;

export type V2IneligibilityReason =
  (typeof V2_INELIGIBILITY_REASON_ORDER)[number];

export const MACRO_CATEGORY_ORDER: readonly MacroCategory[] = [
  MacroCategory.DAILY_CLEAN,
  MacroCategory.CLASSIC_PREMIUM,
  MacroCategory.BUSINESS_FORMAL,
  MacroCategory.URBAN_STREET,
  MacroCategory.ARTISTIC_MINIMAL,
  MacroCategory.OUTDOOR_FUNCTIONAL,
  MacroCategory.ROMANTIC_SOFT,
  MacroCategory.SPORT_ACTIVE,
  MacroCategory.TREND_YOUTH,
];

export interface V2DiagnosisAnalysisInput {
  gender: "MALE" | "FEMALE" | "OTHER";
  age: number;
  heightCm: number;
  weightKg: number;
  bodyType: string | null;
  faceShape: string | null;
  vibeKeywords: string[];
  diagnosisSummary: string;
}

export interface ArchetypeScoreBreakdown {
  vibe: number;
  body: number;
  face: number;
  age: number;
  clothing: number;
  scene: number;
  personality: number;
  total: number;
  matchedPhrases: string[];
  matchedAliases: string[];
}

export type V2DiversityWarning =
  | "ONLY_TWO_MACRO_CATEGORIES"
  | "ONLY_ONE_MACRO_CATEGORY";

export type V2CreationFallbackReason =
  | "V2_DISABLED"
  | "V2_READINESS_FAILED"
  | "INSUFFICIENT_ELIGIBLE_ARCHETYPES"
  | "SNAPSHOT_VALIDATION_FAILED"
  | "INVALID_V2_RECOMMENDATION_SET";

export type SnapshotRank = 1 | 2 | 3;
export type SubjectGenderPresentation =
  | "MASCULINE"
  | "FEMININE"
  | "ANDROGYNOUS";

export interface ArchetypeRecommendationSnapshot {
  readonly schemaVersion: typeof SNAPSHOT_SCHEMA_VERSION;
  readonly archetypeVersion: number;
  readonly provenance: {
    readonly archetypeId: string;
    readonly archetypeSlug: string;
  };
  readonly selection: {
    readonly rank: SnapshotRank;
    readonly matchScore: number;
    readonly macroCategory: MacroCategory;
  };
  readonly identity: {
    readonly name: string;
    readonly category: string;
    readonly personalityLabel: string;
    readonly description: string;
  };
  readonly styleDNA: {
    readonly clothingDNA: string;
    readonly hairstyleDNA: string;
    readonly shoesDNA: string;
    readonly colorDNA: readonly string[];
    readonly avoidDNA: string;
    readonly requiredItems: readonly string[];
    readonly forbiddenItems: readonly string[];
    readonly silhouetteDNA: string;
    readonly sceneMood: string;
  };
  readonly subjectContext: {
    readonly genderPresentation: SubjectGenderPresentation;
    readonly bodyTypeHint: string | null;
    readonly faceShapeHint: string | null;
    readonly ageBand: string | null;
  };
}

export type V2SnapshotValidationReason =
  | "INVALID_SOURCE_MODE"
  | "UNSUPPORTED_SCHEMA_VERSION"
  | "INVALID_ARCHETYPE_VERSION"
  | "VERSION_MISMATCH"
  | "MISSING_REQUIRED_FIELD"
  | "INVALID_MACRO_CATEGORY"
  | "INVALID_MATCH_SCORE"
  | "INVALID_RANK"
  | "INVALID_COLOR_DNA"
  | "INVALID_REQUIRED_ITEMS"
  | "INVALID_FORBIDDEN_ITEMS"
  | "REQUIRED_FORBIDDEN_CONFLICT"
  | "ARCHETYPE_ID_MISMATCH"
  | "SIZE_LIMIT_EXCEEDED"
  | "UNSAFE_SNAPSHOT_TEXT";

export type V2SnapshotSetValidationReason =
  | "SET_SIZE_INVALID"
  | "INVALID_MEMBER"
  | "DUPLICATE_RANK"
  | "DUPLICATE_ARCHETYPE_ID"
  | "RANK_SET_INVALID";

export interface V2SelectionDiagnostics {
  pipelineVersion: typeof ARCHETYPE_V2_VERSION;
  selectedMode: RecommendationSource;
  eligibleCount: number;
  ineligibleReasonsByArchetype: Array<{
    archetypeId: string;
    reasonCodes: V2IneligibilityReason[];
  }>;
  selected: Array<{
    rank: SnapshotRank;
    archetypeId: string;
    macroCategory: MacroCategory;
    matchScore: number;
  }>;
  availableMacroCategoryCount: number;
  diversityWarning: V2DiversityWarning | null;
  fallbackReason: V2CreationFallbackReason | null;
  infrastructureFailure?: {
    errorCode:
      | "RECOMMENDATION_PERSISTENCE_FAILED"
      | "RESULT_PERSISTENCE_FAILED";
    correlationId: string;
  };
}
