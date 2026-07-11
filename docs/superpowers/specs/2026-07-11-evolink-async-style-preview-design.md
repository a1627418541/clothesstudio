# EvoLink Async Style Preview Design

## Goal

Support EvoLink's asynchronous GPT Image 2 API while preserving compatibility
with the synchronous OpenAI Images response.

## Confirmed production evidence

- EvoLink returns an `image.generation.task` object from
  `POST /v1/images/generations`.
- The response includes `id`, `status`, `progress`, and `task_info`, but
  no image data.
- Completed task details are available from `GET /v1/tasks/{task_id}`, where
  `results[0]` contains the temporary image URL.
- The existing application correctly prevents automatic retries of failed
  recommendations.

## Design

### Provider adapter

- Parse synchronous OpenAI image data first.
- Parse EvoLink task objects into a task descriptor.
- Poll `/v1/tasks/{task_id}` with the same bearer token.
- Poll every 2 seconds for at most 75 attempts (about 150 seconds).
- Return `results[0]` when the task is completed.
- Return safe errors for failed, cancelled, malformed, or timed-out tasks.

### Route execution

- Claim recommendations atomically as before.
- Generate all claimed recommendations concurrently with `Promise.all`.
- Set `maxDuration = 180` for the Vercel route.
- Persist each successful temporary EvoLink URL to R2 immediately.

### Safety

- Do not log API keys, task payloads, prompts, or generated URLs.
- Do not automatically retry failed recommendations.
- Do not create any paid request in automated tests.

## Verification

- Unit tests for task parsing, polling completion, failure, and timeout.
- Provider integration test with mocked HTTP responses.
- Existing regression suite, ESLint, TypeScript, and production build.
