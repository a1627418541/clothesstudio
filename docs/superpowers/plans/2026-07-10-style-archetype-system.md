# Style Archetype System Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Replace the fixed gender-based mock recommendations with a data-driven Style Archetype System that stores archetypes in the database, scores them against the user's profile, and produces three visually distinct recommendations with archetype-specific image prompts.

**Architecture:** Add a `StyleArchetype` table and link `StyleRecommendation` to it via `archetypeId`. Build a scoring engine in pure TypeScript that ranks active archetypes by vibe keyword overlap, body type, age, and gender using configurable weights. Seed the database with 20 archetypes, then wire the diagnosis API to select the top 3 and store them. The report page reads archetype data when present and falls back to legacy recommendation fields for historical records.

**Tech Stack:** Next.js 15, React 19, TypeScript, Prisma 7, PostgreSQL, Tailwind CSS, Vitest.

## Global Constraints

- Keep all existing `StyleRecommendation` advice fields for backward compatibility.
- `GenderScope` enum must include `OTHER` to align with `Gender.OTHER`.
- `StyleArchetype.version` defaults to `1`.
- Matching weights live in `src/lib/style-archetype/match-config.ts`, not inside the scoring function.
- No admin UI, product mapping, affiliate logic, or A/B testing in this sprint.
- Lint, typecheck (`npx tsc --noEmit`), and build (`npm run build`) must pass.
- Tests use Vitest and live next to the code they test.

---

## File Structure

- `prisma/schema.prisma` — add `GenderScope` enum, `StyleArchetype` model, and `archetypeId`/`matchScore` to `StyleRecommendation`.
- `prisma/migrations/YYYYMMDDHMMSS_add_style_archetype/` — generated migration.
- `prisma/seed-style-archetypes.ts` — seed the first 20 archetypes (10 male, 10 female).
- `src/lib/style-archetype/match-config.ts` — exported weight config.
- `src/lib/style-archetype/match-archetypes.ts` — scoring engine.
- `src/lib/style-archetype/match-archetypes.test.ts` — unit tests for scoring.
- `src/lib/style-archetype/archetype-data.ts` — raw archetype definitions used by seed and tests.
- `src/lib/style-archetype/build-recommendation.ts` — map archetype + user profile to a `StyleRecommendationOutput` shape.
- `src/lib/ai/style-preview-prompt.ts` — extend to render archetype `imagePromptTemplate`.
- `src/lib/ai/style-preview-service.ts` — accept archetype when generating preview image.
- `src/lib/ai/mock-style-provider.ts` — replace fixed mock output with archetype matches.
- `src/lib/diagnosis-service.ts` — include archetype data in `DiagnosisDetail`, with legacy fallback.
- `src/app/api/diagnosis/route.ts` — create recommendations from archetype matches.
- `src/app/api/diagnosis/[id]/style-previews/route.ts` — pass archetype to image generator.
- `src/components/diagnosis/primary-style-direction.tsx` — display archetype name / personality label / score.
- `src/components/diagnosis/alternative-style-card.tsx` — display archetype name / personality label / score.

---

## Task 1: Prisma Schema Migration

**Files:**
- Modify: `prisma/schema.prisma`
- Create: `prisma/migrations/20260711000000_add_style_archetype/migration.sql`
- Test: `npx prisma generate` and `npx prisma migrate dev --name add_style_archetype`

**Interfaces:**
- Produces: `StyleArchetype` Prisma model, `GenderScope` enum, updated `StyleRecommendation` with `archetypeId` and `matchScore`.

- [ ] **Step 1: Add `GenderScope` enum and `StyleArchetype` model to schema**

Open `prisma/schema.prisma`. Add the enum after the existing enums:

```prisma
enum GenderScope {
  MALE
  FEMALE
  UNISEX
  OTHER
}
```

Add the model after `StyleDiagnosis`:

```prisma
model StyleArchetype {
  id                  String   @id @default(cuid())
  slug                String   @unique
  name                String
  genderScope         GenderScope
  category            String
  description         String   @db.Text
  personalityLabel    String?
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

- [ ] **Step 2: Link `StyleRecommendation` to `StyleArchetype`**

In `prisma/schema.prisma`, in `model StyleRecommendation`, add after the existing fields:

```prisma
  archetypeId String?
  archetype   StyleArchetype? @relation(fields: [archetypeId], references: [id], onDelete: SetNull)

  matchScore  Int?
```

Do **not** remove any existing fields (`summary`, `clothingAdvice`, `hairstyleAdvice`, `shoesAdvice`, `colorPalette`, `avoidTips`).

- [ ] **Step 3: Generate and apply migration**

Run:

```bash
npx prisma generate
npx prisma migrate dev --name add_style_archetype
```

Expected: migration succeeds, `prisma/migrations/20260711000000_add_style_archetype/` is created.

- [ ] **Step 4: Commit**

```bash
git add prisma/schema.prisma prisma/migrations/20260711000000_add_style_archetype/
git commit -m "feat(db): add StyleArchetype model and link to StyleRecommendation"
```

---

## Task 2: Archetype Data Definitions

**Files:**
- Create: `src/lib/style-archetype/archetype-data.ts`
- Test: `src/lib/style-archetype/archetype-data.test.ts`

**Interfaces:**
- Produces: `ArchetypeDefinition` type, `MALE_ARCHETYPES`, `FEMALE_ARCHETYPES` arrays.
- Consumes: nothing.

- [ ] **Step 1: Define the archetype definition type and seed data**

Create `src/lib/style-archetype/archetype-data.ts`:

```ts
export interface ArchetypeDefinition {
  slug: string;
  name: string;
  personalityLabel: string;
  genderScope: "MALE" | "FEMALE" | "UNISEX" | "OTHER";
  category: string;
  description: string;
  keywords: string[];
  clothingDNA: string;
  hairstyleDNA: string;
  shoesDNA: string;
  colorDNA: string[];
  avoidDNA: string;
  imagePromptTemplate: string;
}

const BASE_PROMPT = `A full-body fashion editorial photo of a {gender} model embodying the {personalityLabel} style. {bodyTypeHint} {faceShapeHint}. Outfit: {clothingDNA}. Shoes: {shoesDNA}. Colors: {colorDNA}. Hairstyle: {hairstyleDNA}. Avoid: {avoidDNA}. Clean studio background, soft natural light, no text, no user face, no transformation.`;

