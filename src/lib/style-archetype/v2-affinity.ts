import { EligibleV2Archetype } from "./v2-eligibility";
import {
  ArchetypeScoreBreakdown,
  MACRO_CATEGORY_ORDER,
  V2DiagnosisAnalysisInput,
} from "./v2-types";

const WEIGHTS = {
  vibe: 30,
  body: 15,
  face: 10,
  age: 10,
  clothing: 15,
  scene: 10,
  personality: 10,
} as const;

const GENERIC_TERMS = new Set([
  "clean",
  "casual",
  "modern",
  "simple",
  "balanced",
  "comfortable",
]);

const CONTROLLED_ALIAS_GROUPS = [
  ["quiet luxury", "old money", "understated luxury", "refined classic"],
  ["streetwear", "urban street", "street fashion"],
  ["business formal", "executive tailoring", "office professional"],
  ["japanese minimal", "tokyo minimal", "relaxed japanese layering"],
] as const;

type MatchKind = "complete" | "alias" | "multi" | "partial";

interface TextMatch {
  quality: number;
  kind: MatchKind;
  evidence: string;
  term: string;
}

function normalize(value: string): string {
  return value
    .normalize("NFKC")
    .toLowerCase()
    .replace(/[-_/]+/g, " ")
    .replace(/[^\p{L}\p{N}\s]/gu, " ")
    .replace(/\s+/g, " ")
    .trim();
}

function tokens(value: string): string[] {
  return normalize(value).split(" ").filter(Boolean);
}

function areControlledAliases(left: string, right: string): boolean {
  return CONTROLLED_ALIAS_GROUPS.some((group) => {
    const normalized = group.map(normalize);
    return normalized.includes(left) && normalized.includes(right) && left !== right;
  });
}

function capGeneric(quality: number, evidenceTokens: readonly string[]): number {
  return evidenceTokens.length > 0 && evidenceTokens.every((token) => GENERIC_TERMS.has(token))
    ? Math.min(quality, 0.25)
    : quality;
}

function matchText(input: string, candidate: string): TextMatch | null {
  const inputText = normalize(input);
  const term = normalize(candidate);
  if (!inputText || !term) return null;
  const inputTokens = new Set(tokens(inputText));
  const termTokens = tokens(term);

  if (inputText === term || (termTokens.length > 1 && inputText.includes(term))) {
    return {
      quality: capGeneric(1, termTokens),
      kind: "complete",
      evidence: term,
      term,
    };
  }
  if (areControlledAliases(inputText, term)) {
    return { quality: 0.85, kind: "alias", evidence: inputText, term };
  }

  const overlap = termTokens.filter((token) => inputTokens.has(token));
  if (overlap.length === 0) return null;
  if (termTokens.length > 1 && overlap.length === termTokens.length) {
    return {
      quality: capGeneric(0.7, overlap),
      kind: "multi",
      evidence: overlap.sort().join(" "),
      term,
    };
  }
  return {
    quality: capGeneric(Math.min(0.5, (overlap.length / termTokens.length) * 0.5), overlap),
    kind: "partial",
    evidence: overlap.sort().join(" "),
    term,
  };
}

function round2(value: number): number {
  return Math.round(value * 100) / 100;
}

type SummaryChannel = "clothing" | "scene" | "personality";

const CHANNEL_ORDER: SummaryChannel[] = ["clothing", "scene", "personality"];

function classifySummaryMatches(
  summary: string,
  archetype: EligibleV2Archetype
): Array<TextMatch & { channel: SummaryChannel }> {
  const terms: Record<SummaryChannel, string[]> = {
    clothing: archetype.clothingMatchTerms,
    scene: archetype.sceneMatchTerms,
    personality: archetype.personalityTerms,
  };
  const candidates = CHANNEL_ORDER.flatMap((channel) =>
    terms[channel]
      .map((term) => {
        const match = matchText(summary, term);
        return match ? { ...match, channel } : null;
      })
      .filter((match): match is TextMatch & { channel: SummaryChannel } => Boolean(match))
  ).sort(
    (left, right) =>
      right.quality - left.quality ||
      CHANNEL_ORDER.indexOf(left.channel) - CHANNEL_ORDER.indexOf(right.channel) ||
      left.term.localeCompare(right.term)
  );

  const usedEvidence = new Set<string>();
  return candidates.filter((candidate) => {
    if (usedEvidence.has(candidate.evidence)) return false;
    usedEvidence.add(candidate.evidence);
    return true;
  });
}

