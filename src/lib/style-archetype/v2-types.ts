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
