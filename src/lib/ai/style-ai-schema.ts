import { z } from "zod";

export const styleRecommendationOutputSchema = z.object({
  title: z.string().min(1),
  description: z.string().min(1),
  summary: z.string().min(1),
  clothingAdvice: z.string().min(1),
  hairstyleAdvice: z.string().min(1),
  shoesAdvice: z.string().min(1),
  colorPalette: z.array(z.string().min(1)).min(3).max(7),
  avoidTips: z.array(z.string().min(1)).min(1).max(5),
});

export const styleAiOutputSchema = z.object({
  bodyType: z.string().min(1),
  faceShape: z.string().min(1),
  vibeKeywords: z.array(z.string().min(1)).min(3).max(5),
  summary: z.string().min(1),
  primaryRecommendation: styleRecommendationOutputSchema,
  alternativeRecommendations: z.array(styleRecommendationOutputSchema).length(2),
});

export type StyleAiOutputSchema = z.infer<typeof styleAiOutputSchema>;
