import type {
  RunTryOnWorkflowInput,
  TryOnGarmentCategory,
  TryOnWorkflowDependencies,
  TryOnWorkflowResult,
} from "./types";

const ALLOWED_CLAIM_STATUSES = new Set(["NOT_REQUESTED", "FAILED"]);
const GARMENT_ORDER: TryOnGarmentCategory[] = [
  "TOP",
  "BOTTOM",
  "OUTERWEAR",
];
const THIRTY_DAYS_MS = 30 * 24 * 60 * 60 * 1_000;

function hasCompleteRequiredProducts(input: RunTryOnWorkflowInput): boolean {
  const categories = new Set(input.products.map((product) => product.category));
  return ["TOP", "BOTTOM"].every((category) =>
    categories.has(category as "TOP" | "BOTTOM")
  );
}

function expiresAtFor(input: RunTryOnWorkflowInput): Date | null {
  if (!input.isAnonymous || !input.diagnosisCreatedAt) return null;
  return new Date(input.diagnosisCreatedAt.getTime() + THIRTY_DAYS_MS);
}

async function cancelWorkflow(
  input: RunTryOnWorkflowInput,
  dependencies: TryOnWorkflowDependencies,
  reason: "CONSENT_REQUIRED" | "CONSENT_REVOKED"
): Promise<TryOnWorkflowResult> {
  await dependencies.persistence.persistCancelled({
    recommendationId: input.recommendationId,
    reason,
  });
  return { status: "CANCELLED", reason };
}

export async function runTryOnWorkflow(
  input: RunTryOnWorkflowInput,
  dependencies: TryOnWorkflowDependencies
): Promise<TryOnWorkflowResult> {
  if (input.trigger === "AUTO_PRIMARY" && !input.isPrimary) {
    return { status: "SKIPPED", reason: "AUTO_PRIMARY_ONLY" };
  }
  if (!input.consent) {
    return cancelWorkflow(input, dependencies, "CONSENT_REQUIRED");
  }
  if (!hasCompleteRequiredProducts(input)) {
    return { status: "SKIPPED", reason: "INCOMPLETE_PRODUCT_PLAN" };
  }
  if (
    input.expectedStatuses.length === 0 ||
    input.expectedStatuses.some((status) => !ALLOWED_CLAIM_STATUSES.has(status))
  ) {
    return { status: "SKIPPED", reason: "INVALID_EXPECTED_STATUS" };
  }

  const currentConsent = await dependencies.persistence.readConsent(
    input.diagnosisId
  );
  if (!currentConsent) {
    return cancelWorkflow(input, dependencies, "CONSENT_REQUIRED");
  }

  const claim = await dependencies.persistence.claimAttempt({
    recommendationId: input.recommendationId,
    expectedStatuses: input.expectedStatuses,
    productSnapshotHash: input.productSnapshotHash,
  });
  if (!claim.claimed) {
    return { status: "SKIPPED", reason: "NOT_CLAIMED" };
  }
  if (
    claim.productSnapshotHash !== undefined &&
    claim.productSnapshotHash !== input.productSnapshotHash
  ) {
    return { status: "SKIPPED", reason: "SNAPSHOT_MISMATCH" };
  }

  const consentAfterClaim = await dependencies.persistence.readConsent(
    input.diagnosisId
  );
  if (!consentAfterClaim) {
    return cancelWorkflow(input, dependencies, "CONSENT_REVOKED");
  }

  const garmentProducts = input.products
    .filter(
      (product): product is typeof product & { category: TryOnGarmentCategory } =>
        ["TOP", "BOTTOM", "OUTERWEAR"].includes(product.category)
    )
    .sort(
      (left, right) =>
        GARMENT_ORDER.indexOf(left.category) -
        GARMENT_ORDER.indexOf(right.category)
    );
  const productImageUrls = garmentProducts.map(
    (product) => product.imageUrl
  );

  for (let compositionAttempt = 1; compositionAttempt <= 2; compositionAttempt += 1) {
    try {
      let composedImageUrl = input.fullBodyImageUrl;
      for (const product of garmentProducts) {
        const statusUpdated = await dependencies.persistence.setStatus(
          input.recommendationId,
          "APPLYING_GARMENTS"
        );
        if (!statusUpdated) {
          return { status: "CANCELLED", reason: "CONSENT_REVOKED" };
        }
        const result = await dependencies.virtualTryOn.applyGarment({
          personImageUrl: composedImageUrl,
          productImageUrl: product.imageUrl,
          category: product.category,
        });
        composedImageUrl = result.imageUrl;
      }

      const consentBeforeIdentity = await dependencies.persistence.readConsent(
        input.diagnosisId
      );
      if (!consentBeforeIdentity) {
        return cancelWorkflow(input, dependencies, "CONSENT_REVOKED");
      }

      const identityStatusUpdated = await dependencies.persistence.setStatus(
        input.recommendationId,
        "RESTORING_IDENTITY"
      );
      if (!identityStatusUpdated) {
        return { status: "CANCELLED", reason: "CONSENT_REVOKED" };
      }
      const restored = await dependencies.identityRestore.restore({
        composedImageUrl,
        faceImageUrl: input.faceImageUrl,
      });

      const consentBeforeQuality = await dependencies.persistence.readConsent(
        input.diagnosisId
      );
      if (!consentBeforeQuality) {
        return cancelWorkflow(input, dependencies, "CONSENT_REVOKED");
      }

      const qualityStatusUpdated = await dependencies.persistence.setStatus(
        input.recommendationId,
        "QUALITY_CHECKING"
      );
      if (!qualityStatusUpdated) {
        return { status: "CANCELLED", reason: "CONSENT_REVOKED" };
      }
      const quality = await dependencies.quality.evaluate({
        imageUrl: restored.imageUrl,
        faceImageUrl: input.faceImageUrl,
        productImageUrls,
      });
      if (!quality.passed) continue;

      const consentBeforeCompletion =
        await dependencies.persistence.readConsent(input.diagnosisId);
      if (!consentBeforeCompletion) {
        return cancelWorkflow(input, dependencies, "CONSENT_REVOKED");
      }

      const completed = await dependencies.persistence.persistCompleted({
        recommendationId: input.recommendationId,
        imageUrl: restored.imageUrl,
        identityScore: quality.identityScore,
        productFidelityScore: quality.productFidelityScore,
        providerName: dependencies.virtualTryOn.name,
        tryOnExpiresAt: expiresAtFor(input),
      });
      if (!completed) {
        return { status: "CANCELLED", reason: "CONSENT_REVOKED" };
      }
      return { status: "COMPLETED", attemptNumber: claim.attemptNumber };
    } catch {
      if (compositionAttempt < 2) continue;
      const failed = await dependencies.persistence.persistFailed({
        recommendationId: input.recommendationId,
        failureCode: "PROVIDER_FAILED",
      });
      if (!failed) {
        return { status: "CANCELLED", reason: "CONSENT_REVOKED" };
      }
      return { status: "FAILED", reason: "PROVIDER_FAILED" };
    }
  }

  const failed = await dependencies.persistence.persistFailed({
    recommendationId: input.recommendationId,
    failureCode: "QUALITY_CHECK_FAILED",
  });
  if (!failed) {
    return { status: "CANCELLED", reason: "CONSENT_REVOKED" };
  }
  return { status: "FAILED", reason: "QUALITY_CHECK_FAILED" };
}
