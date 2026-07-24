# Personal Try-On — Face Identity Restoration Design (Rev 2)

Date: 2026-07-24
Status: Design revision 2 (awaiting approval — no implementation, no implementation plan)
Scope: Make Personal Virtual Try-On verifiably produce **the user themselves** via an independent, testable face-identity restoration stage. Prompt-only identity claims are explicitly rejected.

Revision 2 changes: two independently-budgeted stages instead of one oversized synchronous request; two-axis state model; provider facts split into verified vs phase-0 blocking; base-image body-fidelity acceptance gate; identity vs body acceptance split; expanded safety boundaries.

---

## 1. Problem Statement

The current Personal Try-On pipeline (Sprint 3.9 / 3.9.1 / 3.9.2, PR #19) asks EvoLink `gpt-image-2` to preserve identity via prompt. Production acceptance showed generic-model faces, reshaped bodies, regenerated pose/background. Multi-reference generation is fusion-style, not locked-canvas editing; there is **no independent face-swap / identity-restoration module** in the Personal Try-On path. Identity must be **verifiable**, not requested.

## 2. Current-State Audit

### 2.1 Personal Try-On path (post PR #19)

| Component | State |
|---|---|
| API route `…/personal-try-on/route.ts` | Ownership → consent → snapshot → photo presence → full-body size gate → action validation → service. `maxDuration = 180`. |
| `personal-try-on-service.ts` | Exact-status CAS per action (`GENERATE`→PENDING, `RETRY_FAILED`→FAILED, `REGENERATE_COMPLETED`→COMPLETED), attempt cap 3, single-row lifecycle, previous-image preservation, post-commit old-object deletion, orphan cleanup. |
| `evolink-personal-try-on-provider.ts` | Sends `image_urls: [fullBody, frontFace]`, async task poll budget 75×2s = 150s (env-overridable). |
| `personal-try-on-compiler.ts` | v2 prompt: base-photo edit semantics, anti-idealization. Text-only guarantees. |
| `provider-image-input.ts` | signed-url (default) or base64, fixed mode. |
| R2 store/delete | `r2-image-store.ts`, `deleteObjectFromR2`, retention + consent-revocation cleanup. |
| Prisma | `PersonalTryOnGeneration`: recommendationId unique, status (shared `ImageStatus` enum), prompt, promptCompilerVersion, imageUrl, imageObjectKey, provider, error, attemptCount. |
| Frontend | View-state machine (cta/pending/processing/regenerating/completed/unavailable/failed/regeneration_failed), explicit actions, safe error mapping, single refetch after POST (no polling today). |
| Env (Vercel production) | `STYLE_PREVIEW_OPENAI_*` (EvoLink), R2, DATABASE_URL present. **`TENCENT_CLOUD_*`, `REPLICATE_API_TOKEN`, `FACE_SWAP_PROVIDER` ABSENT.** |

### 2.2 Face-swap-related code already in the repo

- `src/lib/ai/face-swap-provider.ts` — `FaceSwapProvider` interface (`swap({ faceImageUrl, sourceImageUrl })`).
- `src/lib/ai/replicate-face-swap-provider.ts` — hosted face-fusion via Replicate predictions API (`user_image = face photo`, `template_image = destination`), pinned version `lucataco/modelscope-facefusion:52edbb2b…`, poll 60×2s.
- `src/lib/ai/mock-face-swap-provider.ts` — mock.
- `src/lib/try-on/providers/face-swap-identity-restore.ts`, `identity-restore-factory.ts` (default mock), legacy `try-on-orchestrator.ts` (quality stage = always-pass mock).
- No InsightFace code. Native Tencent FaceFusion was built once and reverted (`progress.md` Task 0 note).

### 2.3 Audit answers (A–H)

- **A. Face swapping implemented?** No. Personal Try-On has none; legacy restore stage is a mock passthrough in production.
- **B. What is it actually doing?** Pre-#19: effectively text-to-image. Post-#19: reference-conditioned fusion generation — not garment replacement, not identity preservation.
- **C. Are user photos really sent?** Post-#19 the body matches EvoLink's documented `image_urls`; final proof = controlled acceptance call / EvoLink dashboard task inspection (pending).
- **D. Outfit info source?** Text only (archetype snapshot styleDNA/requiredItems). No garment reference images in this path.
- **E. Reliable identity preservation by the model?** No. Fusion-style; OpenAI documents recurring-character consistency as a limitation. Reliable identity needs an explicit restoration step.
- **F. Where to add restoration?** After base-image generation, before final display persistence, as its own independently-budgeted stage (§5).
- **G. Reuse vs new:** Reuse: `FaceSwapProvider` interface, Replicate provider, mock, R2 helpers, service CAS skeleton, action model, view-state machine, message mapper. New: two-stage pipeline split, restore provider factory, additive columns, restore start/poll/retry actions, polling UI, tests.
- **H. PR #19 or new branch?** New branch + new PR. #19 is complete and independently valuable.

### 2.4 Related production finding (legacy pipeline)

`AUTO_TRY_ON_FAILED` in production is explained: legacy workflow hard-constructs Tencent ChangeClothes but `TENCENT_CLOUD_*` credentials are absent in Vercel production (`tryOnProvider: null`, `tryOnAttemptCount: 0`). Any Option-3 future must provision credentials first.

## 3. Goals

- Final displayed try-on image is recognizably the user: face identity, hairstyle, skin tone, age.
- Restoration introduces no further distortion of body proportions, pose, framing, background.
- Independent, unit-testable restoration stage with explicit, separately-retryable state.
- Verifiable acceptance: separate identity and body criteria on controlled real outputs (§19); never declared done from unit tests, prompts, task COMPLETED, or mocks.
- Cost-guarded: every cost-bearing call traces to a user action; per-stage attempt caps; no batch regeneration.
- Process only the user's own consented, declared-self photos; no third-party/celebrity face swapping.

## 4. Non-goals

- No dedicated-VTON pipeline in this iteration (Option 3 fallback, §6).
- No self-hosted GPU / Python services.
- No real identity **scorer** model in v1 (later optional gate).
- No batch re-generation of existing results.
- No changes to Style Preview, Auth, upload, payment, wardrobe, commerce.
- No Vercel cron/queue/worker infrastructure (see §5.3 trigger decision).

## 5. Recommended Architecture

### 5.1 Two independently-budgeted stages

The v1 single synchronous request (base ≤150s + restore ≤60s) could exceed `maxDuration = 180` once R2, DB, download, and cleanup time are counted. Rev 2 splits the pipeline into **two separately-invoked, separately-resumable stages**, each with its own request and its own budget:

**Stage 1 — `GENERATE_BASE` (existing POST, actions `GENERATE` / `RETRY_FAILED` / `REGENERATE_COMPLETED`):**
1. Exact-status CAS claim (existing).
2. EvoLink gpt-image-2 base generation (`image_urls=[fullBody, frontFace]`, compiler v2), poll budget ≤150s (unchanged, env-tunable).
3. Store base image to R2 (`personal-try-on/base/…`), record `baseImageUrl/baseImageObjectKey`.
4. Persist `status=COMPLETED` (base stage) with `faceRestoreStatus=PENDING`; display image = base.
5. Request ends. Budget: ≤150s poll + ~10s R2/DB overhead < 180s. ✓ (existing static assertion pattern retained.)

**Stage 2 — `RESTORE_FACE` (same endpoint, new actions `RESTORE_FACE` / `RETRY_FACE_RESTORE` / `POLL_FACE_RESTORE`):**
1. Requires `status=COMPLETED` (base) and `faceRestoreStatus ∈ {PENDING, FAILED}`; exact CAS flips `faceRestoreStatus` → `PROCESSING`.
2. Start the provider task (e.g., Replicate prediction) with `user_image = face photo`, `template_image = base image`; persist provider task id (`faceRestoreTaskId`). **Return immediately** — do not hold the request open.
3. Completion is driven by short `POLL_FACE_RESTORE` calls (each a cheap provider status GET, seconds): on success → download + store final image (`personal-try-on/restored/…`) → atomic persist: display `imageUrl/imageObjectKey` = final, `faceRestoreStatus=COMPLETED`; on failure → `faceRestoreStatus=FAILED` (+ safe code), display stays base with the mandatory warning (§12).
4. `RETRY_FACE_RESTORE` re-runs stage 2 only: never re-generates base, never re-charges base generation. `faceRestoreAttemptCount` cap = 2. Base `attemptCount` is untouched by stage 2.
5. Budget per request: start ≤ ~10s, poll ≤ ~10s — always far under 180s regardless of provider latency.

### 5.2 Why not synchronous stage-2

Synchronous restore inside one request is acceptable **only** if phase-0 proves provider p95 latency < 60s. Current evidence (§9) shows a model page citing predictions "typically within 32 minutes" — incompatible with any synchronous budget. The start/poll design is latency-proof.

### 5.3 Stage-2 trigger (decision)

**Frontend follow-up requests — no Vercel background/queue/cron.**
- After stage 1 returns and the report shows `BASE_COMPLETED`, the page auto-issues exactly one `RESTORE_FACE` (direct continuation of the user's own generate click — not unattended batch cost), guarded against double-firing by the CAS.
- While `faceRestoreStatus=PROCESSING`, the page polls `POLL_FACE_RESTORE` every ~5s, bounded (≤24 polls ≈ 2 min per page session), then stops and shows the processing state; the next page load resumes polling from persisted state (`faceRestoreTaskId`).
- `FACE_RESTORE_FAILED` shows the manual "重试人脸恢复" button (`RETRY_FACE_RESTORE`).
- If the user closes the tab mid-restore, state persists in DB; the next visit resumes. No server-side scheduler is introduced.

### 5.4 State model (two-axis, equivalent-but-simpler structure)

Keeps the shared `ImageStatus` enum untouched; no enum migration. Two lifecycle axes + explicit image fields on `PersonalTryOnGeneration` (all additive):

| Column | Type | Meaning |
|---|---|---|
| `status` (existing) | ImageStatus | **Base stage**: PENDING → PROCESSING → COMPLETED / FAILED |
| `faceRestoreStatus` | ImageStatus? | **Restore stage**: null (never started) → PENDING (triggerable) → PROCESSING → COMPLETED / FAILED |
| `baseImageUrl` / `baseImageObjectKey` | String? | pre-restoration base image |
| `imageUrl` / `imageObjectKey` (existing) | String? | **current display image** (final after restore success; base until then) |
| `faceRestoreTaskId` | String? | provider task id for resume/poll |
| `faceRestoreProvider` | String? | "replicate" / "mock" |
| `faceRestoreError` | String? | sanitized safe code only |
| `faceRestoreAttemptCount` | Int @default(0) | restore-stage cap 2 |

Derived overall state (exactly the seven required states):

| `status` | `faceRestoreStatus` | Derived state |
|---|---|---|
| PENDING (pre-claim) | — | `PENDING` |
| PROCESSING | — | `BASE_PROCESSING` |
| COMPLETED | null / PENDING | `BASE_COMPLETED` (= restore pending) |
| COMPLETED | PROCESSING | `FACE_RESTORE_PROCESSING` |
| COMPLETED | COMPLETED | `COMPLETED` (formal — only this may display as 本人试穿已完成) |
| FAILED | — | `BASE_FAILED` |
| COMPLETED | FAILED | `FACE_RESTORE_FAILED` |

This answers the four required distinctions: base success = `status`; restore success = `faceRestoreStatus`; display base vs final = `imageUrl` vs `baseImageUrl` + `faceRestoreStatus`; independently retryable stage = which axis failed (§15).

**`FACE_RESTORE_FAILED` rules:** base image may remain displayed, always with the prominent copy “身份恢复失败，当前仅为临时穿搭效果图，不代表最终本人试穿效果。”; the row is **never** presented as formal COMPLETED; `RETRY_FACE_RESTORE` re-runs only the restore stage and never re-charges base generation.

## 6. Alternative Approaches

| Criterion | Option 1: image-gen only (status quo #19) | **Option 2: image-gen + independent face restoration (recommended)** | Option 3: dedicated VTON + face restoration |
|---|---|---|---|
| Identity similarity | Low–medium | **High for face**; seam/lighting risk medium | High (with restore) |
| Garment fidelity | Medium | Medium (as base) | **Highest** |
| Body proportions | Low–medium | As base (not fixed by restore) | **Highest** |
| Deploy difficulty | Done | Moderate | High (creds, garment images, chain) |
| GPU / Python service | No / No | No / No (hosted) | No if hosted |
| Runs on Vercel | Yes | Yes (start/poll design) | Yes via HTTP, slow chain |
| Cost per try-on | ~1 image call | Base + restore call (**cost unverified, §9 — potentially high**) | Highest |
| Latency | ~36s | Base ~36s + restore (async, provider-dependent) | Minutes |
| Privacy risk | EvoLink | EvoLink + restore provider (1h auto-delete on Replicate) | Multiple providers |
| Failure modes | Identity drift | Swap artifacts → base + warning + restore-only retry | Chained accumulation; legacy path already failing (§2.4) |
| Code change | Minimal | Medium (stage split + columns + poll UI) | Largest |

Option 1 is rejected as a final answer. Option 3 is the documented fallback, triggered by the §7 gate.

## 7. Base-Image Body-Fidelity Gate (mandatory before full implementation)

Face restoration fixes face identity only. Before Option 2 enters full implementation, PR #19's controlled acceptance must pass a **body-fidelity gate**:

- Generate **5 base images for the same user** (qualified full-body photo per the Sprint 3.9.2 gate; user-approved budget, one-time).
- Human review per image against: user's real body proportions; visual height; shoulder width; torso and leg length; original pose; original framing/composition; hairstyle; outfit matches recommendation; no obvious transformation into a stranger-model body.
- **Pass condition: ≥ 4 of 5 images satisfy body & pose preservation.**
- If fewer than 4 pass: Option 2 must NOT proceed to full implementation; trigger Option 3 evaluation (dedicated VTON + face restoration, incl. provisioning `TENCENT_CLOUD_*` and re-benchmarking).

## 8. Provider Interfaces

New (Personal-Try-On-scoped):

```ts
export interface FaceRestoreProvider {
  name: string; // "mock" | "replicate" | future
  start(input: {
    faceImage: string;  // signed URL or base64, fixed mode (existing provider-image-input)
    baseImage: string;  // same mode
  }): Promise<{ taskId: string | null; error?: string | null }>;
  check(input: {
    taskId: string;
  }): Promise<
    | { status: "PROCESSING" }
    | { status: "SUCCEEDED"; url: string }
    | { status: "FAILED"; error: string }
  >;
}
```

- `mockFaceRestoreProvider` for all automated tests (controllable outcomes).
- `replicateFaceRestoreProvider` = thin adapter over the existing `replicate-face-swap-provider` prediction mechanics, reshaped to start/check.
- Factory: `FACE_RESTORE_PROVIDER=replicate` → Replicate; anything else → mock passthrough (returns base unchanged on `check`, recorded `faceRestoreProvider="mock"`).
- Legacy `IdentityRestoreProvider` / orchestrator / `FaceSwapProvider` interface are **not** modified.

## 9. Face Restoration Provider — Verification Status

**Nothing below the "verified" lines may be treated as production-ready. Unverified items are implementation phase-0 blocking items.**

| Item | Status |
|---|---|
| Model owner/name | Verified in repo pin: `lucataco/modelscope-facefusion` ([model page](https://replicate.com/lucataco/modelscope-facefusion)) |
| Pinned version | Verified: `52edbb2b…4f7` in `replicate-face-swap-provider.ts` |
| Model family | Verified as a ModelScope face-fusion implementation (equivalent face-swap class); it is **not** the `facefusion/facefusion` OSS project — treat as "FaceFusion-equivalent" |
| Input fields / roles | Verified: `user_image` = source face (user's FACE_FRONT), `template_image` = destination (base try-on image). Documented input constraints: complete face contours, lateral angle ≤ 30°, face > 64×64px, face area ≤ 2/3 of image, similar face shapes for edge quality |
| Async model | Verified: Replicate predictions API, async with polling (also supports `Prefer: wait`) |
| Output URL lifecycle | Verified: [Replicate data retention](https://replicate.com/docs/topics/predictions/data-retention) — API predictions' inputs/outputs/files/logs **auto-deleted after ~1 hour** ⇒ final image MUST be persisted to R2 immediately (our design does) |
| Vercel network fit | Verified compatible (pure HTTPS) |
| **Current availability / operability** | **UNVERIFIED — phase-0 blocking.** Model page exists; "predict time varies significantly". Requires 1–3 controlled real calls (user-approved budget) |
| **Real latency (p50/p95)** | **UNVERIFIED — phase-0 blocking.** Page cites "typically within 32 minutes" — if accurate, asynchronous start/poll design (§5.2) is mandatory; if typical seconds, stage-2 may be simplified later |
| **Per-run cost** | **UNVERIFIED — phase-0 blocking.** Page states "approximately $1.82 per run" — if accurate, this provider is likely **economically unacceptable** for per-try-on use; phase-0 must also price 1–2 alternatives (e.g., fal.ai hosted face-swap / InsightFace endpoints, or native Tencent FaceFusion re-evaluation) |
| **Commercial-use license** | **UNVERIFIED — phase-0 blocking.** Model/license terms on the model page and upstream ModelScope/FaceFusion terms must be checked before production |
| Training-use of user photos | UNVERIFIED — phase-0. Replicate privacy policy lacks a blanket no-training guarantee (per public summaries); enterprise/DPA terms out of scope for now; mitigate via 1h auto-delete + immediate R2 persistence + consent copy disclosure |
| NSFW / safety blocks / error formats | UNVERIFIED — phase-0. Replicate returns standard prediction error payloads; model-specific refusals/NSFW behavior to be characterized in the same controlled calls |
| Poll/timeout budget | Design: per-request budget < 30s (start target ~10s, poll target ~10s); overall restore window bounded by client polling (≤2 min per session, resumable across visits). Final numbers set after phase-0 latency data |

**Phase-0 exit criteria:** availability proven, p95 latency known, real per-run cost known and approved, license confirmed compatible, error formats characterized, 1–2 cheaper/faster alternatives benchmarked if cost or latency is unfavorable.

## 10. Database and State Changes

Additive migration on `PersonalTryOnGeneration` only (columns in §5.4). No enum changes, no destructive edits, no backfill required (existing rows: `faceRestoreStatus=null`, `baseImageUrl=null` → legacy single-stage semantics; they remain displayable and are eligible for `REGENERATE_COMPLETED`).

## 11. API Changes

- Same endpoint. Body `action` enum extended: `RESTORE_FACE`, `RETRY_FACE_RESTORE`, `POLL_FACE_RESTORE` (existing: `GENERATE`, `RETRY_FAILED`, `REGENERATE_COMPLETED`). Unknown action → 400 `INVALID_PERSONAL_TRY_ON_ACTION`.
- Report DTO `personalTryOn` gains safe fields only: `base: { status }`, `faceRestore: { status, errorCode } | null`, `displayKind: "BASE" | "FINAL"`. Never exposes task ids, object keys, provider internals, prompts.
- New safe error codes: `FACE_RESTORE_PROVIDER_FAILED`, `FACE_RESTORE_ATTEMPT_CAP_REACHED`, `FACE_RESTORE_NOT_CLAIMABLE`, `FACE_RESTORE_NOT_CONFIGURED`, `FACE_RESTORE_TASK_LOST` (provider forgot the task — e.g., >1h — instruct restore retry).

## 12. Frontend States

- `BASE_COMPLETED` (restore PENDING): show base image + "人脸恢复准备中"; auto-trigger one `RESTORE_FACE` (§5.3).
- `FACE_RESTORE_PROCESSING`: show base image + "人脸恢复中"; bounded polling; no buttons.
- `COMPLETED` (both axes): show final image, standard disclosure; only this state may read 本人试穿已完成.
- `FACE_RESTORE_FAILED`: show base image + prominent “身份恢复失败，当前仅为临时穿搭效果图，不代表最终本人试穿效果。” + manual “重试人脸恢复” button.
- `BASE_FAILED`: existing failure semantics (`RETRY_FAILED`, base-stage cap).
- New safe copy added to `personal-try-on-messages.ts`; no URLs or codes leak to UI beyond mapped messages.

## 13. Privacy and Consent

- Inputs limited to: the current account / anonymous session's own uploads; explicit `faceTryOnConsent` (timestamp recorded); photos declared by the user to be of themselves.
- No third-party or public-figure face entry: the face source is always the diagnosis's own `FACE_FRONT` asset resolved server-side; no client-supplied face images; no URL inputs accepted for faces.
- Consent copy update required before production enablement: name the restoration processor (Replicate, US) and its 1-hour auto-deletion, alongside EvoLink.
- Withdrawal / 30-day anonymous retention: delete original photos + base image + final/restored image + any temp objects (extend existing cleanup paths to `baseImageObjectKey` and restored keys; DB rows cascade as today).
- Provider retention notes: Replicate API predictions auto-delete after ~1 hour ([docs](https://replicate.com/docs/topics/predictions/data-retention)); EvoLink result links expire per its docs (24h) and task-data retention is UNVERIFIED (phase-0 note).
- Logs and errors never contain image URLs, signed URLs, base64, object keys, tokens, or any biometric/face data — stable codes only.

## 14. Error Handling

| Failure | Behavior |
|---|---|
| Base provider/store fails | Existing semantics (BASE_FAILED, previous image preserved, `RETRY_FAILED`) |
| Restore start fails | `faceRestoreStatus=FAILED` + safe code; base stays displayed with mandatory warning; restore-only retry |
| Restore poll: still running | `PROCESSING`; bounded polling continues/resumes |
| Restore task failed / lost (>1h) | `FACE_RESTORE_FAILED` (`FACE_RESTORE_TASK_LOST`) + restore-only retry |
| Restore start succeeded but taskId persist fails | Row marked `FACE_RESTORE_FAILED`; orphan prediction is cost-only and auto-deleted (~1h); restore-only retry starts a fresh task |
| Poll arrives with missing/unknown taskId | `FACE_RESTORE_TASK_LOST` → `FACE_RESTORE_FAILED` + restore-only retry |
| Final store fails | `FACE_RESTORE_FAILED`; final temp object cleaned best-effort; base stays |
| Final persist fails | Existing orphan cleanup; base stays; no auto re-call |
| Provider not configured / mock | Mock passthrough returns base; recorded as mock; UI shows restoration unavailable note, never fake success |

## 15. Retry and Idempotency

- Base stage: `GENERATE` (CAS PENDING), `RETRY_FAILED` (CAS FAILED), `REGENERATE_COMPLETED` (CAS COMPLETED on base axis; resets restore axis: `faceRestoreStatus=null`, `faceRestoreTaskId=null`; base `attemptCount` cap 3 unchanged). `REGENERATE_COMPLETED` is rejected while `faceRestoreStatus=PROCESSING` — an in-flight restore must finish or fail first, so a billable provider task is never orphaned.
- Restore stage: `RESTORE_FACE` (CAS `faceRestoreStatus` PENDING→PROCESSING), `RETRY_FACE_RESTORE` (CAS FAILED→PROCESSING), cap `faceRestoreAttemptCount ≤ 2`; never touches base `attemptCount`; never re-charges base generation.
- `POLL_FACE_RESTORE` is read-only against the provider except on terminal success (idempotent final persist guarded by CAS on `faceRestoreStatus=PROCESSING`; a duplicate poll after completion is a no-op returning current state).
- No automatic retries; every cost-bearing call traces to a user action or its direct continuation (§5.3).

## 16. Deployment Architecture

- All within the existing Vercel route (`maxDuration = 180`): stage-1 request ≤150s poll + overhead; stage-2 requests are seconds each. No background functions, queues, cron, GPU, or Python services.
- Flags: `PERSONAL_TRY_ON_FACE_RESTORE_ENABLED` (default `false`), `FACE_RESTORE_PROVIDER` (default `mock`). Enabling is a two-step reversible ops action after phase-0.
- Bounded client polling only (≤24 × 5s per session, resumable on next visit).

## 17. Environment Variables

| Name | Purpose | Default |
|---|---|---|
| `PERSONAL_TRY_ON_FACE_RESTORE_ENABLED` | master flag | `false` |
| `FACE_RESTORE_PROVIDER` | `mock` \| `replicate` | `mock` |
| `REPLICATE_API_TOKEN` | Replicate auth (absent in production today — must be added) | — |
| `REPLICATE_FACE_SWAP_MODEL` | pinned model version override | repo pin |
| `PERSONAL_TRY_ON_FACE_RESTORE_POLL_LIMIT` | client poll bound per session | `24` |

## 18. Testing Strategy

- All automated tests use mocks (base provider, restore provider start/check, R2, Prisma client). Zero real EvoLink/Replicate calls.
- Service: stage-1 persist + `faceRestoreStatus=PENDING`; stage-2 start CAS rules (only from PENDING/FAILED; rejects otherwise); poll success → store final → atomic persist (display=final, deletion order); poll failure → FAILED + base kept; task-lost path; retry cap; restore never increments base attemptCount; REGENERATE_COMPLETED resets restore axis.
- Route: new actions validation/forwarding; invalid action 400; gates unchanged.
- DTO: safe fields only; no taskId/keys/prompt/provider leakage.
- View/panel: the five derived states of §12 incl. mandatory FACE_RESTORE_FAILED warning copy and button semantics; polling trigger guard (auto-restore fires once).
- Static assertion: stage-1 budget formula unchanged; stage-2 per-request work < 30s.
- Controlled real acceptance only after Preview deploy, user-approved budget: phase-0 provider calls + the §7 five-image gate.

## 19. Acceptance Criteria

**Identity acceptance (all required, human-reviewed on real outputs):**
- Final face is clearly recognizable as the uploaded user.
- No double faces, wrong face, obvious paste edges, or skin-tone mismatch.
- Age and hairstyle unchanged.
- Repeated generations keep the same identity.

**Body acceptance (all required):**
- No visible change to height or body type versus the user's photo.
- No copied reference-model body.
- Original pose, background, and framing preserved.
- Clothing change introduces no severe body-structure artifacts.

**Explicit non-criteria:** unit tests, prompt wording, `image_urls` presence, provider task COMPLETED, or mock providers never constitute feature completion. Completion requires the above on real outputs plus: caps holding, no auto retries, withdrawal/expiry deleting base+final+temp objects, consent copy live.

## 20. Rollback Plan

- `PERSONAL_TRY_ON_FACE_RESTORE_ENABLED=false` → post-#19 base-image flow; additive columns inert.
- Code rollback: single revert of the feature PR; migration additive, no rollback needed.
- Provider incident: `FACE_RESTORE_PROVIDER=mock` (passthrough) while investigating.

## 21. Files Expected to Change

New:
- `src/lib/personal-try-on/face-restore-provider.ts` (+ test)
- `src/lib/personal-try-on/mock-face-restore-provider.ts`
- `src/lib/personal-try-on/replicate-face-restore-provider.ts` (+ test)
- `src/lib/personal-try-on/face-restore-factory.ts` (+ test)
- `prisma/migrations/<ts>_personal_try_on_face_restore/migration.sql`

Modified:
- `prisma/schema.prisma` (additive columns, §5.4)
- `src/lib/personal-try-on/personal-try-on-service.ts` (+ test) — stage split, start/poll/retry actions
- `src/app/api/diagnosis/[id]/recommendations/[recommendationId]/personal-try-on/route.ts` (+ test)
- `src/lib/personal-try-on/personal-try-on-request.ts` (+ test)
- `src/lib/diagnosis-service.ts` (+ test) — DTO safe fields
- `src/components/diagnosis/personal-try-on-view.ts` (+ test), `try-on-status-panel.tsx`, `personal-try-on-report.test.tsx`, `personal-try-on-messages.ts` (+ test), `src/app/diagnosis/[id]/page.tsx` — states + auto-trigger + bounded polling
- `src/lib/retention/anonymous-media-retention.ts` (+ test), consent-revocation route — delete base/restored/temp objects

Explicitly untouched: `PersonalTryOnImageProvider` interface, Style Preview, legacy orchestrator/providers, Auth, upload, payment, wardrobe, commerce.

---

## Self-Review (Rev 2)

- Placeholders: none — every section contains concrete values or an explicit UNVERIFIED marker with a phase-0 owner.
- Contradictions: stage budgets now strictly separated (stage-1 ≤150s+overhead < 180s; stage-2 requests ≤ ~10–30s); no residual "skip mechanism" language; the only synchronous path is stage-1, unchanged from production today.
- Scope: no implementation, no plan, no code; Option 3 remains a gated fallback, not a shadow commitment.
- Ambiguity: trigger mechanism (§5.3), state mapping (§5.4), display rule (§12), retry/cost rules (§15), and verification status (§9) are each stated in exactly one place.
