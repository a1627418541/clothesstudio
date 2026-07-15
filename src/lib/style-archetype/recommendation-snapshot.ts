import { MacroCategory, RecommendationSource } from "@prisma/client";
import {
  canonicalizeItemList,
  findRequiredForbiddenConflicts,
} from "./canonical-items";
import { EligibleV2Archetype } from "./v2-eligibility";
import {
  normalizeControlledText,
  validateSafeText,
  validateSerializedSize,
} from "./snapshot-safety";
import {
  ArchetypeRecommendationSnapshot,
  SNAPSHOT_SCHEMA_VERSION,
  SNAPSHOT_V1_LIMITS,
  SnapshotRank,
  SubjectGenderPresentation,
  V2SnapshotSetValidationReason,
  V2SnapshotValidationReason,
} from "./v2-types";

export interface SnapshotBuildInput {
  archetype: EligibleV2Archetype;
  rank: SnapshotRank;
  matchScore: number;
  subjectContext: {
    genderPresentation: SubjectGenderPresentation;
    bodyTypeHint: string | null;
    faceShapeHint: string | null;
    ageBand: string | null;
  };
}

export interface StyleRecommendationSnapshotInput {
  sourceMode: RecommendationSource | string | null;
  archetypeVersion: number | null;
  archetypeSnapshot: unknown;
  archetypeId: string | null;
  matchScore: number | null;
  rank: number;
}

export type V2SnapshotValidationResult =
  | { valid: true; snapshot: ArchetypeRecommendationSnapshot }
  | { valid: false; reasons: V2SnapshotValidationReason[] };

export type V2RecommendationSetValidationResult =
  | { valid: true; snapshots: ArchetypeRecommendationSnapshot[] }
  | { valid: false; reason: V2SnapshotSetValidationReason };

type JsonRecord = Record<string, unknown>;

const ROOT_KEYS = [
  "schemaVersion",
  "archetypeVersion",
  "provenance",
  "selection",
  "identity",
  "styleDNA",
  "subjectContext",
] as const;
const PROVENANCE_KEYS = ["archetypeId", "archetypeSlug"] as const;
const SELECTION_KEYS = ["rank", "matchScore", "macroCategory"] as const;
const IDENTITY_KEYS = [
  "name",
  "category",
  "personalityLabel",
  "description",
] as const;
const STYLE_DNA_KEYS = [
  "clothingDNA",
  "hairstyleDNA",
  "shoesDNA",
  "colorDNA",
  "avoidDNA",
  "requiredItems",
  "forbiddenItems",
  "silhouetteDNA",
  "sceneMood",
] as const;
const SUBJECT_KEYS = [
  "genderPresentation",
  "bodyTypeHint",
  "faceShapeHint",
  "ageBand",
] as const;

function isRecord(value: unknown): value is JsonRecord {
  return typeof value === "object" && value !== null && !Array.isArray(value);
}

