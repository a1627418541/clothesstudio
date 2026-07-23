import { describe, expect, it } from "vitest";
import { V2_ARCHETYPE_MANIFEST } from "@/lib/style-archetype/archetype-v2-manifest";
import { buildV2RecommendationSnapshot } from "@/lib/style-archetype/recommendation-snapshot";
import {
  buildPersonalTryOnPrompt,
  compilePersonalTryOnPrompt,
  PERSONAL_TRY_ON_COMPILER_VERSION,
} from "./personal-try-on-compiler";

function snapshotFor(slug: string) {
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

describe("personal try-on compiler", () => {
  it("builds a versioned structured prompt and serializes fixed sections deterministically", () => {
    const snapshot = snapshotFor("old-money");
    const compiled = buildPersonalTryOnPrompt({ snapshot });
    const prompt = compilePersonalTryOnPrompt(compiled);

    expect(compiled.compilerVersion).toBe(PERSONAL_TRY_ON_COMPILER_VERSION);
    expect(compiled.styleIdentity.name).toBe(snapshot.identity.name);
    expect(compiled.subject).toEqual(snapshot.subjectContext);
    expect(compiled.requiredItems).toEqual(snapshot.styleDNA.requiredItems);
    expect(compiled.clothingDNA).toBe(snapshot.styleDNA.clothingDNA);
    expect(compiled.silhouette).toBe(snapshot.styleDNA.silhouetteDNA);
    expect(compiled.colorPalette).toEqual(snapshot.styleDNA.colorDNA);
    expect(compiled.forbiddenItems).toEqual(snapshot.styleDNA.forbiddenItems);
    expect(compiled.avoidDNA).toBe(snapshot.styleDNA.avoidDNA);
    expect(Object.isFrozen(compiled)).toBe(true);
    expect(compilePersonalTryOnPrompt(compiled)).toBe(prompt);

    expect(prompt).toContain("[IDENTITY PRESERVATION]");
    expect(prompt).toContain("preserve identity");
    expect(prompt).toContain("preserve recognizable facial features");
    expect(prompt).toContain("preserve hairstyle");
    expect(prompt).toContain("preserve skin tone");
    expect(prompt).toContain("preserve age");
    expect(prompt).toContain("preserve body proportions");
    expect(prompt).toContain("preserve pose where possible");
    expect(prompt).toContain("[EDIT SCOPE]");
    expect(prompt).toContain("replace clothing only");
    expect(prompt).toContain("no face reshaping");
    expect(prompt).toContain("no identity change");
    expect(prompt).toContain("no unrelated accessories");
    expect(prompt).toContain("no text");
    expect(prompt).toContain("no logo");
    expect(prompt).toContain("[STYLE IDENTITY]");
    expect(prompt).toContain("[SUBJECT]");
    expect(prompt).toContain("[REQUIRED OUTFIT]");
    expect(prompt).toContain("[CLOTHING DNA]");
    expect(prompt).toContain("[SILHOUETTE]");
    expect(prompt).toContain("[COLOR PALETTE]");
    expect(prompt).toContain("[FORBIDDEN ITEMS]");
    expect(prompt).toContain("[ARCHETYPE AVOIDANCE]");
    expect(prompt).not.toContain("[SCENE AND MOOD]");
  });

  it("rejects an invalid snapshot", () => {
    const snapshot = snapshotFor("old-money");
    const invalid = { ...snapshot, identity: { ...snapshot.identity, name: "" } };
    expect(() => buildPersonalTryOnPrompt({ snapshot: invalid })).toThrow();
  });
});
