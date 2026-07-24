# Personal Try-On Face Identity Restoration — Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking. This plan is approved for writing only; implementation starts only after explicit user approval and the Phase 0C Go decision.

**Goal:** Deliver a verifiable "the result is the user themselves" Personal Virtual Try-On by adding an independent, separately-retryable face-identity restoration stage (Stage 2) on top of the existing EvoLink base generation (Stage 1), per the approved design `docs/superpowers/specs/2026-07-24-personal-try-on-face-identity-design.md` (approval commit `3e3fe6c`).

**Architecture:** Two independently-budgeted stages. Stage 1 (`GENERATE_BASE`, existing synchronous path, ≤150s poll + overhead < 180s) persists the base image and marks the restore axis PENDING. Stage 2 (`RESTORE_FACE` start / `POLL_FACE_RESTORE` / `RETRY_FACE_RESTORE`) is start-and-return plus short polling requests; only `status=COMPLETED && faceRestoreStatus=COMPLETED && displayKind=FINAL` may present as a formal completed personal try-on. A single server-side pure function is the only interpreter of the two-axis state.

**Tech Stack:** Next.js 15 App Router, Prisma + Neon PostgreSQL (additive migration), TypeScript, Vitest, Cloudflare R2, EvoLink gpt-image-2 (base), hosted face-swap provider chosen in Phase 0B (Replicate or alternative).

## Global Constraints

- Do not modify `PersonalTryOnImageProvider` public interface, Style Preview code, legacy orchestrator/providers, Auth, upload, payment, wardrobe, commerce.
- No automatic retries and no batch regeneration; every cost-bearing call traces to a user action or its direct continuation.
- Logs and errors never contain image URLs, signed URLs, base64, object keys, tokens, or provider raw responses — stable codes only.
- All automated tests use mocks only; no real EvoLink/Replicate calls, no real cost.
- Every real-cost call (Phases 0A, 0B, 10) requires a separate, explicit user budget approval before execution; no other phase may incur provider cost.
- Real test photos, generated outputs, and full provider responses must never be committed to Git or written to logs; acceptance records contain only ids, statuses, durations, and scores.
- Mock passthrough must never emit formal restoration-success semantics (§Phase 2).
- Production feature flags default off: `PERSONAL_TRY_ON_FACE_RESTORE_ENABLED=false`, `FACE_RESTORE_PROVIDER=mock`.
- Face source is always the diagnosis's own consented FACE_FRONT asset resolved server-side; no client-supplied faces, no third-party/celebrity entry.
- No business code changes during Phases 0A–0C; Phase 1 starts only after an explicit Go decision.

---

## Branch and Baseline Strategy

- PR #19 (`codex/marketplace-mock-try-on`) stays independent; **no new-feature development on it**.
- The docs branch `docs/personal-try-on-face-identity-design` contains documents only; **no implementation on it**.
- Implementation branch (to be created only after Phase 0C Go): `codex/personal-try-on-face-identity`.
  - Baseline: `origin/main` **after** PR #19 is merged; if the user elects to keep PR #19 unmerged after acceptance, baseline = PR #19 head commit (`1a03938` or later) with the branch forked from it — the decision is recorded in Phase 0C.
- If the Phase 0A five-image gate fails, Option 2 implementation does not start; produce an Option 3 evaluation report instead (Phase 0C output B).
- No PR is ever merged automatically; every merge is a human action.

## Hard Gates (non-negotiable order)

```
Phase 0A (base acceptance) ──┐
                             ├─→ Phase 0C Go/No-Go ──Go──→ Phase 1 … Phase 12
Phase 0B (provider verify) ──┘                  │
                                                └─No-Go──→ Option 3 evaluation report (stop)
```

Phase 0C Go requires ALL of: (1) provider verification passed (availability, latency, license, errors); (2) ≥4/5 base images pass body acceptance; (3) user explicitly approves the measured per-try-on cost.

---

## Phase 0A — Base-Image Controlled Acceptance (PR #19)

No code changes. Real EvoLink calls only after user approves budget (5 calls maximum).