function hasExactKeys(value: JsonRecord, keys: readonly string[]): boolean {
  const actual = Object.keys(value).sort();
  const expected = [...keys].sort();
  return actual.length === expected.length &&
    actual.every((key, index) => key === expected[index]);
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

function normalizeOptional(value: string | null): string | null {
  return value === null ? null : normalizeControlledText(value);
}

export function buildV2RecommendationSnapshot(
  input: SnapshotBuildInput
): ArchetypeRecommendationSnapshot {
  const requiredItems = canonicalizeItemList(input.archetype.requiredItems);
  const forbiddenItems = canonicalizeItemList(input.archetype.forbiddenItems);
  if (
    requiredItems.length !== input.archetype.requiredItems.length ||
    forbiddenItems.length !== input.archetype.forbiddenItems.length
  ) {
    throw new Error("Cannot build V2 snapshot from non-canonical item data");
  }

  const snapshot: ArchetypeRecommendationSnapshot = {
    schemaVersion: SNAPSHOT_SCHEMA_VERSION,
    archetypeVersion: input.archetype.version,
    provenance: {
      archetypeId: normalizeControlledText(input.archetype.id),
      archetypeSlug: normalizeControlledText(input.archetype.slug),
    },
    selection: {
      rank: input.rank,
      matchScore: input.matchScore,
      macroCategory: input.archetype.macroCategory,
    },
    identity: {
      name: normalizeControlledText(input.archetype.name),
      category: normalizeControlledText(input.archetype.category),
      personalityLabel: normalizeControlledText(input.archetype.personalityLabel),
      description: normalizeControlledText(input.archetype.description),
    },
    styleDNA: {
      clothingDNA: normalizeControlledText(input.archetype.clothingDNA),
      hairstyleDNA: normalizeControlledText(input.archetype.hairstyleDNA),
      shoesDNA: normalizeControlledText(input.archetype.shoesDNA),
      colorDNA: input.archetype.colorDNA.map(normalizeControlledText),
      avoidDNA: normalizeControlledText(input.archetype.avoidDNA),
      requiredItems,
      forbiddenItems,
      silhouetteDNA: normalizeControlledText(input.archetype.silhouetteDNA),
      sceneMood: normalizeControlledText(input.archetype.sceneMood),
    },
    subjectContext: {
      genderPresentation: input.subjectContext.genderPresentation,
      bodyTypeHint: normalizeOptional(input.subjectContext.bodyTypeHint),
      faceShapeHint: normalizeOptional(input.subjectContext.faceShapeHint),
      ageBand: normalizeOptional(input.subjectContext.ageBand),
    },
  };

  const validation = validateV2RecommendationSnapshot({
    sourceMode: RecommendationSource.ARCHETYPE_V2,
    archetypeVersion: snapshot.archetypeVersion,
    archetypeSnapshot: snapshot,
    archetypeId: snapshot.provenance.archetypeId,
    matchScore: snapshot.selection.matchScore,
    rank: snapshot.selection.rank,
  });
  if (!validation.valid) {
    throw new Error(`Invalid V2 snapshot: ${validation.reasons.join(",")}`);
  }
  return validation.snapshot;
}

function invalid(reason: V2SnapshotValidationReason): V2SnapshotValidationResult {
  return { valid: false, reasons: [reason] };
}

function parseSafeText(
  value: unknown,
  maxLength: number
): { valid: true; value: string } | { valid: false; reason: V2SnapshotValidationReason } {
  if (typeof value !== "string") {
    return { valid: false, reason: "MISSING_REQUIRED_FIELD" };
  }
  const result = validateSafeText(value, { maxLength });
  if (!result.valid) {
    return {
      valid: false,
      reason:
        result.code === "TOO_LONG"
          ? "SIZE_LIMIT_EXCEEDED"
          : "UNSAFE_SNAPSHOT_TEXT",
    };
  }
  return result;
}

function parseOptionalSafeText(
  value: unknown
): { valid: true; value: string | null } | {
  valid: false;
  reason: V2SnapshotValidationReason;
} {
  if (value === null) return { valid: true, value: null };
  return parseSafeText(value, SNAPSHOT_V1_LIMITS.item);
}

function parseStringArray(
  value: unknown,
  options: { maxItems: number; canonical?: boolean; reason: V2SnapshotValidationReason }
): { valid: true; value: string[] } | {
  valid: false;
  reason: V2SnapshotValidationReason;
} {
  if (
    !Array.isArray(value) ||
    value.length === 0 ||
    value.length > options.maxItems
  ) {
    return { valid: false, reason: options.reason };
  }
  const parsed: string[] = [];
  for (const item of value) {
    const safe = parseSafeText(item, SNAPSHOT_V1_LIMITS.item);
    if (!safe.valid) {
      return {
        valid: false,
        reason:
          safe.reason === "SIZE_LIMIT_EXCEEDED"
            ? safe.reason
            : options.reason,
      };
    }
    parsed.push(safe.value);
  }
  if (new Set(parsed).size !== parsed.length) {
    return { valid: false, reason: options.reason };
  }
  if (options.canonical) {
    const canonical = canonicalizeItemList(parsed);
    if (
      canonical.length !== parsed.length ||
      canonical.some((item, index) => item !== parsed[index])
    ) {
      return { valid: false, reason: options.reason };
    }
  }
  return { valid: true, value: parsed };
}

export function validateV2RecommendationSnapshot(
  recommendation: StyleRecommendationSnapshotInput
): V2SnapshotValidationResult {
  if (recommendation.sourceMode !== RecommendationSource.ARCHETYPE_V2) {
    return invalid("INVALID_SOURCE_MODE");
  }
  if (!isRecord(recommendation.archetypeSnapshot)) {
    return invalid("MISSING_REQUIRED_FIELD");
  }
  const raw = recommendation.archetypeSnapshot;
  if (!hasExactKeys(raw, ROOT_KEYS)) {
    return invalid("MISSING_REQUIRED_FIELD");
  }
  if (raw.schemaVersion !== SNAPSHOT_SCHEMA_VERSION) {
    return invalid("UNSUPPORTED_SCHEMA_VERSION");
  }
  const size = validateSerializedSize(raw);
  if (!size.valid) return invalid("SIZE_LIMIT_EXCEEDED");
  if (
    !Number.isInteger(recommendation.archetypeVersion) ||
    Number(recommendation.archetypeVersion) < 2 ||
    !Number.isInteger(raw.archetypeVersion) ||
    Number(raw.archetypeVersion) < 2
  ) {
    return invalid("INVALID_ARCHETYPE_VERSION");
  }
  if (raw.archetypeVersion !== recommendation.archetypeVersion) {
    return invalid("VERSION_MISMATCH");
  }

  if (
    !isRecord(raw.provenance) ||
    !hasExactKeys(raw.provenance, PROVENANCE_KEYS) ||
    !isRecord(raw.selection) ||
    !hasExactKeys(raw.selection, SELECTION_KEYS) ||
    !isRecord(raw.identity) ||
    !hasExactKeys(raw.identity, IDENTITY_KEYS) ||
    !isRecord(raw.styleDNA) ||
    !hasExactKeys(raw.styleDNA, STYLE_DNA_KEYS) ||
    !isRecord(raw.subjectContext) ||
    !hasExactKeys(raw.subjectContext, SUBJECT_KEYS)
  ) {
    return invalid("MISSING_REQUIRED_FIELD");
  }

  const archetypeId = parseSafeText(
    raw.provenance.archetypeId,
    SNAPSHOT_V1_LIMITS.item
  );
  const archetypeSlug = parseSafeText(
    raw.provenance.archetypeSlug,
    SNAPSHOT_V1_LIMITS.item
  );
  if (!archetypeId.valid || !archetypeSlug.valid) {
    return invalid(
      (!archetypeId.valid && archetypeId.reason === "SIZE_LIMIT_EXCEEDED") ||
        (!archetypeSlug.valid && archetypeSlug.reason === "SIZE_LIMIT_EXCEEDED")
        ? "SIZE_LIMIT_EXCEEDED"
        : "UNSAFE_SNAPSHOT_TEXT"
    );
  }
  if (
    recommendation.archetypeId === null ||
    archetypeId.value !== recommendation.archetypeId
  ) {
    return invalid("ARCHETYPE_ID_MISMATCH");
  }

  const rank = raw.selection.rank;
  if (
    !Number.isInteger(rank) ||
    ![1, 2, 3].includes(Number(rank)) ||
    rank !== recommendation.rank
  ) {
    return invalid("INVALID_RANK");
  }
  const matchScore = raw.selection.matchScore;
  if (
    typeof matchScore !== "number" ||
    !Number.isInteger(matchScore) ||
    matchScore < 0 ||
    matchScore > 100 ||
    matchScore !== recommendation.matchScore
  ) {
    return invalid("INVALID_MATCH_SCORE");
  }
  if (
    typeof raw.selection.macroCategory !== "string" ||
    !Object.values(MacroCategory).includes(
      raw.selection.macroCategory as MacroCategory
    )
  ) {
    return invalid("INVALID_MACRO_CATEGORY");
  }

  const identityFields = {
    name: parseSafeText(raw.identity.name, SNAPSHOT_V1_LIMITS.name),
    category: parseSafeText(raw.identity.category, SNAPSHOT_V1_LIMITS.category),
    personalityLabel: parseSafeText(
      raw.identity.personalityLabel,
      SNAPSHOT_V1_LIMITS.personalityLabel
    ),
    description: parseSafeText(
      raw.identity.description,
      SNAPSHOT_V1_LIMITS.description
    ),
  };
  const identityFailure = Object.values(identityFields).find(
    (field) => !field.valid
  );
  if (identityFailure && !identityFailure.valid) {
    return invalid(identityFailure.reason);
  }

  const dnaFields = {
    clothingDNA: parseSafeText(raw.styleDNA.clothingDNA, SNAPSHOT_V1_LIMITS.dna),
    hairstyleDNA: parseSafeText(raw.styleDNA.hairstyleDNA, SNAPSHOT_V1_LIMITS.dna),
    shoesDNA: parseSafeText(raw.styleDNA.shoesDNA, SNAPSHOT_V1_LIMITS.dna),
    avoidDNA: parseSafeText(raw.styleDNA.avoidDNA, SNAPSHOT_V1_LIMITS.dna),
    silhouetteDNA: parseSafeText(
      raw.styleDNA.silhouetteDNA,
      SNAPSHOT_V1_LIMITS.silhouette
    ),
    sceneMood: parseSafeText(raw.styleDNA.sceneMood, SNAPSHOT_V1_LIMITS.scene),
  };
  const dnaFailure = Object.values(dnaFields).find((field) => !field.valid);
  if (dnaFailure && !dnaFailure.valid) {
    return invalid(dnaFailure.reason);
  }

  const colorDNA = parseStringArray(raw.styleDNA.colorDNA, {
    maxItems: SNAPSHOT_V1_LIMITS.colors,
    reason: "INVALID_COLOR_DNA",
  });
  if (!colorDNA.valid) return invalid(colorDNA.reason);
  const requiredItems = parseStringArray(raw.styleDNA.requiredItems, {
    maxItems: SNAPSHOT_V1_LIMITS.arrayItems,
    canonical: true,
    reason: "INVALID_REQUIRED_ITEMS",
  });
  if (!requiredItems.valid) return invalid(requiredItems.reason);
  const forbiddenItems = parseStringArray(raw.styleDNA.forbiddenItems, {
    maxItems: SNAPSHOT_V1_LIMITS.arrayItems,
    canonical: true,
    reason: "INVALID_FORBIDDEN_ITEMS",
  });
  if (!forbiddenItems.valid) return invalid(forbiddenItems.reason);
  if (
    findRequiredForbiddenConflicts(
      requiredItems.value,
      forbiddenItems.value
    ).length > 0
  ) {
    return invalid("REQUIRED_FORBIDDEN_CONFLICT");
  }

  const genderPresentation = raw.subjectContext.genderPresentation;
  if (
    genderPresentation !== "MASCULINE" &&
    genderPresentation !== "FEMININE" &&
    genderPresentation !== "ANDROGYNOUS"
  ) {
    return invalid("MISSING_REQUIRED_FIELD");
  }
  const bodyTypeHint = parseOptionalSafeText(raw.subjectContext.bodyTypeHint);
  const faceShapeHint = parseOptionalSafeText(raw.subjectContext.faceShapeHint);
  const ageBand = parseOptionalSafeText(raw.subjectContext.ageBand);
  const subjectFailure = [bodyTypeHint, faceShapeHint, ageBand].find(
    (field) => !field.valid
  );
  if (subjectFailure && !subjectFailure.valid) {
    return invalid(subjectFailure.reason);
  }

  const snapshot: ArchetypeRecommendationSnapshot = {
    schemaVersion: SNAPSHOT_SCHEMA_VERSION,
    archetypeVersion: raw.archetypeVersion as number,
    provenance: {
      archetypeId: archetypeId.value,
      archetypeSlug: archetypeSlug.value,
    },
    selection: {
      rank: rank as SnapshotRank,
      matchScore,
      macroCategory: raw.selection.macroCategory as MacroCategory,
    },
    identity: {
      name: identityFields.name.valid ? identityFields.name.value : "",
      category: identityFields.category.valid ? identityFields.category.value : "",
      personalityLabel: identityFields.personalityLabel.valid
        ? identityFields.personalityLabel.value
        : "",
      description: identityFields.description.valid
        ? identityFields.description.value
        : "",
    },
    styleDNA: {
      clothingDNA: dnaFields.clothingDNA.valid
        ? dnaFields.clothingDNA.value
        : "",
      hairstyleDNA: dnaFields.hairstyleDNA.valid
        ? dnaFields.hairstyleDNA.value
        : "",
      shoesDNA: dnaFields.shoesDNA.valid ? dnaFields.shoesDNA.value : "",
      colorDNA: colorDNA.value,
      avoidDNA: dnaFields.avoidDNA.valid ? dnaFields.avoidDNA.value : "",
      requiredItems: requiredItems.value,
      forbiddenItems: forbiddenItems.value,
      silhouetteDNA: dnaFields.silhouetteDNA.valid
        ? dnaFields.silhouetteDNA.value
        : "",
      sceneMood: dnaFields.sceneMood.valid ? dnaFields.sceneMood.value : "",
    },
    subjectContext: {
      genderPresentation,
      bodyTypeHint: bodyTypeHint.valid ? bodyTypeHint.value : null,
      faceShapeHint: faceShapeHint.valid ? faceShapeHint.value : null,
      ageBand: ageBand.valid ? ageBand.value : null,
    },
  };
  return { valid: true, snapshot: deepFreeze(snapshot) };
}

export function parseV2RecommendationSnapshot(
  recommendation: StyleRecommendationSnapshotInput
): ArchetypeRecommendationSnapshot | null {
  const validation = validateV2RecommendationSnapshot(recommendation);
  return validation.valid ? validation.snapshot : null;
}

export function validateV2RecommendationSet(
  recommendations: readonly StyleRecommendationSnapshotInput[]
): V2RecommendationSetValidationResult {
  if (recommendations.length !== 3) {
    return { valid: false, reason: "SET_SIZE_INVALID" };
  }
  const snapshots: ArchetypeRecommendationSnapshot[] = [];
  for (const recommendation of recommendations) {
    const validation = validateV2RecommendationSnapshot(recommendation);
    if (!validation.valid) {
      return { valid: false, reason: "INVALID_MEMBER" };
    }
    snapshots.push(validation.snapshot);
  }
  const ranks = snapshots.map((snapshot) => snapshot.selection.rank);
  if (new Set(ranks).size !== ranks.length) {
    return { valid: false, reason: "DUPLICATE_RANK" };
  }
  if (![1, 2, 3].every((rank) => ranks.includes(rank as SnapshotRank))) {
    return { valid: false, reason: "RANK_SET_INVALID" };
  }
  const archetypeIds = snapshots.map(
    (snapshot) => snapshot.provenance.archetypeId
  );
  if (new Set(archetypeIds).size !== archetypeIds.length) {
    return { valid: false, reason: "DUPLICATE_ARCHETYPE_ID" };
  }
  snapshots.sort((left, right) => left.selection.rank - right.selection.rank);
  return { valid: true, snapshots };
}

export function parseV2RecommendationSet(
  recommendations: readonly StyleRecommendationSnapshotInput[]
): ArchetypeRecommendationSnapshot[] | null {
  const validation = validateV2RecommendationSet(recommendations);
  return validation.valid ? validation.snapshots : null;
}
