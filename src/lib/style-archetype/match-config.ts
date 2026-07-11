export interface MatchWeights {
  vibe: number;
  body: number;
  age: number;
  gender: number;
}

export const MATCH_WEIGHTS: MatchWeights = {
  vibe: 0.5,
  body: 0.2,
  age: 0.15,
  gender: 0.15,
};

export function validateWeights(weights: MatchWeights): void {
  const total = weights.vibe + weights.body + weights.age + weights.gender;
  if (Math.abs(total - 1) > 0.001) {
    throw new Error(`Match weights must sum to 1, got ${total}`);
  }
}

export function normalizeWeights(weights: MatchWeights): MatchWeights {
  const total = weights.vibe + weights.body + weights.age + weights.gender;
  if (total === 0) {
    throw new Error("Match weights cannot all be zero");
  }
  return {
    vibe: weights.vibe / total,
    body: weights.body / total,
    age: weights.age / total,
    gender: weights.gender / total,
  };
}
