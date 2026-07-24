import { describe, expect, it } from "vitest";
import { resolvePersonalTryOnView } from "./personal-try-on-view";

function rec(
  overrides: Partial<Parameters<typeof resolvePersonalTryOnView>[0]> = {}
): Parameters<typeof resolvePersonalTryOnView>[0] {
  return {
    personalTryOn: null,
    tryOnImageUrl: null,
    tryOnWorkflowStatus: "NOT_REQUESTED",
    ...overrides,
  };
}

describe("resolvePersonalTryOnView", () => {
  it("returns cta when no generation exists", () => {
    expect(resolvePersonalTryOnView(rec())).toEqual({ kind: "cta" });
  });

  it("returns pending for a claimed but not yet started generation", () => {
    expect(
      resolvePersonalTryOnView(
        rec({ personalTryOn: { status: "PENDING", imageUrl: null, errorCode: null, attemptCount: 0 } })
      )
    ).toEqual({ kind: "pending" });
  });

  it("returns processing for an in-flight generation", () => {
    expect(
      resolvePersonalTryOnView(
        rec({ personalTryOn: { status: "PROCESSING", imageUrl: null, errorCode: null, attemptCount: 1 } })
      )
    ).toEqual({ kind: "processing" });
  });

  it("returns completed with the generation image when finished", () => {
    expect(
      resolvePersonalTryOnView(
        rec({
          personalTryOn: {
            status: "COMPLETED",
            imageUrl: "https://r2.example/personal.png",
            errorCode: null,
            attemptCount: 1,
          },
        })
      )
    ).toEqual({ kind: "completed", imageUrl: "https://r2.example/personal.png", legacy: false });
  });

  it("returns unavailable for a completed generation without an image and never falls back to preview", () => {
    expect(
      resolvePersonalTryOnView(
        rec({ personalTryOn: { status: "COMPLETED", imageUrl: null, errorCode: null, attemptCount: 1 } })
      )
    ).toEqual({ kind: "unavailable" });
  });

  it("returns failed with the safe error code for a failed generation", () => {
    expect(
      resolvePersonalTryOnView(
        rec({
          personalTryOn: {
            status: "FAILED",
            imageUrl: null,
            errorCode: "PERSONAL_TRY_ON_PROVIDER_FAILED",
            attemptCount: 1,
          },
        })
      )
    ).toEqual({ kind: "failed", errorCode: "PERSONAL_TRY_ON_PROVIDER_FAILED" });
  });

  it("keeps a real legacy try-on image for old reports without a generation", () => {
    expect(
      resolvePersonalTryOnView(
        rec({
          tryOnImageUrl: "https://assets.example/legacy-try-on.jpg",
          tryOnWorkflowStatus: "COMPLETED",
        })
      )
    ).toEqual({ kind: "completed", imageUrl: "https://assets.example/legacy-try-on.jpg", legacy: true });
  });

  it("maps a legacy failed workflow to a retryable failure", () => {
    expect(resolvePersonalTryOnView(rec({ tryOnWorkflowStatus: "FAILED" }))).toEqual({
      kind: "failed",
      errorCode: null,
    });
  });

  it("maps a legacy in-flight workflow to processing", () => {
    expect(resolvePersonalTryOnView(rec({ tryOnWorkflowStatus: "APPLYING_GARMENTS" }))).toEqual({
      kind: "processing",
    });
  });

  it("never treats a style-preview-written tryOnImageUrl as a personal try-on", () => {
    expect(
      resolvePersonalTryOnView(
        rec({
          tryOnImageUrl: "https://assets.example/preview-written.jpg",
          tryOnWorkflowStatus: "NOT_REQUESTED",
        })
      )
    ).toEqual({ kind: "cta" });
  });

  it("returns regenerating when a generation is processing over a previous image", () => {
    expect(
      resolvePersonalTryOnView(
        rec({
          personalTryOn: {
            status: "PROCESSING",
            imageUrl: "https://r2.example/previous.png",
            errorCode: null,
            attemptCount: 2,
          },
        })
      )
    ).toEqual({ kind: "regenerating", imageUrl: "https://r2.example/previous.png" });
  });

  it("returns regeneration_failed with the previous image when a regeneration fails", () => {
    expect(
      resolvePersonalTryOnView(
        rec({
          personalTryOn: {
            status: "FAILED",
            imageUrl: "https://r2.example/previous.png",
            errorCode: "PERSONAL_TRY_ON_PROVIDER_FAILED",
            attemptCount: 2,
          },
        })
      )
    ).toEqual({
      kind: "regeneration_failed",
      errorCode: "PERSONAL_TRY_ON_PROVIDER_FAILED",
      imageUrl: "https://r2.example/previous.png",
    });
  });

  it("returns unavailable for a legacy completed workflow without an image", () => {
    expect(resolvePersonalTryOnView(rec({ tryOnWorkflowStatus: "COMPLETED" }))).toEqual({
      kind: "unavailable",
    });
  });
});
