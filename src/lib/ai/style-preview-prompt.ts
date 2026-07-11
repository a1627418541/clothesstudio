export interface ArchetypePreviewPromptInput {
  gender: string;
  age: number;
  bodyType: string | null;
  faceShape: string | null;
  archetype: {
    name: string;
    personalityLabel: string | null;
    imagePromptTemplate: string;
    clothingDNA: string;
    hairstyleDNA: string;
    shoesDNA: string;
    colorDNA: string[];
    avoidDNA: string;
  };
}

export function buildStylePreviewPrompt(input: {
  gender: string;
  age: number;
  title: string;
  description?: string | null;
  summary?: string | null;
  clothingAdvice?: string | null;
  hairstyleAdvice?: string | null;
  shoesAdvice?: string | null;
  colorPalette: string[];
}): string {
  const clothing = input.clothingAdvice?.trim() ?? "Modern, well-fitted clothing.";
  const hair = input.hairstyleAdvice?.trim() ?? "Clean, modern hairstyle.";
  const shoes = input.shoesAdvice?.trim() ?? "Clean, modern shoes.";
  const colors = input.colorPalette?.length ? input.colorPalette.join(", ") : "neutral, versatile tones";

  return `
Create a clean fashion style preview image for a ${input.age}-year-old ${input.gender.toLowerCase()}.
Show a full-body model standing in a minimal studio background with soft, even lighting.
Style direction: ${input.title}.
${input.description ? `Description: ${input.description}` : ""}
${input.summary ? `Summary: ${input.summary}` : ""}
Outfit direction: ${clothing}
Hairstyle direction: ${hair}
Shoe direction: ${shoes}
Use the following color palette: ${colors}.
The image should look like a polished style recommendation card illustration for a fashion app.
Editorial, modern, premium, clean, aspirational.
No text inside the image.
Do not use any uploaded user photos.
Do not generate a transformation image of the user.
Do not include the face of any real person.
  `.trim();
}

export function buildArchetypeStylePreviewPrompt(input: ArchetypePreviewPromptInput): string {
  const gender = input.gender.toLowerCase();
  const bodyTypeHint = input.bodyType ? `${input.bodyType} build` : "balanced proportions";
  const faceShapeHint = input.faceShape ? `${input.faceShape} face shape` : "neutral face shape";
  const colors = input.archetype.colorDNA.length
    ? input.archetype.colorDNA.join(", ")
    : "neutral, versatile tones";

  const substitutions: Record<string, string> = {
    gender,
    personalityLabel: input.archetype.personalityLabel ?? input.archetype.name,
    bodyTypeHint,
    faceShapeHint,
    clothingDNA: input.archetype.clothingDNA,
    shoesDNA: input.archetype.shoesDNA,
    colorDNA: colors,
    hairstyleDNA: input.archetype.hairstyleDNA,
    avoidDNA: input.archetype.avoidDNA,
  };

  const rendered = input.archetype.imagePromptTemplate.replace(
    /\{(\w+)\}/g,
    (_match, key) => substitutions[key] ?? `{${key}}`
  );

  return `${rendered}

Additional constraints for this style preview:
- The model should be a ${input.age}-year-old ${gender} with ${bodyTypeHint} and ${faceShapeHint}.
- Do not include the face of any real person or the uploaded user.
- Do not generate a transformation image of the user.
- No text, logos, or watermarks inside the image.
- Clean studio or neutral background, soft natural light, editorial fashion photography.`;
}
