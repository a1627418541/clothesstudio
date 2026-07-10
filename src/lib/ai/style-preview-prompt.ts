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
