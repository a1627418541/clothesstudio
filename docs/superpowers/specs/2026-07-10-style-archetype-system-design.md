# Style Archetype System Design Spec

**Date:** 2026-07-10
**Sprint:** 3.7
**Status:** Design — pending review

---

## 1. Product Goal

Upgrade the current fixed-style recommendation engine into an extensible **Style Archetype System**.

Instead of returning visually similar "Clean Casual / Casual Minimal / Relaxed Casual" results, the system will assign the user a **Style Identity**: a ranked set of 3 distinct archetypes with clear visual differences.

**Input:**
- Gender
- Age
- Height / Weight
- Body Type
- Face Shape
- Vibe Keywords
- Lifestyle (future extension)

**Output:**
- Top 3 `StyleArchetype` matches, each with a match score
- Each archetype exposes `name` for internal use and `personalityLabel` for user-facing identity (e.g. "Old Money" → "Modern Gentleman")
- Each archetype drives distinct `clothingDNA`, `hairstyleDNA`, `shoesDNA`, `colorDNA`, `avoidDNA`
- Each archetype produces an `imagePromptTemplate` so generated preview images have recognizable visual identity

---

## 2. Core Principles

1. **Visual differentiation first.** Top 3 recommendations must look meaningfully different in a mood board.
2. **Data-driven archetypes.** No hard-coded style definitions in application code.
3. **Gender-aware but not gender-limited.** `genderScope` controls applicability; unisex archetypes are valid.
4. **Scoring over rules.** Match engine returns scores, not fixed branches, so results can be tuned without code changes.
5. **Image identity baked in.** Every archetype carries a dedicated image prompt template.
6. **Future-proof.** Admin backend, product mapping, and affiliate links are not implemented now, but the schema must support them.

---

## 3. Data Model

### 3.1 New model: `StyleArchetype`

```prisma
model StyleArchetype {
  id                  String   @id @default(cuid())
  slug                String   @unique
  name                String
  genderScope         GenderScope
  category            String
  description         String   @db.Text
  personalityLabel    String?  // e.g. "Modern Gentleman" for display to the user
  keywords            String[]
  clothingDNA         String   @db.Text
  hairstyleDNA        String   @db.Text
  shoesDNA            String   @db.Text
  colorDNA            String[]
  avoidDNA            String   @db.Text
  imagePromptTemplate String   @db.Text
  version             Int      @default(1)
  active              Boolean  @default(true)
  createdAt           DateTime @default(now())
  updatedAt           DateTime @updatedAt

  recommendations StyleRecommendation[]

  @@index([genderScope, active])
  @@index([category])
}
```

### 3.2 Supporting enum

```prisma
enum GenderScope {
  MALE
  FEMALE
  UNISEX
  OTHER
}
```

`OTHER` matches all gender inputs and is used for fully unisex or gender-neutral archetypes. It also aligns with the existing `Gender.OTHER` value in `StyleDiagnosis`.

### 3.3 Change to `StyleRecommendation`

Add a relation so each recommendation is linked to an archetype:

```prisma
model StyleRecommendation {
  ...existing fields...

  archetypeId String?
  archetype   StyleArchetype? @relation(fields: [archetypeId], references: [id], onDelete: SetNull)

  matchScore  Int? // 0-100, populated at generation time
}
```

Existing advice fields (`summary`, `clothingAdvice`, `hairstyleAdvice`, `shoesAdvice`, `colorPalette`, `avoidTips`) are **not removed**. For new recommendations the application reads from the linked `StyleArchetype`; for historical records without an `archetypeId`, the report continues to use the legacy fields. This preserves backward compatibility.

### 3.4 Migration strategy

1. Create `GenderScope` enum.
2. Create `StyleArchetype` table.
3. Add `archetypeId` and `matchScore` to `StyleRecommendation`.
4. Seed first 20 archetypes (10 male, 10 female) via a Prisma seed script.
5. Backfill existing recommendations by matching their title/summary text to archetype keywords (optional, can run as a one-off script).

---

## 4. First Style Library

### 4.1 Male Archetypes (10)

