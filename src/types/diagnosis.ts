export interface ReportRecommendation {
  id: string;
  rank: number;
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
  archetype: {
    id: string;
    name: string;
    personalityLabel: string | null;
    category: string;
  } | null;
  matchScore: number | null;
}
