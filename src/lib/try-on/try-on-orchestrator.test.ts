import { beforeEach, describe, expect, it, vi } from "vitest";
import {
  createMockIdentityRestoreProvider,
  createMockTryOnQualityProvider,
  createMockVirtualTryOnProvider,
} from "./mock-providers";
import { runTryOnWorkflow } from "./try-on-orchestrator";

function makeDependencies() {
  return {
    virtualTryOn: {
      name: "mock-vton",
      applyGarment: vi.fn(
        async ({
          personImageUrl,
        }: {
          personImageUrl: string;
          productImageUrl: string;
          category: "TOP" | "BOTTOM" | "OUTERWEAR";
        }) => ({
          imageUrl: personImageUrl,
        })
      ),
      applyHat: vi.fn(
        async ({ personImageUrl }: { personImageUrl: string }) => ({
          imageUrl: personImageUrl,
        })
      ),
    },
    identityRestore: {
      name: "mock-identity",
      restore: vi.fn(
        async ({ composedImageUrl }: { composedImageUrl: string }) => ({
          imageUrl: composedImageUrl,
        })
      ),
    },
    quality: {
      evaluate: vi.fn(async () => ({
        passed: true,
        identityScore: 1,
        productFidelityScore: 1,
      })),
    },
    persistence: {
      claimAttempt: vi.fn(async () => ({
        claimed: true,
        attemptNumber: 1,
        productSnapshotHash: "sha256:products",
      })),
      readConsent: vi.fn(async () => true),
      setStatus: vi.fn(async () => true),
      persistCompleted: vi.fn(async () => true),
      persistFailed: vi.fn(async () => true),
      persistCancelled: vi.fn(async () => undefined),
    },
  };
}

function makeInput(
  overrides: Partial<Parameters<typeof runTryOnWorkflow>[0]> = {}
) {
  return {
    diagnosisId: "diag-1",
    recommendationId: "rec-1",
    trigger: "AUTO_PRIMARY" as const,
    isPrimary: true,
    expectedStatuses: ["NOT_REQUESTED"] as const,
    consent: true,
    fullBodyImageUrl: "https://assets.example/body.jpg",
    faceImageUrl: "https://assets.example/face.jpg",
    productSnapshotHash: "sha256:products",
    products: [
      { category: "TOP" as const, imageUrl: "https://assets.example/top.jpg" },
      {
        category: "BOTTOM" as const,
        imageUrl: "https://assets.example/bottom.jpg",
      },
      { category: "HAT" as const, imageUrl: "https://assets.example/hat.jpg" },
    ],
    diagnosisCreatedAt: new Date("2026-07-20T00:00:00.000Z"),
    isAnonymous: true,
    ...overrides,
  };
}

