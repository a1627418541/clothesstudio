# Style Preview Production Fix Design

## Goal

Stop repeated paid image-generation calls, make provider response failures diagnosable without exposing secrets, persist every successful preview to R2, and close the upload-to-diagnosis authorization gap.

## Confirmed production evidence

- Recent Neon rows are `FAILED` with `OpenAI returned no image data` and no preview URL.
- Older rows are `COMPLETED` with absolute `https://...r2.dev/...` URLs.
- A completed R2 object returns HTTP 200, so Neon and public R2 delivery are working.
- The report page automatically treats both `PENDING` and `FAILED` as generation candidates and does not await the post-generation refresh.
- The style-preview route selects both `PENDING` and `FAILED` rows and does not atomically claim a row before generation.

## Design

### Generation policy

- Automatic generation processes only `PENDING` recommendations.
- `FAILED` recommendations require an explicit retry request from the report page.
- A conditional database update from the expected status to `PROCESSING` atomically claims each recommendation. Concurrent requests that fail to claim it skip generation.
- The client awaits the report refresh before clearing its in-flight state.

### Provider response handling

- The provider accepts the documented OpenAI image response (`data[0].b64_json` or `data[0].url`).
- It also accepts narrowly defined OpenAI-compatible aliases (`data[0].base64`, `images[0].b64_json`, `images[0].url`).
- If no image is present, the stored error contains only safe response shape information (top-level keys and first-item keys), never values, headers, prompts, URLs, or API-key fragments.
- Temporary debug logs that expose key prefixes, provider URLs, generated URLs, or response payload structure are removed.

### Storage policy

- Every successful provider result, including mock fallback, passes through the same R2 persistence step.
- R2 persistence failure produces `FAILED`; external or short-lived provider URLs are never treated as durable success.
- `CLOUDFLARE_R2_PUBLIC_BASE_URL` must be a valid absolute HTTP(S) URL and is normalized before object URLs are built.

### Authorization

- If `/api/upload` receives `diagnosisId`, it validates the photo role and verifies that the current authenticated user or anonymous session owns that diagnosis before uploading or linking an asset.

### Configuration and documentation

- The text diagnosis OpenAI client consumes `OPENAI_BASE_URL`.
- README and `.env.example` describe the current real-AI and style-preview behavior.

## Verification

- Vitest regression tests cover response parsing, automatic/manual retry policy, R2 URL construction, provider fallback persistence, and ownership checks.
- Run `npm test`, `npm run lint`, `npx tsc --noEmit`, and `npm run build`.
- Perform static secret-log scanning before completion.