export const MALE_ARCHETYPES: ArchetypeDefinition[] = [
  {
    slug: "clean-minimal",
    name: "Clean Minimal",
    personalityLabel: "Modern Minimalist",
    genderScope: "MALE",
    category: "Minimal",
    description: "Sharp basics, neutral palette, nothing extra.",
    keywords: ["minimal", "clean", "simple", "premium basics"],
    clothingDNA: "Tailored crew-neck tees, crisp oxford shirts, tapered chinos, dark selvedge denim, unstructured blazers.",
    hairstyleDNA: "Neat textured crop or classic side part, low maintenance.",
    shoesDNA: "Clean white leather sneakers, minimalist loafers, suede desert boots.",
    colorDNA: ["white", "light gray", "navy", "camel", "black"],
    avoidDNA: "oversized logos, busy patterns, heavy layering",
    imagePromptTemplate: BASE_PROMPT,
  },
  {
    slug: "smart-casual",
    name: "Smart Casual",
    personalityLabel: "Refined Professional",
    genderScope: "MALE",
    category: "Business Casual",
    description: "Polished enough for the office, relaxed enough for dinner.",
    keywords: ["modern", "refined", "office casual"],
    clothingDNA: "Knit polos, tailored trousers, unstructured blazers, merino layers, dark denim.",
    hairstyleDNA: "Clean taper with natural texture or slicked-back neat style.",
    shoesDNA: "Leather loafers, minimalist derby shoes, clean suede sneakers.",
    colorDNA: ["navy", "charcoal", "burgundy", "cream", "olive"],
    avoidDNA: "baggy jeans, loud graphics, athletic sneakers",
    imagePromptTemplate: BASE_PROMPT,
  },
  {
    slug: "old-money",
    name: "Old Money",
    personalityLabel: "Modern Gentleman",
    genderScope: "MALE",
    category: "Luxury Classic",
    description: "Quiet luxury built on heritage fabrics and timeless silhouettes.",
    keywords: ["quiet luxury", "classic", "heritage"],
    clothingDNA: "Cashmere crewnecks, tailored wool trousers, camel overcoats, crisp white shirts, fine-knit polos.",
    hairstyleDNA: "Classic side part, neatly groomed, medium length.",
    shoesDNA: "Dark leather loafers, polished oxford shoes, suede chukka boots.",
    colorDNA: ["navy", "camel", "cream", "bottle green", "burgundy"],
    avoidDNA: "logo-driven pieces, synthetic fabrics, overly tight or oversized fits",
    imagePromptTemplate: BASE_PROMPT,
  },
  {
    slug: "japanese-minimal",
    name: "Japanese Minimal",
    personalityLabel: "Tokyo Minimalist",
    genderScope: "MALE",
    category: "Minimal",
    description: "Relaxed proportions, muted tones, intentional layering.",
    keywords: ["japanese", "layering", "relaxed tailoring"],
    clothingDNA: "Wide-leg trousers, oversized shirts, longline cardigans, boxy blazers, natural fabrics.",
    hairstyleDNA: "Textured medium length, soft fringe, or sleek tucked-back style.",
    shoesDNA: "Minimal leather sneakers, Japanese loafers, suede slip-ons.",
    colorDNA: ["ivory", "charcoal", "sand", "slate blue", "black"],
    avoidDNA: "bright colors, rigid suiting, heavy branding",
    imagePromptTemplate: BASE_PROMPT,
  },
  {
    slug: "streetwear",
    name: "Streetwear",
    personalityLabel: "Urban Creative",
    genderScope: "MALE",
    category: "Urban",
    description: "Oversized silhouettes, bold references, contemporary attitude.",
    keywords: ["urban", "oversized", "street fashion"],
    clothingDNA: "Boxy tees, oversized hoodies, cargo pants, bomber jackets, statement outerwear.",
    hairstyleDNA: "Buzz cut, textured crop, braids, or messy fringe.",
    shoesDNA: "High-top sneakers, chunky runners, limited-edition collaborations.",
    colorDNA: ["black", "gray", "white", "neon accent", "earth tone"],
    avoidDNA: "slim-fit formal trousers, polished dress shoes, preppy patterns",
    imagePromptTemplate: BASE_PROMPT,
  },
  {
    slug: "business-formal",
    name: "Business Formal",
    personalityLabel: "Executive Presence",
    genderScope: "MALE",
    category: "Formal",
    description: "Boardroom-ready tailoring with commanding presence.",
    keywords: ["executive", "professional", "formal"],
    clothingDNA: "Two-piece suits, crisp dress shirts, silk ties, overcoats, pocket squares.",
    hairstyleDNA: "Neatly combed, classic business cut, clean neckline.",
    shoesDNA: "Polished oxford shoes, patent leather, premium leather derbies.",
    colorDNA: ["charcoal", "navy", "black", "white", "deep burgundy"],
    avoidDNA: "denim, sneakers, casual knits, loud patterns",
    imagePromptTemplate: BASE_PROMPT,
  },
  {
    slug: "preppy",
    name: "Preppy",
    personalityLabel: "Ivy League Gentleman",
    genderScope: "MALE",
    category: "Classic",
    description: "Collegiate classics with a clean, privileged attitude.",
    keywords: ["ivy league", "college", "classic"],
    clothingDNA: "Chambray shirts, chinos, cable-knit sweaters, navy blazers, rugby stripes.",
    hairstyleDNA: "Classic side part, medium length, clean and tidy.",
    shoesDNA: "Leather boat shoes, penny loafers, canvas sneakers.",
    colorDNA: ["navy", "burgundy", "cream", "kelly green", "white"],
    avoidDNA: "distressed denim, oversized streetwear, neon colors",
    imagePromptTemplate: BASE_PROMPT,
  },
  {
    slug: "workwear",
    name: "Workwear",
    personalityLabel: "Heritage Craftsman",
    genderScope: "MALE",
    category: "Utility",
    description: "Rugged utility pieces with honest fabrics and functional details.",
    keywords: ["utility", "rugged", "heritage"],
    clothingDNA: "Heavyweight chore coats, canvas trousers, flannel shirts, denim jackets, tool belts.",
    hairstyleDNA: "Short practical cut, slicked back, or medium textured style.",
    shoesDNA: "Work boots, moc-toe boots, leather derbies, canvas high-tops.",
    colorDNA: ["brown", "olive", "indigo", "tan", "charcoal"],
    avoidDNA: "shiny synthetics, slim dress pants, delicate fabrics",
    imagePromptTemplate: BASE_PROMPT,
  },
  {
    slug: "gorpcore",
    name: "Gorpcore",
    personalityLabel: "Outdoor Technologist",
    genderScope: "MALE",
    category: "Outdoor",
    description: "Technical outdoor gear worn with urban confidence.",
    keywords: ["outdoor", "technical", "functional"],
    clothingDNA: "Hardshell jackets, cargo pants, fleece layers, utility vests, technical backpacks.",
    hairstyleDNA: "Practical short cut, buzzed sides, or baseball-cap-ready medium length.",
    shoesDNA: "Trail-running shoes, technical sneakers, hiking boots.",
    colorDNA: ["olive", "black", "gray", "orange accent", "sand"],
    avoidDNA: "formal suiting, leather loafers, delicate knits",
    imagePromptTemplate: BASE_PROMPT,
  },
  {
    slug: "french-casual",
    name: "French Casual",
    personalityLabel: "Parisian Nonchalant",
    genderScope: "MALE",
    category: "Effortless",
    description: "Effortless Parisian style with undone elegance.",
    keywords: ["parisian", "effortless", "chic"],
    clothingDNA: "Breton stripes, linen shirts, tailored trousers, leather jackets, wool coats.",
    hairstyleDNA: "Tousled medium length, natural texture, relaxed side part.",
    shoesDNA: "White leather sneakers, suede chelsea boots, leather loafers.",
    colorDNA: ["navy", "white", "black", "camel", "gray"],
    avoidDNA: "oversized logos, bright neon, overly distressed denim",
    imagePromptTemplate: BASE_PROMPT,
  },
];

