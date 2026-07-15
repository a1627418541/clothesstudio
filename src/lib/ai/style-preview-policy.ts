export type PreviewImageStatus =
  | "PENDING"
  | "PROCESSING"
  | "COMPLETED"
  | "FAILED";

export function shouldAutoGenerateStylePreviews(
  recommendations: { previewImageStatus: string }[]
): boolean {
  return recommendations.some((rec) => rec.previewImageStatus === "PENDING");
}

export function getRequestedPreviewStatuses(
  retryFailed: boolean
): PreviewImageStatus[] {
  return retryFailed ? ["FAILED"] : ["PENDING"];
}
