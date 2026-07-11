import { GenderScope } from "@prisma/client";
import { MATCH_WEIGHTS, MatchWeights, validateWeights } from "./match-config";

export interface ScorableArchetype {
  id: string;
  slug: string;
  name: string;
  genderScope: GenderScope;
  category: string;
  keywords: string[];
  active: boolean;
}

export interface StyleMatchInput {
  gender: "MALE" | "FEMALE" | "OTHER" | "UNISEX";
  age: number;
  heightCm: number;
  weightKg: number;
  bodyType: string | null;
  faceShape: string | null;
  vibeKeywords: string[];
}

export interface StyleMatchResult<T extends ScorableArchetype = ScorableArchetype> {
  archetypeId: string;
  slug: string;
  name: string;
  score: number;
  archetype: T;
}

export interface MatchOptions {
  topK?: number;
  scoreFloor?: number;
  weights?: MatchWeights;
}

const DEFAULT_TOP_K = 3;
const DEFAULT_SCORE_FLOOR = 30;

function normalizeTextSet(values: string[]): Set<string> {
  return new Set(values.map((v) => v.toLowerCase().trim()).filter(Boolean));
}

function scoreGender(inputGender: StyleMatchInput["gender"], scope: GenderScope): number {
  if (scope === GenderScope.UNISEX || scope === GenderScope.OTHER) return 1;
  return inputGender === scope ? 1 : 0;
}

function scoreVibe(userKeywords: string[], archetypeKeywords: string[]): number {
  if (userKeywords.length === 0 || archetypeKeywords.length === 0) return 0;
  const userSet = normalizeTextSet(userKeywords);
  const archetypeSet = normalizeTextSet(archetypeKeywords);
  if (userSet.size === 0 || archetypeSet.size === 0) return 0;

  let intersection = 0;
  for (const keyword of userSet) {
    if (archetypeSet.has(keyword)) {
      intersection++;
    }
  }
  const union = new Set([...userSet, ...archetypeSet]);
  return intersection / union.size;
}

function scoreBodyType(bodyType: string | null, archetype: ScorableArchetype): number {
  if (!bodyType) return 0.5;
  const lowerBody = bodyType.toLowerCase();
  const preferred = getPreferredBodyTypes(archetype);
  if (preferred.some((p) => lowerBody.includes(p))) return 1;
  return 0.4;
}

function getPreferredBodyTypes(archetype: ScorableArchetype): string[] {
  const categoryMap: Record<string, string[]> = {
    Utility: ["athletic", "rectangle", "broad"],
    Minimal: ["lean", "rectangle", "slim"],
    "Luxury Classic": ["rectangle", "athletic", "lean"],
    Luxury: ["rectangle", "athletic", "lean"],
    Urban: ["rectangle", "athletic"],
    Formal: ["rectangle", "athletic"],
    Classic: ["rectangle", "oval"],
    Outdoor: ["athletic", "rectangle"],
    Effortless: ["rectangle", "lean"],
    Soft: ["hourglass", "pear", "rectangle"],
    Romantic: ["hourglass", "pear"],
    Business: ["rectangle", "hourglass"],
    "Business Casual": ["rectangle", "athletic"],
    Natural: ["rectangle", "hourglass"],
    Trend: ["rectangle", "athletic"],
    Sporty: ["athletic", "rectangle"],
  };
  return categoryMap[archetype.category] ?? ["rectangle"];
}

function scoreAge(age: number, archetype: ScorableArchetype): number {
  const config = getAgeCurve(archetype.category);
  const distance = Math.abs(age - config.peak);
  return Math.max(0, 1 - distance / config.spread);
}

function getAgeCurve(category: string): { peak: number; spread: number } {
  const categoryMap: Record<string, { peak: number; spread: number }> = {
    Trend: { peak: 22, spread: 6 },
    Urban: { peak: 25, spread: 8 },
    Sporty: { peak: 26, spread: 8 },
    Soft: { peak: 26, spread: 8 },
    Natural: { peak: 28, spread: 10 },
    Minimal: { peak: 30, spread: 10 },
    Effortless: { peak: 32, spread: 10 },
    Romantic: { peak: 30, spread: 10 },
    Business: { peak: 32, spread: 12 },
    "Business Casual": { peak: 32, spread: 12 },
    "Luxury Classic": { peak: 35, spread: 12 },
    Luxury: { peak: 35, spread: 12 },
    Classic: { peak: 30, spread: 12 },
    Utility: { peak: 32, spread: 12 },
    Outdoor: { peak: 30, spread: 12 },
    Formal: { peak: 38, spread: 12 },
  };
  return categoryMap[category] ?? { peak: 30, spread: 10 };
}

function computeBaseScore(input: StyleMatchInput, archetype: ScorableArchetype, weights: MatchWeights): number {
  const genderScore = scoreGender(input.gender, archetype.genderScope);
  const vibeScore = scoreVibe(input.vibeKeywords, archetype.keywords);
  const bodyScore = scoreBodyType(input.bodyType, archetype);
  const ageScore = scoreAge(input.age, archetype);

  const weighted =
    weights.gender * genderScore +
    weights.vibe * vibeScore +
    weights.body * bodyScore +
    weights.age * ageScore;

  return Math.round(weighted * 100);
}

function applyCategoryDiversity<T extends ScorableArchetype>(
  results: StyleMatchResult<T>[],
  topK: number
): StyleMatchResult<T>[] {
  const selected: StyleMatchResult<T>[] = [];
  const seenCategories = new Set<string>();
  const fallback: StyleMatchResult<T>[] = [];

  for (const result of results) {
    if (selected.length >= topK) break;

    const category = result.archetype.category;
    if (seenCategories.has(category)) {
      fallback.push(result);
      continue;
    }

    seenCategories.add(category);
    selected.push(result);
  }

  for (const result of fallback) {
    if (selected.length >= topK) break;
    selected.push(result);
  }

  return selected;
}

export function matchArchetypes<T extends ScorableArchetype>(
  input: StyleMatchInput,
  archetypes: T[],
  options: MatchOptions = {}
): StyleMatchResult<T>[] {
  const {
    topK = DEFAULT_TOP_K,
    scoreFloor = DEFAULT_SCORE_FLOOR,
    weights = MATCH_WEIGHTS,
  } = options;

  validateWeights(weights);

  const activeArchetypes = archetypes.filter((a) => a.active);

  const scored = activeArchetypes.map((archetype) => ({
    archetypeId: archetype.id,
    slug: archetype.slug,
    name: archetype.name,
    score: computeBaseScore(input, archetype, weights),
    archetype,
  }));

  const sorted = scored.sort((a, b) => b.score - a.score);
  const aboveFloor = sorted.filter((r) => r.score >= scoreFloor);
  const diversified = applyCategoryDiversity(aboveFloor, topK);

  return diversified.slice(0, topK);
}

export function rankArchetypes<T extends ScorableArchetype>(
  input: StyleMatchInput,
  archetypes: T[],
  options?: MatchOptions
): StyleMatchResult<T>[] {
  return matchArchetypes(input, archetypes, options);
}