export const FEMALE_ARCHETYPES: ArchetypeDefinition[] = [
  {
    slug: "minimal-chic",
    name: "Minimal Chic",
    personalityLabel: "Effortless Sophisticate",
    genderScope: "FEMALE",
    category: "Minimal",
    description: "Clean lines, premium materials, understated confidence.",
    keywords: ["minimal", "modern", "premium"],
    clothingDNA: "Structured blazers, silk blouses, wide-leg trousers, slip skirts, tailored coats.",
    hairstyleDNA: "Sleek low bun, straight middle part, or polished ponytail.",
    shoesDNA: "Pointed flats, minimalist ankle boots, kitten heels.",
    colorDNA: ["black", "white", "camel", "gray", "navy"],
    avoidDNA: "busy prints, excessive jewelry, loud logos",
    imagePromptTemplate: BASE_PROMPT,
  },
  {
    slug: "korean-soft-minimal",
    name: "Korean Soft Minimal",
    personalityLabel: "Seoul Soft",
    genderScope: "FEMALE",
    category: "Soft",
    description: "Gentle layers, muted pastels, approachable femininity.",
    keywords: ["korean", "soft", "feminine"],
    clothingDNA: "Soft knit tops, pleated midi skirts, oversized cardigans, straight-leg jeans, trench coats.",
    hairstyleDNA: "See-through bangs, soft waves, low ponytail, or natural black hair.",
    shoesDNA: "Chunky loafers, canvas sneakers, low-block heels, mary janes.",
    colorDNA: ["ivory", "beige", "dusty pink", "soft blue", "gray"],
    avoidDNA: "aggressive tailoring, dark gothic tones, heavy makeup styling",
    imagePromptTemplate: BASE_PROMPT,
  },
  {
    slug: "french-chic",
    name: "French Chic",
    personalityLabel: "Parisian Muse",
    genderScope: "FEMALE",
    category: "Effortless",
    description: "Timeless elegance with a relaxed, romantic edge.",
    keywords: ["parisian", "elegant", "effortless"],
    clothingDNA: "Silk camisoles, high-waist jeans, tailored blazers, ballet flats, trench coats.",
    hairstyleDNA: "Tousled bob, curtain bangs, messy bun, or natural waves.",
    shoesDNA: "Ballet flats, block-heel ankle boots, leather loafers.",
    colorDNA: ["black", "white", "denim blue", "camel", "red accent"],
    avoidDNA: "overly coordinated outfits, heavy logos, neon colors",
    imagePromptTemplate: BASE_PROMPT,
  },
  {
    slug: "old-money-feminine",
    name: "Old Money Feminine",
    personalityLabel: "Quiet Luxury Heiress",
    genderScope: "FEMALE",
    category: "Luxury Classic",
    description: "Understated wealth in refined fabrics and silhouettes.",
    keywords: ["quiet luxury", "classic", "luxury"],
    clothingDNA: "Cashmere knits, wool trousers, silk shirts, pearl details, tailored coats.",
    hairstyleDNA: "Blow-dried waves, polished ponytail, or classic chignon.",
    shoesDNA: "Leather loafers, pointed flats, low block heels, riding boots.",
    colorDNA: ["cream", "navy", "camel", "ivory", "bottle green"],
    avoidDNA: "flashy logos, synthetic fabrics, overly revealing cuts",
    imagePromptTemplate: BASE_PROMPT,
  },
  {
    slug: "romantic-feminine",
    name: "Romantic Feminine",
    personalityLabel: "Modern Romantic",
    genderScope: "FEMALE",
    category: "Romantic",
    description: "Soft, flowing pieces with delicate, feminine details.",
    keywords: ["romantic", "soft", "elegant"],
    clothingDNA: "Floral midi dresses, puff sleeves, lace accents, soft knits, A-line skirts.",
    hairstyleDNA: "Soft curls, half-up styles, braided details, or wispy updo.",
    shoesDNA: "Strappy sandals, ballet flats, kitten heels, embroidered flats.",
    colorDNA: ["blush", "ivory", "sage green", "lavender", "soft rose"],
    avoidDNA: "boxy oversized cuts, harsh black leather, rigid tailoring",
    imagePromptTemplate: BASE_PROMPT,
  },
  {
    slug: "street-fashion",
    name: "Street Fashion",
    personalityLabel: "Urban Trendsetter",
    genderScope: "FEMALE",
    category: "Urban",
    description: "Bold, confident street style with contemporary references.",
    keywords: ["urban", "cool", "trend"],
    clothingDNA: "Oversized hoodies, cargo pants, crop tops, bomber jackets, statement accessories.",
    hairstyleDNA: "Sleek high ponytail, wolf cut, space buns, or blunt bangs.",
    shoesDNA: "Chunky sneakers, combat boots, high-top canvas, platform shoes.",
    colorDNA: ["black", "gray", "white", "neon green", "brown"],
    avoidDNA: "delicate florals, preppy pearls, bodycon dresses",
    imagePromptTemplate: BASE_PROMPT,
  },
  {
    slug: "office-professional",
    name: "Office Professional",
    personalityLabel: "Power Woman",
    genderScope: "FEMALE",
    category: "Business",
    description: "Sharp, confident tailoring for the modern workplace.",
    keywords: ["professional", "confident", "modern"],
    clothingDNA: "Tailored blazers, wide-leg trousers, sheath dresses, silk blouses, pencil skirts.",
    hairstyleDNA: "Sleek low bun, straight blowout, or polished shoulder-length cut.",
    shoesDNA: "Pointed pumps, loafers, block-heel mules, leather ankle boots.",
    colorDNA: ["navy", "black", "white", "burgundy", "camel"],
    avoidDNA: "denim, sneakers, overly casual knits, mini lengths",
    imagePromptTemplate: BASE_PROMPT,
  },
  {
    slug: "japanese-natural",
    name: "Japanese Natural",
    personalityLabel: "Natural Minimalist",
    genderScope: "FEMALE",
    category: "Natural",
    description: "Relaxed, natural textures with soft, earthy layers.",
    keywords: ["natural", "relaxed", "soft"],
    clothingDNA: "Linen dresses, cotton tunics, wide pants, oversized knits, earth-tone layers.",
    hairstyleDNA: "Natural waves, low bun with loose strands, or blunt straight bob.",
    shoesDNA: "Leather sandals, canvas sneakers, wooden clogs, minimal flats.",
    colorDNA: ["beige", "olive", "brown", "off-white", "rust"],
    avoidDNA: "synthetic shine, neon colors, tight bodycon silhouettes",
    imagePromptTemplate: BASE_PROMPT,
  },
  {
    slug: "y2k-trend",
    name: "Y2K Trend",
    personalityLabel: "Digital Nostalgic",
    genderScope: "FEMALE",
    category: "Trend",
    description: "Playful, nostalgic noughties energy with a modern twist.",
    keywords: ["youth", "trend", "fashion"],
    clothingDNA: "Low-rise jeans, baby tees, cargo skirts, halter tops, denim-on-denim, butterfly clips.",
    hairstyleDNA: "High pigtails, face-framing tendrils, crimped texture, or chunky highlights.",
    shoesDNA: "Platform sandals, colorful sneakers, kitten heels, ballet flats.",
    colorDNA: ["silver", "pink", "baby blue", "lavender", "denim"],
    avoidDNA: "classic tailoring, dark mature tones, heavy luxury branding",
    imagePromptTemplate: BASE_PROMPT,
  },
  {
    slug: "active-lifestyle",
    name: "Active Lifestyle",
    personalityLabel: "Sporty Optimist",
    genderScope: "FEMALE",
    category: "Sporty",
    description: "Athleisure and activewear styled with healthy energy.",
    keywords: ["sporty", "healthy", "dynamic"],
    clothingDNA: "Matching sets, leggings, cropped jackets, oversized hoodies, tennis skirts.",
    hairstyleDNA: "High ponytail, sleek braids, claw-clip bun, or natural air-dried texture.",
    shoesDNA: "Running shoes, retro trainers, chunky sneakers, slides.",
    colorDNA: ["white", "black", "sage green", "blush", "navy"],
    avoidDNA: "formal dresses, high heels, delicate fabrics, heavy jewelry",
    imagePromptTemplate: BASE_PROMPT,
  },
];

