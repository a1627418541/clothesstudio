# Sprint 3 Design: Real AI Style Diagnosis Engine

> **Goal:** Upgrade the existing mock style engine to a real AI-powered diagnosis engine while preserving a reliable mock fallback. Sprint 3 covers text-based diagnosis and recommendations only — no AI image generation.

**Date:** 2026-07-10

---

## 1. Product Goal

Replace the deterministic `mock-style-engine` with a pluggable AI provider layer. The first real provider is OpenAI (`gpt-4o-mini` by default). The system must:

- Analyze three user photos (FACE_FRONT, FACE_SIDE, FULL_BODY) plus basic profile data.
- Return a structured diagnosis: `bodyType`, `faceShape`, `vibeKeywords`, `summary`.
- Generate three complete style recommendations (primary + 2 alternatives).
- Validate AI output with Zod.
- Fall back to mock recommendations if AI fails, so the user never sees an error.
- Record every AI invocation as an `AiJob` linked to a `PromptVersion`.
- Keep API keys server-side only.
- Keep image bytes server-side: images are stored in R2 and accessed via public URL only; image binary is never sent to the frontend nor uploaded directly by the browser to the AI provider.

Out of scope: image generation, wardrobe, payments, community, Gemini full implementation, prompt management UI.

---

## 2. Technical Approach

### 2.1 Provider abstraction

Introduce a `StyleAiProvider` interface in `src/lib/ai/style-ai-provider.ts`. All diagnosis business logic calls this interface, never a concrete SDK directly.

```ts
export interface StyleAiProvider {
  analyze(input: StyleAiInput): Promise<StyleAiOutput>;
}

export interface StyleAiOutput {
  bodyType: string;
  faceShape: string;
  vibeKeywords: string[];
  summary: string;
  recommendations: StyleRecommendationOutput[]; // length 3; [0] primary, [1][2] alternatives
}
```

Concrete implementations:

- `OpenAiStyleProvider` — calls OpenAI vision model with R2 public image URLs.
- `MockStyleProvider` — wraps the extended mock engine (3 recommendations).
- `GeminiStyleProvider` — interface placeholder; not implemented in Sprint 3.

A factory/service (`StyleAiService`) selects the provider based on `AI_PROVIDER` env var, invokes the real provider, validates output, normalizes the result into a `recommendations` array of 3, and falls back to mock on failure.

### 2.2 Image input strategy

- Use existing `MediaAsset.url` (R2 public URL) as image input.
- Pass three URLs to the provider with explicit role labels.
- Validate that all three assets belong to the current diagnosis before calling AI.
- Do not download images to the server or expose image bytes to the frontend.

This is acceptable for the MVP because the R2 bucket is already public. Future sprints may switch to signed URLs or server-side base64 proxying.

### 2.3 Structured output and validation

- Prompt forces JSON output.
- `style-ai-schema.ts` defines a strict Zod schema for the AI response.
- `StyleAiService` parses and validates the response; any validation error triggers fallback.

### 2.4 Fallback behavior

- If OpenAI call fails (timeout, HTTP error, malformed JSON, Zod validation failure), mark the `AiJob.status = FAILED`, store the real provider failure reason in `AiJob.errorMessage`, and then call the mock provider.
- If the mock provider succeeds, store its structured output in `AiJob.output`. The `AiJob.status` remains `FAILED` because it records that the *real* AI provider failed, not that the user-facing diagnosis failed.
- The user-facing diagnosis still completes successfully using fallback data; the frontend receives the same response shape regardless of fallback.
- Mock provider always returns 3 recommendations so database structure stays consistent.

### 2.5 PromptVersion tracking

- Prompt text, name, version, and model are hard-coded constants in `style-ai-prompt.ts`.
- Before each AI call, `ensurePromptVersion({ name, version, model, prompt })` upserts a `PromptVersion` record by `(name, version)`.
- `AiJob.promptVersionId` references that record.
- No prompt management UI or runtime active-prompt switching in Sprint 3.

### 2.6 AiJob lifecycle