- [ ] **Step 1: Prepare input.** One qualified front-facing full-body photo passing the Sprint 3.9.2 gate (long edge ≥1500px, short edge ≥700px, subject ~70% of frame, head-to-shoes visible, no occlusion) plus the existing FACE_FRONT photo.
- [ ] **Step 2: Generate 5 base images.** Same user, same recommendation or across recommendations on one diagnosis; use the deployed PR #19 build (Preview or production alias). Each run records: generation id, EvoLink task id, compilerVersion (=2), attemptCount, wall time, safe result status.
- [ ] **Step 3: EvoLink dashboard cross-check.** For each of the 5 task ids, confirm the task consumed BOTH references (full-body + front-face). If any task shows no reference consumption, stop — the `image_urls` fix is not effective; return to provider debugging before any acceptance scoring.
- [ ] **Step 4: Human review per image** against: visual height, shoulder width, body proportions, torso length, leg length, original pose, framing/composition, background, hairstyle, outfit fidelity, and "turned into a stranger-model body" (fail flag).
- [ ] **Step 5: Record results** in a standalone report `docs/superpowers/reviews/<date>-phase0a-base-image-acceptance.md` (score table, generation ids, task ids, dashboard confirmations, wall times, safe statuses — real outputs only; no images or URLs in the report or the repo). ≥4/5 pass → proceed to 0C; otherwise → 0C No-Go path.

## Phase 0B — Face Restore Provider Verification

No code changes. Real provider calls only after user approves budget (≈3–6 calls maximum across candidates). Never commit tokens, images, signed URLs, or full provider responses to the repo or logs.

Candidates (at minimum): (1) Replicate `lucataco/modelscope-facefusion` pinned `52edbb2b…4f7`; (2) one cheaper/faster hosted alternative (e.g., a fal.ai hosted face-swap/InsightFace endpoint — selected at execution time); (3) native Tencent FaceFusion re-evaluation only if (1) and (2) are both unfavorable.

Per candidate, verify and record:

- Currently callable end-to-end; pinned model version.
- Input fields and source/target roles (user face = source, base try-on image = destination).
- Real output quality on our photo pair: visible paste edges, skin-tone mismatch, double faces, hairstyle damage (score each).
- Observed latency (p50/p95 over the small sample) and whether async start/check is supported.
- Real per-run cost (from billing/usage page, not marketing pages).
- Commercial-use license compatibility.
- User-photo retention and training-use terms.
- API error formats and NSFW/content-block behavior.
- Output URL lifetime (Replicate: ~1h auto-delete, already documented).
- Vercel reachability from our deployment region.

Deliverable: a standalone comparison report `docs/superpowers/reviews/<date>-phase0b-face-restore-provider-verification.md` and a nominated provider (or "none acceptable" → 0C No-Go).

## Phase 0C — Go / No-Go Decision

- [ ] **Step 1:** Assemble Phase 0A score table + Phase 0B comparison + per-try-on cost estimate (base + restore).
- [ ] **Step 2:** User decision, recorded as a standalone decision record `docs/superpowers/reviews/<date>-phase0c-go-no-go.md` and in `.superpowers/sdd/progress.md`:
  - **Go** = provider passed AND ≥4/5 body acceptance AND cost approved → unlock Phase 1, create `codex/personal-try-on-face-identity` per the baseline rule.
  - **No-Go** = any condition fails **or no explicit written Go exists** → this plan terminates: Phases 1–12 are not executed, no migration is run, no business implementation is written; the only follow-up deliverable is the Option 3 evaluation report `docs/superpowers/reviews/<date>-option3-vton-face-restore-evaluation.md`.

---

## Phase 1 — Database and State Model

**Files:**
- Modify: `prisma/schema.prisma`
- Create: `prisma/migrations/<timestamp>_personal_try_on_face_restore/migration.sql` (generated by Prisma)
- Test: `src/lib/personal-try-on/personal-try-on-generation-schema.test.ts`

**Additive columns on `PersonalTryOnGeneration` (all nullable or defaulted; no enum changes; no backfill; no new indexes — lookups stay on existing id/recommendationId/diagnosisId indexes):**

