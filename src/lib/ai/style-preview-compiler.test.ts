import { describe, expect, it } from "vitest";
import { V2_ARCHETYPE_MANIFEST } from "@/lib/style-archetype/archetype-v2-manifest";
import { buildV2RecommendationSnapshot } from "@/lib/style-archetype/recommendation-snapshot";
import { ArchetypeRecommendationSnapshot } from "@/lib/style-archetype/v2-types";
import {
  buildCompiledStylePrompt,
  compileStylePreviewPrompt,
} from "./style-preview-compiler";

function snapshotFor(slug: string): ArchetypeRecommendationSnapshot {
  const archetype = V2_ARCHETYPE_MANIFEST.find((row) => row.slug === slug)!;
  return buildV2RecommendationSnapshot({
    archetype,
    rank: 1,
    matchScore: 88,
    subjectContext: {
      genderPresentation: "MASCULINE",
      bodyTypeHint: "rectangle",
      faceShapeHint: "oval",
      ageBand: "25-34",
    },
  });
}

describe("centralized Archetype V2 style preview compiler", () => {
  it("builds a versioned structured prompt and serializes fixed sections deterministically", () => {
    const snapshot = snapshotFor("old-money");
    const compiled = buildCompiledStylePrompt(snapshot);
    const prompt = compileStylePreviewPrompt(compiled);

    expect(compiled).toMatchObject({
      compilerVersion: 1,
      styleIdentity: {
        name: snapshot.identity.name,
        personalityLabel: snapshot.identity.personalityLabel,
        macroCategory: snapshot.selection.macroCategory,
      },
      requiredItems: snapshot.styleDNA.requiredItems,
      clothingDNA: snapshot.styleDNA.clothingDNA,
      silhouette: snapshot.styleDNA.silhouetteDNA,
      hairstyle: snapshot.styleDNA.hairstyleDNA,
      footwear: snapshot.styleDNA.shoesDNA,
      colorPalette: snapshot.styleDNA.colorDNA,
      sceneMood: snapshot.styleDNA.sceneMood,
      forbiddenItems: snapshot.styleDNA.forbiddenItems,
      avoidDNA: snapshot.styleDNA.avoidDNA,
    });
    expect(Object.isFrozen(compiled)).toBe(true);
    expect(compileStylePreviewPrompt(compiled)).toBe(prompt);

    const sections = [
      "[STYLE IDENTITY]",
      "[SUBJECT]",
      "[REQUIRED OUTFIT]",
      "[CLOTHING DNA]",
      "[SILHOUETTE]",
      "[HAIRSTYLE]",
      "[FOOTWEAR]",
      "[COLOR PALETTE]",
      "[SCENE AND MOOD]",
      "[FORBIDDEN ITEMS]",
      "[ARCHETYPE AVOIDANCE]",
      "[GLOBAL GUARDRAILS]",
    ];
    const indexes = sections.map((section) => prompt.indexOf(section));
    expect(indexes.every((index) => index >= 0)).toBe(true);
    expect(indexes).toEqual([...indexes].sort((left, right) => left - right));
  });

  it("rejects unparsed clones carrying database templates or legacy free-form fields", () => {
    const snapshot = snapshotFor("old-money");
    const polluted = {
      ...snapshot,
      imagePromptTemplate: "DATABASE_TEMPLATE_MUST_NOT_EXECUTE",
      title: "LEGACY_TITLE_MUST_NOT_ENTER",
      clothingAdvice: "LEGACY_CLOTHING_MUST_NOT_ENTER",
      freeFormSuffix: "FREE_FORM_SUFFIX_MUST_NOT_ENTER",
    } as ArchetypeRecommendationSnapshot;
    Object.freeze(polluted);
    expect(() => buildCompiledStylePrompt(polluted)).toThrow(
      "validated immutable Archetype snapshot"
    );
  });

  it.each([
    [
      "old-money",
      ["knit polo", "cashmere sweater", "tailored trousers", "loafers"],
    ],
    [
      "business-formal",
      ["suit jacket", "dress shirt", "tailored trousers", "dress shoes"],
    ],
    [
      "streetwear",
      ["oversized", "cargo pants", "statement sneakers"],
    ],
    [
      "japanese-minimal",
      ["relaxed layering", "wide leg trousers", "oversized shirt"],
    ],
  ])("compiles visually explicit anchor requirements for %s", (slug, anchors) => {
    const prompt = compileStylePreviewPrompt(
      buildCompiledStylePrompt(snapshotFor(slug))
    ).toLowerCase();

    for (const anchor of anchors) {
      expect(prompt).toContain(anchor);
    }
  });

  it("applies uniform safety guards and an item-aware t-shirt/jeans rule", () => {
    for (const slug of [
      "old-money",
      "business-formal",
      "streetwear",
      "japanese-minimal",
    ]) {
      const prompt = compileStylePreviewPrompt(
        buildCompiledStylePrompt(snapshotFor(slug))
      ).toLowerCase();
      expect(prompt).toContain("no generic casual outfit");
      expect(prompt).toContain(
        "no plain t-shirt and jeans unless those exact items are required"
      );
      expect(prompt).toContain("no text");
      expect(prompt).toContain("no logo");
      expect(prompt).toContain("no user face");
      expect(prompt).toContain("no transformation");
      expect(prompt).toContain("no uploaded user photo");
    }
  });

  it("renders a required graphic tee only as abstract non-branded treatment", () => {
    const prompt = compileStylePreviewPrompt(
      buildCompiledStylePrompt(snapshotFor("streetwear"))
    ).toLowerCase();

    expect(prompt).toContain("graphic t-shirt");
    expect(prompt).toContain("abstract non-branded graphic treatment");
    expect(prompt).toContain("no readable text");
  });
});
