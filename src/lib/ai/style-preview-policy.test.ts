import { describe, expect, it } from "vitest";
import {
  getRequestedPreviewStatuses,
  shouldAutoGenerateStylePreviews,
  shouldOfferStylePreviewRetry,
} from "./style-preview-policy";

describe("style preview generation policy", () => {
  it("automatically generates only pending recommendations", () => {
    expect(
      shouldAutoGenerateStylePreviews([
        { previewImageStatus: "FAILED", canGeneratePreview: true },
        { previewImageStatus: "COMPLETED", canGeneratePreview: true },
      ])
    ).toBe(false);

    expect(
      shouldAutoGenerateStylePreviews([
        { previewImageStatus: "FAILED", canGeneratePreview: true },
        { previewImageStatus: "PENDING", canGeneratePreview: true },
      ])
    ).toBe(true);

    expect(
      shouldAutoGenerateStylePreviews([
        { previewImageStatus: "PENDING", canGeneratePreview: false },
      ])
    ).toBe(false);
  });

  it("includes failed recommendations only for explicit retry", () => {
    expect(getRequestedPreviewStatuses(false)).toEqual(["PENDING"]);
    expect(getRequestedPreviewStatuses(true)).toEqual(["FAILED"]);
  });

  it("offers explicit retry only for failed recommendations with permission", () => {
    expect(
      shouldOfferStylePreviewRetry([
        { previewImageStatus: "FAILED", canRetryPreview: true },
      ])
    ).toBe(true);
    expect(
      shouldOfferStylePreviewRetry([
        { previewImageStatus: "FAILED", canRetryPreview: false },
        { previewImageStatus: "COMPLETED", canRetryPreview: true },
      ])
    ).toBe(false);
  });
});
