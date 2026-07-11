# Style Preview Production Fix Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Stop repeated paid preview generation and reliably persist/display generated images in production.

**Architecture:** Add small testable policy/parsing helpers around the existing route and provider boundaries. Keep the current synchronous API architecture, but make generation claiming idempotent and retries explicit.

**Tech Stack:** Next.js 15, React 19, TypeScript, Prisma 7, Neon PostgreSQL, Cloudflare R2, Vitest.

## Global Constraints

- Preserve existing uncommitted user work and do not modify `.env.local`.
- Never log API keys, key prefixes, prompts, image payloads, or signed/provider URLs.
- Automatic generation may charge at most once per `PENDING` recommendation.
- A failed recommendation is retried only by explicit user action.
- All successful preview images must have a durable absolute R2 URL.

---

### Task 1: Test foundation and generation policy

**Files:**
- Modify: `package.json`
- Modify: `package-lock.json`
- Create: `vitest.config.ts`
- Create: `src/lib/ai/style-preview-policy.ts`
- Create: `src/lib/ai/style-preview-policy.test.ts`
- Modify: `src/app/diagnosis/[id]/page.tsx`
- Modify: `src/app/api/diagnosis/[id]/style-previews/route.ts`

**Interfaces:**
- Produces: `shouldAutoGenerateStylePreviews`, `getRequestedPreviewStatuses`, and explicit `retryFailed` request behavior.

- [ ] Write tests proving automatic generation excludes `FAILED` and manual retry includes it.
- [ ] Run the focused test and verify RED because the policy module does not exist.
- [ ] Implement the policy module, await report refresh, add the manual retry action, and atomically claim rows with `updateMany`.
- [ ] Run the focused test and verify GREEN.

### Task 2: Provider response parsing and safe errors

**Files:**
- Create: `src/lib/ai/style-preview-response.ts`
- Create: `src/lib/ai/style-preview-response.test.ts`
- Modify: `src/lib/ai/openai-style-preview-provider.ts`

**Interfaces:**
- Produces: `parseStylePreviewResponse(value: unknown)` returning image data or a safe shape-only error.

- [ ] Write tests for documented base64/URL responses, compatible aliases, empty data, and secret-free error messages.
- [ ] Run the focused test and verify RED because the parser does not exist.
- [ ] Implement the parser and use it in the provider while removing unsafe debug logs.
- [ ] Run the focused test and verify GREEN.

### Task 3: Durable R2 persistence and provider configuration

**Files:**
- Create: `src/lib/r2.test.ts`
- Modify: `src/lib/r2.ts`
- Modify: `src/lib/r2-image-store.ts`
- Create: `src/lib/ai/style-preview-service.test.ts`
- Modify: `src/lib/ai/style-preview-service.ts`
- Create: `src/lib/ai/openai-style-provider.test.ts`
- Modify: `src/lib/ai/openai-style-provider.ts`

**Interfaces:**
- Produces: validated public R2 URL construction and text provider `baseURL` configuration.

- [ ] Write failing tests for missing/invalid R2 public URL, normalized object URLs, fallback persistence, storage failure, and `OPENAI_BASE_URL`.
- [ ] Run focused tests and verify RED for each missing behavior.
- [ ] Implement the minimal configuration and persistence changes and remove remaining sensitive debug logs.
- [ ] Run focused tests and verify GREEN.

### Task 4: Upload ownership protection

**Files:**
- Create: `src/lib/ownership.ts`
- Create: `src/lib/ownership.test.ts`
- Modify: `src/app/api/upload/route.ts`

**Interfaces:**
- Produces: `isOwnedByActor(resource, actor)` used before diagnosis photo association.

- [ ] Write failing ownership tests for logged-in users, anonymous sessions, and cross-owner denial.
- [ ] Run the focused test and verify RED because the helper does not exist.
- [ ] Implement the helper and validate diagnosis ownership before uploading/linking.
- [ ] Run the focused test and verify GREEN.

### Task 5: Documentation and full verification

**Files:**
- Modify: `README.md`
- Modify: `.env.example`

**Interfaces:**
- Produces: accurate production setup and retry behavior documentation.

- [ ] Update the README from Sprint 2-only language to the current provider and preview pipeline.
- [ ] Document that `CLOUDFLARE_R2_PUBLIC_BASE_URL` is required for browser-visible assets.
- [ ] Run `npm test`, `npm run lint`, `npx tsc --noEmit`, and `npm run build`.
- [ ] Scan the diff for secrets and unsafe logs, then review `git diff` and `git status`.
