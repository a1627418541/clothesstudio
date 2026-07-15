import { ArchetypeRecommendationSnapshot } from "@/lib/style-archetype/v2-types";
import { validateV2RecommendationSnapshot } from "@/lib/style-archetype/recommendation-snapshot";

export const STYLE_PREVIEW_COMPILER_VERSION = 1 as const;

export interface CompiledStylePrompt {
  readonly compilerVersion: typeof STYLE_PREVIEW_COMPILER_VERSION;
  readonly styleIdentity: {
    readonly name: string;
    readonly personalityLabel: string;
    readonly macroCategory: ArchetypeRecommendationSnapshot["selection"]["macroCategory"];
  };
  readonly subject: ArchetypeRecommendationSnapshot["subjectContext"];
  readonly requiredItems: readonly string[];
  readonly clothingDNA: string;
  readonly silhouette: string;
  readonly hairstyle: string;
  readonly footwear: string;
  readonly colorPalette: readonly string[];
  readonly sceneMood: string;
  readonly forbiddenItems: readonly string[];
  readonly avoidDNA: string;
  readonly graphicTreatmentRequired: boolean;
}

function deepFreeze<T>(value: T): T {
  if (value && typeof value === "object" && !Object.isFrozen(value)) {
    Object.freeze(value);
    for (const child of Object.values(value as Record<string, unknown>)) {
      deepFreeze(child);
    }
  }
  return value;
}

function parseValidatedImmutableSnapshot(
  snapshot: ArchetypeRecommendationSnapshot
): ArchetypeRecommendationSnapshot {
  const validation = validateV2RecommendationSnapshot({
    sourceMode: "ARCHETYPE_V2",
    archetypeVersion: snapshot.archetypeVersion,
    archetypeSnapshot: snapshot,
    archetypeId: snapshot.provenance.archetypeId,
    matchScore: snapshot.selection.matchScore,
    rank: snapshot.selection.rank,
  });
  if (!validation.valid) {
    throw new Error(
      "V2 compiler requires a validated immutable Archetype snapshot"
    );
  }
  return validation.snapshot;
}

export function buildCompiledStylePrompt(
  snapshot: ArchetypeRecommendationSnapshot
): CompiledStylePrompt {
  const validated = parseValidatedImmutableSnapshot(snapshot);
  const compiled: CompiledStylePrompt = {
    compilerVersion: STYLE_PREVIEW_COMPILER_VERSION,
    styleIdentity: {
      name: validated.identity.name,
      personalityLabel: validated.identity.personalityLabel,
      macroCategory: validated.selection.macroCategory,
    },
    subject: {
      genderPresentation: validated.subjectContext.genderPresentation,
      bodyTypeHint: validated.subjectContext.bodyTypeHint,
      faceShapeHint: validated.subjectContext.faceShapeHint,
      ageBand: validated.subjectContext.ageBand,
    },
    requiredItems: [...validated.styleDNA.requiredItems],
    clothingDNA: validated.styleDNA.clothingDNA,
    silhouette: validated.styleDNA.silhouetteDNA,
    hairstyle: validated.styleDNA.hairstyleDNA,
    footwear: validated.styleDNA.shoesDNA,
    colorPalette: [...validated.styleDNA.colorDNA],
    sceneMood: validated.styleDNA.sceneMood,
    forbiddenItems: [...validated.styleDNA.forbiddenItems],
    avoidDNA: validated.styleDNA.avoidDNA,
    graphicTreatmentRequired:
      validated.styleDNA.requiredItems.includes("graphic-t-shirt"),
  };
  return deepFreeze(compiled);
}

function readableItem(item: string): string {
  return item.replace(/-/g, " ");
}

function list(items: readonly string[]): string {
  return items.map((item) => `- ${readableItem(item)}`).join("\n");
}

function optionalSubject(label: string, value: string | null): string {
  return `${label}: ${value ?? "not specified"}`;
}

export function compileStylePreviewPrompt(
  compiled: CompiledStylePrompt
): string {
  const graphicTreatmentRule = compiled.graphicTreatmentRequired
    ? "- Render the required graphic t-shirt only as an abstract non-branded graphic treatment with no readable text."
    : "- Do not add graphic treatments that are not present in the required outfit.";

  return [
    "STYLE PREVIEW SPECIFICATION",
    `Compiler version: ${compiled.compilerVersion}`,
    "",
    "[STYLE IDENTITY]",
    `Style name: ${compiled.styleIdentity.name}`,
    `Personality: ${compiled.styleIdentity.personalityLabel}`,
    `Macro category: ${compiled.styleIdentity.macroCategory}`,
    "",
    "[SUBJECT]",
    `Gender presentation: ${compiled.subject.genderPresentation}`,
    optionalSubject("Body type hint", compiled.subject.bodyTypeHint),
    optionalSubject("Face shape hint", compiled.subject.faceShapeHint),
    optionalSubject("Age band", compiled.subject.ageBand),
    "",
    "[REQUIRED OUTFIT]",
    list(compiled.requiredItems),
    "",
    "[CLOTHING DNA]",
    compiled.clothingDNA,
    "",
    "[SILHOUETTE]",
    compiled.silhouette,
    "",
    "[HAIRSTYLE]",
    compiled.hairstyle,
    "",
    "[FOOTWEAR]",
    compiled.footwear,
    "",
    "[COLOR PALETTE]",
    compiled.colorPalette.join(", "),
    "",
    "[SCENE AND MOOD]",
    compiled.sceneMood,
    "",
    "[FORBIDDEN ITEMS]",
    list(compiled.forbiddenItems),
    "",
    "[ARCHETYPE AVOIDANCE]",
    compiled.avoidDNA,
    "",
    "[GLOBAL GUARDRAILS]",
    "- Create a full-body editorial fashion image using the required outfit and stated silhouette.",
    "- No generic casual outfit.",
    "- No plain t-shirt and jeans unless those exact items are required.",
    graphicTreatmentRule,
    "- No text.",
    "- No logo.",
    "- No user face.",
    "- No transformation.",
    "- No uploaded user photo.",
  ].join("\n");
}
