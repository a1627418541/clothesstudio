import { ArchetypeRecommendationSnapshot } from "@/lib/style-archetype/v2-types";
import { validateV2RecommendationSnapshot } from "@/lib/style-archetype/recommendation-snapshot";

export const PERSONAL_TRY_ON_COMPILER_VERSION = 1 as const;

export interface PersonalTryOnPromptInput {
  snapshot: ArchetypeRecommendationSnapshot;
}

export interface CompiledPersonalTryOnPrompt {
  readonly compilerVersion: typeof PERSONAL_TRY_ON_COMPILER_VERSION;
  readonly styleIdentity: {
    readonly name: string;
    readonly personalityLabel: string;
    readonly macroCategory: ArchetypeRecommendationSnapshot["selection"]["macroCategory"];
  };
  readonly subject: ArchetypeRecommendationSnapshot["subjectContext"];
  readonly requiredItems: readonly string[];
  readonly clothingDNA: string;
  readonly silhouette: string;
  readonly colorPalette: readonly string[];
  readonly forbiddenItems: readonly string[];
  readonly avoidDNA: string;
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
      "Personal try-on compiler requires a validated immutable Archetype snapshot"
    );
  }
  return validation.snapshot;
}

export function buildPersonalTryOnPrompt(
  input: PersonalTryOnPromptInput
): CompiledPersonalTryOnPrompt {
  const validated = parseValidatedImmutableSnapshot(input.snapshot);
  const compiled: CompiledPersonalTryOnPrompt = {
    compilerVersion: PERSONAL_TRY_ON_COMPILER_VERSION,
    styleIdentity: {
      name: validated.identity.name,
      personalityLabel: validated.identity.personalityLabel,
      macroCategory: validated.selection.macroCategory,
    },
    subject: validated.subjectContext,
    requiredItems: [...validated.styleDNA.requiredItems],
    clothingDNA: validated.styleDNA.clothingDNA,
    silhouette: validated.styleDNA.silhouetteDNA,
    colorPalette: [...validated.styleDNA.colorDNA],
    forbiddenItems: [...validated.styleDNA.forbiddenItems],
    avoidDNA: validated.styleDNA.avoidDNA,
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

export function compilePersonalTryOnPrompt(
  compiled: CompiledPersonalTryOnPrompt
): string {
  return [
    "PERSONAL VIRTUAL TRY-ON SPECIFICATION",
    `Compiler version: ${compiled.compilerVersion}`,
    "",
    "[IDENTITY PRESERVATION]",
    "- preserve identity",
    "- preserve recognizable facial features",
    "- preserve hairstyle",
    "- preserve skin tone",
    "- preserve age",
    "- preserve body proportions",
    "- preserve pose where possible",
    "",
    "[EDIT SCOPE]",
    "- replace clothing only",
    "- replace footwear only if required by the style",
    "- no face reshaping",
    "- no identity change",
    "- no unrelated accessories",
    "- no text",
    "- no logo",
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
    "[COLOR PALETTE]",
    compiled.colorPalette.join(", "),
    "",
    "[FORBIDDEN ITEMS]",
    list(compiled.forbiddenItems),
    "",
    "[ARCHETYPE AVOIDANCE]",
    compiled.avoidDNA,
  ].join("\n");
}
