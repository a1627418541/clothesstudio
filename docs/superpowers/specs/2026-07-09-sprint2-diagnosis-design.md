# Sprint 2 — Diagnosis Submission + Basic Info Form + Primary Style Preview

## Goal
Allow a logged-in user or anonymous visitor to upload three diagnosis photos, fill in basic body/face info, submit a style diagnosis, and immediately see a mock-generated primary style recommendation preview. No real AI, no generated images, no wardrobe, no payments, no community.

## Scope
- `/diagnosis` — client page with three photo uploads, basic info form, submit, inline preview.
- `/diagnosis/[id]` — server-rendered report preview page with photos, basic info, and primary recommendation.
- `POST /api/diagnosis` — accept submission, validate ownership of uploaded assets, create `StyleDiagnosis` + 3 `DiagnosisPhoto` rows + 1 primary `StyleRecommendation`.
- `GET /api/diagnosis/[id]` — return diagnosis details only to the owner (user or current anonymous session).
- `src/lib/mock-style-engine.ts` — deterministic, branching mock engine that produces bilingual recommendation text.
- `src/lib/validators/diagnosis.ts` — shared Zod schemas used on both client and server.
- `src/lib/diagnosis-service.ts` — shared query + authorization logic used by the API route and the detail page.

## Out of scope
- Real AI inference.
- Image generation, lookbook, wardrobe, community, payments.
- Non-primary recommendations.
- Editing or deleting a diagnosis.
- Email / notification triggers.

## Global Constraints
- Next.js 15 App Router with React 19, TypeScript strict mode, Tailwind CSS v4.
- Prisma 7 with Neon PostgreSQL, Neon HTTP fetch transport (`neonConfig.poolQueryViaFetch = true`).
- Auth.js v5 beta with `@auth/prisma-adapter`.
- Anonymous sessions via HTTP-only cookie `aps_anonymous_session` (max-age 7 days).
- Cloudflare R2 uploads via existing `POST /api/upload`.
- Zod for validation; same schema shared by client and server.
- All R2 credentials and env vars stay server-side only.

---

## Module 1 — Schema Changes

### `Gender` enum
Replace the existing four-value enum with:

```prisma
enum Gender {
  MALE
  FEMALE
  OTHER
}
```

### `StyleDiagnosis`
Make basic-info fields required for new submissions:

```prisma
model StyleDiagnosis {
  id                 String               @id @default(cuid())
  userId             String?
  anonymousSessionId String?

  user               User?                @relation(fields: [userId], references: [id], onDelete: SetNull)
  anonymousSession   AnonymousSession?    @relation(fields: [anonymousSessionId], references: [id], onDelete: SetNull)

  gender       Gender
  age          Int
  heightCm     Int
  weightKg     Int
  bodyType     String?
  faceShape    String?
  vibeKeywords String[]
  summary      String?
  status       StyleDiagnosisStatus @default(SUBMITTED)

  photos          DiagnosisPhoto[]
  recommendations StyleRecommendation[]
  generatedImages GeneratedImage[]
  aiJobs          AiJob[]

  deletedAt DateTime?
  createdAt DateTime @default(now())
  updatedAt DateTime @updatedAt
}
```

- `gender`, `age`, `heightCm`, `weightKg` are required.
- Default status remains `SUBMITTED` at the schema level; the API transitions it to `PREVIEW_READY` after the mock recommendation is written.

### `StyleRecommendation`
Evolve the placeholder model to store the primary recommendation fields and remove `description` / `category` / `priority`:

```prisma
model StyleRecommendation {
  id              String         @id @default(cuid())
  diagnosisId     String
  diagnosis       StyleDiagnosis @relation(fields: [diagnosisId], references: [id], onDelete: Cascade)

  title           String
  summary         String
  clothingAdvice  String
  hairstyleAdvice String
  shoesAdvice     String
  colorPalette    String[]
  avoidTips       String[]

  rank            Int            @default(0)
  isPrimary       Boolean        @default(false)

  createdAt DateTime @default(now())
  updatedAt DateTime @updatedAt

  @@index([diagnosisId])
}
```

- For Sprint 2 only one recommendation is created per diagnosis.
- It is stored with `rank = 1` and `isPrimary = true`.
- `colorPalette` stores lowercase English color names, e.g. `["navy", "ivory", "camel"]`.
- `avoidTips` stores short lowercase English labels, e.g. `["oversized silhouettes", "neon colors"]`.

