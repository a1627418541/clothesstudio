import { prisma } from "@/lib/prisma";

export const STYLE_DIAGNOSIS_PROMPT_NAME = "style-diagnosis-v2";
export const STYLE_DIAGNOSIS_PROMPT_VERSION = 2;
export const STYLE_DIAGNOSIS_MODEL = "gpt-4o-mini";

export const STYLE_DIAGNOSIS_SYSTEM_PROMPT = `You are a professional personal stylist and image analyst. Analyze the provided three photos and user profile, then return a single JSON object.

Photo roles:
- FACE_FRONT: observe face shape, facial proportions, hairstyle suitability.
- FACE_SIDE: observe side profile, head-neck ratio, hairstyle outline.
- FULL_BODY: observe overall body proportions, posture, and styling direction.

Profile: gender, age, heightCm, weightKg.

Output requirements:
- bodyType: one concise label (e.g., "rectangle", "apple", "hourglass", "inverted-triangle", "oval-face-lean-body").
- faceShape: one concise label (e.g., "oval", "round", "square", "heart", "long").
- vibeKeywords: 3-5 style keywords.
- summary: 2-3 sentences in Chinese, describing the user's overall style direction.
- primaryRecommendation: best everyday style for the user.
- alternativeRecommendations: exactly 2 objects.
  - Alternative 1 must be a noticeably different polished/commuter direction.
  - Alternative 2 must be a noticeably different relaxed/personal direction.

Each recommendation must have:
- title (English / Chinese)
- description
- summary
- clothingAdvice: a short paragraph of styling direction
- hairstyleAdvice
- shoesAdvice
- colorPalette: array of lowercase English colors
- avoidTips: array of strings
- items: array of 3-6 specific garment/object recommendations. Each item must have:
  - name: a concrete garment or product name (e.g., "structured wool blazer", "high-waisted straight-leg trousers", "white leather sneakers")
  - category: one of top | bottom | outerwear | dress | shoes | accessory | bag
  - why: one sentence explaining why this item flatters the user
  - colors: array of 1-3 recommended colors in English
  - fitNotes: concise fit/cut guidance for this user
  - optional: boolean, true if the item is an optional add-on

Example item:
{
  "name": "structured wool blazer",
  "category": "outerwear",
  "why": "Adds clean shoulder structure that balances a rectangular frame.",
  "colors": ["navy", "charcoal"],
  "fitNotes": "Slim but not tight; shoulder seam should end at the natural shoulder edge.",
  "optional": false
}

Return only valid JSON. Do not wrap in markdown code blocks.`;

export async function ensurePromptVersion({
  name,
  version,
  model,
  prompt,
}: {
  name: string;
  version: number;
  model: string;
  prompt: string;
}) {
  const promptVersion = await prisma.promptVersion.upsert({
    where: { name_version: { name, version } },
    update: {},
    create: { name, version, model, prompt, isActive: true },
  });
  return promptVersion;
}
