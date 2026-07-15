import { describe, it, expect } from "vitest";
import {
  buildArchetypeStylePreviewPrompt,
  buildLegacyArchetypeStylePreviewPrompt,
  buildStylePreviewPrompt,
} from "./style-preview-prompt";

const oldMoneyArchetype = {
  name: "Old Money",
  personalityLabel: "Modern Gentleman",
  imagePromptTemplate:
    "A full-body fashion editorial photo of a {gender} model embodying the {personalityLabel} style. {bodyTypeHint} {faceShapeHint}. Outfit: {clothingDNA}. Shoes: {shoesDNA}. Colors: {colorDNA}. Hairstyle: {hairstyleDNA}. Avoid: {avoidDNA}.",
  clothingDNA:
    "Cashmere crewnecks, tailored wool trousers, camel overcoats, crisp white shirts, fine-knit polos.",
  hairstyleDNA: "Classic side part, neatly groomed, medium length.",
  shoesDNA: "Dark leather loafers, polished oxford shoes, suede chukka boots.",
  colorDNA: ["navy", "camel", "cream", "bottle green", "burgundy"],
  avoidDNA: "logo-driven pieces, synthetic fabrics, overly tight or oversized fits",
};

const streetwearArchetype = {
  name: "Streetwear",
  personalityLabel: "Urban Creative",
  imagePromptTemplate:
    "A full-body fashion editorial photo of a {gender} model embodying the {personalityLabel} style. {bodyTypeHint} {faceShapeHint}. Outfit: {clothingDNA}. Shoes: {shoesDNA}. Colors: {colorDNA}. Hairstyle: {hairstyleDNA}. Avoid: {avoidDNA}.",
  clothingDNA:
    "Boxy tees, oversized hoodies, cargo pants, bomber jackets, statement outerwear.",
  hairstyleDNA: "Buzz cut, textured crop, braids, or messy fringe.",
  shoesDNA: "High-top sneakers, chunky runners, limited-edition collaborations.",
  colorDNA: ["black", "gray", "white", "neon accent", "earth tone"],
  avoidDNA: "slim-fit formal trousers, polished dress shoes, preppy patterns",
};

describe("buildArchetypeStylePreviewPrompt", () => {
  it("keeps database-template rendering behind an explicit legacy-only entry point", () => {
    const prompt = buildLegacyArchetypeStylePreviewPrompt({
      gender: "MALE",
      age: 35,
      bodyType: "rectangle",
      faceShape: "oval",
      archetype: {
        ...oldMoneyArchetype,
        imagePromptTemplate: "LEGACY DATABASE TEMPLATE: {clothingDNA}",
      },
    });

    expect(prompt).toContain("LEGACY DATABASE TEMPLATE");
    expect(buildArchetypeStylePreviewPrompt).not.toBe(
      buildLegacyArchetypeStylePreviewPrompt
    );
  });

  it("renders archetype DNA fields into the prompt", () => {
    const prompt = buildArchetypeStylePreviewPrompt({
      gender: "MALE",
      age: 35,
      bodyType: "rectangle",
      faceShape: "oval",
      archetype: oldMoneyArchetype,
    });

    expect(prompt).toContain("Modern Gentleman");
    expect(prompt).toContain("Cashmere crewnecks");
    expect(prompt).toContain("Dark leather loafers");
    expect(prompt).toContain("navy, camel, cream");
    expect(prompt).toContain("Classic side part");
    expect(prompt).toContain("logo-driven pieces");
    expect(prompt).toContain("35-year-old male");
  });

  it("produces visually distinct prompts for different archetypes", () => {
    const male35 = {
      gender: "MALE" as const,
      age: 35,
      bodyType: "rectangle" as const,
      faceShape: "oval" as const,
    };

    const oldMoneyPrompt = buildArchetypeStylePreviewPrompt({
      ...male35,
      archetype: oldMoneyArchetype,
    });
    const streetwearPrompt = buildArchetypeStylePreviewPrompt({
      ...male35,
      archetype: streetwearArchetype,
    });

    expect(oldMoneyPrompt).toContain("camel overcoats");
    expect(streetwearPrompt).toContain("oversized hoodies");
    expect(oldMoneyPrompt).not.toContain("oversized hoodies");
    expect(streetwearPrompt).not.toContain("camel overcoats");
  });

  it("keeps safety restrictions", () => {
    const prompt = buildArchetypeStylePreviewPrompt({
      gender: "FEMALE",
      age: 28,
      bodyType: null,
      faceShape: null,
      archetype: oldMoneyArchetype,
    });

    expect(prompt).toContain("Do not include the face of any real person");
    expect(prompt).toContain("Do not generate a transformation image");
    expect(prompt).toContain("No text, logos, or watermarks");
  });
});

describe("buildStylePreviewPrompt", () => {
  it("still works for legacy recommendations without archetype", () => {
    const prompt = buildStylePreviewPrompt({
      gender: "MALE",
      age: 30,
      title: "Smart Casual",
      description: "Polished but relaxed",
      summary: "Office-ready",
      clothingAdvice: "Knit polos and tailored trousers",
      hairstyleAdvice: "Clean taper",
      shoesAdvice: "Leather loafers",
      colorPalette: ["navy", "charcoal", "cream"],
    });

    expect(prompt).toContain("Smart Casual");
    expect(prompt).toContain("Knit polos and tailored trousers");
    expect(prompt).toContain("Do not include the face of any real person");
  });
});
