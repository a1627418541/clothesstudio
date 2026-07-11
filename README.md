# AI Personal Style Studio

Production-ready diagnosis and style-preview flow for an AI-powered personal style studio.

## What's Included

- Next.js 15 + React 19 + TypeScript + Tailwind CSS
- Prisma 7 ORM with Neon PostgreSQL
- Auth.js v5 with optional Google OAuth and Resend Magic Link
- Anonymous sessions via HTTP-only cookie
- Cloudflare R2 server-side upload with MediaAsset persistence
- Reserved Inngest and PostHog clients
- `/upload` — Sprint 1 mock upload test page
- `/diagnosis` — upload 3 photos, fill basic info, and generate 3 AI-backed style recommendations
- `/diagnosis/[id]` — private report page with recommendations and durable R2-hosted style preview images

## Prerequisites

- Node.js 20+
- A Neon PostgreSQL database
- (Optional) Google OAuth credentials
- (Optional) Resend API key and verified sender domain
- Cloudflare R2 bucket and credentials (required for photo upload)

## Environment Setup

Copy `.env.example` to `.env.local` and fill in the values:

```bash
cp .env.example .env.local
```

Required variables:

- `DATABASE_URL` — Neon PostgreSQL connection string
- `AUTH_SECRET` — random string (at least 32 characters)
- `AUTH_URL` — `http://localhost:3000` for local development
- `CLOUDFLARE_R2_ACCOUNT_ID`
- `CLOUDFLARE_R2_ACCESS_KEY_ID`
- `CLOUDFLARE_R2_SECRET_ACCESS_KEY`
- `CLOUDFLARE_R2_BUCKET_NAME`
- `CLOUDFLARE_R2_PUBLIC_BASE_URL`

`CLOUDFLARE_R2_PUBLIC_BASE_URL` must be an absolute public HTTP(S) base URL
(for example, an R2 custom domain or `https://pub-xxx.r2.dev`). The app rejects
relative object keys because browsers cannot display them reliably.

Optional variables:

- `AUTH_GOOGLE_ID` / `AUTH_GOOGLE_SECRET`
- `AUTH_RESEND_KEY` / `EMAIL_FROM`
- `INNGEST_EVENT_KEY` / `INNGEST_SIGNING_KEY`
- `NEXT_PUBLIC_POSTHOG_KEY` / `NEXT_PUBLIC_POSTHOG_HOST`

### AI Provider (server-side only)

Text diagnosis and style preview images use **separate provider configurations** so you can route text analysis through an OpenAI-compatible service (e.g. StarAPI) while sending image generation to an OpenAI official image endpoint.

#### Text Diagnosis

| Variable | Required | Default | Description |
|----------|----------|---------|-------------|
| `AI_PROVIDER` | no | `openai` | `openai`, `mock`, or `gemini` (gemini not implemented). |
| `OPENAI_API_KEY` | yes if provider=openai | — | Server-side only. |
| `OPENAI_BASE_URL` | no | `https://api.openai.com/v1` | OpenAI-compatible endpoint for text diagnosis. |
| `OPENAI_STYLE_MODEL` | no | `gpt-4o-mini` | Model used for diagnosis. |

- Set `AI_PROVIDER=mock` for local development without OpenAI costs.
- Set `AI_PROVIDER=openai` and provide `OPENAI_API_KEY` for real AI diagnosis.
- If OpenAI fails, the text diagnosis falls back to the mock engine and records
  the provider failure in `AiJob`.

#### Style Preview Images

| Variable | Required | Default | Description |
|----------|----------|---------|-------------|
| `STYLE_PREVIEW_PROVIDER` | no | `mock` | `openai` or `mock`. |
| `STYLE_PREVIEW_MODEL` | no | `gpt-image-2` | Image model, e.g. `gpt-image-2`. |
| `STYLE_PREVIEW_OPENAI_API_KEY` | yes if provider=openai | — | **Separate** from `OPENAI_API_KEY`. Server-side only. |
| `STYLE_PREVIEW_OPENAI_BASE_URL` | no | `https://api.openai.com/v1` | OpenAI `/images/generations` endpoint. |
| `STYLE_PREVIEW_FALLBACK_TO_MOCK` | no | `false` | Fallback to mock if image generation fails. Useful in development. |

