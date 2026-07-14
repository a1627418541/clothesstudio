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
