export const CANONICAL_ITEM_KEYS = [
  "t-shirt",
  "graphic-t-shirt",
  "sneakers",
  "statement-sneakers",
  "tailored-trousers",
  "wide-leg-trousers",
  "cargo-pants",
  "jeans",
  "hoodie",
  "knit-polo",
  "cashmere-sweater",
  "blazer",
  "suit-jacket",
  "dress-shirt",
  "loafers",
  "dress-shoes",
  "minimal-leather-shoes",
  "work-boots",
  "trail-shoes",
  "oversized-shirt",
  "relaxed-layering",
  "ripped-jeans",
  "chunky-sneakers",
  "tight-polo",
  "business-suit",
  "loud-graphics",
] as const;

export type CanonicalItemKey = (typeof CANONICAL_ITEM_KEYS)[number];

const ITEM_ALIASES: Record<CanonicalItemKey, readonly string[]> = {
  "t-shirt": ["t-shirt", "t shirt", "tee", "tees"],
  "graphic-t-shirt": ["graphic t-shirt", "graphic t shirt", "graphic tee"],
  sneakers: ["sneakers", "sneaker", "trainers", "trainer"],
  "statement-sneakers": ["statement sneakers", "statement sneaker"],
  "tailored-trousers": [
    "tailored trousers",
    "tailored trouser",
    "trousers",
    "trouser",
    "dress pants",
    "office trousers",
  ],
  "wide-leg-trousers": ["wide-leg trousers", "wide leg trousers", "wide pants"],
  "cargo-pants": ["cargo pants", "cargo trousers", "cargos"],
  jeans: ["jeans", "denim jeans"],
  hoodie: ["hoodie", "hooded sweatshirt"],
  "knit-polo": ["knit polo", "knitted polo", "polo knit"],
  "cashmere-sweater": ["cashmere sweater", "cashmere knit"],
  blazer: ["blazer", "structured blazer", "unstructured blazer"],
  "suit-jacket": ["suit jacket", "tailored suit jacket"],
  "dress-shirt": ["dress shirt", "formal shirt"],
  loafers: ["loafers", "loafer", "leather loafers"],
  "dress-shoes": ["dress shoes", "leather dress shoes"],
  "minimal-leather-shoes": ["minimal leather shoes", "simple leather shoes"],
  "work-boots": ["work boots", "utility boots"],
  "trail-shoes": ["trail shoes", "hiking shoes", "trail sneakers"],
  "oversized-shirt": ["oversized shirt", "relaxed oversized shirt"],
  "relaxed-layering": ["relaxed layering", "layered neutral outfit"],
  "ripped-jeans": ["ripped jeans", "distressed jeans"],
  "chunky-sneakers": ["chunky sneakers", "chunky trainers"],
  "tight-polo": ["tight polo", "fitted polo"],
  "business-suit": ["business suit", "formal suit"],
  "loud-graphics": ["loud graphics", "streetwear graphics"],
};

const ITEM_FAMILY: Record<CanonicalItemKey, string> = {
  "t-shirt": "t-shirt",
  "graphic-t-shirt": "t-shirt",
  sneakers: "sneakers",
  "statement-sneakers": "sneakers",
  "tailored-trousers": "tailored-trousers",
  "wide-leg-trousers": "wide-leg-trousers",
  "cargo-pants": "cargo-pants",
  jeans: "jeans",
  hoodie: "hoodie",
  "knit-polo": "knit-polo",
  "cashmere-sweater": "cashmere-sweater",
  blazer: "tailored-jacket",
  "suit-jacket": "tailored-jacket",
  "dress-shirt": "dress-shirt",
  loafers: "loafers",
  "dress-shoes": "dress-shoes",
  "minimal-leather-shoes": "minimal-leather-shoes",
  "work-boots": "work-boots",
  "trail-shoes": "trail-shoes",
  "oversized-shirt": "oversized-shirt",
  "relaxed-layering": "relaxed-layering",
  "ripped-jeans": "jeans",
  "chunky-sneakers": "sneakers",
  "tight-polo": "polo",
  "business-suit": "tailored-jacket",
  "loud-graphics": "t-shirt",
};

function normalizeAlias(value: string): string {
  return value
    .normalize("NFKC")
    .toLowerCase()
    .replace(/[’']/g, "")
    .replace(/[-_/]+/g, " ")
    .replace(/[^\p{L}\p{N}\s]/gu, " ")
    .replace(/\s+/g, " ")
    .trim();
}

const ALIAS_TO_ITEM = new Map<string, CanonicalItemKey>();

for (const key of CANONICAL_ITEM_KEYS) {
  for (const alias of [key, ...ITEM_ALIASES[key]]) {
    ALIAS_TO_ITEM.set(normalizeAlias(alias), key);
  }
}

export function canonicalizeItem(value: string): CanonicalItemKey | null {
  if (typeof value !== "string") return null;
  return ALIAS_TO_ITEM.get(normalizeAlias(value)) ?? null;
}

export function canonicalizeItemList(values: readonly string[]): CanonicalItemKey[] {
  const result: CanonicalItemKey[] = [];
  const seen = new Set<CanonicalItemKey>();

  for (const value of values) {
    const canonical = canonicalizeItem(value);
    if (canonical && !seen.has(canonical)) {
      seen.add(canonical);
      result.push(canonical);
    }
  }

  return result;
}

export interface RequiredForbiddenConflict {
  required: CanonicalItemKey;
  forbidden: CanonicalItemKey;
}

export function findRequiredForbiddenConflicts(
  requiredItems: readonly string[],
  forbiddenItems: readonly string[]
): RequiredForbiddenConflict[] {
  const required = canonicalizeItemList(requiredItems);
  const forbidden = canonicalizeItemList(forbiddenItems);

  return required.flatMap((requiredKey) =>
    forbidden
      .filter((forbiddenKey) => ITEM_FAMILY[requiredKey] === ITEM_FAMILY[forbiddenKey])
      .map((forbiddenKey) => ({ required: requiredKey, forbidden: forbiddenKey }))
  );
}