| Column | Type | Nullability/Default | Meaning |
|---|---|---|---|
| `faceRestoreStatus` | `ImageStatus?` | null | restore axis lifecycle (null = never started / legacy single-stage) |
| `baseImageUrl` | `String?` | null | pre-restoration base image URL |
| `baseImageObjectKey` | `String?` | null | pre-restoration base R2 key |
| `faceRestoreTaskId` | `String?` | null | provider task id for start/poll resume |
| `faceRestoreProvider` | `String?` | null | "replicate" / "mock" / future |
| `faceRestoreError` | `String?` | null | sanitized safe code only |
| `faceRestoreAttemptCount` | `Int` | `@default(0)` | restore-stage attempts (cap 2) |
| `faceRestoreStartedAt` | `DateTime?` | null | set on successful restore claim; the ONLY age source for staleness (never `updatedAt`) |

`imageUrl`/`imageObjectKey` semantics: feature flag OFF or legacy rows → single-stage result (unchanged); flag ON → current display image (base until restore completes, then final). `baseImageUrl`/`baseImageObjectKey` permanently reference the base image of the current generation cycle — written once at base success and replaced only when a NEW base is produced by `REGENERATE_COMPLETED`; restore outcomes never overwrite them. Consumers must never interpret `imageUrl` as a final personal try-on without the interpreter's `displayKind="FINAL"` (Phase 6).

- [ ] **Step 1: Failing test** — extend the schema test to assert every column above exists with the expected nullability/default.
- [ ] **Step 2:** Run `npx vitest run src/lib/personal-try-on/personal-try-on-generation-schema.test.ts` → FAIL (columns missing).
- [ ] **Step 3:** Add the columns to `prisma/schema.prisma`; run `npx prisma migrate dev --name personal_try_on_face_restore && npx prisma generate`. Verify the generated SQL contains only `ADD COLUMN` statements (no drops, no enum recreates).
- [ ] **Step 4:** Test passes.
- [ ] **Step 5:** Commit: `feat: add face restore columns to PersonalTryOnGeneration`
- **Done when:** migration applies cleanly on a current copy of the schema; old rows read with all-new fields null/0; full suite green.
- **Rollback:** migration is additive — revert commit; columns inert.

---

## Phase 2 — FaceRestoreProvider Interface and Mock

**Files:**
- Create: `src/lib/personal-try-on/face-restore-provider.ts`
- Create: `src/lib/personal-try-on/mock-face-restore-provider.ts`
- Create: `src/lib/personal-try-on/face-restore-factory.ts`
- Tests: `src/lib/personal-try-on/face-restore-provider.test.ts`, `face-restore-factory.test.ts`

**Interface (start/check, async by construction):**

```typescript
export interface FaceRestoreProvider {
  name: string;
  start(input: { faceImage: string; baseImage: string }): Promise<{
    taskId: string | null;
    error?: string | null;
  }>;
  check(input: { taskId: string }): Promise<
    | { status: "PROCESSING" }
    | { status: "SUCCEEDED"; url: string }
    | { status: "FAILED"; error: string }
  >;
}
```

Mock rules (hard requirements): controllable outcomes per test; mock passthrough NEVER returns `SUCCEEDED` with a "restored" result claiming formal identity success — the test mock may only simulate success when a test explicitly programs it; the factory's default/unconfigured branch returns a provider whose `start` fails with `FACE_RESTORE_NOT_CONFIGURED` (used when flag off or `FACE_RESTORE_PROVIDER` unset), so production can never silently fake restoration. In production wiring, the unconfigured/mock path can never write `faceRestoreStatus=COMPLETED`: formal completion is reachable only through a real provider's SUCCEEDED check.

- [ ] **Step 1: Failing tests** — interface conformance; mock programmed outcomes (PROCESSING → SUCCEEDED/FAILED); factory: `FACE_RESTORE_PROVIDER=replicate` + flag on → replicate; anything else → unconfigured provider (`FACE_RESTORE_NOT_CONFIGURED`).
- [ ] **Step 2:** Run → FAIL (modules missing).
- [ ] **Step 3:** Implement interface, mock, factory.
- [ ] **Step 4:** Tests pass.
- [ ] **Step 5:** Commit: `feat: add face restore provider interface, mock, and factory`
- **Done when:** unconfigured path provably cannot produce success; all tests mocked.
- **Rollback:** revert commit (unused modules).

---

## Phase 3 — Real Provider Adapter

