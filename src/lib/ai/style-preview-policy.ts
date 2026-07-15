export type PreviewImageStatus =
  | "PENDING"
  | "PROCESSING"
  | "COMPLETED"
  | "FAILED";

export function shouldAutoGenerateStylePreviews(
  recommendations: {
    previewImageStatus: string;
    canGeneratePreview: boolean;
  }[]
): boolean {
  return recommendations.some(
    (rec) =>
      rec.previewImageStatus === "PENDING" && rec.canGeneratePreview
  );
}

export function shouldOfferStylePreviewRetry(
  recommendations: {
    previewImageStatus: string;
    canRetryPreview: boolean;
  }[]
): boolean {
  return recommendations.some(
    (rec) => rec.previewImageStatus === "FAILED" && rec.canRetryPreview
  );
}

export function getRequestedPreviewStatuses(
  retryFailed: boolean
): PreviewImageStatus[] {
  return retryFailed ? ["FAILED"] : ["PENDING"];
}
