import { describe, it, expect } from "vitest";
import {
  buildMatchedRecommendations,
  buildMatchesFromInput,
  MatchedRecommendation,
} from "./diagnosis-matcher";
import { ALL_ARCHETYPES } from "./archetype-data";
import { StyleAiOutput, StyleRecommendationOutput } from "@/lib/ai/style-ai-provider";

function makeRecommendation(
  title: string,
  overrides: Partial<StyleRecommendationOutput> = {}
): StyleRecommendationOutput {
  const defaults: Record<string, Partial<StyleRecommendationOutput>> = {
    "Clean Minimal": {
      description: "Sharp basics, neutral palette, nothing extra.",
      summary: "Modern, clean, and minimal everyday style.",
      clothingAdvice: "Tailored crew-neck tees, tapered chinos, dark denim.",
    },
    "Smart Casual": {
      description: "Polished enough for the office, relaxed enough for dinner.",
      summary: "Refined professional with modern ease.",
      clothingAdvice: "Knit polos, tailored trousers, unstructured blazers.",
    },
    "Old Money": {
      description: "Quiet luxury built on heritage fabrics and timeless silhouettes.",
      summary: "Understated, classic, refined.",
      clothingAdvice: "Cashmere crewnecks and tailored wool trousers.",
    },
    "Streetwear": {
      description: "Urban oversized silhouettes with bold references.",
      summary: "Confident, contemporary street style.",
      clothingAdvice: "Boxy tees, oversized hoodies, cargo pants.",
    },
    "Business Formal": {
      description: "Boardroom-ready tailoring with commanding presence.",
      summary: "Executive, professional, formal.",
      clothingAdvice: "Two-piece suits and crisp dress shirts.",
    },
    "Japanese Minimal": {
      description: "Relaxed proportions, muted tones, intentional layering.",
      summary: "Tokyo minimalist with soft tailoring.",
      clothingAdvice: "Wide-leg trousers, oversized shirts, longline cardigans.",
    },
  };

  const preset = defaults[title] ?? {};

  return {
    title,
    description: "Description",
    summary: "Summary",
    clothingAdvice: "Clothing advice",
    hairstyleAdvice: "Hairstyle advice",
    shoesAdvice: "Shoes advice",
    colorPalette: ["navy", "white", "gray"],
    avoidTips: ["avoid"],
    items: [
      {
        name: `${title} item`,
        category: "top",
        why: "Why this item.",
        colors: ["navy"],
        fitNotes: "Regular fit.",
        optional: false,
      },
    ],
    ...preset,
    ...overrides,
  };
}

function makeOutput(
  recommendations: StyleRecommendationOutput[] = [
    makeRecommendation("Clean Minimal"),
    makeRecommendation("Smart Casual"),
    makeRecommendation("Old Money"),
  ]
): StyleAiOutput {
  return {
    bodyType: "rectangle",
    faceShape: "oval",
    vibeKeywords: ["minimal", "clean", "premium"],
    summary: "Summary",
    recommendations,
  };
}

function extractSlugs(matched: MatchedRecommendation[]): (string | null)[] {
  return matched.map((m) => {
    if (!m.archetypeId) return null;
    const archetype = ALL_ARCHETYPES.find((a) => a.slug === m.archetypeId);
    return archetype?.slug ?? m.archetypeId;
  });
}

const maleUser = {
  gender: "MALE" as const,
  age: 30,
  heightCm: 178,
  weightKg: 75,
};