**Files:**
- Create: `src/lib/personal-try-on/replicate-face-restore-provider.ts`
- Test: `src/lib/personal-try-on/replicate-face-restore-provider.test.ts`

Adapter over the existing `src/lib/ai/replicate-face-swap-provider.ts` mechanics (POST `/v1/predictions`, `user_image`=face, `template_image`=base, `urls.get` polling), reshaped to `start`/`check`: `start` creates the prediction and returns its id + get-url-derived task handle; `check` GETs once and maps `succeeded|failed|canceled|processing` to the interface result. Provider chosen at Phase 0B; if the winner is not Replicate, this task becomes the equivalent adapter for the winner (same interface, same test shape). Errors normalized to safe codes; no URLs echoed.

- [ ] **Step 1: Failing tests** — `start` posts the exact input roles and returns taskId; missing token → `FACE_RESTORE_NOT_CONFIGURED`; `check` maps succeeded/failed/canceled/processing; error payloads never leak URLs.
- [ ] **Step 2:** Run → FAIL.
- [ ] **Step 3:** Implement adapter (reuse prediction helpers; keep legacy provider untouched).
- [ ] **Step 4:** Tests pass.
- [ ] **Step 5:** Commit: `feat: add replicate face restore adapter`
- **Done when:** adapter behavior fully covered by mocks; interface unchanged.
- **Rollback:** revert commit.

---

## Phase 4 — Stage-2 Service: start / poll / retry / stale

**Files:**
- Modify: `src/lib/personal-try-on/personal-try-on-service.ts`
- Test: `src/lib/personal-try-on/personal-try-on-service.test.ts`

Changes:

1. **Stage-1 completion write** (inside existing `runPersonalTryOnGeneration` success path, behind flag): on base success persist `baseImageUrl/baseImageObjectKey` + `faceRestoreStatus="PENDING"` (+ `faceRestoreProvider` unset) in the same atomic update that writes the display image; flag OFF → write nothing new (legacy semantics).
2. **`startFaceRestore(input, deps)`**: requires row `status=COMPLETED` and `faceRestoreStatus ∈ {PENDING, FAILED}`; exact CAS → `faceRestoreStatus=PROCESSING`, `faceRestoreAttemptCount` increment only when coming from FAILED (RETRY) — first start from PENDING does not consume the retry cap (cap 2 applies to retries); call `provider.start`, persist `faceRestoreTaskId` + `faceRestoreStartedAt=now` + `faceRestoreProvider=name`; taskId persist failure → row to `faceRestoreStatus=FAILED` (`FACE_RESTORE_PROVIDER_FAILED`), orphan prediction is cost-only; stale pre-check: if already PROCESSING and `faceRestoreStartedAt` older than 24h → first run the stale transition (below), then evaluate claimability.
3. **`pollFaceRestore(input, deps)`**: requires PROCESSING + taskId; **stale rule executed here (real DB transition)**: PROCESSING && `faceRestoreStartedAt < now-24h` → write `faceRestoreStatus=FAILED`, `faceRestoreError="FACE_RESTORE_TASK_LOST"`, keep base display (no DB side effects in the DTO formatter — see Phase 6). Otherwise call `provider.check`: PROCESSING → return current state; SUCCEEDED → download + store final to R2 (`personal-try-on/restored/…`) → atomic persist display `imageUrl/imageObjectKey`=final, `faceRestoreStatus=COMPLETED`, error=null (CAS-guarded idempotency: only when still PROCESSING); FAILED → `faceRestoreStatus=FAILED` + safe code; task lost at provider → `FACE_RESTORE_TASK_LOST` as above. Poll is read-only except these guarded transitions.
4. **Replacement ordering (strict, applies to final images and to base regeneration alike):** store the new final object to R2 → atomic DB switch (display `imageUrl/imageObjectKey`=final, `faceRestoreStatus=COMPLETED`) → only after the commit succeeds, best-effort delete the superseded object (only when keys differ) → if the DB switch fails, best-effort delete the NEW orphan and keep the old display. Neither `REGENERATE_COMPLETED` nor `RETRY_FACE_RESTORE` may delete the previous successful final before its replacement is fully persisted.
5. **Stale reconcile helper:** `reconcileStaleFaceRestore(row, now)` — the single shared transition used by both `pollFaceRestore` and the report-read trigger (Phase 6): PROCESSING && `faceRestoreStartedAt < now-24h` → write `faceRestoreStatus=FAILED`, `faceRestoreError="FACE_RESTORE_TASK_LOST"`, keep base display; idempotent via CAS on still-PROCESSING.
6. **Attempt/cost invariants:** restore never increments base `attemptCount`; `faceRestoreAttemptCount` cap 2 for retries; no automatic retries anywhere.

