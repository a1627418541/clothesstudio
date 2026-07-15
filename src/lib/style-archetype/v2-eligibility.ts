import { GenderScope } from "@prisma/client";
import {
  getV2ArchetypeValidationReasonCodes,
  V2ArchetypeCandidate,
  V2ArchetypeManifestEntry,
} from "./archetype-v2-manifest";
import {
  canonicalizeItemList,
  CanonicalItemKey,
} from "./canonical-items";
import {
  V2_INELIGIBILITY_REASON_ORDER,
  V2IneligibilityReason,
} from "./v2-types";

export type EligibilityUserGender = "MALE" | "FEMALE" | "OTHER";
export type EligibleV2Archetype = Omit<V2ArchetypeManifestEntry, "version"> & {
  version: number;
};

export interface EligibleV2ArchetypeResult {
  eligible: true;
  archetype: EligibleV2Archetype;
  canonicalRequiredItems: CanonicalItemKey[];
  canonicalForbiddenItems: CanonicalItemKey[];
}

export interface IneligibleV2ArchetypeResult {
  eligible: false;
  reasons: V2IneligibilityReason[];
}

export type V2EligibilityResult =
  | EligibleV2ArchetypeResult
  | IneligibleV2ArchetypeResult;

const GENDER_SCOPES: Record<EligibilityUserGender, readonly GenderScope[]> = {
  MALE: [GenderScope.MALE, GenderScope.UNISEX],
  FEMALE: [GenderScope.FEMALE, GenderScope.UNISEX],
  OTHER: [GenderScope.OTHER, GenderScope.UNISEX],
};

const REASON_INDEX = new Map(
  V2_INELIGIBILITY_REASON_ORDER.map((reason, index) => [reason, index])
);

function sortReasons(reasons: Iterable<V2IneligibilityReason>) {
  return [...new Set(reasons)].sort(
    (left, right) =>
      (REASON_INDEX.get(left) ?? Number.MAX_SAFE_INTEGER) -
        (REASON_INDEX.get(right) ?? Number.MAX_SAFE_INTEGER) ||
      left.localeCompare(right)
  );
}

export function evaluateV2Eligibility(
  archetype: V2ArchetypeCandidate,
  userGender: EligibilityUserGender
): V2EligibilityResult {
  const reasons = new Set<V2IneligibilityReason>();
  const structuralReasons = getV2ArchetypeValidationReasonCodes({
    ...archetype,
    version: 2,
  });
  for (const reason of structuralReasons) {
    reasons.add(reason as V2IneligibilityReason);
  }

  if (!Number.isInteger(archetype.version) || Number(archetype.version) < 2) {
    reasons.add("UNSUPPORTED_VERSION");
  }
  if (
    !archetype.genderScope ||
    !GENDER_SCOPES[userGender].includes(archetype.genderScope)
  ) {
    reasons.add("GENDER_INCOMPATIBLE");
  }

  if (reasons.size > 0) {
    return { eligible: false, reasons: sortReasons(reasons) };
  }

  return {
    eligible: true,
    archetype: archetype as EligibleV2Archetype,
    canonicalRequiredItems: canonicalizeItemList(archetype.requiredItems!),
    canonicalForbiddenItems: canonicalizeItemList(archetype.forbiddenItems!),
  };
}

export interface V2EligibilityCollection {
  eligible: EligibleV2ArchetypeResult[];
  ineligible: Array<{
    archetypeId: string;
    reasons: V2IneligibilityReason[];
  }>;
}

export function collectEligibleV2Archetypes(
  archetypes: readonly V2ArchetypeCandidate[],
  userGender: EligibilityUserGender
): V2EligibilityCollection {
  const eligible: EligibleV2ArchetypeResult[] = [];
  const ineligible: V2EligibilityCollection["ineligible"] = [];

  for (const archetype of archetypes) {
    const result = evaluateV2Eligibility(archetype, userGender);
    if (result.eligible) {
      eligible.push(result);
    } else {
      ineligible.push({
        archetypeId: archetype.id ?? archetype.slug ?? "<missing>",
        reasons: result.reasons,
      });
    }
  }

  eligible.sort((left, right) => left.archetype.slug.localeCompare(right.archetype.slug));
  ineligible.sort((left, right) => left.archetypeId.localeCompare(right.archetypeId));
  return { eligible, ineligible };
}
