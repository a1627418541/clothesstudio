# Sprint 3.8 — Style Archetype Calibration V2 Design

**Date:** 2026-07-14
**Status:** Approved design consolidated for final review
**Scope:** Archetype V2 selection, immutable recommendation snapshots, report projection, centralized style-preview prompt compilation, compatibility, diagnostics, rollout, and tests

## 1. Problem Statement

Sprint 3.7 added Style Archetypes and archetype-backed style previews, but production reports can still generate three visually similar casual directions.

The observed failure is architectural rather than a single prompt defect:

1. AI first creates generic recommendation copy.
2. A matcher later tries to bind those recommendations to Archetypes.
3. Some recommendations fail the match floor and remain legacy recommendations.
4. The preview path then mixes generic prompts, Archetype templates, live relations, and legacy copy.
5. Titles, report advice, and image prompts can therefore describe different styles.

Sprint 3.8 replaces that mixed path for new eligible reports with an Archetype-authoritative V2 domain pipeline.

## 2. Goals

1. Select Top 3 recommendations directly from eligible V2 Style Archetypes.
2. Make Primary the highest-affinity Archetype while enforcing strong macro-category diversity for alternatives.
3. Make report copy and image prompts derive from the same immutable snapshot.
4. Prevent live Archetype edits from changing historical reports.
5. Compile all V2 image prompts through one centralized, deterministic compiler.
6. Make Old Money, Business Formal, Streetwear, Japanese Minimal, and other Archetypes visibly distinct.
7. Preserve legacy report readability without migrating or recomputing old reports.
8. Prevent invalid V2 records from silently generating paid generic fallback images.
9. Provide dry-run diagnostics that never call the image provider and never mutate the database.
10. Preserve explicit infrastructure failures instead of hiding them as recommendation fallback.

## 3. Non-goals

Sprint 3.8 does not:

- add shopping, affiliate, or commerce integrations;
- add a second AI call;
- change Auth, upload, payment, or wardrobe behavior;
- change the public image-provider protocol;
- recompute old reports;
- backfill old prompts or snapshots;
- build a Prompt-editing admin UI;
- add a complete image-attempt history table;
- use Jaccard similarity as production selection logic.

## 4. Architecture Overview

```text
Diagnosis AI output
├─ diagnosis analysis
└─ legacy recommendations (fallback only)

Diagnosis analysis
↓
V2 feature gate and readiness gate
↓
V2 Archetype eligibility validator
↓
Archetype affinity scorer
↓
Hard macro-diversity selector
↓
Archetype-authoritative projection
↓
Immutable ArchetypeRecommendationSnapshot set
├─ V2 ReportDisplayModel
└─ CompiledStylePrompt
   ↓
   centralized compileStylePreviewPrompt()
   ↓
   existing image-provider protocol
```

AI recommendations never determine V2 Archetype selection. They remain available only for deterministic whole-report legacy fallback when the V2 domain cannot form a complete set.

## 5. Persistence Model

### 5.1 New enums

```prisma
enum RecommendationSource {
  LEGACY_AI
  ARCHETYPE_V2
}

enum MacroCategory {
  DAILY_CLEAN
  CLASSIC_PREMIUM
  BUSINESS_FORMAL
  URBAN_STREET
  ARTISTIC_MINIMAL
  OUTDOOR_FUNCTIONAL
  ROMANTIC_SOFT
  SPORT_ACTIVE
  TREND_YOUTH
}
```

### 5.2 StyleRecommendation additions

```prisma
sourceMode            RecommendationSource @default(LEGACY_AI)
archetypeVersion      Int?
archetypeSnapshot     Json?
promptCompilerVersion Int?
previewAttemptCount   Int                  @default(0)
```

The existing field name remains:

```prisma
colorPalette String[]
```

No duplicate `recommendedColors` field is introduced.

`StyleRecommendation` stores the latest style-preview attempt through the existing fields:

```prisma
previewImageStatus ImageStatus
previewImagePrompt String?
previewImageUrl    String?
previewImageError  String?
```

A complete attempt-history table is not added in this Sprint.

`previewAttemptCount` is a lightweight monotonic audit counter, not an attempt history. Existing records begin at zero because historical attempts cannot be reconstructed safely.

### 5.3 StyleArchetype V2 additions

Display and prompt fields:

```prisma
macroCategory  MacroCategory?
requiredItems  String[] @default([])
forbiddenItems String[] @default([])
silhouetteDNA  String?  @db.Text
sceneMood      String?  @db.Text
```

Scorer-only metadata:

```prisma
vibeAliases         String[] @default([])
clothingMatchTerms  String[] @default([])
sceneMatchTerms     String[] @default([])
personalityTerms    String[] @default([])
preferredBodyTypes  String[] @default([])
preferredFaceShapes String[] @default([])
ageMin              Int?
ageMax              Int?
```