- [ ] **Step 1: Failing tests** — stage-1 writes restore fields (flag on) and omits them (flag off); start CAS from PENDING and from FAILED; start rejected from PROCESSING/COMPLETED-restore; poll success → final persisted (display=final, deletion/ordering rules); poll PROCESSING → no writes; poll FAILED; stale 24h transition in poll (not on read); retry cap 2; base attemptCount untouched by restore.
- [ ] **Step 2:** Run → FAIL.
- [ ] **Step 3:** Implement minimal changes.
- [ ] **Step 4:** Target tests pass; run full personal-try-on suite for regressions.
- [ ] **Step 5:** Commit: `feat: add face restore stage two service with stale task handling`
- **Done when:** every transition above is test-covered; no path re-charges base for a restore retry.
- **Rollback:** revert commit (columns remain, unused).

---

## Phase 5 — API Actions and Safe Errors

**Files:**
- Modify: `src/app/api/diagnosis/[id]/recommendations/[recommendationId]/personal-try-on/route.ts`
- Modify: `src/components/diagnosis/personal-try-on-messages.ts`
- Tests: route test, messages test

Actions added to body validation: `RESTORE_FACE`, `RETRY_FACE_RESTORE`, `POLL_FACE_RESTORE` (existing four unchanged); unknown → 400 `INVALID_PERSONAL_TRY_ON_ACTION`. Flag guard: when `PERSONAL_TRY_ON_FACE_RESTORE_ENABLED` is not `true`, restore actions → 409 `FACE_RESTORE_NOT_CONFIGURED` (never fakes success). New safe codes mapped to customer copy: `FACE_RESTORE_PROVIDER_FAILED`, `FACE_RESTORE_ATTEMPT_CAP_REACHED`, `FACE_RESTORE_NOT_CLAIMABLE`, `FACE_RESTORE_NOT_CONFIGURED`, `FACE_RESTORE_TASK_LOST`. Ownership/consent/snapshot/photo gates are reused for restore actions exactly as for generation (restore never relaxes them).

- [ ] **Step 1: Failing tests** — each new action forwards to the right service method; flag off → 409; invalid action 400; consent withdrawn → restore blocked; message mapping for the five codes.
- [ ] **Step 2:** Run → FAIL.
- [ ] **Step 3:** Implement.
- [ ] **Step 4:** Tests pass.
- [ ] **Step 5:** Commit: `feat: add face restore api actions and safe errors`
- **Rollback:** revert commit.

---

## Phase 6 — Single Interpreter (server-side pure function)

**Files:**
- Create: `src/lib/personal-try-on/personal-try-on-stage.ts`
- Test: `src/lib/personal-try-on/personal-try-on-stage.test.ts`
- Modify: `src/lib/diagnosis-service.ts` (+ test), and all consumer call sites listed below.

**Interpreter contract:**

```typescript
export type PersonalTryOnStage =
  | "PENDING" | "BASE_PROCESSING" | "BASE_COMPLETED"
  | "FACE_RESTORE_PROCESSING" | "COMPLETED"
  | "BASE_FAILED" | "FACE_RESTORE_FAILED";

export function derivePersonalTryOnStage(input: {
  status: string;
  faceRestoreStatus: string | null;
  imageUrl: string | null;
  baseImageUrl: string | null;
  faceRestoreStartedAt: Date | null;
  now: Date;
}): {
  stage: PersonalTryOnStage;
  displayKind: "BASE" | "FINAL" | null;
  restoreStale: boolean; // display-only stale signal; no DB write here
}
```

Formal completion requires `status=COMPLETED && faceRestoreStatus=COMPLETED && imageUrl present && displayKind=FINAL`. Stale (>24h PROCESSING) is derived as `restoreStale=true` and displayed as `FACE_RESTORE_FAILED`/`FACE_RESTORE_TASK_LOST` **without** mutating the DB inside the pure interpreter.

