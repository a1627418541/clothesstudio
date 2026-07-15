import { GenderScope, MacroCategory } from "@prisma/client";
import { ALL_ARCHETYPES, ArchetypeDefinition } from "./archetype-data";
import {
  canonicalizeItemList,
  findRequiredForbiddenConflicts,
} from "./canonical-items";
import { validateSafeText } from "./snapshot-safety";
import { ARCHETYPE_V2_VERSION, SNAPSHOT_V1_LIMITS } from "./v2-types";

export const V2_ARCHETYPE_SLUGS = [
  "clean-minimal",
  "smart-casual",
  "old-money",
  "japanese-minimal",
  "streetwear",
  "business-formal",
  "preppy",
  "workwear",
  "gorpcore",
  "french-casual",
  "minimal-chic",
  "korean-soft-minimal",
  "french-chic",
  "old-money-feminine",
  "romantic-feminine",
  "street-fashion",
  "office-professional",
  "japanese-natural",
  "y2k-trend",
  "active-lifestyle",
] as const;

export type V2ArchetypeSlug = (typeof V2_ARCHETYPE_SLUGS)[number];

interface V2Config {
  genderScope: GenderScope;
  macroCategory: MacroCategory;
  requiredItems: string[];
  forbiddenItems: string[];
  silhouetteDNA: string;
  sceneMood: string;
  sceneMatchTerms: string[];
}

