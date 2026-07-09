# AI Personal Style Studio

Sprint 1 infrastructure for an AI-powered personal style studio.

## What's Included

- Next.js 15 + React 19 + TypeScript + Tailwind CSS
- Prisma 7 ORM with Neon PostgreSQL
- Auth.js v5 with optional Google OAuth and Resend Magic Link
- Anonymous sessions via HTTP-only cookie
- Cloudflare R2 server-side upload with MediaAsset persistence
- Reserved Inngest and PostHog clients
- Mock upload page for end-to-end verification

## Prerequisites

- Node.js 20+
- A Neon PostgreSQL database
- (Optional) Google OAuth credentials
- (Optional) Resend API key and verified sender domain
- (Optional) Cloudflare R2 bucket and credentials

## Environment Setup

Copy `.env.example` to `.env.local` and fill in the values:

```bash
cp .env.example .env.local
```

Required variables:

- `DATABASE_URL` — Neon PostgreSQL connection string
- `AUTH_SECRET` — random string (at least 32 characters)
- `AUTH_URL` — `http://localhost:3000` for local development

Optional variables:

- `AUTH_GOOGLE_ID` / `AUTH_GOOGLE_SECRET`
- `AUTH_RESEND_KEY` / `EMAIL_FROM`
- `CLOUDFLARE_R2_*` for uploads
- `INNGEST_EVENT_KEY` / `INNGEST_SIGNING_KEY`
- `NEXT_PUBLIC_POSTHOG_KEY` / `NEXT_PUBLIC_POSTHOG_HOST`

## Database Setup

```bash
npx prisma generate
npx prisma migrate dev --name init
```

## Run Development Server

```bash
npm run dev
```

Open [http://localhost:3000](http://localhost:3000).

## Verification

1. `GET /api/health` → `{ "status": "ok" }`
2. `GET /api/anonymous-session` → creates/resolves anonymous session
3. `/upload` → upload three images (face front, face side, full body)
4. Uploaded files appear in R2
5. `MediaAsset` records appear in Neon

## Project Structure

```
src/
  app/
    api/
      anonymous-session/route.ts
      auth/[...nextauth]/route.ts
      health/route.ts
      upload/route.ts
    layout.tsx
    page.tsx
    upload/page.tsx
  lib/
    anonymous-session.ts
    auth.ts
    env.ts
    inngest.ts
    posthog.ts
    prisma.ts
    r2.ts
prisma/
  schema.prisma
prisma.config.ts
```

## Important Notes

- This project uses Prisma 7. The database connection URL is configured in `prisma.config.ts`, and the Prisma Client uses the Neon serverless driver adapter.
- Auth.js providers are dynamically assembled from environment variables. Missing provider configuration will not crash the dev server.
- Inngest and PostHog are reserved but inactive in Sprint 1.

## Sprint 2 Plan

- AI diagnosis pipeline (Inngest)
- Style recommendations
- Generated images
- User dashboard
- Anonymous-to-user data migration
- Custom Resend email templates
- PostHog event tracking