**Stale conversion trigger:** the report READ path (`getDiagnosisDetailForViewer` — already a DB-touching service, NOT the pure formatter) fires exactly one idempotent `reconcileStaleFaceRestore` (Phase 4) per stale row before mapping, so a plain report view converges the DB to FAILED. The pure formatter/interpreter itself stays side-effect free; CAS idempotency makes duplicate triggers no-ops.

**Search-and-replace list (every raw `personalTryOn.status` judgment migrates to the interpreter):**
- `src/lib/diagnosis-service.ts` — `toPersonalTryOnState` → emit interpreter output (safe fields only).
- `src/components/diagnosis/personal-try-on-view.ts` — `resolvePersonalTryOnView` consumes interpreter result.
- `src/components/diagnosis/try-on-status-panel.tsx` — labels/buttons from derived stage.
- `src/components/diagnosis/primary-style-direction.tsx`, `alternative-style-card.tsx` — image slot selection from displayKind.
- `src/app/diagnosis/[id]/page.tsx` — action derivation from derived stage.
- All affected test fixtures/assertions.

- [ ] **Step 1: Failing tests** — full interpreter matrix (both axes × images × staleness); **regression test: a base image can never render the copy “本人试穿已完成”**; DTO emits derived fields with no key/taskId/prompt leakage.
- [ ] **Step 2:** Run → FAIL.
- [ ] **Step 3:** Implement interpreter + migrate call sites.
- [ ] **Step 4:** Tests pass; run component/service regressions.
- [ ] **Step 5:** Commit: `feat: single interpreter for personal try-on two-axis stage`
- **Rollback:** revert commit (consumers return to pre-interpreter behavior; flag off).

---

## Phase 7 — Frontend States and Bounded Polling

**Files:**
- Modify: `src/components/diagnosis/personal-try-on-view.ts`, `try-on-status-panel.tsx`, `primary-style-direction.tsx`, `alternative-style-card.tsx`, `src/app/diagnosis/[id]/page.tsx`, `personal-try-on-messages.ts`
- Tests: `personal-try-on-report.test.tsx`, view test, workspace static test

Behavior: BASE_COMPLETED → base image + "人脸恢复准备中" + exactly one guarded auto `RESTORE_FACE`; FACE_RESTORE_PROCESSING → base image + "人脸恢复中" + bounded polling (`POLL_FACE_RESTORE` every ~5s, ≤24 per page session, resumes on next visit via persisted state); COMPLETED (formal) → final image; FACE_RESTORE_FAILED → base image + prominent “身份恢复失败，当前仅为临时穿搭效果图，不代表最终本人试穿效果。” + manual “重试人脸恢复”; BASE_FAILED → existing retry semantics; restoration unconfigured → "身份恢复未启用" note (never fake). No new dependencies; polling implemented with existing fetch + state (no libraries).

- [ ] **Step 1: Failing tests** — each derived state renders its exact copy/buttons; auto-restore fires once (guard); poll loop bounds and resumes; unconfigured note; mandatory warning copy present.
- [ ] **Step 2:** Run → FAIL.
- [ ] **Step 3:** Implement.
- [ ] **Step 4:** Tests pass.
- [ ] **Step 5:** Commit: `feat: face restore frontend states with bounded polling`
- **Rollback:** revert commit.

---

## Phase 8 — Privacy, Consent, Withdrawal, Retention

**Files:**
- Modify: consent UI copy (diagnosis form consent text), `src/app/api/diagnosis/[id]/try-on-consent/route.ts` (+ test), `src/lib/retention/anonymous-media-retention.ts` (+ test)

Consent copy names the restoration processor and its retention (e.g., Replicate US, ~1h auto-delete) before production enablement. Withdrawal (`deleteGenerated`) and 30-day anonymous retention must delete: original photos (existing), `baseImageObjectKey`, display `imageObjectKey` (final or base), and any temp objects; rows cascade as today. Logs stay stable-codes-only everywhere.