1. Create `AiJob` with `status = PENDING`, `type = DIAGNOSIS_ANALYSIS`, `promptVersionId`, `input` (diagnosisId, photo URLs, profile).
2. Update to `status = RUNNING` before calling provider.
3. On success: update to `COMPLETED`, store structured output in `output`.
4. On failure: update to `FAILED`, store the real provider's error summary in `errorMessage`, store fallback output (from mock provider) in `output`. `FAILED` here means the real AI provider failed; the user still receives a successful diagnosis response built from fallback data.

Never write API keys, DB credentials, or R2 secrets into `AiJob` fields.

---

## 3. File Design

```
src/lib/ai/
  style-ai-provider.ts        # StyleAiProvider interface + StyleAiInput/Output types
  openai-style-provider.ts    # OpenAI implementation
  mock-style-provider.ts      # Adapter around mock-style-engine
  gemini-style-provider.ts    # Interface placeholder
  style-ai-schema.ts          # Zod schemas for AI output
  style-ai-service.ts         # Provider selection, validation, fallback orchestration
  style-ai-prompt.ts          # Prompt constants, ensurePromptVersion helper

src/lib/
  mock-style-engine.ts        # Extended to return 3 recommendations, old API preserved
```

### Responsibilities

| File | Responsibility |
|------|----------------|
| `style-ai-provider.ts` | Define the provider contract and input/output types. |
| `openai-style-provider.ts` | Build messages, call OpenAI, return raw structured output. |
| `mock-style-provider.ts` | Implement `StyleAiProvider` using `generateMockStyleRecommendations`. |
| `gemini-style-provider.ts` | Skeleton class implementing `StyleAiProvider`; throws "not implemented". |
| `style-ai-schema.ts` | Zod schema for full AI response and per-recommendation shape. |
| `style-ai-service.ts` | Choose provider, ensure PromptVersion, run AI, validate, fallback, return unified output. |
| `style-ai-prompt.ts` | Hard-coded prompt, version constants, `ensurePromptVersion` helper. |
| `mock-style-engine.ts` | Generate 3 bilingual recommendations; keep `generateMockStyleRecommendation` for compatibility. |

---

## 4. API Flow

### `POST /api/diagnosis`

Current flow is preserved up to asset ownership validation. Then:

1. Resolve three `MediaAsset` records from `photoAssetIds`.
2. Create the `StyleDiagnosis` row and 3 `DiagnosisPhoto` rows inside a Prisma transaction (status = `SUBMITTED`).
3. Call `StyleAiService.analyze({
     userId,
     anonymousSessionId,
     diagnosisId: created.id,
     gender,
     age,
     heightCm,
     weightKg,
     photoUrls: {
       FACE_FRONT: front.url,
       FACE_SIDE: side.url,
       FULL_BODY: full.url,
     },
   })`.
4. `StyleAiService` returns a normalized `StyleAiOutput` containing `bodyType`, `faceShape`, `vibeKeywords`, `summary`, and `recommendations` (array of 3; item 0 is primary, items 1/2 are alternatives).
5. Inside a second Prisma transaction:
   - Update `StyleDiagnosis` with `bodyType`, `faceShape`, `vibeKeywords`, `summary`, `status: PREVIEW_READY`.
   - Create 3 `StyleRecommendation` records with `rank` 1/2/3 and `isPrimary` true/false/false.
6. Return `{ id, status, primaryRecommendation: recommendations[0] }` to match existing frontend expectations.

### `GET /api/diagnosis/[id]` / `/diagnosis/[id]`

- Return all recommendations sorted by `rank asc`.
- Frontend displays primary first, then two alternatives in a simple list.
- No complex UI in Sprint 3.

---

## 5. Prompt Design

Prompt constants live in `src/lib/ai/style-ai-prompt.ts`.

```ts
export const STYLE_DIAGNOSIS_PROMPT_NAME = "style-diagnosis-v1";
export const STYLE_DIAGNOSIS_PROMPT_VERSION = 1;
export const STYLE_DIAGNOSIS_MODEL = "gpt-4o-mini";
export const STYLE_DIAGNOSIS_SYSTEM_PROMPT = `...`;
```

### System prompt (abridged)

