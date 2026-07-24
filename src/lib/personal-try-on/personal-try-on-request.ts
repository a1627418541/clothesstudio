import type { PersonalTryOnAction } from "./personal-try-on-service";

export type PostPersonalTryOnResult =
  | { ok: true }
  | { ok: false; errorCode: string | null };

function extractErrorCode(body: unknown): string | null {
  if (typeof body !== "object" || body === null) return null;
  const code = (body as { error?: unknown }).error;
  return typeof code === "string" && code.length > 0 ? code : null;
}

// Sprint 3.9.x: the only client entry point for personal try-on generation.
// Never calls the legacy /try-on endpoint and never logs response payloads
// (they may contain image URLs). The action drives the service's exact-status
// CAS: GENERATE → PENDING, RETRY_FAILED → FAILED, REGENERATE_COMPLETED →
// COMPLETED.
export async function postPersonalTryOn(input: {
  diagnosisId: string;
  recommendationId: string;
  action: PersonalTryOnAction;
  fetchImpl?: typeof fetch;
}): Promise<PostPersonalTryOnResult> {
  const fetchImpl = input.fetchImpl ?? fetch;
  try {
    const response = await fetchImpl(
      `/api/diagnosis/${input.diagnosisId}/recommendations/${input.recommendationId}/personal-try-on`,
      {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ action: input.action }),
      }
    );
    const body: unknown = await response.json().catch(() => null);
    if (!response.ok) {
      return { ok: false, errorCode: extractErrorCode(body) };
    }
    if (typeof body === "object" && body !== null && (body as { ok?: unknown }).ok === false) {
      return { ok: false, errorCode: extractErrorCode(body) };
    }
    return { ok: true };
  } catch {
    return { ok: false, errorCode: null };
  }
}