export const ALL_ARCHETYPES: ArchetypeDefinition[] = [...MALE_ARCHETYPES, ...FEMALE_ARCHETYPES];
```

- [ ] **Step 2: Write a test verifying uniqueness and counts**

Create `src/lib/style-archetype/archetype-data.test.ts`:

```ts
import { describe, it, expect } from "vitest";
import { ALL_ARCHETYPES, MALE_ARCHETYPES, FEMALE_ARCHETYPES } from "./archetype-data";

describe("archetype-data", () => {
  it("has 10 male and 10 female archetypes", () => {
    expect(MALE_ARCHETYPES).toHaveLength(10);
    expect(FEMALE_ARCHETYPES).toHaveLength(10);
    expect(ALL_ARCHETYPES).toHaveLength(20);
  });

  it("has unique slugs", () => {
    const slugs = ALL_ARCHETYPES.map((a) => a.slug);
    expect(new Set(slugs).size).toBe(slugs.length);
  });

  it("has no cleafit archetype", () => {
    const slugs = ALL_ARCHETYPES.map((a) => a.slug);
    expect(slugs).not.toContain("cleafit");
  });
});
```

- [ ] **Step 3: Run the test and verify it passes**

Run:

```bash
npx vitest run src/lib/style-archetype/archetype-data.test.ts
```

Expected: 3 tests pass.

- [ ] **Step 4: Commit**

```bash
git add src/lib/style-archetype/archetype-data.ts src/lib/style-archetype/archetype-data.test.ts
git commit -m "feat(archetype): add initial 20 archetype definitions"
```

---

## Task 3: Seed Script for Style Archetypes

**Files:**
- Create: `prisma/seed-style-archetypes.ts`
- Modify: `prisma/seed.ts` if it exists; otherwise create it.

**Interfaces:**
- Consumes: `ALL_ARCHETYPES` from `src/lib/style-archetype/archetype-data.ts`.
- Produces: Idempotent seed function `seedStyleArchetypes()`.

- [ ] **Step 1: Create the seed script**

Create `prisma/seed-style-archetypes.ts`:

```ts
import { PrismaClient, GenderScope } from "@prisma/client";
import { ALL_ARCHETYPES } from "../src/lib/style-archetype/archetype-data";

const prisma = new PrismaClient();

export async function seedStyleArchetypes() {
  for (const def of ALL_ARCHETYPES) {
    await prisma.styleArchetype.upsert({
      where: { slug: def.slug },
      update: {
        name: def.name,
        personalityLabel: def.personalityLabel,
        genderScope: def.genderScope as GenderScope,
        category: def.category,
        description: def.description,
        keywords: def.keywords,
        clothingDNA: def.clothingDNA,
        hairstyleDNA: def.hairstyleDNA,
        shoesDNA: def.shoesDNA,
        colorDNA: def.colorDNA,
        avoidDNA: def.avoidDNA,
        imagePromptTemplate: def.imagePromptTemplate,
        version: 1,
        active: true,
      },
      create: {
        slug: def.slug,
        name: def.name,
        personalityLabel: def.personalityLabel,
        genderScope: def.genderScope as GenderScope,
        category: def.category,
        description: def.description,
        keywords: def.keywords,
        clothingDNA: def.clothingDNA,
        hairstyleDNA: def.hairstyleDNA,
        shoesDNA: def.shoesDNA,
        colorDNA: def.colorDNA,
        avoidDNA: def.avoidDNA,
        imagePromptTemplate: def.imagePromptTemplate,
        version: 1,
        active: true,
      },
    });
  }
}

async function main() {
  await seedStyleArchetypes();
  console.log(`Seeded ${ALL_ARCHETYPES.length} style archetypes.`);
}

main()
  .catch((e) => {
    console.error(e);
    process.exit(1);
  })
  .finally(async () => {
    await prisma.$disconnect();
  });
```

- [ ] **Step 2: Register the seed script in package.json**

In `package.json`, add to `scripts`:

```json
"seed": "tsx prisma/seed-style-archetypes.ts"
```

- [ ] **Step 3: Run the seed script**

Run:

```bash
npx tsx prisma/seed-style-archetypes.ts
```

Expected: `Seeded 20 style archetypes.` is printed.

- [ ] **Step 4: Commit**

```bash
git add prisma/seed-style-archetypes.ts package.json
git commit -m "feat(db): add style archetype seed script"
```

---

## Task 4: Matching Engine Config

**Files:**
- Create: `src/lib/style-archetype/match-config.ts`
- Test: `src/lib/style-archetype/match-config.test.ts`

**Interfaces:**
- Produces: `MATCH_WEIGHTS` constant and `MatchWeights` type.

- [ ] **Step 1: Create the config module**

Create `src/lib/style-archetype/match-config.ts`:

```ts
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
```

- [ ] **Step 2: Write a test**

Create `src/lib/style-archetype/match-config.test.ts`:

```ts
import { describe, it, expect } from "vitest";
import { MATCH_WEIGHTS, validateWeights } from "./match-config";

describe("match-config", () => {
  it("sums to 1", () => {
    const total = MATCH_WEIGHTS.vibe + MATCH_WEIGHTS.body + MATCH_WEIGHTS.age + MATCH_WEIGHTS.gender;
    expect(total).toBeCloseTo(1);
  });

  it("validates correct weights", () => {
    expect(() => validateWeights(MATCH_WEIGHTS)).not.toThrow();
  });

  it("throws when weights do not sum to 1", () => {
    expect(() => validateWeights({ vibe: 0.5, body: 0.5, age: 0, gender: 0 })).toThrow();
  });
});
```

- [ ] **Step 3: Run the test**

```bash
npx vitest run src/lib/style-archetype/match-config.test.ts
```

Expected: 3 tests pass.

- [ ] **Step 4: Commit**

```bash
git add src/lib/style-archetype/match-config.ts src/lib/style-archetype/match-config.test.ts
git commit -m "feat(archetype): add configurable match weights"
```

---

## Task 5: Matching Engine

**Files:**
- Create: `src/lib/style-archetype/match-archetypes.ts`
- Test: `src/lib/style-archetype/match-archetypes.test.ts`

**Interfaces:**
- Consumes: `StyleArchetype` from Prisma, `MATCH_WEIGHTS` from `match-config.ts`.
- Produces: `matchArchetypes(input, archetypes)` returning top 3 matches.

- [ ] **Step 1: Write the failing test**

Create `src/lib/style-archetype/match-archetypes.test.ts`:

```ts
import { describe, it, expect } from "vitest";
import { matchArchetypes, StyleMatchInput } from "./match-archetypes";
import { StyleArchetype, GenderScope } from "@prisma/client";

