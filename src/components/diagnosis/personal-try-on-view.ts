import type {
  ReportPersonalTryOnState,
  ReportTryOnWorkflowStatus,
} from "@/types/diagnosis";

export const PERSONAL_TRY_ON_DISCLOSURE =
  "AI 本人试穿效果，仅供风格与搭配参考，人物细节可能存在差异。";
export const LEGACY_TRY_ON_DISCLOSURE = "本人试穿为 AI 生成效果，仅供搭配参考";

export type PersonalTryOnView =
  | { kind: "cta" }
  | { kind: "pending" }
  | { kind: "processing" }
  | { kind: "regenerating"; imageUrl: string }
  | { kind: "completed"; imageUrl: string; legacy: boolean }
  | { kind: "unavailable" }
  | { kind: "failed"; errorCode: string | null }
  | { kind: "regeneration_failed"; errorCode: string | null; imageUrl: string };

const LEGACY_IN_FLIGHT_STATUSES: ReadonlySet<ReportTryOnWorkflowStatus> =
  new Set([
    "QUEUED",
    "APPLYING_GARMENTS",
    "APPLYING_HAT",
    "RESTORING_IDENTITY",
    "QUALITY_CHECKING",
  ]);

// The personal try-on slot is driven exclusively by PersonalTryOnGeneration.
// Legacy reports (no generation row) keep their real legacy try-on image only
// when the legacy workflow actually completed; a tryOnImageUrl written by the
// style-preview pipeline must never masquerade as a personal try-on.
export function resolvePersonalTryOnView(recommendation: {
  personalTryOn: ReportPersonalTryOnState | null;
  tryOnImageUrl: string | null;
  tryOnWorkflowStatus: ReportTryOnWorkflowStatus;
}): PersonalTryOnView {
  const generation = recommendation.personalTryOn;
  if (generation) {
    switch (generation.status) {
      case "PENDING":
        return { kind: "pending" };
      case "PROCESSING":
        return generation.imageUrl
          ? { kind: "regenerating", imageUrl: generation.imageUrl }
          : { kind: "processing" };
      case "COMPLETED":
        return generation.imageUrl
          ? { kind: "completed", imageUrl: generation.imageUrl, legacy: false }
          : { kind: "unavailable" };
      case "FAILED":
        return generation.imageUrl
          ? {
              kind: "regeneration_failed",
              errorCode: generation.errorCode,
              imageUrl: generation.imageUrl,
            }
          : { kind: "failed", errorCode: generation.errorCode };
    }
  }

  const workflow = recommendation.tryOnWorkflowStatus;
  if (workflow === "COMPLETED") {
    return recommendation.tryOnImageUrl
      ? { kind: "completed", imageUrl: recommendation.tryOnImageUrl, legacy: true }
      : { kind: "unavailable" };
  }
  if (workflow === "FAILED") return { kind: "failed", errorCode: null };
  if (LEGACY_IN_FLIGHT_STATUSES.has(workflow)) return { kind: "processing" };
  return { kind: "cta" };
}
