# AI Personal Style Studio

Sprint 1 infrastructure + Sprint 2 diagnosis submission and primary style preview for an AI-powered personal style studio.

## What's Included

- Next.js 15 + React 19 + TypeScript + Tailwind CSS
- Prisma 7 ORM with Neon PostgreSQL
- Auth.js v5 with optional Google OAuth and Resend Magic Link
- Anonymous sessions via HTTP-only cookie
- Cloudflare R2 server-side upload with MediaAsset persistence
- Reserved Inngest and PostHog clients
- `/upload` — Sprint 1 mock upload test page
- `/diagnosis` — Sprint 2 product flow: upload 3 photos, fill basic info, submit, see mock primary recommendation
- `/diagnosis/[id]` — Sprint 2 report preview page with photos and recommendation

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

Optional variables:

- `AUTH_GOOGLE_ID` / `AUTH_GOOGLE_SECRET`
- `AUTH_RESEND_KEY` / `EMAIL_FROM`
- `INNGEST_EVENT_KEY` / `INNGEST_SIGNING_KEY`
- `NEXT_PUBLIC_POSTHOG_KEY` / `NEXT_PUBLIC_POSTHOG_HOST`

### AI Provider (server-side only)

| Variable | Required | Default | Description |
|----------|----------|---------|-------------|
| `AI_PROVIDER` | no | `openai` | `openai`, `mock`, or `gemini` (gemini not implemented). |
| `OPENAI_API_KEY` | yes if provider=openai | — | Server-side only. |
| `OPENAI_STYLE_MODEL` | no | `gpt-4o-mini` | Model used for diagnosis. |

- Set `AI_PROVIDER=mock` for local development without OpenAI costs.
- Set `AI_PROVIDER=openai` and provide `OPENAI_API_KEY` for real AI diagnosis.
- If OpenAI fails, the system automatically falls back to the mock engine.

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

Expected: 1 diagnosis, 3 photos, 1 primary recommendation.

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
- Inngest and PostHog are reserved but inactive in Sprint 2.
- The style engine in Sprint 2 is deterministic and mock-based; no real AI model is called.

## Sprint 2 Scope

Implemented:

- Prisma schema adjustments: `Gender` enum (`MALE` / `FEMALE` / `OTHER`), required basic-info fields on `StyleDiagnosis`, expanded `StyleRecommendation` model.
- Shared Zod validators for diagnosis submission.
- Bilingual mock style engine with gender branches and conditional advice.
- `POST /api/diagnosis` with asset ownership validation and Prisma transaction.
- `GET /api/diagnosis/[id]` with ownership checks.
- `/diagnosis` client page with uploads, form, and inline preview.
- `/diagnosis/[id]` server page with report preview.

Out of scope for Sprint 2:

- Real AI model integration
- Image generation
- Full report unlock
- Payments
- Wardrobe management
- Community features
- Admin panel
- Share links
