# EvoLink Async Style Preview Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Poll EvoLink image tasks to completion and persist their result URLs to R2.

**Architecture:** Extend the response parser with an async task descriptor, add a focused EvoLink polling module, wire it into the existing provider, and run claimed recommendation jobs concurrently inside a bounded Vercel route.

**Tech Stack:** Next.js 15, TypeScript, Vitest, EvoLink REST API, Cloudflare R2.

## Global Constraints

- No real paid image requests during verification.
- Preserve synchronous OpenAI response compatibility.
- Failed tasks must not retry automatically.
- Do not stage or commit the unrelated `.claude/` directory.

---

### Task 1: Parse EvoLink task responses

**Files:**
- Modify: `src/lib/ai/style-preview-response.ts`
- Modify: `src/lib/ai/style-preview-response.test.ts`

**Interfaces:**
- Produces: `{ taskId: string; taskStatus: string }` for valid task objects.

- [ ] Add a failing task-response parsing test.
- [ ] Run the focused test and confirm RED.
- [ ] Implement the minimal parser extension.
- [ ] Run the focused test and confirm GREEN.

### Task 2: Poll EvoLink tasks

**Files:**
- Create: `src/lib/ai/evolink-style-preview-task.ts`
- Create: `src/lib/ai/evolink-style-preview-task.test.ts`

**Interfaces:**
- Produces: `pollEvoLinkStylePreviewTask` returning provider image data or a safe error.

- [ ] Add failing completion, failure, and timeout tests with mocked HTTP.
- [ ] Run the focused test and confirm RED.
- [ ] Implement bounded polling of `GET /v1/tasks/{task_id}`.
- [ ] Run the focused test and confirm GREEN.

### Task 3: Wire provider and parallel route

**Files:**
- Modify: `src/lib/ai/openai-style-preview-provider.ts`
- Create: `src/lib/ai/openai-style-preview-provider.test.ts`
- Modify: `src/app/api/diagnosis/[id]/style-previews/route.ts`

**Interfaces:**
- Consumes: the task descriptor and polling function.
- Produces: concurrent generation with a 180-second route duration.

- [ ] Add a failing provider integration test for task creation followed by completion.
- [ ] Run the focused test and confirm RED.
- [ ] Wire task polling into the provider.
- [ ] Refactor claimed recommendation processing to `Promise.all`.
- [ ] Run the focused and full tests and confirm GREEN.

### Task 4: Documentation and release verification

**Files:**
- Modify: `README.md`
- Modify: `.env.example`

**Interfaces:**
- Produces: accurate EvoLink deployment instructions.

- [ ] Document synchronous OpenAI and asynchronous EvoLink compatibility.
- [ ] Run `npm test`, `npm run lint`, `npx tsc --noEmit`, and `npm run build`.
- [ ] Scan the final commit for secret patterns and exact local secret values.
- [ ] Commit, push, and open a draft PR to `main`.