describe("buildMatchedRecommendations", () => {
  it("maps top 3 archetype matches to 3 recommendations using user profile", () => {
    const output = makeOutput();

    const matched = buildMatchedRecommendations(maleUser, output, ALL_ARCHETYPES);

    expect(matched).toHaveLength(3);
    expect(matched[0].archetypeId).toBeTruthy();
    expect(matched[0].matchScore).toBeGreaterThan(0);
  });

  it("preserves recommendations when archetype list is empty", () => {
    const output = makeOutput();

    const matched = buildMatchedRecommendations(maleUser, output, []);

    expect(matched).toHaveLength(3);
    expect(matched.every((m) => m.archetypeId === null)).toBe(true);
    expect(matched.every((m) => m.matchScore === null)).toBe(true);
    expect(matched.map((m) => m.recommendation.title)).toEqual([
      "Clean Minimal",
      "Smart Casual",
      "Old Money",
    ]);
  });

  it("returns distinct categories for 30 male clean/minimal input", () => {
    const output = makeOutput();

    const matched = buildMatchedRecommendations(maleUser, output, ALL_ARCHETYPES);
    const categories = matched
      .map((m) => ALL_ARCHETYPES.find((a) => a.slug === m.archetypeId)?.category)
      .filter(Boolean);

    expect(new Set(categories).size).toBeGreaterThanOrEqual(2);
  });

  it("ranks Smart Casual, Old Money, and Business Formal highly for 35 male professional", () => {
    const output = makeOutput();
    output.vibeKeywords = ["professional", "executive", "refined"];

    const matched = buildMatchedRecommendations(
      { ...maleUser, age: 35, weightKg: 78 },
      output,
      ALL_ARCHETYPES
    );
    const slugs = extractSlugs(matched);

    const preferred = ["smart-casual", "old-money", "business-formal"];
    const intersection = slugs.filter((s) => s && preferred.includes(s));
    expect(intersection.length).toBeGreaterThanOrEqual(2);
  });

  it("matches each recommendation to a semantically corresponding archetype", () => {
    const recommendations = [
      makeRecommendation("Old Money", {
        description: "Quiet luxury built on heritage fabrics and timeless silhouettes.",
        summary: "Understated, classic, refined.",
        clothingAdvice: "Cashmere crewnecks and tailored wool trousers.",
      }),
      makeRecommendation("Streetwear", {
        description: "Urban oversized silhouettes with bold references.",
        summary: "Confident, contemporary street style.",
        clothingAdvice: "Boxy tees, oversized hoodies, cargo pants.",
      }),
      makeRecommendation("Business Formal", {
        description: "Boardroom-ready tailoring with commanding presence.",
        summary: "Executive, professional, formal.",
        clothingAdvice: "Two-piece suits and crisp dress shirts.",
      }),
    ];
    const output = makeOutput(recommendations);
    output.vibeKeywords = ["classic", "urban", "executive"];

    const matched = buildMatchedRecommendations(
      { ...maleUser, age: 35 },
      output,
      ALL_ARCHETYPES
    );
    const slugs = extractSlugs(matched);

    expect(slugs[0]).toBe("old-money");
    expect(slugs[1]).toBe("streetwear");
    expect(slugs[2]).toBe("business-formal");
  });

  it("matches recommendations using multi-word archetype keywords without relying on title", () => {
    const recommendations = [
      {
        ...makeRecommendation("Any"),
        title: "Direction A",
        description: "A quiet luxury direction built on heritage fabrics.",
        summary: "Classic and refined with premium basics.",
        clothingAdvice: "Timeless silhouettes in neutral tones.",
      },
      {
        ...makeRecommendation("Any"),
        title: "Direction B",
        description: "An urban oversized direction with street fashion energy.",
        summary: "Bold contemporary attitude.",
        clothingAdvice: "Cargo pants and statement outerwear.",
      },
      {
        ...makeRecommendation("Any"),
        title: "Direction C",
        description: "A polished office casual direction.",
        summary: "Refined professional for modern workplace.",
        clothingAdvice: "Knit polos and tailored trousers.",
      },
    ];
    const output = makeOutput(recommendations);

    const matched = buildMatchedRecommendations(maleUser, output, ALL_ARCHETYPES);
    const slugs = extractSlugs(matched);

    expect(slugs[0]).toBe("old-money");
    expect(slugs[1]).toBe("streetwear");
    expect(slugs[2]).toBe("smart-casual");
  });

  it("enforces distinct categories when different category candidates are available", () => {
    const recommendations = [
      {
        ...makeRecommendation("Any"),
        title: "Minimal Look",
        description: "Clean and simple with premium basics.",
      },
      {
        ...makeRecommendation("Any"),
        title: "Another Minimal Look",
        description: "Another clean minimal option.",
      },
      {
        ...makeRecommendation("Any"),
        title: "Urban Look",
        description: "Urban oversized street fashion.",
      },
    ];
    const output = makeOutput(recommendations);

    const matched = buildMatchedRecommendations(maleUser, output, ALL_ARCHETYPES);
    const categories = matched
      .map((m) => ALL_ARCHETYPES.find((a) => a.slug === m.archetypeId)?.category)
      .filter(Boolean);

    expect(new Set(categories).size).toBeGreaterThanOrEqual(2);
    expect(categories[0]).not.toBe(categories[2]);
  });
});

describe("buildMatchesFromInput", () => {
  it("uses explicit matching input", () => {
    const output = makeOutput();
    const input = {
      gender: "MALE" as const,
      age: 35,
      heightCm: 178,
      weightKg: 78,
      bodyType: "rectangle" as const,
      faceShape: "oval" as const,
      vibeKeywords: ["professional", "executive", "refined"],
    };

    const matched = buildMatchesFromInput(input, output, ALL_ARCHETYPES);

    expect(matched).toHaveLength(3);
    expect(matched[0].archetypeId).toBeTruthy();
  });
});
