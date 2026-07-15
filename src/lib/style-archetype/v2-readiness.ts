import { GenderScope, MacroCategory } from "@prisma/client";
import {
  getV2ArchetypeValidationReasonCodes,
  V2_ARCHETYPE_SLUGS,
  V2ArchetypeCandidate,
} from "./archetype-v2-manifest";

export type ReadinessUserGender = "MALE" | "FEMALE" | "OTHER";

export interface V2ReadinessPool {
  eligibleCount: number;
  macroCategories: MacroCategory[];
  ready: boolean;
}

export interface V2ReadinessReport {
  ready: boolean;
  expectedArchetypeCount: number;
  eligibleArchetypeCount: number;
  missingExpectedSlugs: string[];
  invalidArchetypes: Array<{
    archetypeId: string;
    reasonCodes: string[];
  }>;
  pools: Record<ReadinessUserGender, V2ReadinessPool>;
}

export function getCompatibleGenderScopes(
  gender: ReadinessUserGender
): GenderScope[] {
  switch (gender) {
    case "MALE":
      return [GenderScope.MALE, GenderScope.UNISEX];
    case "FEMALE":
      return [GenderScope.FEMALE, GenderScope.UNISEX];
    case "OTHER":
      return [GenderScope.OTHER, GenderScope.UNISEX];
  }
}

function getPool(
  gender: ReadinessUserGender,
  eligibleRows: readonly V2ArchetypeCandidate[]
): V2ReadinessPool {
  const scopes = getCompatibleGenderScopes(gender);
  const rows = eligibleRows.filter(
    (row) => row.genderScope && scopes.includes(row.genderScope)
  );
  const macroSet = new Set(rows.map((row) => row.macroCategory).filter(Boolean));
  const macroCategories = Object.values(MacroCategory).filter((macro) =>
    macroSet.has(macro)
  );

  return {
    eligibleCount: rows.length,
    macroCategories,
    ready: rows.length >= 3 && macroCategories.length >= 3,
  };
}

export function getV2ReadinessReport(
  rows: readonly V2ArchetypeCandidate[]
): V2ReadinessReport {
  const expected = new Set<string>(V2_ARCHETYPE_SLUGS);
  const present = new Set(rows.map((row) => row.slug).filter(Boolean));
  const missingExpectedSlugs = V2_ARCHETYPE_SLUGS.filter(
    (slug) => !present.has(slug)
  );
  const invalidArchetypes: V2ReadinessReport["invalidArchetypes"] = [];
  const eligibleRows: V2ArchetypeCandidate[] = [];

  for (const row of rows) {
    const reasonCodes = getV2ArchetypeValidationReasonCodes(row);
    if (!row.slug || !expected.has(row.slug)) reasonCodes.push("UNEXPECTED_SLUG");
    if (reasonCodes.length > 0) {
      invalidArchetypes.push({
        archetypeId: row.id ?? row.slug ?? "<missing>",
        reasonCodes: [...new Set(reasonCodes)],
      });
    } else {
      eligibleRows.push(row);
    }
  }

  const pools = {
    MALE: getPool("MALE", eligibleRows),
    FEMALE: getPool("FEMALE", eligibleRows),
    OTHER: getPool("OTHER", eligibleRows),
  };
  const ready =
    missingExpectedSlugs.length === 0 &&
    invalidArchetypes.length === 0 &&
    eligibleRows.length === V2_ARCHETYPE_SLUGS.length &&
    Object.values(pools).every((pool) => pool.ready);

  return {
    ready,
    expectedArchetypeCount: V2_ARCHETYPE_SLUGS.length,
    eligibleArchetypeCount: eligibleRows.length,
    missingExpectedSlugs,
    invalidArchetypes,
    pools,
  };
}
