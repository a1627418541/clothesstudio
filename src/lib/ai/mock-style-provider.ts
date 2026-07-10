import {
  StyleAiProvider,
  StyleAiInput,
  StyleAiOutput,
  StyleRecommendationOutput,
} from "@/lib/ai/style-ai-provider";
import {
  generateMockStyleRecommendations,
  MockStyleInput,
} from "@/lib/mock-style-engine";

export class MockStyleProvider implements StyleAiProvider {
  async analyze(input: StyleAiInput): Promise<StyleAiOutput> {
    const mockInput: MockStyleInput = {
      gender: input.gender,
      age: input.age,
      heightCm: input.heightCm,
      weightKg: input.weightKg,
    };

    const result = generateMockStyleRecommendations(mockInput);

    const recommendations: StyleRecommendationOutput[] = result.recommendations.map((rec) => ({
      title: rec.title,
      description: rec.description,
      summary: rec.summary,
      clothingAdvice: rec.clothingAdvice,
      hairstyleAdvice: rec.hairstyleAdvice,
      shoesAdvice: rec.shoesAdvice,
      colorPalette: rec.colorPalette,
      avoidTips: rec.avoidTips,
    }));

    return {
      bodyType: result.bodyType,
      faceShape: result.faceShape,
      vibeKeywords: result.vibeKeywords,
      summary: result.summary,
      recommendations,
    };
  }
}
