export interface StyleAiPhotoUrls {
  FACE_FRONT: string;
  FACE_SIDE: string;
  FULL_BODY: string;
}

export interface StyleAiInput {
  userId: string | null;
  anonymousSessionId: string | null;
  diagnosisId: string;
  gender: "MALE" | "FEMALE" | "OTHER";
  age: number;
  heightCm: number;
  weightKg: number;
  photoUrls: StyleAiPhotoUrls;
}

export interface RecommendationItem {
  name: string;
  category: "top" | "bottom" | "outerwear" | "dress" | "shoes" | "accessory" | "bag";
  why: string;
  colors: string[];
  fitNotes: string;
  optional: boolean;
}

export interface StyleRecommendationOutput {
  title: string;
  description: string;
  summary: string;
  clothingAdvice: string;
  hairstyleAdvice: string;
  shoesAdvice: string;
  colorPalette: string[];
  avoidTips: string[];
  items: RecommendationItem[];
}

export interface StyleAiOutput {
  bodyType: string;
  faceShape: string;
  vibeKeywords: string[];
  summary: string;
  recommendations: StyleRecommendationOutput[]; // length === 3; [0] primary, [1][2] alternatives
}

export interface StyleAiProvider {
  analyze(input: StyleAiInput): Promise<StyleAiOutput>;
}