- Set `STYLE_PREVIEW_PROVIDER=mock` to show placeholder style images.
- Set `STYLE_PREVIEW_PROVIDER=openai` and provide `STYLE_PREVIEW_OPENAI_API_KEY` for real style preview images.
- The image provider never reuses `OPENAI_API_KEY`, avoiding accidental StarAPI-key usage on an OpenAI image endpoint.
- Automatic preview generation runs once for each `PENDING` recommendation.
  Failed previews are retried only when the user explicitly clicks the retry button.
- All successful provider and mock-fallback images are copied to R2 before the
  recommendation is marked `COMPLETED`.

## Database Setup

```bash
npx prisma generate
npx prisma migrate deploy
```

For local development, migrations have been committed. Use `npx prisma migrate deploy` to apply them in non-interactive environments.

## Run Development Server

```bash
npm run dev
```

Open [http://localhost:3000](http://localhost:3000).

## Verification

### Sprint 1

1. `GET /api/health` → `{ "status": "ok" }`
2. `GET /api/anonymous-session` → creates/resolves anonymous session
3. `/upload` → upload three images (face front, face side, full body)
4. Uploaded files appear in R2
5. `MediaAsset` records appear in Neon

### Sprint 2

1. Run checks:

```bash
npx prisma generate
npx prisma migrate deploy
npm run lint
npx tsc --noEmit
npm run dev
```

2. Visit `http://localhost:3000/diagnosis` in an incognito window.
3. Upload three photos and submit the form.
4. Verify inline preview displays the mock recommendation.
5. Click **View Details** and verify `/diagnosis/[id]` renders the report.
6. Check Neon records for the latest diagnosis:

```sql
SELECT * FROM "StyleDiagnosis" ORDER BY "createdAt" DESC LIMIT 1;
SELECT * FROM "DiagnosisPhoto" WHERE "diagnosisId" = '<id>';
SELECT * FROM "StyleRecommendation" WHERE "diagnosisId" = '<id>';
```

Expected: 1 diagnosis, 3 photos, 3 recommendations (1 primary + 2 alternatives).

7. Copy the `/diagnosis/[id]` URL to a different browser/incognito session and confirm access is denied.

## Project Structure

```
src/
  app/
    api/
      anonymous-session/route.ts
      auth/[...nextauth]/route.ts
      diagnosis/route.ts
      diagnosis/[id]/route.ts
      health/route.ts
      upload/route.ts
    diagnosis/page.tsx
    diagnosis/[id]/page.tsx
    layout.tsx
    page.tsx
    upload/page.tsx
  lib/
    anonymous-session.ts
    auth.ts
    diagnosis-service.ts
    env.ts
    inngest.ts
    mock-style-engine.ts
    posthog.ts
    prisma.ts
    r2.ts
    validators/
      diagnosis.ts
prisma/
  schema.prisma
  migrations/
prisma.config.ts
```

## Important Notes

- This project uses Prisma 7. The database connection URL is configured in `prisma.config.ts`, and the Prisma Client uses the Neon serverless driver adapter.
- Auth.js providers are dynamically assembled from environment variables. Missing provider configuration will not crash the dev server.
- Inngest and PostHog clients are reserved but currently inactive.
- Text diagnosis supports real OpenAI-compatible providers with validated mock fallback.
- Recommendation preview images use a separately configured image provider and are persisted to R2.

## Current Scope

Implemented:

- Prisma schema adjustments: `Gender` enum (`MALE` / `FEMALE` / `OTHER`), required basic-info fields on `StyleDiagnosis`, expanded `StyleRecommendation` model.
- Shared Zod validators for diagnosis submission.
- Pluggable real/mock text diagnosis engine with Zod-validated structured output.
- `POST /api/diagnosis` with asset ownership validation, AI job tracking, and Prisma transactions.
- `GET /api/diagnosis/[id]` with ownership checks.
- `/diagnosis` client page with uploads, form, and inline preview.
- `/diagnosis/[id]` report with three recommendations and durable style preview images.

Out of scope:

- Full report unlock
- Payments
- Wardrobe management
- Community features
- Admin panel
- Share links
- Personalized transformation images of the uploaded user