Scorer metadata is not copied into `ReportDisplayModel` or `CompiledStylePrompt`.

Existing `imagePromptTemplate` remains in the database for genuine legacy behavior and possible future reference. V2 never executes it.

### 5.4 Migration compatibility

The migration is additive:

- old recommendations receive `sourceMode = LEGACY_AI` through the schema default;
- old `archetypeSnapshot`, `archetypeVersion`, and `promptCompilerVersion` remain null;
- old `archetypeId` values remain unchanged and do not imply V2;
- old `previewImagePrompt` values remain unchanged;
- old `colorPalette` values remain unchanged;
- V1 Archetypes retain null or empty V2 fields and fail V2 eligibility until seeded completely.

No old report is recomputed, upgraded, or reclassified as V2.

## 6. V2 Feature Gate and Readiness

### 6.1 Feature flag

```text
STYLE_ARCHETYPE_V2_ENABLED=false
```

The flag is fail-closed:

- missing, malformed, or any value other than exact `true` means disabled;
- disabled means all new reports use the existing legacy plan;
- disabling the flag does not affect reading previously created V2 reports.

Stable creation fallback reasons include:

```ts
enum V2CreationFallbackReason {
  V2_DISABLED
  V2_READINESS_FAILED
  INSUFFICIENT_ELIGIBLE_ARCHETYPES
  SNAPSHOT_VALIDATION_FAILED
  INVALID_V2_RECOMMENDATION_SET
}
```

### 6.2 Readiness report

The read-only checker returns:

```ts
interface V2ReadinessReport {
  ready: boolean
  expectedArchetypeCount: number
  eligibleArchetypeCount: number
  missingExpectedSlugs: string[]
  invalidArchetypes: Array<{
    archetypeId: string
    reasonCodes: string[]
  }>
  pools: Record<"MALE" | "FEMALE" | "OTHER", {
    eligibleCount: number
    macroCategories: MacroCategory[]
    ready: boolean
  }>
}
```

Sprint 3.8 seeds 20 expected Archetypes. Readiness requires:

- all 20 expected slugs exist and are V2 eligible;
- total V2 eligible count is at least 20;
- MALE, FEMALE, and OTHER user pools each have at least three compatible eligible candidates;
- each user pool covers at least three macro categories;
- the seed validator reports no structural, canonical-item, or safety errors.

The runtime selector still performs eligibility validation. If the feature flag is mistakenly enabled against incomplete data, the selector fails closed to a whole-report legacy plan rather than creating partial V2 recommendations.

## 7. Seed Strategy

The seed is validated before any database write:

```text
load complete in-memory V2 seed manifest
↓
validate all 20 records
↓
validate canonical required/forbidden items
↓
validate gender pools and macro coverage
↓
only if every record passes: Prisma transaction upsert all records
↓
transaction completes
↓
run read-only readiness verification against persisted data
```

The seed transaction prevents partial upserts caused by an individual database write failure. Readiness verification occurs after the transaction because it validates the actual persisted database state and deployment environment.

If readiness verification fails, the feature flag stays disabled. A successful migration or partially successful operational run is never sufficient reason to enable V2.

## 8. V2 Selection Input

V2 reads diagnosis analysis only:

```ts
interface ArchetypeSelectionInput {
  gender: Gender
  age: number | null
  bodyType: string | null
  faceShape: string | null
  vibeKeywords: string[]
  diagnosisSummary: string | null
  height: number | null
  weight: number | null
}
```

V2 does not read legacy recommendation titles, summaries, clothing advice, or recommendation order.

Height and weight remain available to the domain input but are not directly scored in V2.1. Body-shape analysis may already use them; the Archetype scorer does not introduce BMI or unsupported body stereotypes.

## 9. GenderScope Compatibility

The compatibility matrix is exact:

| User gender | Eligible GenderScope values |
|---|---|
| MALE | MALE, UNISEX |
| FEMALE | FEMALE, UNISEX |
| OTHER | OTHER, UNISEX |

`GenderScope.OTHER` is not a wildcard.

If future product requirements allow OTHER users to access selected MALE or FEMALE Archetypes, that must be introduced as a separate explicit product rule with dedicated tests.

## 10. V2 Eligibility

An Archetype is eligible only when all conditions pass:

1. `active === true`.
2. `version >= 2`.
3. GenderScope is compatible.
4. `macroCategory` is supported.
5. Identity fields are complete.
6. `clothingDNA`, `hairstyleDNA`, `shoesDNA`, `colorDNA`, and `avoidDNA` are valid.
7. `requiredItems` and `forbiddenItems` are present and valid.
8. `silhouetteDNA` and `sceneMood` are valid.
9. Scorer metadata is structurally valid.
10. Canonical required and forbidden item keys do not conflict.
11. Safety and size validation passes.