const V2_CONFIG: Record<V2ArchetypeSlug, V2Config> = {
  "clean-minimal": {
    genderScope: GenderScope.UNISEX,
    macroCategory: MacroCategory.DAILY_CLEAN,
    requiredItems: ["t-shirt", "tailored-trousers", "minimal-leather-shoes"],
    forbiddenItems: ["hoodie", "ripped-jeans", "chunky-sneakers", "cargo-pants"],
    silhouetteDNA: "Crisp straight lines with a precise regular fit and restrained structure.",
    sceneMood: "Bright architectural studio with calm daylight and disciplined negative space.",
    sceneMatchTerms: ["architectural daylight studio"],
  },
  "smart-casual": {
    genderScope: GenderScope.MALE,
    macroCategory: MacroCategory.DAILY_CLEAN,
    requiredItems: ["knit-polo", "tailored-trousers", "blazer", "loafers"],
    forbiddenItems: ["hoodie", "graphic-t-shirt", "ripped-jeans", "chunky-sneakers"],
    silhouetteDNA: "Polished tailored separates with an easy shoulder and tapered lower line.",
    sceneMood: "Contemporary hotel lounge at warm late-afternoon light.",
    sceneMatchTerms: ["modern hotel lounge"],
  },
  "old-money": {
    genderScope: GenderScope.MALE,
    macroCategory: MacroCategory.CLASSIC_PREMIUM,
    requiredItems: ["knit-polo", "cashmere-sweater", "tailored-trousers", "loafers"],
    forbiddenItems: ["hoodie", "graphic-t-shirt", "ripped-jeans", "chunky-sneakers"],
    silhouetteDNA: "Quietly structured heritage tailoring with relaxed refinement and no trend exaggeration.",
    sceneMood: "Discreet heritage club terrace with soft overcast editorial light.",
    sceneMatchTerms: ["heritage club terrace"],
  },
  "japanese-minimal": {
    genderScope: GenderScope.UNISEX,
    macroCategory: MacroCategory.ARTISTIC_MINIMAL,
    requiredItems: ["relaxed-layering", "oversized-shirt", "wide-leg-trousers", "minimal-leather-shoes"],
    forbiddenItems: ["tight-polo", "business-suit", "loud-graphics", "statement-sneakers"],
    silhouetteDNA: "Relaxed asymmetric layering with generous volume and a controlled wide-leg line.",
    sceneMood: "Quiet Tokyo concrete gallery with diffuse gray daylight and tactile shadows.",
    sceneMatchTerms: ["tokyo concrete gallery"],
  },
  streetwear: {
    genderScope: GenderScope.UNISEX,
    macroCategory: MacroCategory.URBAN_STREET,
    requiredItems: ["hoodie", "graphic-t-shirt", "cargo-pants", "statement-sneakers"],
    forbiddenItems: ["blazer", "loafers", "tailored-trousers", "dress-shirt"],
    silhouetteDNA: "Deliberately oversized upper volume with wide utility bottoms and grounded footwear.",
    sceneMood: "Graphic urban underpass at blue hour with directional editorial lighting.",
    sceneMatchTerms: ["urban underpass blue hour"],
  },
  "business-formal": {
    genderScope: GenderScope.MALE,
    macroCategory: MacroCategory.BUSINESS_FORMAL,
    requiredItems: ["suit-jacket", "dress-shirt", "tailored-trousers", "dress-shoes"],
    forbiddenItems: ["t-shirt", "hoodie", "sneakers", "jeans"],
    silhouetteDNA: "Commanding structured suit line with a defined shoulder, clean waist, and full trouser break.",
    sceneMood: "Premium boardroom with controlled window light and formal editorial restraint.",
    sceneMatchTerms: ["executive boardroom"],
  },
  preppy: {
    genderScope: GenderScope.MALE,
    macroCategory: MacroCategory.CLASSIC_PREMIUM,
    requiredItems: ["dress-shirt", "knit-polo", "blazer", "loafers"],
    forbiddenItems: ["hoodie", "ripped-jeans", "statement-sneakers", "cargo-pants"],
    silhouetteDNA: "Neat Ivy proportions with a natural shoulder, trim layers, and straight chinos.",
    sceneMood: "Historic campus courtyard in clear autumn daylight.",
    sceneMatchTerms: ["ivy campus courtyard"],
  },
  workwear: {
    genderScope: GenderScope.MALE,
    macroCategory: MacroCategory.OUTDOOR_FUNCTIONAL,
    requiredItems: ["work-boots", "cargo-pants", "jeans", "oversized-shirt"],
    forbiddenItems: ["business-suit", "dress-shoes", "loafers", "minimal-leather-shoes"],
    silhouetteDNA: "Rugged boxy layers with functional ease, sturdy straight legs, and visible material weight.",
    sceneMood: "Honest timber workshop with textured side light and utilitarian atmosphere.",
    sceneMatchTerms: ["heritage timber workshop"],
  },
  gorpcore: {
    genderScope: GenderScope.MALE,
    macroCategory: MacroCategory.OUTDOOR_FUNCTIONAL,
    requiredItems: ["trail-shoes", "cargo-pants", "hoodie", "relaxed-layering"],
    forbiddenItems: ["business-suit", "loafers", "dress-shirt", "tailored-trousers"],
    silhouetteDNA: "Technical layered volume with articulated utility pockets and weather-ready proportions.",
    sceneMood: "Rocky trailhead beside modern concrete architecture under dramatic cloud cover.",
    sceneMatchTerms: ["technical trailhead"],
  },
  "french-casual": {
    genderScope: GenderScope.MALE,
    macroCategory: MacroCategory.DAILY_CLEAN,
    requiredItems: ["oversized-shirt", "tailored-trousers", "blazer", "loafers"],
    forbiddenItems: ["hoodie", "graphic-t-shirt", "cargo-pants", "chunky-sneakers"],
    silhouetteDNA: "Relaxed Parisian tailoring with lightly undone layers and a long clean trouser line.",
    sceneMood: "Quiet Paris side street in soft morning light with understated cinematic grain.",
    sceneMatchTerms: ["paris morning street"],
  },
  "minimal-chic": {
    genderScope: GenderScope.FEMALE,
    macroCategory: MacroCategory.DAILY_CLEAN,
    requiredItems: ["blazer", "wide-leg-trousers", "minimal-leather-shoes", "relaxed-layering"],
    forbiddenItems: ["hoodie", "graphic-t-shirt", "ripped-jeans", "chunky-sneakers"],
    silhouetteDNA: "Long clean feminine lines with controlled volume, precise tailoring, and minimal ornament.",
    sceneMood: "Monochrome design gallery with soft directional daylight.",
    sceneMatchTerms: ["monochrome design gallery"],
  },
  "korean-soft-minimal": {
    genderScope: GenderScope.FEMALE,
    macroCategory: MacroCategory.ROMANTIC_SOFT,
    requiredItems: ["cashmere-sweater", "wide-leg-trousers", "sneakers", "relaxed-layering"],
    forbiddenItems: ["business-suit", "work-boots", "dress-shoes", "loud-graphics"],
    silhouetteDNA: "Soft rounded layers with gentle volume, dropped shoulders, and a fluid lower line.",
    sceneMood: "Airy Seoul cafe interior with pastel daylight and a quiet approachable mood.",
    sceneMatchTerms: ["seoul pastel cafe"],
  },
  "french-chic": {
    genderScope: GenderScope.FEMALE,
    macroCategory: MacroCategory.CLASSIC_PREMIUM,
    requiredItems: ["blazer", "tailored-trousers", "loafers", "oversized-shirt"],
    forbiddenItems: ["hoodie", "cargo-pants", "chunky-sneakers", "loud-graphics"],
    silhouetteDNA: "Effortless fitted-and-relaxed contrast with a softly defined waist and elegant length.",
    sceneMood: "Parisian apartment balcony in natural morning light.",
    sceneMatchTerms: ["paris apartment balcony"],
  },
  "old-money-feminine": {
    genderScope: GenderScope.FEMALE,
    macroCategory: MacroCategory.CLASSIC_PREMIUM,
    requiredItems: ["cashmere-sweater", "tailored-trousers", "loafers", "blazer"],
    forbiddenItems: ["hoodie", "graphic-t-shirt", "ripped-jeans", "chunky-sneakers"],
    silhouetteDNA: "Refined heritage tailoring with a graceful waist, composed layers, and discreet luxury.",
    sceneMood: "Private library salon with soft window light and quiet heritage detail.",
    sceneMatchTerms: ["private heritage library"],
  },
  "romantic-feminine": {
    genderScope: GenderScope.FEMALE,
    macroCategory: MacroCategory.ROMANTIC_SOFT,
    requiredItems: ["relaxed-layering", "cashmere-sweater", "minimal-leather-shoes", "wide-leg-trousers"],
    forbiddenItems: ["hoodie", "cargo-pants", "work-boots", "business-suit"],
    silhouetteDNA: "Flowing feminine volume with a softly articulated waist and delicate movement.",
    sceneMood: "Light-filled conservatory with diffused floral color and gentle editorial softness.",
    sceneMatchTerms: ["romantic glass conservatory"],
  },
  "street-fashion": {
    genderScope: GenderScope.FEMALE,
    macroCategory: MacroCategory.URBAN_STREET,
    requiredItems: ["hoodie", "graphic-t-shirt", "cargo-pants", "statement-sneakers"],
    forbiddenItems: ["blazer", "loafers", "tailored-trousers", "dress-shirt"],
    silhouetteDNA: "Bold oversized street proportions with cropped contrast, utility volume, and platform grounding.",
    sceneMood: "Neon-edged urban plaza at dusk with energetic fashion-editorial framing.",
    sceneMatchTerms: ["neon urban plaza"],
  },
  "office-professional": {
    genderScope: GenderScope.FEMALE,
    macroCategory: MacroCategory.BUSINESS_FORMAL,
    requiredItems: ["blazer", "dress-shirt", "tailored-trousers", "dress-shoes"],
    forbiddenItems: ["t-shirt", "hoodie", "sneakers", "jeans"],
    silhouetteDNA: "Confident structured tailoring with a clean shoulder, defined waist, and full-length trousers.",
    sceneMood: "Modern executive office with crisp architectural light.",
    sceneMatchTerms: ["executive office architecture"],
  },
  "japanese-natural": {
    genderScope: GenderScope.FEMALE,
    macroCategory: MacroCategory.ARTISTIC_MINIMAL,
    requiredItems: ["relaxed-layering", "oversized-shirt", "wide-leg-trousers", "minimal-leather-shoes"],
    forbiddenItems: ["tight-polo", "business-suit", "loud-graphics", "chunky-sneakers"],
    silhouetteDNA: "Soft natural layering with generous ease, rounded volume, and an unforced wide-leg shape.",
    sceneMood: "Quiet timber-and-plaster Japanese interior with warm diffused daylight.",
    sceneMatchTerms: ["japanese timber interior"],
  },
  "y2k-trend": {
    genderScope: GenderScope.FEMALE,
    macroCategory: MacroCategory.TREND_YOUTH,
    requiredItems: ["t-shirt", "cargo-pants", "jeans", "chunky-sneakers"],
    forbiddenItems: ["blazer", "business-suit", "dress-shirt", "loafers"],
    silhouetteDNA: "Playful fitted top and low-slung wide bottom contrast with energetic platform footwear.",
    sceneMood: "Chromed digital studio with candy color, flash photography, and nostalgic pop energy.",
    sceneMatchTerms: ["chrome digital pop studio"],
  },
  "active-lifestyle": {
    genderScope: GenderScope.FEMALE,
    macroCategory: MacroCategory.SPORT_ACTIVE,
    requiredItems: ["hoodie", "sneakers", "t-shirt", "relaxed-layering"],
    forbiddenItems: ["business-suit", "dress-shoes", "loafers", "tailored-trousers"],
    silhouetteDNA: "Athletic layered ease with cropped-and-oversized contrast and clear freedom of movement.",
    sceneMood: "Sunlit modern wellness studio with clean kinetic energy.",
    sceneMatchTerms: ["sunlit wellness studio"],
  },
};