| # | Slug | Name | Category | Keywords |
|---|------|------|----------|----------|
| 1 | `clean-minimal` | Clean Minimal | Minimal | minimal, clean, simple, premium basics |
| 2 | `smart-casual` | Smart Casual | Business Casual | modern, refined, office casual |
| 3 | `old-money` | Old Money | Luxury Classic | quiet luxury, classic, heritage |
| 4 | `japanese-minimal` | Japanese Minimal | Minimal | japanese, layering, relaxed tailoring |
| 5 | `streetwear` | Streetwear | Urban | urban, oversized, street fashion |
| 6 | `business-formal` | Business Formal | Formal | executive, professional, formal |
| 7 | `preppy` | Preppy | Classic | ivy league, college, classic |
| 8 | `workwear` | Workwear | Utility | utility, rugged, heritage |
| 9 | `gorpcore` | Gorpcore | Outdoor | outdoor, technical, functional |
| 10 | `french-casual` | French Casual | Effortless | parisian, effortless, chic |

> Note: `cleafit` is intentionally excluded from v1 archetypes. It can be surfaced later as a `Trend` tag rather than a full archetype.

### 4.2 Female Archetypes (10)

| # | Slug | Name | Category | Keywords |
|---|------|------|----------|----------|
| 1 | `minimal-chic` | Minimal Chic | Minimal | minimal, modern, premium |
| 2 | `korean-soft-minimal` | Korean Soft Minimal | Soft | korean, soft, feminine |
| 3 | `french-chic` | French Chic | Effortless | parisian, elegant, effortless |
| 4 | `old-money-feminine` | Old Money Feminine | Luxury Classic | quiet luxury, classic, luxury |
| 5 | `romantic-feminine` | Romantic Feminine | Romantic | romantic, soft, elegant |
| 6 | `street-fashion` | Street Fashion | Urban | urban, cool, trend |
| 7 | `office-professional` | Office Professional | Business | professional, confident, modern |
| 8 | `japanese-natural` | Japanese Natural | Natural | natural, relaxed, soft |
| 9 | `y2k-trend` | Y2K Trend | Trend | youth, trend, fashion |
| 10 | `active-lifestyle` | Active Lifestyle | Sporty | sporty, healthy, dynamic |

---

## 5. Style Matching Engine

### 5.1 Inputs

```ts
interface StyleMatchInput {
  gender: "MALE" | "FEMALE" | "OTHER";
  age: number;
  heightCm: number;
  weightKg: number;
  bodyType: string | null;
  faceShape: string | null;
  vibeKeywords: string[];
}
```

### 5.2 Output

```ts
interface StyleMatchResult {
  archetypeId: string;
  slug: string;
  name: string;
  score: number; // 0-100
  archetype: StyleArchetype;
}
```

Top 3 results are returned, sorted by score descending.

### 5.3 Scoring factors (v1)

| Factor | Weight | How |
|--------|--------|-----|
| Vibe keyword overlap | 50% | Jaccard similarity between user vibe keywords and archetype keywords. |
| Body-type fit | 20% | Archetype has preferred body types. e.g. Workwear suits athletic/broad; Clean Minimal suits lean. |
| Age fit | 15% | Archetype has an implicit age curve. e.g. Y2K/Streetwear favor younger; Old Money favors 28+. |
| Gender scope | 15% | Male/Female/Unisex/Other match. MALE input matches MALE, UNISEX, and OTHER. |

Weights are stored in a configuration object, not hard-coded inside the scoring function:

```ts
export const MATCH_WEIGHTS = {
  vibe: 0.5,
  body: 0.2,
  age: 0.15,
  gender: 0.15,
};
```

This allows future tuning without changing the match function. Weights are exported from a dedicated module (e.g. `src/lib/style-archetype/match-config.ts`).

### 5.4 Category diversity rule

After computing base scores, if two candidates share the same `category`, the lower-scored one receives a small penalty (e.g. -5 points). This prevents "Clean Minimal / Japanese Minimal / French Casual" from all being "Minimal/Effortless" categories.

### 5.5 Score normalization

- Each factor returns 0-1.
- Weighted sum produces 0-1.
- Multiply by 100 and round to integer.
- Minimum score floor: 30. Anything below is filtered out.

---

## 6. Image Prompt Template Strategy

Each archetype stores an `imagePromptTemplate` field.

Template uses variable substitution:

```text
A full-body fashion editorial photo of a {gender} model embodying the {personalityLabel} style. {bodyTypeHint} {faceShapeHint}. Outfit: {clothingDNA}. Shoes: {shoesDNA}. Colors: {colorDNA}. Hairstyle: {hairstyleDNA}. Avoid: {avoidDNA}. Clean studio background, soft natural light, no text, no user face, no transformation.
```