describe("runTryOnWorkflow", () => {
  let deps: ReturnType<typeof makeDependencies>;

  beforeEach(() => {
    deps = makeDependencies();
  });

  it("never calls providers without active consent", async () => {
    const result = await runTryOnWorkflow(makeInput({ consent: false }), deps);

    expect(result).toEqual({
      status: "CANCELLED",
      reason: "CONSENT_REQUIRED",
    });
    expect(deps.virtualTryOn.applyGarment).not.toHaveBeenCalled();
    expect(deps.identityRestore.restore).not.toHaveBeenCalled();
  });

  it("skips automatic generation for a non-primary recommendation", async () => {
    const result = await runTryOnWorkflow(makeInput({ isPrimary: false }), deps);

    expect(result).toEqual({
      status: "SKIPPED",
      reason: "AUTO_PRIMARY_ONLY",
    });
    expect(deps.persistence.claimAttempt).not.toHaveBeenCalled();
  });

  it("rejects incomplete products and a stale snapshot before providers", async () => {
    const incomplete = await runTryOnWorkflow(
      makeInput({ products: makeInput().products.slice(0, 2) }),
      deps
    );
    expect(incomplete).toEqual({
      status: "SKIPPED",
      reason: "INCOMPLETE_PRODUCT_PLAN",
    });

    deps.persistence.claimAttempt.mockResolvedValueOnce({
      claimed: true,
      attemptNumber: 1,
      productSnapshotHash: "sha256:changed",
    });
    const stale = await runTryOnWorkflow(makeInput(), deps);
    expect(stale).toEqual({ status: "SKIPPED", reason: "SNAPSHOT_MISMATCH" });
    expect(deps.virtualTryOn.applyGarment).not.toHaveBeenCalled();
  });

  it("honors compare-and-set claim failure", async () => {
    deps.persistence.claimAttempt.mockResolvedValueOnce({
      claimed: false,
      attemptNumber: 0,
      productSnapshotHash: "sha256:products",
    });

    const result = await runTryOnWorkflow(makeInput(), deps);

    expect(result).toEqual({ status: "SKIPPED", reason: "NOT_CLAIMED" });
    expect(deps.virtualTryOn.applyGarment).not.toHaveBeenCalled();
  });

  it("applies garments before the hat and persists anonymous expiry", async () => {
    const callOrder: string[] = [];
    deps.virtualTryOn.applyGarment.mockImplementation(async (input) => {
      callOrder.push(input.category);
      return { imageUrl: input.personImageUrl };
    });
    deps.virtualTryOn.applyHat.mockImplementation(async (input) => {
      callOrder.push("HAT");
      return { imageUrl: input.personImageUrl };
    });

    const result = await runTryOnWorkflow(
      makeInput({
        products: [
          ...makeInput().products.slice(0, 2),
          {
            category: "OUTERWEAR",
            imageUrl: "https://assets.example/outerwear.jpg",
          },
          makeInput().products[2],
        ],
      }),
      deps
    );

    expect(result.status).toBe("COMPLETED");
    expect(callOrder).toEqual(["TOP", "BOTTOM", "OUTERWEAR", "HAT"]);
    expect(deps.persistence.persistCompleted).toHaveBeenCalledWith(
      expect.objectContaining({
        recommendationId: "rec-1",
        providerName: "mock-vton",
        tryOnExpiresAt: new Date("2026-08-19T00:00:00.000Z"),
      })
    );
  });

  it("cancels if consent is revoked before identity restoration", async () => {
    deps.persistence.readConsent
      .mockResolvedValueOnce(true)
      .mockResolvedValueOnce(false);

    const result = await runTryOnWorkflow(makeInput(), deps);

    expect(result).toEqual({
      status: "CANCELLED",
      reason: "CONSENT_REVOKED",
    });
    expect(deps.virtualTryOn.applyGarment).not.toHaveBeenCalled();
    expect(deps.identityRestore.restore).not.toHaveBeenCalled();
    expect(deps.quality.evaluate).not.toHaveBeenCalled();
  });

  it("does not send face data to quality after consent is revoked", async () => {
    deps.persistence.readConsent
      .mockResolvedValueOnce(true)
      .mockResolvedValueOnce(true)
      .mockResolvedValueOnce(true)
      .mockResolvedValueOnce(false);

    const result = await runTryOnWorkflow(makeInput(), deps);

    expect(result).toEqual({
      status: "CANCELLED",
      reason: "CONSENT_REVOKED",
    });
    expect(deps.identityRestore.restore).toHaveBeenCalledTimes(1);
    expect(deps.quality.evaluate).not.toHaveBeenCalled();
    expect(deps.persistence.persistCompleted).not.toHaveBeenCalled();
  });

  it("does not persist a result when consent is revoked after quality", async () => {
    deps.persistence.readConsent
      .mockResolvedValueOnce(true)
      .mockResolvedValueOnce(true)
      .mockResolvedValueOnce(true)
      .mockResolvedValueOnce(true)
      .mockResolvedValueOnce(false);

    const result = await runTryOnWorkflow(makeInput(), deps);

    expect(deps.quality.evaluate).toHaveBeenCalledTimes(1);
    expect(deps.persistence.persistCompleted).not.toHaveBeenCalled();
    expect(result).toEqual({
      status: "CANCELLED",
      reason: "CONSENT_REVOKED",
    });
  });

  it("treats a rejected consent-aware completion write as cancelled", async () => {
    deps.persistence.persistCompleted.mockResolvedValue(false);

    const result = await runTryOnWorkflow(makeInput(), deps);

    expect(deps.persistence.persistCompleted).toHaveBeenCalledTimes(1);
    expect(result).toEqual({
      status: "CANCELLED",
      reason: "CONSENT_REVOKED",
    });
  });

  it("auto-retries one failed quality check and then completes", async () => {
    deps.quality.evaluate
      .mockResolvedValueOnce({
        passed: false,
        identityScore: 0.71,
        productFidelityScore: 0.68,
      })
      .mockResolvedValueOnce({
        passed: true,
        identityScore: 0.96,
        productFidelityScore: 0.94,
      });

    const result = await runTryOnWorkflow(makeInput(), deps);

    expect(result.status).toBe("COMPLETED");
    expect(deps.quality.evaluate).toHaveBeenCalledTimes(2);
    expect(deps.virtualTryOn.applyGarment).toHaveBeenCalledTimes(4);
    expect(deps.virtualTryOn.applyHat).toHaveBeenCalledTimes(2);
  });

  it("fails with a safe code after exactly two quality attempts", async () => {
    deps.quality.evaluate.mockResolvedValue({
      passed: false,
      identityScore: 0.5,
      productFidelityScore: 0.5,
    });

    const result = await runTryOnWorkflow(makeInput(), deps);

    expect(result).toEqual({
      status: "FAILED",
      reason: "QUALITY_CHECK_FAILED",
    });
    expect(deps.quality.evaluate).toHaveBeenCalledTimes(2);
    expect(deps.persistence.persistFailed).toHaveBeenCalledWith({
      recommendationId: "rec-1",
      failureCode: "QUALITY_CHECK_FAILED",
    });
    expect(deps.persistence.persistCompleted).not.toHaveBeenCalled();
  });

  it("retries one provider failure and persists only a safe code", async () => {
    deps.virtualTryOn.applyGarment.mockRejectedValue(
      new Error("secret provider response")
    );

    const result = await runTryOnWorkflow(makeInput(), deps);

    expect(result).toEqual({ status: "FAILED", reason: "PROVIDER_FAILED" });
    expect(deps.virtualTryOn.applyGarment).toHaveBeenCalledTimes(2);
    expect(deps.persistence.persistFailed).toHaveBeenCalledWith({
      recommendationId: "rec-1",
      failureCode: "PROVIDER_FAILED",
    });
  });
});

describe("deterministic mock providers", () => {
  it("discloses MOCK and never presents the unchanged image as transformed", async () => {
    const virtualTryOn = createMockVirtualTryOnProvider();
    const garment = await virtualTryOn.applyGarment({
      personImageUrl: "person.jpg",
      productImageUrl: "top.jpg",
      category: "TOP",
    });
    const identity = await createMockIdentityRestoreProvider().restore({
      composedImageUrl: garment.imageUrl,
      faceImageUrl: "face.jpg",
    });
    const quality = await createMockTryOnQualityProvider().evaluate({
      imageUrl: identity.imageUrl,
      faceImageUrl: "face.jpg",
      productImageUrls: ["top.jpg"],
    });

    expect(virtualTryOn.disclosure).toBe("MOCK");
    expect(identity.imageUrl).toBe("person.jpg");
    expect(virtualTryOn.appliedLayers).toEqual([
      { category: "TOP", productImageUrl: "top.jpg" },
    ]);
    expect(quality).toEqual({
      passed: true,
      identityScore: 1,
      productFidelityScore: 1,
    });
  });
});