function makeArchetype(overrides: Partial<StyleArchetype> & { slug: string; name: string }): StyleArchetype {
  return {
    id: overrides.slug,
    slug: overrides.slug,
    name: overrides.name,
    genderScope: overrides.genderScope ?? GenderScope.MALE,
    category: overrides.category ?? "Test",
    description: "",
    personalityLabel: overrides.personalityLabel ?? overrides.name,
    keywords: overrides.keywords ?? [],
    clothingDNA: "",
    hairstyleDNA: "",
    shoesDNA: "",
    colorDNA: [],
    avoidDNA: "",
    imagePromptTemplate: "",
    version: 1,
    active: true,
    createdAt: new Date(),
    updatedAt: new Date(),
    ...overrides,
  } as StyleArchetype;
}

const input: StyleMatchInput = {
  gender: "MALE",
  age: 30,
  heightCm: 178,
  weightKg: 75,
  bodyType: "rectangle",
  faceShape: "oval",
  vibeKeywords: ["minimal", "clean", "premium"],
};

describe("matchArchetypes", () => {
  it("returns top 3 matches sorted by score", () => {
    const archetypes = [
      makeArchetype({ slug: "clean-minimal", name: "Clean Minimal", category: "Minimal", keywords: ["minimal", "clean", "premium"], genderScope: GenderScope.MALE }),
      makeArchetype({ slug: "smart-casual", name: "Smart Casual", category: "Business", keywords: ["refined", "office"], genderScope: GenderScope.MALE }),
      makeArchetype({ slug: "streetwear", name: "Streetwear", category: "Urban", keywords: ["urban", "oversized"], genderScope: GenderScope.MALE }),
      makeArchetype({ slug: "old-money", name: "Old Money", category: "Luxury", keywords: ["classic", "heritage"], genderScope: GenderScope.MALE }),
    ];

    const results = matchArchetypes(input, archetypes);
    expect(results).toHaveLength(3);
    expect(results[0].slug).toBe("clean-minimal");
    expect(results[0].score).toBeGreaterThanOrEqual(results[1].score);
    expect(results[1].score).toBeGreaterThanOrEqual(results[2].score);
  });

  it("avoids duplicate categories in top 3", () => {
    const archetypes = [
      makeArchetype({ slug: "a", name: "A", category: "Minimal", keywords: ["minimal"], genderScope: GenderScope.MALE }),
      makeArchetype({ slug: "b", name: "B", category: "Minimal", keywords: ["minimal"], genderScope: GenderScope.MALE }),
      makeArchetype({ slug: "c", name: "C", category: "Minimal", keywords: ["minimal"], genderScope: GenderScope.MALE }),
      makeArchetype({ slug: "d", name: "D", category: "Urban", keywords: ["urban"], genderScope: GenderScope.MALE }),
      makeArchetype({ slug: "e", name: "E", category: "Luxury", keywords: ["classic"], genderScope: GenderScope.MALE }),
    ];

    const results = matchArchetypes(input, archetypes);
    const categories = results.map((r) => r.archetype.category);
    expect(new Set(categories).size).toBe(3);
  });

  it("filters out scores below floor", () => {
    const archetypes = [
      makeArchetype({ slug: "match", name: "Match", category: "A", keywords: ["minimal"], genderScope: GenderScope.MALE }),
      makeArchetype({ slug: "miss", name: "Miss", category: "B", keywords: ["steampunk"], genderScope: GenderScope.FEMALE }),
    ];

    const results = matchArchetypes(input, archetypes);
    expect(results.every((r) => r.score >= 30)).toBe(true);
    expect(results.map((r) => r.slug)).not.toContain("miss");
  });
});
```

- [ ] **Step 2: Run test to verify it fails**

```bash
npx vitest run src/lib/style-archetype/match-archetypes.test.ts
```

Expected: FAIL with "matchArchetypes is not defined" or similar.

- [ ] **Step 3: Implement the matching engine**

Create `src/lib/style-archetype/match-archetypes.ts`:

```ts
import { StyleArchetype, GenderScope } from "@prisma/client";
import { MATCH_WEIGHTS } from "./match-config";

export interface StyleMatchInput {
  gender: "MALE" | "FEMALE" | "OTHER";
  age: number;
  heightCm: number;
  weightKg: number;
  bodyType: string | null;
  faceShape: string | null;
  vibeKeywords: string[];
}

export interface StyleMatchResult {
  archetypeId: string;
  slug: string;
  name: string;
  score: number;
  archetype: StyleArchetype;
}

const SCORE_FLOOR = 30;
const DIVERSITY_PENALTY = 5;

function normalizeGenderScore(inputGender: StyleMatchInput["gender"], scope: GenderScope): number {
  if (scope === GenderScope.UNISEX || scope === GenderScope.OTHER) return 1;
  if (inputGender === scope) return 1;
  return 0;
}

function normalizeVibeScore(userKeywords: string[], archetypeKeywords: string[]): number {
  if (userKeywords.length === 0 || archetypeKeywords.length === 0) return 0;
  const userSet = new Set(userKeywords.map((k) => k.toLowerCase()));
  const archetypeSet = new Set(archetypeKeywords.map((k) => k.toLowerCase()));
  const intersection = [...userSet].filter((k) => archetypeSet.has(k));
  const union = new Set([...userSet, ...archetypeSet]);
  return union.size === 0 ? 0 : intersection.length / union.size;
}

function normalizeBodyTypeScore(bodyType: string | null, archetype: StyleArchetype): number {
  if (!bodyType) return 0.5;
  const lowerBody = bodyType.toLowerCase();
  const preferred = getPreferredBodyTypes(archetype);
  if (preferred.some((p) => lowerBody.includes(p))) return 1;
  if (["athletic", "rectangle"].some((p) => lowerBody.includes(p)) && archetype.category === "Utility") return 0.8;
  return 0.4;
}

function getPreferredBodyTypes(archetype: StyleArchetype): string[] {
  const categoryMap: Record<string, string[]> = {
    Utility: ["athletic", "rectangle", "broad"],
    Minimal: ["lean", "rectangle", "slim"],
    Luxury: ["rectangle", "athletic", "lean"],
    Urban: ["rectangle", "athletic"],
    Formal: ["rectangle", "athletic"],
    Classic: ["rectangle", "oval"],
    Outdoor: ["athletic", "rectangle"],
    Effortless: ["rectangle", "lean"],
    Soft: ["hourglass", "pear", "rectangle"],
    Romantic: ["hourglass", "pear"],
    Business: ["rectangle", "hourglass"],
    Natural: ["rectangle", "hourglass"],
    Trend: ["rectangle", "athletic"],
    Sporty: ["athletic", "rectangle"],
  };
  return categoryMap[archetype.category] ?? ["rectangle"];
}

function normalizeAgeScore(age: number, archetype: StyleArchetype): number {
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
    Luxury: { peak: 35, spread: 12 },
    Classic: { peak: 30, spread: 12 },
    Utility: { peak: 32, spread: 12 },
    Outdoor: { peak: 30, spread: 12 },
    Formal: { peak: 38, spread: 12 },
  };
  const config = categoryMap[archetype.category] ?? { peak: 30, spread: 10 };
  const distance = Math.abs(age - config.peak);
  return Math.max(0, 1 - distance / config.spread);
}