export interface V2ArchetypeManifestEntry
  extends Omit<ArchetypeDefinition, "genderScope"> {
  genderScope: GenderScope;
  macroCategory: MacroCategory;
  requiredItems: string[];
  forbiddenItems: string[];
  silhouetteDNA: string;
  sceneMood: string;
  vibeAliases: string[];
  clothingMatchTerms: string[];
  sceneMatchTerms: string[];
  personalityTerms: string[];
  preferredBodyTypes: string[];
  preferredFaceShapes: string[];
  ageMin: number;
  ageMax: number;
  version: typeof ARCHETYPE_V2_VERSION;
}

const BASE_BY_SLUG = new Map(ALL_ARCHETYPES.map((row) => [row.slug, row]));

export const V2_ARCHETYPE_MANIFEST: V2ArchetypeManifestEntry[] =
  V2_ARCHETYPE_SLUGS.map((slug) => {
    const base = BASE_BY_SLUG.get(slug);
    if (!base) throw new Error(`Missing base archetype: ${slug}`);
    const config = V2_CONFIG[slug];

    return {
      ...base,
      ...config,
      id: slug,
      active: true,
      version: ARCHETYPE_V2_VERSION,
      vibeAliases: [...base.keywords],
      clothingMatchTerms: [...config.requiredItems],
      personalityTerms: [base.personalityLabel.toLowerCase()],
      preferredBodyTypes: ["rectangle", "athletic"],
      preferredFaceShapes: ["oval", "oblong"],
      ageMin: 18,
      ageMax: 70,
    };
  });