### `DiagnosisPhoto`
Unchanged. Photos are linked with roles `FACE_FRONT`, `FACE_SIDE`, `FULL_BODY` and `@@unique([diagnosisId, role])`.

---

## Module 2 — Shared Validation

File: `src/lib/validators/diagnosis.ts`

This file must contain only pure Zod schemas and types — no server-only imports so it can be imported by the client page.

```typescript
import { z } from "zod";

export const diagnosisPhotoAssetIdsSchema = z.object({
  FACE_FRONT: z.string().min(1, "Front face photo is required"),
  FACE_SIDE: z.string().min(1, "Side face photo is required"),
  FULL_BODY: z.string().min(1, "Full body photo is required"),
});

export const diagnosisFormSchema = z.object({
  gender: z.enum(["MALE", "FEMALE", "OTHER"]),
  age: z.number().int().min(13).max(80),
  heightCm: z.number().int().min(120).max(230),
  weightKg: z.number().int().min(30).max(200),
  photoAssetIds: diagnosisPhotoAssetIdsSchema,
});

export type DiagnosisFormInput = z.infer<typeof diagnosisFormSchema>;
```

- Client uses the same schema for live validation.
- API uses the same schema for `safeParse` and returns `400 BAD_REQUEST` on failure.

---

## Module 3 — Mock Style Engine

File: `src/lib/mock-style-engine.ts`

### Input type

```typescript
export interface MockStyleInput {
  gender: "MALE" | "FEMALE" | "OTHER";
  age: number;
  heightCm: number;
  weightKg: number;
}
```

### Output type

```typescript
export interface MockStyleRecommendation {
  title: string;
  summary: string;
  clothingAdvice: string;
  hairstyleAdvice: string;
  shoesAdvice: string;
  colorPalette: string[];
  avoidTips: string[];
}
```

### Branching rules

The engine selects a base style by `gender`:

| Gender | Bilingual title                  |
|--------|----------------------------------|
| MALE   | Clean Casual / 干净休闲          |
| FEMALE | Soft Minimal / 柔和极简          |
| OTHER  | Gender Neutral / 无性别风        |

Each branch has a base `summary`, `clothingAdvice`, `hairstyleAdvice`, and `shoesAdvice` string in English + Chinese, e.g.:

- **MALE summary**: "A relaxed but polished everyday look that keeps silhouettes simple and fabrics breathable. / 轻松但精致的日常造型，剪裁简洁、面料透气。"
- **FEMALE summary**: "Gentle tones and flowing lines create a calm, modern femininity without excess detail. / 柔和色调与流畅线条，打造不过分装饰的 calm 现代女性气质。"
- **OTHER summary**: "Balanced silhouettes and muted palettes that sit outside traditional gendered dressing. / 平衡廓形与低饱和配色，跳出传统性别化着装框架。"

Conditional sentences are appended to `clothingAdvice` based on `age`, `heightCm`, and `weightKg`:

- **Age >= 40**: add age-appropriate tailoring note (fit over trend) in English + Chinese.
- **Age < 25**: add youthful fabric / experimentation note in English + Chinese.
- **heightCm < 160**: add vertical-line / proportion-lengthening note in English + Chinese.
- **heightCm >= 175**: add structure / oversized-balance note in English + Chinese.
- **weightKg >= 85 (MALE) or >= 75 (FEMALE/OTHER)**: add structured, breathable, dark-palette emphasis in English + Chinese.
- **weightKg < 55**: add light layering / texture-volume note in English + Chinese.

The final values are deterministic bilingual strings. The engine is synchronous and runs in-process in `POST /api/diagnosis`.

### Color palette
Each branch returns a fixed palette of 3-5 lowercase English color names appropriate to the base style:

- Clean Casual: `["navy", "white", "light gray", "camel", "olive"]`
- Soft Minimal: `["ivory", "taupe", "dusty rose", "charcoal", "soft white"]`
- Gender Neutral: `["black", "ecru", "sage green", "slate gray", "tan"]`

### Avoid tips
Each branch returns 2-3 short lowercase English labels to avoid:

- Clean Casual: `["oversized silhouettes", "neon colors", "excessive logos"]`
- Soft Minimal: `["busy prints", "heavy accessories", "high-contrast clashes"]`
- Gender Neutral: `["rigid gendered cuts", "overly bright primaries", "bulky layering"]

---

## Module 4 — Diagnosis Service

File: `src/lib/diagnosis-service.ts`

This file contains Prisma-backed query logic plus ownership checks. It is imported by both `GET /api/diagnosis/[id]/route.ts` and `src/app/diagnosis/[id]/page.tsx` so the server component does not need to call the internal API.

### Function

```typescript
export async function getDiagnosisDetailForViewer({
  diagnosisId,
  userId,
  anonymousSessionId,
}: {
  diagnosisId: string;
  userId: string | null;
  anonymousSessionId: string | null;
}): Promise<
  | { ok: true; diagnosis: DiagnosisDetail }
  | { ok: false; code: "NOT_FOUND" | "FORBIDDEN" }
>;
```

### Behavior

1. Query `StyleDiagnosis` by `id`, include `photos` (with `mediaAsset`) and `recommendations` (filtered to `isPrimary: true`, ordered by `rank asc`).
2. If not found → `{ ok: false, code: "NOT_FOUND" }`.
3. If `diagnosis.userId` exists, the viewer must be a logged-in user with the same `userId`; otherwise → `{ ok: false, code: "FORBIDDEN" }`.
4. If `diagnosis.userId` is null, ownership falls back to `anonymousSessionId`. The viewer must provide an anonymous session id equal to `diagnosis.anonymousSessionId`; otherwise → `{ ok: false, code: "FORBIDDEN" }`.
5. On success, photos are returned in fixed order: `FACE_FRONT`, `FACE_SIDE`, `FULL_BODY`.

### Type returned

```typescript
export interface DiagnosisDetail {
  id: string;
  gender: string;
  age: number;
  heightCm: number;
  weightKg: number;
  status: string;
  createdAt: Date;
  photos: {
    role: string;
    url: string | null;
    mimeType: string;
  }[];
  primaryRecommendation: {
    title: string;
    summary: string;
    clothingAdvice: string;
    hairstyleAdvice: string;
    shoesAdvice: string;
    colorPalette: string[];
    avoidTips: string[];
  } | null;
}
```

---

## Module 5 — API Routes

### `POST /api/diagnosis`

File: `src/app/api/diagnosis/route.ts`

#### Steps

1. Resolve current actor:
   - `const session = await auth();` (Auth.js v5 `auth()` helper from `src/lib/auth.ts`).
   - If `session?.user?.id`, use that as `userId`.
   - Else read the `aps_anonymous_session` cookie and look up `AnonymousSession` by token. If missing or expired, create a new anonymous session and set the cookie. Use its `id` as `anonymousSessionId`.
2. Read and parse JSON body.
3. `diagnosisFormSchema.safeParse(body)`.
   - On failure: `400 BAD_REQUEST` with Zod error issues.
4. Ownership validation:
   - For each entry in `photoAssetIds`, `await prisma.mediaAsset.findUnique({ where: { id } })`.
   - Each asset must exist and belong to the current actor (`userId` or `anonymousSessionId`).
   - Any mismatch → `403 FORBIDDEN` with message `"Photo asset not owned by current session"`.
5. Inside `prisma.$transaction`:
   - Create `StyleDiagnosis` with `gender`, `age`, `heightCm`, `weightKg`, `status: StyleDiagnosisStatus.SUBMITTED`, and the resolved owner fields.
   - Create 3 `DiagnosisPhoto` rows mapping each role to its `mediaAssetId`.
   - Call `generateMockStyleRecommendation({ gender, age, heightCm, weightKg })`.
   - Create one `StyleRecommendation` with the generated fields, `rank: 1`, `isPrimary: true`.
   - Update `StyleDiagnosis.status` to `PREVIEW_READY`.
6. Return `201 CREATED` with:

```json
{
  "id": "<diagnosisId>",
  "status": "PREVIEW_READY",
  "primaryRecommendation": { ... }
}
```

### `GET /api/diagnosis/[id]`

File: `src/app/api/diagnosis/[id]/route.ts`

#### Steps

1. Read `params.id`.
2. Resolve actor exactly as in POST (`auth()` then anonymous cookie).
3. Call `getDiagnosisDetailForViewer({ diagnosisId: id, userId, anonymousSessionId })`.
4. Map result:
   - `NOT_FOUND` → `404 NOT_FOUND`.
   - `FORBIDDEN` → `403 FORBIDDEN`.
   - Success → `200 OK` with JSON detail.

---

## Module 6 — Frontend Pages

### `/diagnosis`

File: `src/app/diagnosis/page.tsx`

A client component (`"use client"`) for Sprint 2 simplicity.

#### Layout

1. **Three upload cards** stacked vertically, labeled:
   - Front face photo
   - Side face photo
   - Full body photo
2. Each card contains:
   - A hidden file input accepting `image/*`.
   - A visible drop/click area.
   - Status text: `idle | uploading | uploaded | error`.
   - On file selection, build a `FormData` with `file` and `role` (e.g. `FACE_FRONT`) and call `POST /api/upload`; on success store the returned `MediaAsset.id` in component state under the matching role.
3. **Basic info form** below uploads:
   - `Gender` select: Male / Female / Other (maps to `MALE`, `FEMALE`, `OTHER`).
   - `Age` number input (13-80).
   - `Height (cm)` number input (120-230).
   - `Weight (kg)` number input (30-200).
4. **Submit Diagnosis** button:
   - Disabled until all three uploads succeed and Zod validation passes.
   - On click, `POST /api/diagnosis` with `{ gender, age, heightCm, weightKg, photoAssetIds }`.
5. **Inline preview** (shown after successful submission):
   - Display `primaryRecommendation.title`, `summary`, `clothingAdvice`, `hairstyleAdvice`, `shoesAdvice`, `colorPalette`, `avoidTips`.
   - A **View Details** button linking to `/diagnosis/[id]`.
6. **Error states**:
   - Upload error shown per card.
   - Validation error shown under the offending field.
   - Submit error shown above the submit button.

### `/diagnosis/[id]`

File: `src/app/diagnosis/[id]/page.tsx`

An async server component.

#### Steps

1. Await `params` (Next.js 15 passes `params` as a Promise) and read `params.id`.
2. Resolve actor via `auth()` and the anonymous cookie.
3. Call `getDiagnosisDetailForViewer({ diagnosisId: id, userId, anonymousSessionId })`.
4. Render:
   - Diagnosis id.
   - Gender, age, height, weight.
   - Three photos in fixed order `FACE_FRONT`, `FACE_SIDE`, `FULL_BODY` using the R2 public URL from `mediaAsset.url`.
   - Primary recommendation title + all advice fields.
   - A fallback message when no primary recommendation exists.
   - A **Login to view full report** prompt if the viewer is anonymous.
5. If `NOT_FOUND` or `FORBIDDEN`, render a simple error page with message and a link back to `/diagnosis`.

---

## Module 7 — Error Handling & Loading States

- `POST /api/diagnosis` returns structured error JSON: `{ error: string, issues?: z.ZodIssue[] }`.
- Client disables submit and shows field-level errors from Zod.
- API returns `403` for cross-session asset access and diagnosis detail access.
- Server detail page renders plain error UI for `403` / `404`.
- All async client actions use try/catch and set local error state; no global error boundary required for Sprint 2.

---

## Module 8 — Verification Checklist

Before marking Sprint 2 complete, run:

1. `npx prisma generate` succeeds.
2. `npx prisma migrate dev --name sprint2_diagnosis_primary_recommendation` succeeds.
3. `npm run lint` passes.
4. `npx tsc --noEmit` passes.
5. `npm run dev` starts without errors.
6. End-to-end flow:
   - Visit `/diagnosis` in an incognito window.
   - Upload three photos; verify `MediaAsset` rows in Neon with the current anonymous session id.
   - Fill the form and submit; verify a `StyleDiagnosis` row, three `DiagnosisPhoto` rows, and one `StyleRecommendation` row are created.
   - Verify the inline preview displays the mock recommendation.
   - Click **View Details** and verify `/diagnosis/[id]` renders the report.
   - Copy the `/diagnosis/[id]` URL into another browser/incognito session and verify it returns `403` / error page.

---

## Open Questions / Future Sprints

- The `UserProfile` / `UserPrivacySettings` models are unchanged; they will be used once user onboarding is added.
- `AiJob` is not created during Sprint 2 because the engine is mock/synchronous. Real inference will enqueue an `AiJob` later.
- `GeneratedImage` remains reserved for future AI-generated lookbook images.