function maxMatch(inputs: readonly string[], terms: readonly string[]): TextMatch | null {
  const matches = inputs.flatMap((input) =>
    terms.map((term) => matchText(input, term)).filter((match): match is TextMatch => Boolean(match))
  );
  return (
    matches.sort(
      (left, right) => right.quality - left.quality || left.term.localeCompare(right.term)
    )[0] ?? null
  );
}

export interface ScoredEligibleArchetype {
  archetype: EligibleV2Archetype;
  breakdown: ArchetypeScoreBreakdown;
  matchScore: number;
  completePhraseCount: number;
  aliasMatchCount: number;
}

export function scoreEligibleArchetype(
  input: V2DiagnosisAnalysisInput,
  archetype: EligibleV2Archetype
): ScoredEligibleArchetype {
  const vibeMatch = maxMatch(input.vibeKeywords, archetype.vibeAliases);
  const summaryMatches = classifySummaryMatches(input.diagnosisSummary, archetype);
  const channelQuality = (channel: SummaryChannel) =>
    Math.max(
      0,
      ...summaryMatches
        .filter((match) => match.channel === channel)
        .map((match) => match.quality)
    );
  const body = input.bodyType
    ? Number(
        archetype.preferredBodyTypes.some(
          (term) => normalize(term) === normalize(input.bodyType!)
        )
      )
    : 0;
  const face = input.faceShape
    ? Number(
        archetype.preferredFaceShapes.some(
          (term) => normalize(term) === normalize(input.faceShape!)
        )
      )
    : 0;
  const age = Number(input.age >= archetype.ageMin && input.age <= archetype.ageMax);

  const scores = {
    vibe: round2(WEIGHTS.vibe * (vibeMatch?.quality ?? 0)),
    body: WEIGHTS.body * body,
    face: WEIGHTS.face * face,
    age: WEIGHTS.age * age,
    clothing: round2(WEIGHTS.clothing * channelQuality("clothing")),
    scene: round2(WEIGHTS.scene * channelQuality("scene")),
    personality: round2(WEIGHTS.personality * channelQuality("personality")),
  };
  const allMatches = [vibeMatch, ...summaryMatches].filter(
    (match): match is TextMatch => Boolean(match)
  );
  const total = round2(
    Math.min(100, Math.max(0, Object.values(scores).reduce((sum, score) => sum + score, 0)))
  );
  const unique = (values: string[]) => [...new Set(values)];
  const breakdown: ArchetypeScoreBreakdown = {
    ...scores,
    total,
    matchedPhrases: unique(
      allMatches
        .filter((match) => match.kind === "complete" || match.kind === "multi")
        .map((match) => match.evidence)
    ),
    matchedAliases: unique(
      allMatches.filter((match) => match.kind === "alias").map((match) => match.term)
    ),
  };

  return {
    archetype,
    breakdown,
    matchScore: Math.round(total),
    completePhraseCount: allMatches.filter((match) => match.kind === "complete").length,
    aliasMatchCount: allMatches.filter((match) => match.kind === "alias").length,
  };
}

export function rankEligibleArchetypes(
  input: V2DiagnosisAnalysisInput,
  archetypes: readonly EligibleV2Archetype[]
): ScoredEligibleArchetype[] {
  return archetypes
    .map((archetype) => scoreEligibleArchetype(input, archetype))
    .sort(
      (left, right) =>
        right.breakdown.total - left.breakdown.total ||
        right.completePhraseCount - left.completePhraseCount ||
        right.aliasMatchCount - left.aliasMatchCount ||
        MACRO_CATEGORY_ORDER.indexOf(left.archetype.macroCategory) -
          MACRO_CATEGORY_ORDER.indexOf(right.archetype.macroCategory) ||
        left.archetype.slug.localeCompare(right.archetype.slug)
    );
}