function computeBaseScore(input: StyleMatchInput, archetype: StyleArchetype): number {
  const genderScore = normalizeGenderScore(input.gender, archetype.genderScope);
  const vibeScore = normalizeVibeScore(input.vibeKeywords, archetype.keywords);
  const bodyScore = normalizeBodyTypeScore(input.bodyType, archetype);
  const ageScore = normalizeAgeScore(input.age, archetype);

  const weighted =
    MATCH_WEIGHTS.gender * genderScore +
    MATCH_WEIGHTS.vibe * vibeScore +
    MATCH_WEIGHTS.body * bodyScore +
    MATCH_WEIGHTS.age * ageScore;

  return Math.round(weighted * 100);
}

function applyDiversityPenalty(results: StyleMatchResult[]): StyleMatchResult[] {
  const seenCategories = new Set<string>();
  return results.map((result) => {
    const category = result.archetype.category;
    if (seenCategories.has(category)) {
      return { ...result, score: Math.max(0, result.score - DIVERSITY_PENALTY) };
    }
    seenCategories.add(category);
    return result;
  });
}

export function matchArchetypes(
  input: StyleMatchInput,
  archetypes: StyleArchetype[]
): StyleMatchResult[] {
  const activeArchetypes = archetypes.filter((a) => a.active);

  const scored = activeArchetypes.map((archetype) => ({
    archetypeId: archetype.id,
    slug: archetype.slug,
    name: archetype.name,
    score: computeBaseScore(input, archetype),
    archetype,
  }));

  const sorted = scored.sort((a, b) => b.score - a.score);
  const diversified = applyDiversityPenalty(sorted);
  const reSorted = diversified.sort((a, b) => b.score - a.score);

  return reSorted.filter((r) => r.score >= SCORE_FLOOR).slice(0, 3);
}
```

- [ ] **Step 4: Run tests and verify they pass**

```bash
npx vitest run src/lib/style-archetype/match-archetypes.test.ts
```

Expected: 3 tests pass.

- [ ] **Step 5: Commit**

```bash
git add src/lib/style-archetype/match-archetypes.ts src/lib/style-archetype/match-archetypes.test.ts
git commit -m "feat(archetype): add style matching engine with diversity penalty"
```

---

## Task 6: Map Archetype to Recommendation Output

**Files:**
- Create: `src/lib/style-archetype/build-recommendation.ts`
- Test: `src/lib/style-archetype/build-recommendation.test.ts`

**Interfaces:**
- Consumes: `StyleArchetype` and `StyleMatchInput`.
- Produces: `StyleRecommendationOutput` shape used by the diagnosis API.

- [ ] **Step 1: Create the mapping function**

Create `src/lib/style-archetype/build-recommendation.ts`:

```ts
import { StyleArchetype } from "@prisma/client";
import { StyleRecommendationOutput } from "@/lib/ai/style-ai-provider";
import { StyleMatchInput } from "./match-archetypes";

export function buildRecommendationFromArchetype(
  archetype: StyleArchetype,
  input: StyleMatchInput
): StyleRecommendationOutput {
  const bodyHint = input.bodyType ? `Body type ${input.bodyType}.` : "";

  return {
    title: `${archetype.name} / ${archetype.personalityLabel ?? archetype.name}`,
    description: archetype.description,
    summary: `${archetype.description} ${bodyHint}`.trim(),
    clothingAdvice: archetype.clothingDNA,
    hairstyleAdvice: archetype.hairstyleDNA,
    shoesAdvice: archetype.shoesDNA,
    colorPalette: archetype.colorDNA,
    avoidTips: archetype.avoidDNA.split(",").map((t) => t.trim()).filter(Boolean),
  };
}
```

- [ ] **Step 2: Write a test**

Create `src/lib/style-archetype/build-recommendation.test.ts`:

```ts
import { describe, it, expect } from "vitest";
import { buildRecommendationFromArchetype } from "./build-recommendation";
import { StyleArchetype, GenderScope } from "@prisma/client";
import { StyleMatchInput } from "./match-archetypes";

const archetype: StyleArchetype = {
  id: "old-money",
  slug: "old-money",
  name: "Old Money",
  personalityLabel: "Modern Gentleman",
  genderScope: GenderScope.MALE,
  category: "Luxury Classic",
  description: "Quiet luxury.",
  keywords: ["classic"],
  clothingDNA: "Cashmere crewnecks.",
  hairstyleDNA: "Classic side part.",
  shoesDNA: "Dark leather loafers.",
  colorDNA: ["navy", "camel"],
  avoidDNA: "logos, synthetics",
  imagePromptTemplate: "prompt",
  version: 1,
  active: true,
  createdAt: new Date(),
  updatedAt: new Date(),
};

const input: StyleMatchInput = {
  gender: "MALE",
  age: 30,
  heightCm: 178,
  weightKg: 75,
  bodyType: "rectangle",
  faceShape: "oval",
  vibeKeywords: ["classic"],
};

describe("buildRecommendationFromArchetype", () => {
  it("maps archetype DNA to recommendation output", () => {
    const rec = buildRecommendationFromArchetype(archetype, input);
    expect(rec.title).toContain("Old Money");
    expect(rec.title).toContain("Modern Gentleman");
    expect(rec.clothingAdvice).toBe("Cashmere crewnecks.");
    expect(rec.avoidTips).toEqual(["logos", "synthetics"]);
    expect(rec.colorPalette).toEqual(["navy", "camel"]);
  });
});
```

- [ ] **Step 3: Run the test**

```bash
npx vitest run src/lib/style-archetype/build-recommendation.test.ts
```

Expected: 1 test passes.

- [ ] **Step 4: Commit**

```bash
git add src/lib/style-archetype/build-recommendation.ts src/lib/style-archetype/build-recommendation.test.ts
git commit -m "feat(archetype): map archetype DNA to recommendation output"
```

---

## Task 7: Update Mock Style Provider

**Files:**
- Modify: `src/lib/ai/mock-style-provider.ts`
- Modify: `src/lib/mock-style-engine.ts` (optional: deprecate or remove later)

**Interfaces:**
- Consumes: `matchArchetypes`, `buildRecommendationFromArchetype`, `prisma.styleArchetype.findMany`.
- Produces: `StyleAiOutput` with archetype-based recommendations.

- [ ] **Step 1: Rewrite MockStyleProvider to use archetypes**

Replace the contents of `src/lib/ai/mock-style-provider.ts`:

```ts
import {
  StyleAiProvider,
  StyleAiInput,
  StyleAiOutput,
  StyleRecommendationOutput,
} from "@/lib/ai/style-ai-provider";
import { prisma } from "@/lib/prisma";
import { matchArchetypes } from "@/lib/style-archetype/match-archetypes";
import { buildRecommendationFromArchetype } from "@/lib/style-archetype/build-recommendation";

