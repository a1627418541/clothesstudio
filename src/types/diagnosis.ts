import type { MacroCategory, RecommendationSource } from "@prisma/client";

export interface ReportArchetypeMetadata {
  id: string;
  name: string;
  personalityLabel: string | null;
  category: string;
}

interface BaseReportRecommendation {
  id: string;
  rank: number;
  isPrimary: boolean;
  sourceMode: RecommendationSource;
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
  archetype: ReportArchetypeMetadata | null;
  matchScore: number | null;
  personalityLabel: string | null;
  category: string | null;
  macroCategory: MacroCategory | null;
  requiredItems: string[];
  forbiddenItems: string[];
  silhouette: string | null;
  sceneMood: string | null;
  canGeneratePreview: boolean;
}

export interface V2ReportRecommendation extends BaseReportRecommendation {
  displayMode: "ARCHETYPE_V2";
  sourceMode: "ARCHETYPE_V2";
  archetype: ReportArchetypeMetadata;
  matchScore: number;
  personalityLabel: string;
  category: string;
  macroCategory: MacroCategory;
  silhouette: string;
  sceneMood: string;
  canGeneratePreview: true;
}

export interface LegacyReportRecommendation extends BaseReportRecommendation {
  displayMode: "LEGACY";
}

export type ReportRecommendation =
  | V2ReportRecommendation
  | LegacyReportRecommendation;

export type ReportDisplayModel =
  | {
      mode: "ARCHETYPE_V2";
      recommendations: V2ReportRecommendation[];
    }
  | {
      mode: "LEGACY";
      recommendations: LegacyReportRecommendation[];
    };