`version >= 2` alone never makes an Archetype eligible.

Eligibility returns stable reason codes rather than a boolean-only result.

## 11. Canonical Item Dictionary

V2 retains `String[]` fields in the first version, but validation converts every item through a controlled alias dictionary before conflict checks.

Examples:

```text
tee / tees / t-shirt / t shirts         → t-shirt
sneaker / sneakers / trainers           → sneakers
trouser / trousers / dress pants        → tailored-trousers
hoodie / hooded sweatshirt              → hoodie
loafer / loafers                        → loafers
```

The normalization sequence is deterministic:

1. Unicode normalization.
2. Lowercase.
3. Trim and collapse whitespace.
4. Normalize punctuation and singular/plural aliases.
5. Resolve through the controlled alias dictionary.
6. Deduplicate by canonical key.
7. Sort deterministically where order has no presentation meaning.

Raw string `contains` is not sufficient conflict detection.

The validator rejects broad conflicts such as required `statement sneakers` with forbidden `sneakers`. Legitimate exceptions require an explicit canonical item rule rather than natural-language ambiguity.

## 12. Archetype Affinity Scoring

Each eligible Archetype receives a deterministic 0–100 score:

| Signal | Weight |
|---|---:|
| Vibe affinity | 30 |
| Body affinity | 15 |
| Face affinity | 10 |
| Age affinity | 10 |
| Clothing affinity | 15 |
| Scene affinity | 10 |
| Personality affinity | 10 |

Each dimension uses its own scorer metadata. `diagnosisSummary` is not scored repeatedly against clothing, scene, and personality free text. Any summary-derived terms are classified once into a single controlled signal channel before scoring.

Matching priority:

1. complete style phrase;
2. controlled phrase alias;
3. full multi-token match;
4. partial token overlap.

For example, `quiet luxury` can match controlled aliases such as `old money`, `understated luxury`, and `refined classic` without depending on token-level Jaccard.

Generic terms are explicitly downweighted:

```text
clean, casual, modern, simple, balanced, comfortable
```

A generic token by itself can contribute at most 20–25% of that dimension's score. Generic words cannot dominate complete style phrases or controlled aliases.

The score result includes a debug breakdown:

```ts
interface ArchetypeScoreBreakdown {
  vibe: number
  body: number
  face: number
  age: number
  clothing: number
  scene: number
  personality: number
  total: number
  matchedPhrases: string[]
  matchedAliases: string[]
}
```

`matchScore` is the rounded rule-based Archetype affinity score. It is not AI confidence and not accuracy.

There is no score floor that produces a null Archetype. Score ranks eligible candidates only.

## 13. Deterministic Hard Macro Diversity

Selection order is:

1. Primary: globally highest-scoring eligible Archetype.
2. Alternative 1: highest-scoring remaining Archetype whose macroCategory differs from Primary.
3. Alternative 2: highest-scoring remaining Archetype whose macroCategory differs from both prior selections.

Fallback diversity behavior:

- three or more macro categories: all three selections use different macro categories;
- two macro categories: cover both first, then select the highest remaining candidate and emit a warning;
- one macro category with at least three eligible candidates: select the highest three and emit a warning;
- fewer than three eligible candidates: whole-report deterministic legacy fallback.

Stable tie-breaking:

1. total score descending;
2. complete phrase matches descending;
3. controlled alias matches descending;
4. fixed MacroCategory enum order;
5. Archetype slug ascending.

Selection never depends on random numbers, database return order, creation time, or legacy recommendation index.

## 14. Immutable Recommendation Snapshot

```ts
interface ArchetypeRecommendationSnapshot {
  schemaVersion: 1
  archetypeVersion: number

  provenance: {
    archetypeId: string
    archetypeSlug: string
  }

  selection: {
    rank: 1 | 2 | 3
    matchScore: number
    macroCategory: MacroCategory
  }

  identity: {
    name: string
    category: string
    personalityLabel: string
    description: string
  }

  styleDNA: {
    clothingDNA: string
    hairstyleDNA: string
    shoesDNA: string
    colorDNA: string[]
    avoidDNA: string
    requiredItems: string[]
    forbiddenItems: string[]
    silhouetteDNA: string
    sceneMood: string
  }

  subjectContext: {
    genderPresentation: "MASCULINE" | "FEMININE" | "ANDROGYNOUS"
    bodyTypeHint: string | null
    faceShapeHint: string | null
    ageBand: string | null
  }
}
```

`subjectContext` is an immutable, minimized projection of diagnosis analysis. It contains no photo, upload URL, height, weight, or exact birth information.

`archetypeId` is provenance only. Report and prompt paths never use the live relation as historical content.

## 15. Snapshot Safety and Size Limits

Initial limits are fixed and versioned with snapshot schema version 1:

| Field | Limit |
|---|---:|
| identity name | 80 characters |
| category | 60 characters |
| personalityLabel | 120 characters |
| description | 600 characters |
| each DNA overview | 1,200 characters |
| silhouetteDNA | 600 characters |
| sceneMood | 600 characters |
| array item count | 12 items |
| colorDNA count | 10 items |
| individual item | 120 characters |
| serialized snapshot | 32 KiB UTF-8 |

Before snapshot creation, controlled text is normalized and validated:

- remove disallowed control characters;
- normalize line endings and whitespace;
- reject unexpected HTML tags or script-like markup;
- reject obvious Prompt-injection directives such as `ignore previous instructions`, fake `system:` or `assistant:` roles, and fenced instruction payloads;
- reject malformed arrays, nested objects, and unsupported keys;
- enforce item and total serialized limits.

The compiler accepts only a successfully parsed V2 snapshot. It does not accept arbitrary JSON or partially sanitized database content.

## 16. Snapshot Validation and Parsing

```ts
type SnapshotValidationResult =
  | { valid: true; snapshot: ArchetypeRecommendationSnapshot }
  | { valid: false; reasons: SnapshotValidationError[] }

function validateV2RecommendationSnapshot(
  recommendation: StyleRecommendationLike
): SnapshotValidationResult

function parseV2RecommendationSnapshot(
  recommendation: StyleRecommendationLike
): ArchetypeRecommendationSnapshot | null
```

V2 parsing requires all of the following:

- `sourceMode === ARCHETYPE_V2`;
- database `archetypeVersion >= 2`;
- supported `schemaVersion`;
- required fields complete and within size limits;
- valid colorDNA, requiredItems, and forbiddenItems;
- no canonical required/forbidden conflicts;
- snapshot `archetypeVersion` equals the database column;
- snapshot `matchScore` equals the database column;
- snapshot provenance Archetype ID equals `archetypeId`;
- supported rank, macroCategory, subject enums, and safe strings.

Stable validation codes include:

```ts
enum SnapshotValidationErrorCode {
  INVALID_SOURCE_MODE
  UNSUPPORTED_SCHEMA_VERSION
  INVALID_ARCHETYPE_VERSION
  VERSION_MISMATCH
  MISSING_REQUIRED_FIELD
  INVALID_MACRO_CATEGORY
  INVALID_MATCH_SCORE
  INVALID_COLOR_DNA
  INVALID_REQUIRED_ITEMS
  INVALID_FORBIDDEN_ITEMS
  REQUIRED_FORBIDDEN_CONFLICT
  ARCHETYPE_ID_MISMATCH
  SIZE_LIMIT_EXCEEDED
  UNSAFE_SNAPSHOT_TEXT
}
```

No parser path fills missing snapshot data from the live Archetype relation or legacy recommendation fields.

## 17. Report-level Set Validation

```ts
function parseV2RecommendationSet(
  recommendations: StyleRecommendationLike[]
): ArchetypeRecommendationSnapshot[] | null
```

A valid set requires:

- exactly three recommendations;
- unique ranks 1, 2, and 3;
- all three pass the single parser;
- all three are `ARCHETYPE_V2`;
- supported and consistent schema versions;
- unique Archetype IDs;
- hard macro diversity when sufficient categories existed at selection time.

Any failure makes the entire report use the legacy display adapter. A report never renders a mixture of V2 and legacy view models.

## 18. Archetype-authoritative Projection

The selected Archetype creates the snapshot and compatibility mirrors together:

```ts
{
  sourceMode: "ARCHETYPE_V2",
  archetypeVersion: snapshot.archetypeVersion,
  archetypeSnapshot: snapshot,
  archetypeId: snapshot.provenance.archetypeId,
  matchScore: snapshot.selection.matchScore,

  title: snapshot.identity.name,
  description: snapshot.identity.description,
  summary: snapshot.identity.description,
  clothingAdvice: projectClothingAdvice(snapshot),
  hairstyleAdvice: snapshot.styleDNA.hairstyleDNA,
  shoesAdvice: snapshot.styleDNA.shoesDNA,
  colorPalette: snapshot.styleDNA.colorDNA,
  avoidTips: projectAvoidTips(snapshot),

  promptCompilerVersion: null,
  previewImagePrompt: null,
}
```

Compatibility mirrors satisfy the existing non-null schema and support controlled legacy display fallback. They are not V2 report or V2 prompt sources.

## 19. Atomic Recommendation Planning and Persistence

```text
select Top 3
↓
create three snapshots
↓
validate each snapshot
↓
validate the complete set
↓
choose one V2 or legacy RecommendationPlan
↓
Prisma transaction writes all three recommendations
↓
same transaction updates diagnosis state
```

The transaction creates all three or none. A failed second or third insert rolls back the first insert.

Domain and infrastructure failures remain distinct:

```text
Domain failure
→ deterministic whole-report legacy fallback allowed

Infrastructure failure
→ rollback
→ explicit failure state
→ no legacy fallback
→ no automatic paid retry
```

Domain failures include insufficient eligible candidates, invalid generated snapshots, and invalid V2 sets.

Infrastructure failures include Neon connectivity, Prisma transaction failure or timeout, recommendation persistence failure, diagnosis state persistence failure, and provider-result persistence failure.

Infrastructure failure sets the existing `AiJobStatus.PERSISTENCE_FAILED`. No new similar AiJob status is introduced.

## 20. Recommendation Diagnostics

Controlled diagnostics are stored under a namespaced section of `AiJob.output`:

```ts
interface V2SelectionDiagnostics {
  pipelineVersion: 2
  selectedMode: RecommendationSource
  eligibleCount: number
  ineligibleReasonsByArchetype: Array<{
    archetypeId: string
    reasonCodes: string[]
  }>
  selected?: Array<{
    rank: 1 | 2 | 3
    archetypeId: string
    macroCategory: MacroCategory
    matchScore: number
  }>
  diversityWarning: DiversityWarning | null
  fallbackReason: V2CreationFallbackReason | null
}
```

Diagnostics never include photos, uploaded URLs, credentials, headers, or full prompts.

Infrastructure failures use `AiJobStatus.PERSISTENCE_FAILED` as the lifecycle state. Stable subtype codes and a safe correlation ID may be stored inside the controlled output namespace and logs; they do not replace or compete with the lifecycle status.

## 21. Report Display Models

```ts
type ReportDisplayModel =
  | V2ReportDisplayModel
  | LegacyReportDisplayModel
```

### 21.1 V2 model

V2 content maps only from the snapshot:

```ts
interface V2ReportDisplayModel {
  mode: "ARCHETYPE_V2"
  recommendations: Array<{
    recommendationId: string
    rank: 1 | 2 | 3
    title: string
    description: string
    personalityLabel: string
    category: string
    macroCategory: MacroCategory
    matchScore: number
    clothingAdvice: {
      overview: string
      requiredItems: string[]
      silhouette: string
    }
    hairstyleAdvice: string
    shoesAdvice: string
    colorPalette: string[]
    avoidAdvice: {
      overview: string
      forbiddenItems: string[]
    }
    sceneMood: string
    previewImageUrl: string | null
  }>
}
```

V2 report mapping never reads the current Archetype relation, legacy copy, or imagePromptTemplate.

### 21.2 Legacy fallback reasons

```ts
enum LegacyDisplayFallbackReason {
  TRUE_LEGACY_RECORD
  INVALID_V2_SNAPSHOT
  INCOMPLETE_V2_SET
  UNSUPPORTED_SNAPSHOT_VERSION
}
```

Precedence:

1. all true legacy records: `TRUE_LEGACY_RECORD`;
2. any unsupported snapshot version: `UNSUPPORTED_SNAPSHOT_VERSION`;
3. mixed source modes, missing entries, or invalid ranks: `INCOMPLETE_V2_SET`;
4. other snapshot errors: `INVALID_V2_SNAPSHOT`.

The reason is internal, logged, and asserted in tests. It is not shown to normal users.

### 21.3 Invalid V2 behavior

For `ARCHETYPE_V2` records with an invalid snapshot:

- build the whole report through compatibility mirrors;
- continue showing an existing previewImageUrl;
- show unavailable when no image exists;
- never call the generic legacy prompt builder;
- never execute the current Archetype imagePromptTemplate;
- never read the live Archetype relation to repair fields;
- never overwrite an existing V2 previewImagePrompt;
- never regenerate, including explicit failed retry.

Only true `LEGACY_AI` records may execute the legacy image-prompt pipeline.

## 22. CompiledStylePrompt

```ts
interface CompiledStylePrompt {
  compilerVersion: 1
  styleIdentity: {
    name: string
    personalityLabel: string
    macroCategory: MacroCategory
  }
  subject: {
    genderPresentation: string
    bodyTypeHint: string | null
    ageBand: string | null
  }
  outfit: {
    requiredItems: string[]
    clothingDNA: string
    silhouette: string
  }
  grooming: {
    hairstyleDNA: string
  }
  footwear: {
    shoesDNA: string
  }
  visualDirection: {
    colorPalette: string[]
    sceneMood: string
  }
  negativeConstraints: {
    forbiddenItems: string[]
    globalGuardrails: string[]
  }
}
```

The only V2 builder accepts a successfully parsed snapshot:

```ts
function buildCompiledStylePrompt(
  snapshot: ArchetypeRecommendationSnapshot
): CompiledStylePrompt
```

It does not accept a Prisma Archetype relation, legacy recommendation, database imagePromptTemplate, upload URL, or free-form Prompt extension.

## 23. Centralized Prompt Compiler