export class MockStyleProvider implements StyleAiProvider {
  async analyze(input: StyleAiInput): Promise<StyleAiOutput> {
    const archetypes = await prisma.styleArchetype.findMany();
    const matches = matchArchetypes(
      {
        gender: input.gender,
        age: input.age,
        heightCm: input.heightCm,
        weightKg: input.weightKg,
        bodyType: null,
        faceShape: null,
        vibeKeywords: ["clean", "minimal", "modern"],
      },
      archetypes
    );

    if (matches.length === 0) {
      throw new Error("No matching archetypes found");
    }

    const recommendations: StyleRecommendationOutput[] = matches.map((match) =>
      buildRecommendationFromArchetype(match.archetype, {
        gender: input.gender,
        age: input.age,
        heightCm: input.heightCm,
        weightKg: input.weightKg,
        bodyType: null,
        faceShape: null,
        vibeKeywords: ["clean", "minimal", "modern"],
      })
    );

    return {
      bodyType: "rectangle",
      faceShape: "oval",
      vibeKeywords: ["clean", "minimal", "modern"],
      summary: "A modern, clean direction selected from the style archetype library.",
      recommendations,
    };
  }
}
```

- [ ] **Step 2: Typecheck and lint**

Run:

```bash
npm run lint
npx tsc --noEmit
```

Expected: no errors.

- [ ] **Step 3: Commit**

```bash
git add src/lib/ai/mock-style-provider.ts
git commit -m "feat(archetype): wire mock provider to archetype matching engine"
```

---

## Task 8: Update Diagnosis API

**Files:**
- Modify: `src/app/api/diagnosis/route.ts`
- Modify: `src/lib/ai/style-ai-provider.ts`

**Interfaces:**
- Consumes: `StyleAiOutput` (unchanged shape), `prisma.styleArchetype.findMany`, `matchArchetypes`, `buildRecommendationFromArchetype`.
- Produces: `StyleRecommendation` records with `archetypeId` and `matchScore`.

- [ ] **Step 1: Update the API to select archetypes after AI diagnosis**

Modify `src/app/api/diagnosis/route.ts`. After the call to `styleAiService.analyze`, add archetype matching before the transaction creates recommendations.

Insert these imports at the top:

```ts
import { matchArchetypes } from "@/lib/style-archetype/match-archetypes";
import { buildRecommendationFromArchetype } from "@/lib/style-archetype/build-recommendation";
```

After:

```ts
const { output, jobId, errorMessage } = await styleAiService.analyze(styleInput);
```

Add:

```ts
const archetypes = await prisma.styleArchetype.findMany({ where: { active: true } });
const matches = matchArchetypes(
  {
    gender,
    age,
    heightCm,
    weightKg,
    bodyType: output.bodyType,
    faceShape: output.faceShape,
    vibeKeywords: output.vibeKeywords,
  },
  archetypes
);

const matchedRecommendations = matches.map((match) => ({
  ...buildRecommendationFromArchetype(match.archetype, {
    gender,
    age,
    heightCm,
    weightKg,
    bodyType: output.bodyType,
    faceShape: output.faceShape,
    vibeKeywords: output.vibeKeywords,
  }),
  archetypeId: match.archetypeId,
  matchScore: match.score,
}));

const recommendationsToSave = matchedRecommendations.length >= 3
  ? matchedRecommendations
  : matchedRecommendations.concat(output.recommendations.slice(matchedRecommendations.length).map((rec) => ({ ...rec, archetypeId: null, matchScore: null })));
```

Replace the `styleRecommendation.createMany` block in the transaction with:

```ts
await tx.styleRecommendation.createMany({
  data: recommendationsToSave.map((rec, index) => ({
    diagnosisId: diagnosis.id,
    title: rec.title,
    description: rec.description,
    summary: rec.summary,
    clothingAdvice: rec.clothingAdvice,
    hairstyleAdvice: rec.hairstyleAdvice,
    shoesAdvice: rec.shoesAdvice,
    colorPalette: rec.colorPalette,
    avoidTips: rec.avoidTips,
    archetypeId: rec.archetypeId ?? null,
    matchScore: rec.matchScore ?? null,
    rank: index + 1,
    isPrimary: index === 0,
  })),
});
```

- [ ] **Step 2: Typecheck**

```bash
npx tsc --noEmit
```

Expected: no errors.

- [ ] **Step 3: Commit**

```bash
git add src/app/api/diagnosis/route.ts
git commit -m "feat(archetype): select archetypes in diagnosis API and persist matchScore"
```

---

## Task 9: Archetype-Aware Image Prompt

**Files:**
- Modify: `src/lib/ai/style-preview-prompt.ts`
- Modify: `src/lib/ai/style-preview-service.ts`
- Modify: `src/app/api/diagnosis/[id]/style-previews/route.ts`

**Interfaces:**
- Consumes: `StyleArchetype` from Prisma.
- Produces: rendered image prompt string.

- [ ] **Step 1: Add archetype prompt renderer**

Append to `src/lib/ai/style-preview-prompt.ts`:

```ts
import { StyleArchetype } from "@prisma/client";

