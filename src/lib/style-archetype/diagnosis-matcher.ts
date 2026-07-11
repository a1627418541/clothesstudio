import {
  StyleAiOutput,
  StyleRecommendationOutput,
} from "@/lib/ai/style-ai-provider";
import {
  matchArchetypes,
  ScorableArchetype,
  StyleMatchInput,
} from "./match-archetypes";
import { MATCH_WEIGHTS, MatchWeights } from "./match-config";

export interface MatchedRecommendation {
  recommendation: StyleRecommendationOutput;
  archetypeId: string | null;
  matchScore: number | null;
}

export interface BuildMatchesOptions {
  topK?: number;
  weights?: MatchWeights;
  scoreFloor?: number;
}

function normalizeText(values: string[]): string[] {
  return values
    .map((v) => v.toLowerCase().trim())
    .filter((v) => v.length > 1);
}

function extractNgrams(words: string[], maxN: number): string[] {
  const ngrams: string[] = [];
  for (let n = 1; n <= maxN; n++) {
    for (let i = 0; i <= words.length - n; i++) {
      ngrams.push(words.slice(i, i + n).join(" "));
    }
  }
  return ngrams;
}

function extractNgramsFromText(text: string, maxN: number): string[] {
  const words = normalizeText(text.split(/\W+/));
  return extractNgrams(words, maxN);
}

function extractNgramsFromKeywords(keywords: string[]): string[] {
  const allNgrams = new Set<string>();
  for (const keyword of keywords) {
    for (const ngram of extractNgramsFromText(keyword, 2)) {
      allNgrams.add(ngram);
    }
  }
  return Array.from(allNgrams);
}

function jaccard(a: string[], b: string[]): number {
  const setA = new Set(a);
  const setB = new Set(b);
  if (setA.size === 0 || setB.size === 0) return 0;
  let intersection = 0;
  for (const value of setA) {
    if (setB.has(value)) intersection++;
  }
  return intersection / (setA.size + setB.size - intersection);
}

function scoreRecommendationToArchetype(
  rec: StyleRecommendationOutput,
  archetype: ScorableArchetype
): number {
  const recKeywords = extractNgramsFromText(
    [rec.title, rec.description, rec.summary, rec.clothingAdvice].join(" "),
    2
  );
  const archetypeKeywords = extractNgramsFromKeywords(archetype.keywords);
  const keywordScore = jaccard(recKeywords, archetypeKeywords);

  const text = [rec.title, rec.description, rec.summary].join(" ").toLowerCase();
  const nameScore = text.includes(archetype.name.toLowerCase()) ? 0.3 : 0;

  return Math.min(1, keywordScore + nameScore);
}

function matchesGender(archetype: ScorableArchetype, gender: StyleMatchInput["gender"]): boolean {
  if (archetype.genderScope === "UNISEX" || archetype.genderScope === "OTHER") return true;
  return archetype.genderScope === gender;
}

function assignArchetypesByRecommendation(
  recommendations: StyleRecommendationOutput[],
  rankedArchetypes: ScorableArchetype[],
  gender: StyleMatchInput["gender"],
  options: Required<Pick<BuildMatchesOptions, "topK" | "scoreFloor">>
): MatchedRecommendation[] {
  const assignedArchetypeIds = new Set<string>();
  const usedCategories = new Set<string>();

  return recommendations.map((rec) => {
    const available = rankedArchetypes.filter(
      (a) => !assignedArchetypeIds.has(a.id) && matchesGender(a, gender)
    );

    const scored = available.map((a) => ({
      archetype: a,
      recScore: scoreRecommendationToArchetype(rec, a),
    }));

    const aboveFloor = scored.filter((c) => c.recScore * 100 >= options.scoreFloor);

    const fromFreshCategory = aboveFloor
      .filter((c) => !usedCategories.has(c.archetype.category))
      .sort((a, b) => b.recScore - a.recScore)[0];

    const best =
      fromFreshCategory ??
      aboveFloor.sort((a, b) => b.recScore - a.recScore)[0] ??
      null;

    if (!best) {
      return {
        recommendation: rec,
        archetypeId: null,
        matchScore: null,
      };
    }

    assignedArchetypeIds.add(best.archetype.id);
    usedCategories.add(best.archetype.category);

    return {
      recommendation: rec,
      archetypeId: best.archetype.id,
      matchScore: Math.round(best.recScore * 100),
    };
  });
}

export function buildMatchesFromInput(
  input: Omit<StyleMatchInput, "gender"> & { gender: "MALE" | "FEMALE" | "OTHER" },
  output: StyleAiOutput,
  archetypes: ScorableArchetype[],
  options: BuildMatchesOptions = {}
): MatchedRecommendation[] {
  const topK = options.topK ?? 3;
  const scoreFloor = options.scoreFloor ?? 10;

  const matches = matchArchetypes(input, archetypes, {
    topK: archetypes.length,
    weights: options.weights ?? MATCH_WEIGHTS,
    scoreFloor: 0,
  });

  const rankedArchetypes = matches.map((m) => m.archetype);

  return assignArchetypesByRecommendation(output.recommendations, rankedArchetypes, input.gender, {
    topK,
    scoreFloor,
  });
}

export function buildMatchedRecommendations(
  userInput: {
    gender: "MALE" | "FEMALE" | "OTHER";
    age: number;
    heightCm: number;
    weightKg: number;
  },
  output: StyleAiOutput,
  archetypes: ScorableArchetype[],
  options: BuildMatchesOptions = {}
): MatchedRecommendation[] {
  const matchInput: StyleMatchInput = {
    gender: userInput.gender,
    age: userInput.age,
    heightCm: userInput.heightCm,
    weightKg: userInput.weightKg,
    bodyType: output.bodyType ?? null,
    faceShape: output.faceShape ?? null,
    vibeKeywords: output.vibeKeywords ?? [],
  };

  return buildMatchesFromInput(
    matchInput as Omit<StyleMatchInput, "gender"> & { gender: "MALE" | "FEMALE" | "OTHER" },
    output,
    archetypes,
    options
  );
}