```ts
function compileStylePreviewPrompt(
  compiled: CompiledStylePrompt
): string
```

The final Prompt uses a fixed order:

1. editorial image objective;
2. style name;
3. personality label and macroCategory;
4. required outfit items;
5. clothing DNA;
6. silhouette;
7. hairstyle;
8. footwear;
9. color palette;
10. scene and mood;
11. Archetype-specific forbidden items;
12. global guardrails.

Global guardrails always include:

- no generic casual outfit;
- no plain t-shirt and jeans unless explicitly required by the Archetype;
- no text;
- no logo;
- no identifiable user face;
- no transformation;
- no uploaded user photo.

Guardrails are canonical-item aware. A required t-shirt removes only the t-shirt prohibition; required jeans remove only the jeans prohibition. `no generic casual outfit` always remains.

If Streetwear requires a graphic t-shirt, the compiler describes it as an abstract non-branded graphic treatment so it remains compatible with no text and no logo.

The compiler formats controlled fields; it does not reinterpret the Archetype or invent substitute garments.

## 24. Style Preview State Machine

The existing enum remains:

```text
PENDING → PROCESSING → COMPLETED
                     ↘ FAILED

FAILED  → PROCESSING only through explicit retry
```

Default forbidden transitions:

- COMPLETED to PROCESSING;
- PROCESSING to PROCESSING;
- invalid V2 to any provider call;
- automatic paid retry after persistence failure.

### 24.1 Exact expected status

CAS claims use an exact expected state:

- initial generation: `expectedStatus = PENDING`;
- explicit retry: `expectedStatus = FAILED`.

The claim never uses `status in [PENDING, FAILED]`. This keeps initial and retry semantics independently auditable.

### 24.2 Generation sequence

```text
validate snapshot
↓
build CompiledStylePrompt
↓
compile final Prompt
↓
atomically claim exact expected status
  - set PROCESSING
  - persist promptCompilerVersion
  - persist previewImagePrompt
  - increment previewAttemptCount
  - create the STYLE_GENERATION AiJob for this attempt
↓
only when claim succeeds, send the exact same in-memory Prompt to provider
↓
COMPLETED or FAILED
```

PROCESSING plus Prompt audit fields are written in the same atomic claim boundary. If that write fails, the provider is not called.

The CAS claim, attempt-count increment, and attempt AiJob creation share one Prisma transaction. The resulting counter value is copied into the AiJob input as `attemptNumber`.

`previewImagePrompt` means the final Prompt associated with that generation attempt. It does not mean the provider succeeded.

Provider failure preserves the Prompt and compiler version while changing status to FAILED. A valid explicit retry may overwrite them with the latest attempt. Invalid V2 never overwrites them.

### 24.3 Concurrency and cost protection

Only `claim.count === 1` can reach the provider. Parallel requests that lose the CAS claim are skipped without provider calls.

Page refresh does not retry PROCESSING, FAILED, invalid V2, or persistence-failed attempts automatically.

## 25. Attempt and Correlation Audit

The project already has `AiJobType.STYLE_GENERATION` and `AiJobStatus.PERSISTENCE_FAILED`, but the current style-preview route does not create a dedicated AiJob for each preview attempt.

Sprint 3.8 uses one AiJob per claimed image attempt without adding a full attempt table:

- `AiJob.id` is the correlation and attempt identifier;
- input records recommendationId, `attemptNumber`, exact expected status, compiler version, and a Prompt hash rather than duplicating the full Prompt;
- output records provider name, completion state, safe recovery metadata, and storage result;
- logs include AiJob ID/correlation ID and stable error code;
- StyleRecommendation retains only the latest Prompt, compiler version, URL, error, and status.

The current common provider interface returns URL/base64/error but not a provider job ID. EvoLink task IDs are visible internally during polling but are not exposed through the common result contract. Because changing the provider protocol is out of Sprint scope, task ID persistence is best-effort only where existing boundaries expose it.

If a provider returns a non-sensitive result ID, job ID, or retrievable remote URL at the orchestration boundary, it is saved to the controlled AiJob output before local result persistence. Signed URLs, credentials, and secret query parameters are never written to ordinary logs.

Future full historical audit should add a dedicated `StylePreviewAttempt` table. That future table would preserve every Prompt, provider identifier, state transition, remote result, and retry relationship.

## 26. Provider Success and Persistence Failure

If the provider succeeds but URL/storage persistence fails:

1. do not call the provider again automatically;
2. mark the attempt AiJob as `PERSISTENCE_FAILED` where the database is reachable;
3. record a stable error subtype such as `RESULT_PERSISTENCE_FAILED`;
4. record the correlation ID;
5. preserve any non-sensitive external recovery identifier in controlled AiJob output;
6. make no legacy fallback;
7. require explicit operational recovery.

