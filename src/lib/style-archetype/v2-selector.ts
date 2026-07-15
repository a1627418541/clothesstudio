import {
  compareScoredEligibleArchetypes,
  ScoredEligibleArchetype,
} from "./v2-affinity";
import {
  V2CreationFallbackReason,
  V2DiversityWarning,
} from "./v2-types";

export interface V2SelectionResult {
  selected: ScoredEligibleArchetype[];
  availableMacroCategoryCount: number;
  diversityWarning: V2DiversityWarning | null;
  fallbackReason: V2CreationFallbackReason | null;
}

export function selectV2TopThree(
  scored: readonly ScoredEligibleArchetype[]
): V2SelectionResult {
  const ranked = [...scored].sort(compareScoredEligibleArchetypes);
  const availableMacroCategoryCount = new Set(
    ranked.map((row) => row.archetype.macroCategory)
  ).size;

  if (ranked.length < 3) {
    return {
      selected: [],
      availableMacroCategoryCount,
      diversityWarning: null,
      fallbackReason: "INSUFFICIENT_ELIGIBLE_ARCHETYPES",
    };
  }

  const selected: ScoredEligibleArchetype[] = [ranked[0]];
  while (selected.length < 3) {
    const usedRows = new Set(selected);
    const usedMacros = new Set(selected.map((row) => row.archetype.macroCategory));
    const nextDifferentMacro = ranked.find(
      (row) => !usedRows.has(row) && !usedMacros.has(row.archetype.macroCategory)
    );
    const nextHighest = ranked.find((row) => !usedRows.has(row));
    selected.push(nextDifferentMacro ?? nextHighest!);
  }

  const diversityWarning: V2DiversityWarning | null =
    availableMacroCategoryCount === 1
      ? "ONLY_ONE_MACRO_CATEGORY"
      : availableMacroCategoryCount === 2
        ? "ONLY_TWO_MACRO_CATEGORIES"
        : null;

  return {
    selected,
    availableMacroCategoryCount,
    diversityWarning,
    fallbackReason: null,
  };
}