export interface V2ManifestValidationError {
  slug: string;
  code: string;
  field?: string;
}

export interface V2ManifestValidationResult {
  valid: boolean;
  errors: V2ManifestValidationError[];
}

type NullablePartial<T> = {
  [Key in keyof T]?: T[Key] | null;
};

export type V2ArchetypeCandidate = NullablePartial<
  Omit<V2ArchetypeManifestEntry, "version">
> & {
  version?: number | null;
};

function hasValidText(value: unknown, maxLength: number): boolean {
  return (
    typeof value === "string" &&
    validateSafeText(value, { maxLength }).valid
  );
}

function hasValidStringArray(
  value: unknown,
  maxItems: number,
  options: { canonical?: boolean } = {}
): value is string[] {
  if (!Array.isArray(value) || value.length === 0 || value.length > maxItems) {
    return false;
  }
  if (
    !value.every(
      (item) =>
        typeof item === "string" &&
        validateSafeText(item, { maxLength: SNAPSHOT_V1_LIMITS.item }).valid
    )
  ) {
    return false;
  }
  return !options.canonical || canonicalizeItemList(value).length === value.length;
}

export function getV2ArchetypeValidationReasonCodes(
  row: V2ArchetypeCandidate
): string[] {
  const reasons: string[] = [];
  const add = (code: string) => {
    if (!reasons.includes(code)) reasons.push(code);
  };

  if (row.active !== true) add("INACTIVE");
  if (row.version !== ARCHETYPE_V2_VERSION) add("UNSUPPORTED_VERSION");
  if (!row.macroCategory || !Object.values(MacroCategory).includes(row.macroCategory)) {
    add("INVALID_MACRO_CATEGORY");
  }

  const textFields: Array<[unknown, number, string]> = [
    [row.name, SNAPSHOT_V1_LIMITS.name, "INVALID_NAME"],
    [row.category, SNAPSHOT_V1_LIMITS.category, "INVALID_CATEGORY"],
    [row.personalityLabel, SNAPSHOT_V1_LIMITS.personalityLabel, "INVALID_PERSONALITY"],
    [row.description, SNAPSHOT_V1_LIMITS.description, "INVALID_DESCRIPTION"],
    [row.clothingDNA, SNAPSHOT_V1_LIMITS.dna, "INVALID_CLOTHING_DNA"],
    [row.hairstyleDNA, SNAPSHOT_V1_LIMITS.dna, "INVALID_HAIRSTYLE_DNA"],
    [row.shoesDNA, SNAPSHOT_V1_LIMITS.dna, "INVALID_SHOES_DNA"],
    [row.avoidDNA, SNAPSHOT_V1_LIMITS.dna, "INVALID_AVOID_DNA"],
    [row.silhouetteDNA, SNAPSHOT_V1_LIMITS.silhouette, "INVALID_SILHOUETTE"],
    [row.sceneMood, SNAPSHOT_V1_LIMITS.scene, "INVALID_SCENE_MOOD"],
  ];
  for (const [value, limit, code] of textFields) {
    if (!hasValidText(value, limit)) add(code);
  }

  if (!hasValidStringArray(row.colorDNA, SNAPSHOT_V1_LIMITS.colors)) {
    add("INVALID_COLOR_DNA");
  }
  if (!hasValidStringArray(row.requiredItems, SNAPSHOT_V1_LIMITS.arrayItems, { canonical: true })) {
    add("INVALID_REQUIRED_ITEMS");
  }
  if (!hasValidStringArray(row.forbiddenItems, SNAPSHOT_V1_LIMITS.arrayItems, { canonical: true })) {
    add("INVALID_FORBIDDEN_ITEMS");
  }
  if (
    Array.isArray(row.requiredItems) &&
    Array.isArray(row.forbiddenItems) &&
    findRequiredForbiddenConflicts(row.requiredItems, row.forbiddenItems).length > 0
  ) {
    add("REQUIRED_FORBIDDEN_CONFLICT");
  }

  const scorerLists = [
    row.vibeAliases,
    row.clothingMatchTerms,
    row.sceneMatchTerms,
    row.personalityTerms,
  ];
  if (!scorerLists.every((list) => hasValidStringArray(list, SNAPSHOT_V1_LIMITS.arrayItems))) {
    add("INVALID_SCORER_TERMS");
  } else {
    const terms = scorerLists
      .flat()
      .map((term) => term.normalize("NFKC").toLowerCase().trim());
    if (new Set(terms).size !== terms.length) add("SCORER_TERMS_OVERLAP");
  }

  if (!hasValidStringArray(row.keywords, SNAPSHOT_V1_LIMITS.arrayItems)) {
    add("INVALID_KEYWORDS");
  }
  if (!hasValidStringArray(row.preferredBodyTypes, SNAPSHOT_V1_LIMITS.arrayItems)) {
    add("INVALID_BODY_PREFERENCES");
  }
  if (!hasValidStringArray(row.preferredFaceShapes, SNAPSHOT_V1_LIMITS.arrayItems)) {
    add("INVALID_FACE_PREFERENCES");
  }
  if (
    !Number.isInteger(row.ageMin) ||
    !Number.isInteger(row.ageMax) ||
    Number(row.ageMin) < 0 ||
    Number(row.ageMax) > 120 ||
    Number(row.ageMin) > Number(row.ageMax)
  ) {
    add("INVALID_AGE_RANGE");
  }
  if (!row.genderScope || !Object.values(GenderScope).includes(row.genderScope)) {
    add("INVALID_GENDER_SCOPE");
  }
  if (!hasValidText(row.slug, SNAPSHOT_V1_LIMITS.name)) add("INVALID_SLUG");
  if (!hasValidText(row.imagePromptTemplate, SNAPSHOT_V1_LIMITS.dna)) {
    add("INVALID_LEGACY_PROMPT_TEMPLATE");
  }

  return reasons;
}

export function validateV2Manifest(
  rows: readonly V2ArchetypeCandidate[]
): V2ManifestValidationResult {
  const errors: V2ManifestValidationError[] = [];
  const seen = new Set<string>();
  const expected = new Set<string>(V2_ARCHETYPE_SLUGS);

  for (const row of rows) {
    const slug = typeof row.slug === "string" ? row.slug : "<missing>";
    if (seen.has(slug)) errors.push({ slug, code: "DUPLICATE_SLUG" });
    seen.add(slug);
    if (!expected.has(slug)) errors.push({ slug, code: "UNEXPECTED_SLUG" });
    for (const code of getV2ArchetypeValidationReasonCodes(row)) {
      errors.push({ slug, code });
    }
  }

  for (const slug of V2_ARCHETYPE_SLUGS) {
    if (!seen.has(slug)) errors.push({ slug, code: "MISSING_SLUG" });
  }

  return { valid: errors.length === 0, errors };
}