If the database is completely unavailable, the server emits a secret-safe structured log containing correlation ID and stable error code. It never logs API keys, authorization headers, base64 image bodies, or signed URL credentials.

`previewImageError` contains only a bounded, sanitized user-safe message or stable error code.

## 27. Dry-run and Debug Design

The initial interface is server-only rather than a public endpoint:

```ts
compileV2StylePreviewsDryRun(
  diagnosisId: string
): Promise<V2PromptDebugReport>
```

The report includes:

- source mode and fallback reason;
- snapshot validation results;
- selected names, scores, and macro categories;
- canonical required and forbidden items;
- final compiled Prompts;
- compiler version;
- style-specific pairwise similarity heuristics;
- structural difference assertions.

Dry-run guarantees:

- zero provider calls;
- zero database writes;
- no ImageStatus changes;
- no previewImagePrompt writes;
- no promptCompilerVersion writes;
- no image creation;
- no legacy generic prompt generation for invalid V2.

## 28. Prompt Difference Heuristic

Bigram Jaccard `< 0.60` is a debug and test heuristic only. It does not participate in production selection or compilation.

Before comparison, tests remove fixed compiler labels, boilerplate, and global guardrails. They compare only:

- required outfit;
- clothing DNA;
- silhouette;
- footwear;
- scene;
- Archetype-specific forbidden items.

Tests also assert structured differences in:

- macroCategory;
- canonical required item keys;
- canonical forbidden item keys;
- sceneMood.

A passing Jaccard heuristic never replaces the structured assertions.

## 29. Deployment and Rollback

Deployment avoids an unsafe manual window:

1. Build and verify the release artifacts with V2 flag defaulting to false.
2. Confirm the currently deployed application tolerates additive columns; the migration does not remove or rename existing columns.
3. Keep the old application serving traffic and run `prisma migrate deploy`.
4. Deploy V2-capable application code with `STYLE_ARCHETYPE_V2_ENABLED=false`.
5. Validate the complete seed manifest in memory.
6. Execute the transactional V2 seed.
7. Run read-only V2 readiness verification.
8. Smoke-test legacy report creation and old report reading while V2 remains disabled.
9. Enable `STYLE_ARCHETYPE_V2_ENABLED=true` only after readiness passes.
10. Smoke-test a V2 diagnosis and dry-run Prompt report with a mock/no-cost provider path.

Rollback sequence:

1. disable the V2 feature flag;
2. stop new V2 creation immediately;
3. continue reading existing V2 reports from snapshots;
4. keep additive migration columns in place;
5. repair seed or code without recomputing reports;
6. rerun readiness before re-enabling.

If migration succeeds but seed fails, V2 stays disabled and legacy behavior remains available.

## 30. Complete Test Matrix

### 30.1 Migration and compatibility

- Old recommendations read as LEGACY_AI.
- Old snapshot/version/compilerVersion fields remain null.
- Existing previewAttemptCount begins at zero without pretending to reconstruct old attempts.
- Old previewImagePrompt is unchanged.
- Existing colorPalette remains unchanged.
- Existing archetypeId does not imply V2.
- V1 Archetypes cannot enter the eligible pool.

### 30.2 Feature flag and readiness

- Flag disabled makes new reports deterministically legacy.
- Missing or malformed flag is disabled.
- Incomplete seed with flag mistakenly enabled still yields whole-report fallback.
- Readiness reports total eligible count correctly.
- Readiness reports each gender-compatible pool correctly.
- Readiness reports macroCategory coverage correctly.
- Missing expected seed slug makes readiness fail.
- Migration success plus seed failure leaves legacy functionality available.
- Enabling V2 does not affect old report reads.

### 30.3 Gender and eligibility

- MALE accepts MALE and UNISEX only.
- FEMALE accepts FEMALE and UNISEX only.
- OTHER accepts OTHER and UNISEX only.
- OTHER is never a wildcard.
- Every missing or invalid V2 field produces the correct reason code.
- Version alone cannot grant eligibility.
- Unsafe text and oversized snapshots are rejected.

### 30.4 Canonical items

- Known aliases map to stable canonical keys.
- Required and forbidden duplicates are removed.
- Conflicts are detected after alias normalization.
- Broad conflicts such as statement sneakers versus forbidden sneakers fail.
- Validation does not rely on raw substring matching alone.

### 30.5 Scoring

- Complete phrases outrank generic token matches.
- Controlled aliases outrank partial tokens.
- Generic tokens are capped per dimension.
- Summary terms are not counted across multiple dimensions.
- matchScore stays in 0–100 and is documented as affinity.
- Legacy recommendation changes cannot alter V2 ranking.
- Repeated runs produce identical scores and order.

### 30.6 Hard macro diversity