You are a professional personal stylist and image analyst. Analyze the provided three photos and user profile, then return a single JSON object.

Photo roles:
- FACE_FRONT: observe face shape, facial proportions, hairstyle suitability.
- FACE_SIDE: observe side profile, head-neck ratio, hairstyle outline.
- FULL_BODY: observe overall body proportions, posture, and styling direction.

Profile: gender, age, heightCm, weightKg.

Output requirements:
- bodyType: one concise label (e.g., "rectangle", "apple", "hourglass", "inverted-triangle", "oval-face-lean-body").
- faceShape: one concise label (e.g., "oval", "round", "square", "heart", "long").
- vibeKeywords: 3-5 style keywords.
- summary: 2-3 sentences in Chinese, describing the user's overall style direction.
- primaryRecommendation: best everyday style for the user.
- alternativeRecommendations: exactly 2 objects.
  - Alternative 1 must be a noticeably different polished/commuter direction.
  - Alternative 2 must be a noticeably different relaxed/personal direction.

Each recommendation must have: title (English / Chinese), description, summary, clothingAdvice, hairstyleAdvice, shoesAdvice, colorPalette (array of lowercase English colors), avoidTips (array of strings).

Return only valid JSON. Do not wrap in markdown code blocks.

### User message

- Text block with profile data.
- Three image URL blocks with role labels.

---

## 6. JSON Output Schema (Zod)

```ts
export const styleRecommendationSchema = z.object({
  title: z.string().min(1),
  description: z.string().min(1),
  summary: z.string().min(1),
  clothingAdvice: z.string().min(1),
  hairstyleAdvice: z.string().min(1),
  shoesAdvice: z.string().min(1),
  colorPalette: z.array(z.string().min(1)).min(3).max(7),
  avoidTips: z.array(z.string().min(1)).min(1).max(5),
});

export const styleAiOutputSchema = z.object({
  bodyType: z.string().min(1),
  faceShape: z.string().min(1),
  vibeKeywords: z.array(z.string().min(1)).min(3).max(5),
  summary: z.string().min(1),
  primaryRecommendation: styleRecommendationSchema,
  alternativeRecommendations: z.array(styleRecommendationSchema).length(2),
});
```

---

## 7. Error Handling

| Failure | Behavior |
|---------|----------|
| OpenAI timeout | Mark `AiJob` FAILED, fallback to mock. |
| OpenAI HTTP error (4xx/5xx) | Log status + message, fallback to mock. |
| OpenAI returns non-JSON | Log sample, fallback to mock. |
| Zod validation fails | Log issues, fallback to mock. |
| Image URL 404/403 from OpenAI side | OpenAI may still return a result based on available images; if it fails, fallback to mock. |
| Mock provider fails | Return HTTP 500 (this should never happen). |
| Database write fails | Transaction rolls back; return HTTP 500. |

All fallback paths still create/update `AiJob` with `status = FAILED` and store fallback output.

---

## 8. Environment Variables

| Variable | Required | Default | Description |
|----------|----------|---------|-------------|
| `AI_PROVIDER` | no | `openai` | `openai`, `mock`, or `gemini` (gemini not implemented). |
| `OPENAI_API_KEY` | yes if provider=openai | — | Server-side only. |
| `OPENAI_STYLE_MODEL` | no | `gpt-4o-mini` | Model used for diagnosis. |

No `NEXT_PUBLIC_` prefix. Keys are read only in server-side code.

---

## 9. Database Write Strategy

### Single transaction per diagnosis submission

```ts
await prisma.$transaction(async (tx) => {
  const diagnosis = await tx.styleDiagnosis.update({
    where: { id: diagnosisId },
    data: {
      bodyType: output.bodyType,
      faceShape: output.faceShape,
      vibeKeywords: output.vibeKeywords,
      summary: output.summary,
      status: "PREVIEW_READY",
    },
  });

  await tx.styleRecommendation.createMany({
    data: output.recommendations.map((rec, index) => ({
      diagnosisId,
      title: rec.title,
      description: rec.description,
      summary: rec.summary,
      clothingAdvice: rec.clothingAdvice,
      hairstyleAdvice: rec.hairstyleAdvice,
      shoesAdvice: rec.shoesAdvice,
      colorPalette: rec.colorPalette,
      avoidTips: rec.avoidTips,
      rank: index + 1,
      isPrimary: index === 0,
    })),
  });
});
```