At runtime, the engine fills placeholders using:
- `gender` from diagnosis
- `archetypeName`, `clothingDNA`, etc. from the archetype
- `bodyTypeHint` / `faceShapeHint` derived from diagnosis and archetype guidance

This guarantees that an Old Money image looks visibly different from a Streetwear image even if both are generated for the same user.

---

## 7. Integration with Existing Flow

### 7.1 Diagnosis generation

Current flow:
- `POST /api/diagnosis` → text diagnosis → 3 fixed recommendations

New flow:
- `POST /api/diagnosis` → text diagnosis
- Text diagnosis still produces body type, face shape, vibe keywords, summary
- `StyleArchetype` selection happens after diagnosis
- For each of the top 3 matches, create a `StyleRecommendation` linked to `archetypeId` and `matchScore`
- New recommendations continue to store advice fields (populated from the archetype DNA), keeping the schema compatible with historical records that do not have an archetype
- At read time, the report page prefers archetype data when `archetypeId` is present; otherwise it falls back to the legacy `StyleRecommendation` advice fields

### 7.2 Style preview image generation

Replace the generic prompt builder with the archetype's `imagePromptTemplate`.
- `generateStylePreviewImage` receives the selected archetype
- Prompt is rendered from the template
- Generated image visually reflects the archetype identity

### 7.3 Report page

- Display archetype name and match score
- Show category label
- Keep existing image / advice layout

---

## 8. API Surface Changes

### 8.1 New internal module

```ts
// src/lib/style-archetype/match-archetypes.ts
export async function matchArchetypes(input: StyleMatchInput): Promise<StyleMatchResult[]>;
```

### 8.2 Existing module changes

- `src/lib/diagnosis-service.ts`: include archetype data in `DiagnosisDetail`
- `src/lib/ai/style-preview-prompt.ts`: render archetype image prompt template
- `src/lib/mock-style-engine.ts` (or replacement): use archetypes instead of hard-coded branches
- `src/app/api/diagnosis/route.ts`: create recommendations from archetype matches

---

## 9. Future Extensibility

### 9.1 Admin backend

- CRUD endpoints for `StyleArchetype`
- Soft-delete via `active` flag
- Versioning via `updatedAt` + optional `version` field later

### 9.2 Product recommendations

Add a join table:

```prisma
model ArchetypeProductMapping {
  id            String @id @default(cuid())
  archetypeId   String
  productUrl    String
  affiliateTag  String?
  priority      Int    @default(0)
}
```

### 9.3 Affiliate monetization

- Store `affiliateTag` per product mapping
- Add `StyleArchetype.commercialNotes` text field for copy
- Future report section: "Shop this archetype"

### 9.4 A/B testing archetypes

- Add `StyleArchetype.variantGroup` and `StyleArchetype.isControl` fields
- Match engine can filter to active experiment group

---

## 10. Non-Goals for This Sprint

- Admin UI for archetype management
- Product / affiliate mapping
- A/B testing framework
- Real-time archetype learning from user feedback
- Lifestyle input field

---

## 11. Success Criteria

- [ ] `StyleArchetype` table exists and is seeded with 20 archetypes (10 male, 10 female)
- [ ] `StyleRecommendation` links to `archetypeId` and stores `matchScore`; legacy advice fields remain for historical records
- [ ] A user receives 3 distinct archetypes with no duplicate categories in the top 3
- [ ] Preview images for the top 3 look visually different
- [ ] Lint, typecheck, and build pass
- [ ] Existing diagnoses remain readable after migration

---

## 12. Open Questions

1. Should `cleafit` be spelled `cleafit` or `clean-fit` for the slug?
2. Should the matching engine run in the same API call as diagnosis, or be split into a background step?
3. Do we want archetype-specific `avoidTips` in v1, or derive them from category?
4. Should `colorDNA` store Tailwind-ish hex strings or descriptive color names?

---

## 13. File References

- New spec: `docs/superpowers/specs/2026-07-10-style-archetype-system-design.md`
- Planned migration: `prisma/migrations/YYYYMMDDHMMSS_add_style_archetype_table/`
- Seed script: `prisma/seed-style-archetypes.ts`
- Match engine: `src/lib/style-archetype/match-archetypes.ts`
- Prompt template renderer: `src/lib/ai/style-preview-prompt.ts`