- [ ] **Step 1: Failing tests** — withdrawal deletes base+final keys (best-effort, outside transaction); retention deletes the same set; no new log strings contain URL-like values.
- [ ] **Step 2:** Run → FAIL.
- [ ] **Step 3:** Implement.
- [ ] **Step 4:** Tests pass.
- [ ] **Step 5:** Commit: `feat: cover face restore objects in consent withdrawal and retention`
- **Rollback:** revert commit.

---

## Phase 9 — Automated Verification and Static Assertions

- [ ] Full suite `npm test -- --run` (expect 402 + new tests, all green).
- [ ] `npx tsc --noEmit` clean.
- [ ] `npx eslint` clean on all touched files.
- [ ] `npm run build` succeeds.
- [ ] Static assertions: stage-1 budget formula unchanged (150s + 30s headroom ≤ 180); stage-2 per-request work < 30s; poll bound constant matches env default; no `personalTryOn.status ===` raw comparisons remain outside the interpreter (grep assertion in a test).
- Commit any test-only adjustments: `test: sprint face identity verification hardening`.

---

## Phase 10 — Preview Real Acceptance (user-approved budget)

Estimate: ≥3 outfits × 3 finals = ≥9 base + ≥9 restore calls. Protocol (each must be explicitly recorded; mock results never count):

1. Same user, ≥3 outfits, ≥3 final generations per outfit.
2. Side-by-side review: original front face, original full-body, base, restored final.
3. Identity score per final (recognizable as user; no double/wrong face, edges, tone mismatch; age/hairstyle/skin tone stable).
4. Body score per final (height/build/pose/framing unchanged; no model-body copy; no structural artifacts).
5. base and final both persisted in R2 with correct keys; provider temp outputs expire per their retention.
6. Withdrawal cleans originals + base + final + temp objects.
7. Restore failure retries restore stage only — no second base charge (billing/usage checked).
8. Close-and-reopen resumes polling from persisted state.
9. A >24h PROCESSING row converts to `FACE_RESTORE_TASK_LOST` on next poll and shows the temp-image warning (may be simulated via backdated `faceRestoreStartedAt` in a test environment, not production).
10. No taskId/object key/signed URL/provider raw error reaches the client (inspect network responses).
11. Record: task ids, attemptCounts, durations, safe statuses, cost per outfit.

Go-live recommendation is written from these results; failure of identity or body criteria blocks enablement (§Rollback).

---

## Phase 11 — Deployment, Feature Flag, Rollback Runbook

- Deploy order: migration → code (flags off) → verification → enable `PERSONAL_TRY_ON_FACE_RESTORE_ENABLED=true` + `FACE_RESTORE_PROVIDER=<phase0 winner>` + secrets (`REPLICATE_API_TOKEN` or winner's) in Vercel production.
- Rollback: set flags off (instant return to post-#19 behavior; columns inert) → if needed, revert the feature PR (single revert commit); migration additive, no rollback required.
- Provider incident: `FACE_RESTORE_PROVIDER=mock` while investigating (UI shows restoration unavailable, never fake success).

---

## Phase 12 — PR Preparation and Delivery Report

- One feature PR from `codex/personal-try-on-face-identity` to `main`: design link (`3e3fe6c`), phase evidence (0A table, 0B comparison, 0C decision), verification matrix, acceptance records, flag/rollback notes. Never merged automatically.
- Delivery report: files changed, tests added, commits, residual risks, follow-ups (identity scorer option, Option 3 watch-items).

---

## Self-Review

1. **Spec coverage:** branching/baseline (§Branch), hard gates (§Gates, 0C), 0A protocol (§0A), 0B protocol (§0B), stale handling decision — poll-time DB transition, DTO display-only derivation (§Phase 4, §Phase 6), DB plan with nullability/defaults/semantics (§Phase 1), single interpreter with call-site list and regression test (§Phase 6), mock honesty rules (§Phase 2, §Phase 5, §Phase 7), per-task TDD template (each Phase 1–8), real acceptance 17 points condensed to 11 recorded checks (§Phase 10), no auto-merge (§Branch, §Phase 12).
2. **Placeholder scan:** no TBD; every task has files, failing-test content, commands, commit message, done criteria, rollback.
3. **Type consistency:** `FaceRestoreProvider`, interpreter output, action enum, and DTO shape are consistent across Phases 2, 4, 5, 6, 7.