export function buildArchetypePreviewPrompt(input: {
  gender: string;
  age: number;
  bodyType: string | null;
  faceShape: string | null;
  archetype: StyleArchetype;
}): string {
  const template = input.archetype.imagePromptTemplate;
  const bodyTypeHint = input.bodyType ? `Body type: ${input.bodyType}.` : "";
  const faceShapeHint = input.faceShape ? `Face shape: ${input.faceShape}.` : "";

  return template
    .replace(/{gender}/g, input.gender.toLowerCase())
    .replace(/{age}/g, String(input.age))
    .replace(/{personalityLabel}/g, input.archetype.personalityLabel ?? input.archetype.name)
    .replace(/{bodyTypeHint}/g, bodyTypeHint)
    .replace(/{faceShapeHint}/g, faceShapeHint)
    .replace(/{clothingDNA}/g, input.archetype.clothingDNA)
    .replace(/{shoesDNA}/g, input.archetype.shoesDNA)
    .replace(/{colorDNA}/g, input.archetype.colorDNA.join(", "))
    .replace(/{hairstyleDNA}/g, input.archetype.hairstyleDNA)
    .replace(/{avoidDNA}/g, input.archetype.avoidDNA)
    .trim();
}
```

- [ ] **Step 2: Update style preview service to accept archetype**

Modify `src/lib/ai/style-preview-service.ts`:

Add import:

```ts
import { StyleArchetype } from "@prisma/client";
import { buildArchetypePreviewPrompt } from "./style-preview-prompt";
```

Update `GenerateStylePreviewInput` interface:

```ts
export interface GenerateStylePreviewInput {
  diagnosis: {
    id: string;
    gender: string;
    age: number;
    heightCm: number;
    weightKg: number;
    bodyType: string | null;
    faceShape: string | null;
  };
  recommendation: Pick<
    StyleRecommendation,
    | "id"
    | "rank"
    | "title"
    | "description"
    | "summary"
    | "clothingAdvice"
    | "hairstyleAdvice"
    | "shoesAdvice"
    | "colorPalette"
  >;
  archetype?: StyleArchetype | null;
}
```

Replace the prompt building section:

```ts
export async function generateStylePreviewImage(
  input: GenerateStylePreviewInput
): Promise<GenerateStylePreviewResult> {
  const { diagnosis, recommendation, archetype } = input;

  const prompt = archetype
    ? buildArchetypePreviewPrompt({
        gender: diagnosis.gender,
        age: diagnosis.age,
        bodyType: diagnosis.bodyType,
        faceShape: diagnosis.faceShape,
        archetype,
      })
    : buildStylePreviewPrompt({
        gender: diagnosis.gender,
        age: diagnosis.age,
        title: recommendation.title,
        description: recommendation.description,
        summary: recommendation.summary,
        clothingAdvice: recommendation.clothingAdvice,
        hairstyleAdvice: recommendation.hairstyleAdvice,
        shoesAdvice: recommendation.shoesAdvice,
        colorPalette: recommendation.colorPalette,
      });

  // ...rest of function unchanged
```

- [ ] **Step 3: Update the style-previews API to pass archetype**

Modify `src/app/api/diagnosis/[id]/style-previews/route.ts`. In the include for `prisma.styleDiagnosis.findUnique`, add:

```ts
include: {
  recommendations: {
    orderBy: { rank: "asc" },
    include: { archetype: true },
  },
},
```

Pass `archetype: rec.archetype` into `generateStylePreviewImage`.

- [ ] **Step 4: Typecheck and lint**

```bash
npm run lint
npx tsc --noEmit
```

Expected: no errors.

- [ ] **Step 5: Commit**

```bash
git add src/lib/ai/style-preview-prompt.ts src/lib/ai/style-preview-service.ts src/app/api/diagnosis/[id]/style-previews/route.ts
git commit -m "feat(archetype): render archetype image prompt templates for previews"
```

---

## Task 10: Update Diagnosis Service and Report Page

**Files:**
- Modify: `src/lib/diagnosis-service.ts`
- Modify: `src/components/diagnosis/primary-style-direction.tsx`
- Modify: `src/components/diagnosis/alternative-style-card.tsx`
- Modify: `src/app/diagnosis/[id]/page.tsx`

**Interfaces:**
- Consumes: `StyleArchetype` relation on `StyleRecommendation`.
- Produces: `DiagnosisDetail` with archetype name / personality label / score; UI renders them.

- [ ] **Step 1: Update DiagnosisDetail interface and fetch logic**

Modify `src/lib/diagnosis-service.ts`:

Update the `recommendations` item type to include archetype fields:

```ts
recommendations: {
  id: string;
  rank: number;
  isPrimary: boolean;
  title: string;
  description: string | null;
  summary: string;
  clothingAdvice: string;
  hairstyleAdvice: string;
  shoesAdvice: string;
  colorPalette: string[];
  avoidTips: string[];
  previewImageUrl: string | null;
  previewImageStatus: string;
  previewImageError: string | null;
  archetype: {
    id: string;
    name: string;
    personalityLabel: string | null;
    category: string;
  } | null;
  matchScore: number | null;
}[];
```

Update the Prisma include:

```ts
recommendations: {
  orderBy: { rank: "asc" },
  include: { archetype: true },
},
```

Update the mapping to include archetype and matchScore:

```ts
recommendations: diagnosis.recommendations.map((rec) => ({
  ...rec,
  archetype: rec.archetype
    ? {
        id: rec.archetype.id,
        name: rec.archetype.name,
        personalityLabel: rec.archetype.personalityLabel,
        category: rec.archetype.category,
      }
    : null,
  matchScore: rec.matchScore,
})),
```

- [ ] **Step 2: Update UI components to display archetype info**

Modify `src/components/diagnosis/primary-style-direction.tsx`:

Update the `Recommendation` interface to include `archetype` and `matchScore`.

After the title, add:

```tsx
{recommendation.archetype && (
  <div className="mt-2 flex flex-wrap items-center gap-2">
    <span className="rounded-full bg-[#FFF9F7] px-3 py-1 text-xs font-medium text-[#B85C4F]">
      {recommendation.archetype.name}
    </span>
    {recommendation.archetype.personalityLabel && (
      <span className="text-xs text-[#6F6A63]">{recommendation.archetype.personalityLabel}</span>
    )}
    {recommendation.matchScore !== null && (
      <span className="text-xs text-[#6F6A63]">{recommendation.matchScore}% match</span>
    )}
  </div>
)}
```

Do the equivalent in `src/components/diagnosis/alternative-style-card.tsx`.

- [ ] **Step 3: Update report page Recommendation type**

Modify `src/app/diagnosis/[id]/page.tsx` to include `archetype` and `matchScore` in the `Recommendation` interface.

- [ ] **Step 4: Typecheck and lint**

```bash
npm run lint
npx tsc --noEmit
```

Expected: no errors.

- [ ] **Step 5: Commit**

```bash
git add src/lib/diagnosis-service.ts src/components/diagnosis/primary-style-direction.tsx src/components/diagnosis/alternative-style-card.tsx src/app/diagnosis/[id]/page.tsx
git commit -m "feat(archetype): surface archetype name, personality label, and match score in report"
```

---

## Task 11: OpenAI Provider Alignment (Optional but Recommended)

**Files:**
- Modify: `src/lib/ai/style-ai-prompt.ts`

**Interfaces:**
- Produces: system prompt that instructs the model to return archetype-friendly output.

- [ ] **Step 1: Update system prompt to mention vibe keywords matter**

Append to the prompt in `src/lib/ai/style-ai-prompt.ts`:

```text
Choose vibe keywords that will help match the user to one of these style archetypes: Clean Minimal, Smart Casual, Old Money, Japanese Minimal, Streetwear, Business Formal, Preppy, Workwear, Gorpcore, French Casual, Minimal Chic, Korean Soft Minimal, French Chic, Old Money Feminine, Romantic Feminine, Street Fashion, Office Professional, Japanese Natural, Y2K Trend, Active Lifestyle.
```

- [ ] **Step 2: Commit**

```bash
git add src/lib/ai/style-ai-prompt.ts
git commit -m "chore(prompt): align diagnosis keywords with archetype library"
```

---

## Task 12: Final Verification and Build

**Files:**
- Run commands only.

- [ ] **Step 1: Run all tests**

```bash
npm run test
```

Expected: all archetype tests pass.

- [ ] **Step 2: Run lint and typecheck**

```bash
npm run lint
npx tsc --noEmit
```

Expected: no errors.

- [ ] **Step 3: Run build**

```bash
npm run build
```

Expected: build succeeds.

- [ ] **Step 4: Commit any remaining changes**

```bash
git add -A
git commit -m "feat(archetype): complete Sprint 3.7 Style Archetype System"
```

---

## Self-Review

**Spec coverage:**
- Independent `StyleArchetype` table → Task 1, 2, 3
- `avoidDNA` and `personalityLabel` → Task 2
- `version` field → Task 1
- `GenderScope.OTHER` → Task 1
- Keep existing `StyleRecommendation` advice fields → Task 1 (schema), Task 8 (populate from archetype)
- Matching weights as config → Task 4
- Simplified v1 scoring (vibe/body/age/gender) → Task 5
- Image prompt template strategy → Task 9
- Style Personality display → Task 10
- No cleafit archetype → Task 2 test

**Placeholder scan:** No TBD/TODO/fill-in-later placeholders found.

**Type consistency:**
- `StyleMatchInput` defined in Task 5 and reused in Task 6, 7, 8.
- `MATCH_WEIGHTS` defined in Task 4 and used in Task 5.
- `ArchetypeDefinition` defined in Task 2 and used in Task 3.
- `buildRecommendationFromArchetype` interface is consistent across Task 6, 7, 8.

---

Plan complete and saved to `docs/superpowers/plans/2026-07-10-style-archetype-system.md`. Two execution options:

**1. Subagent-Driven (recommended)** — I dispatch a fresh subagent per task, review between tasks, fast iteration.

**2. Inline Execution** — Execute tasks in this session using `superpowers:executing-plans`, batch execution with checkpoints.

Which approach do you want?