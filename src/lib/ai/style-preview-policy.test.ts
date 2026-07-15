import { describe, expect, it } from "vitest";
import {
  getRequestedPreviewStatuses,
  shouldAutoGenerateStylePreviews,
} from "./style-preview-policy";

describe("style preview generation policy", () => {
  it("automatically generates only pending recommendations", () => {
    expect(
      shouldAutoGenerateStylePreviews([
        { previewImageStatus: "FAILED" },
        { previewImageStatus: "COMPLETED" },
      ])
    ).toBe(false);

    expect(
      shouldAutoGenerateStylePreviews([
        { previewImageStatus: "FAILED" },
        { previewImageStatus: "PENDING" },
      ])
    ).toBe(true);
  });

  it("includes failed recommendations only for explicit retry", () => {
    expect(getRequestedPreviewStatuses(false)).toEqual(["PENDING"]);
    expect(getRequestedPreviewStatuses(true)).toEqual(["FAILED"]);
  });
});