- Primary is the global highest score.
- Alternative 1 is the highest score in a different macro.
- Alternative 2 is the highest score in a third macro when available.
- Two- and one-macro degradation emit stable warnings.
- Eligible count at least three never yields null Archetypes.
- Eligible count below three yields whole-report legacy fallback.
- Database return order cannot change the result.

### 30.7 Snapshot, projection, and transaction

- Snapshot is a deep immutable copy.
- Live Archetype changes do not change a report or Prompt.
- Snapshot contains no imagePromptTemplate.
- Compatibility colorPalette equals snapshot colorDNA.
- Every compatibility mirror derives from the snapshot.
- Single and set validators both pass before persistence.
- Failure of recommendation two or three rolls back all V2 recommendations.
- Diagnosis state update failure rolls back recommendation writes.
- Infrastructure failure never writes a legacy replacement.

### 30.8 Report adapters

- Valid V2 set produces V2ReportDisplayModel.
- V2 report reads no live Archetype relation.
- Every fallbackReason maps deterministically.
- Mixed or incomplete sets never render half V2.
- Invalid V2 with existing image keeps displaying it.
- Invalid V2 without image displays unavailable.
- Invalid V2 cannot regenerate.
- True legacy reports retain their existing display and prompt path.

### 30.9 Compiler

- Compiler accepts only parsed snapshots.
- No legacy recommendation or imagePromptTemplate enters V2 compilation.
- Required items, forbidden items, DNA, silhouette, footwear, and scene appear.
- All global guardrails appear.
- T-shirt and jeans exceptions are item-specific.
- Old Money contains knit/cashmere, tailored trousers, and loafers.
- Business Formal contains blazer/suit, dress shirt, tailored trousers, and dress shoes.
- Streetwear contains oversized, cargo/wide jeans, and statement sneakers.
- Japanese Minimal contains relaxed layering and wide-leg trousers.
- Structured differences pass.
- Filtered bigram Jaccard heuristic passes.

### 30.10 State machine, attempts, and cost protection

- Initial CAS requires exactly PENDING.
- Explicit retry CAS requires exactly FAILED.
- No broad PENDING-or-FAILED claim is used.
- Parallel requests allow one provider invocation only.
- Prompt audit persistence failure causes zero provider calls.
- Provider receives exactly the persisted final Prompt string.
- Provider failure preserves the latest Prompt and compiler version.
- Valid retry replaces only the latest attempt fields.
- CAS atomically increments previewAttemptCount.
- AiJob records the resulting attemptNumber.
- AiJob ID is recorded as correlation/attempt identifier.
- Provider success plus result persistence failure sets PERSISTENCE_FAILED and performs no automatic paid retry.
- Invalid V2 and page refresh perform zero provider calls.

### 30.11 Dry-run and regression

- Dry-run calls provider zero times.
- Dry-run performs zero database mutations.
- Dry-run returns three complete final Prompts for valid V2.
- Auth, upload, payment, and wardrobe tests remain unchanged and pass.
- Lint, typecheck, full unit/integration tests, and production build pass.
- All image tests use mock providers and produce no real cost.

## 31. Acceptance Criteria

1. New reports use the V2 pipeline only when the feature flag and readiness both pass.
2. Eligible V2 Top 3 contains three non-null Archetypes.
3. Primary remains the global highest-affinity result.
4. Alternatives maximize macro-category diversity.
5. New V2 report title, advice, and image Prompt all come from one immutable snapshot.
6. V2 never executes database imagePromptTemplate.
7. Old Money, Business Formal, Streetwear, and Japanese Minimal compile visibly distinct Prompts.
8. Old reports continue to open without migration or recomputation.
9. Invalid snapshots never create half-V2 reports and never trigger paid fallback images.
10. Domain failure permits deterministic legacy fallback; infrastructure failure does not.
11. previewImagePrompt equals the Prompt sent to the provider for the latest attempt.
12. Provider success followed by persistence failure never triggers an automatic paid retry.
13. Dry-run performs no provider calls and no writes.
14. No Auth, upload, payment, wardrobe, commerce, or provider-protocol changes are introduced.

## 32. Design Decisions Summary

- Recommendation authority: StyleArchetype V2, not AI recommendation copy.
- Historical authority: immutable schemaVersion 1 snapshot.
- Report source: validated snapshot only.
- Prompt source: validated snapshot only.
- Selection: deterministic affinity plus hard macro diversity.
- Prompt strategy: centralized compiler, not per-row templates.
- Compatibility: whole-report legacy adapter, never half V2.
- Migration: additive, no old-report backfill.
- Rollout: fail-closed feature flag plus readiness gate.
- Domain failures: deterministic legacy fallback permitted.
- Infrastructure failures: rollback, explicit PERSISTENCE_FAILED, no legacy disguise, no automatic paid retry.
- Audit: StyleRecommendation stores latest attempt; AiJob supplies attempt/correlation context; a future StylePreviewAttempt table provides full history.