### AiJob creation

`AiJob` is created before the AI call and updated after. It is **not** inside the diagnosis transaction because it records the attempt even if the diagnosis write later fails.

```ts
const job = await prisma.aiJob.create({
  data: {
    userId,
    anonymousSessionId,
    diagnosisId,
    promptVersionId,
    type: "DIAGNOSIS_ANALYSIS",
    status: "PENDING",
    input: { diagnosisId, gender, age, heightCm, weightKg, photoUrls },
  },
});
```

### PromptVersion upsert

```ts
const promptVersion = await prisma.promptVersion.upsert({
  where: { name_version: { name, version } },
  update: {},
  create: { name, version, model, prompt, isActive: true },
});
```

---

## 10. Acceptance Criteria

- [ ] `POST /api/diagnosis` uses real OpenAI when `AI_PROVIDER=openai`.
- [ ] AI output is validated by Zod; invalid output triggers mock fallback.
- [ ] On success, `StyleDiagnosis` has `bodyType`, `faceShape`, `vibeKeywords`, `summary`.
- [ ] On success, 3 `StyleRecommendation` records are created with rank 1/2/3.
- [ ] On OpenAI failure, mock fallback creates the same 3 records.
- [ ] `AiJob` record is created for every submission with `promptVersionId`.
- [ ] `PromptVersion` record exists after first AI call.
- [ ] API key never appears in frontend bundle or API responses.
- [ ] 图片二进制不会发送到前端，也不会由浏览器直接上传给 AI provider。Sprint 3 中，OpenAI 通过 R2 public URL 访问图片。
- [ ] `GET /api/diagnosis/[id]` returns recommendations sorted by `rank asc`.
- [ ] `/diagnosis/[id]` page shows primary + 2 alternatives.
- [ ] `AI_PROVIDER=mock` still works for local development and tests.
- [ ] `npm run lint`, `npx tsc --noEmit`, `npm run build` pass.
- [ ] Vercel deploy succeeds and production flow works end-to-end.

---

## 11. Out of Scope

- AI-generated images / lookbooks / wardrobe items.
- Payment, subscription, credits.
- Community features (sharing, following, comments).
- Full Gemini provider implementation.
- Prompt management UI or runtime prompt A/B testing.
- Wardrobe upload or outfit planning.
- Real-time progress indicators for AI job.
- Advanced retry/back-off beyond a single attempt.

---

## 12. Migration Notes

A small Prisma migration may be required to add the `description` field to `StyleRecommendation`.

Before running the migration, check `prisma/schema.prisma`:

- If `StyleRecommendation` already has a `description` field, skip the migration.
- If it does not exist, add it and run:

```bash
npx prisma migrate dev --name add_style_recommendation_description
```

Migration SQL:

```sql
ALTER TABLE "StyleRecommendation" ADD COLUMN "description" TEXT;
```

After the migration, the schema will support:

- `StyleDiagnosis.bodyType`, `faceShape`, `vibeKeywords`, `summary`
- `StyleRecommendation.description`, `rank`, `isPrimary`
- `AiJob.type`, `status`, `input`, `output`, `errorMessage`, `promptVersionId`
- `PromptVersion.name`, `version`, `model`, `prompt`, `isActive`

No other schema changes are needed for Sprint 3.

---

## 13. Risks

- **OpenAI vision availability/cost**: `gpt-4o-mini` is cheap but still adds cost. Keep `AI_PROVIDER=mock` for non-production testing.
- **Public R2 URLs**: OpenAI must fetch images; if R2 public access is disabled, calls fail and fall back to mock.
- **JSON reliability**: Even with strong prompting, occasional malformed JSON may occur; fallback must be robust.
- **Latency**: AI call may take 2-8 seconds; frontend should expect delayed response. Sprint 3 does not add async polling.

---

## 14. Next Step

After this design is approved, invoke `writing-plans` to create the detailed implementation plan.
