import { TryOnWorkflowStatus } from "@prisma/client";
import { prisma } from "@/lib/prisma";
import {
  createMockIdentityRestoreProvider,
  createMockTryOnQualityProvider,
  createMockVirtualTryOnProvider,
} from "./mock-providers";
import { runTryOnWorkflow as orchestrateTryOnWorkflow } from "./try-on-orchestrator";
import type {
  RunTryOnWorkflowInput,
  TryOnWorkflowDependencies,
  TryOnWorkflowPersistence,
} from "./types";

function createPersistence(): TryOnWorkflowPersistence {
  return {
    async claimAttempt(input) {
      const claimed = await prisma.styleRecommendation.updateMany({
        where: {
          id: input.recommendationId,
          tryOnWorkflowStatus: {
            in: input.expectedStatuses as TryOnWorkflowStatus[],
          },
          tryOnProductSnapshotHash: input.productSnapshotHash,
          diagnosis: {
            faceTryOnConsent: true,
            faceTryOnRevokedAt: null,
          },
        },
        data: {
          tryOnWorkflowStatus: "QUEUED",
          tryOnAttemptCount: { increment: 1 },
          tryOnFailureCode: null,
        },
      });
      if (claimed.count !== 1) {
        return { claimed: false, attemptNumber: 0 };
      }
      const recommendation = await prisma.styleRecommendation.findUniqueOrThrow({
        where: { id: input.recommendationId },
        select: {
          tryOnAttemptCount: true,
          tryOnProductSnapshotHash: true,
        },
      });
      return {
        claimed: true,
        attemptNumber: recommendation.tryOnAttemptCount,
        productSnapshotHash: recommendation.tryOnProductSnapshotHash,
      };
    },

    async readConsent(diagnosisId) {
      const diagnosis = await prisma.styleDiagnosis.findUnique({
        where: { id: diagnosisId },
        select: {
          faceTryOnConsent: true,
          faceTryOnRevokedAt: true,
        },
      });
      return Boolean(
        diagnosis?.faceTryOnConsent && !diagnosis.faceTryOnRevokedAt
      );
    },

    async setStatus(recommendationId, status) {
      await prisma.styleRecommendation.update({
        where: { id: recommendationId },
        data: { tryOnWorkflowStatus: status },
      });
    },

    async persistCompleted(input) {
      await prisma.styleRecommendation.update({
        where: { id: input.recommendationId },
        data: {
          tryOnImageUrl: input.imageUrl,
          tryOnImageStatus: "COMPLETED",
          tryOnImageError: null,
          tryOnWorkflowStatus: "COMPLETED",
          tryOnFailureCode: null,
          tryOnProvider: input.providerName,
          identityScore: input.identityScore,
          productFidelityScore: input.productFidelityScore,
          tryOnExpiresAt: input.tryOnExpiresAt,
        },
      });
    },

    async persistFailed(input) {
      await prisma.styleRecommendation.update({
        where: { id: input.recommendationId },
        data: {
          tryOnImageStatus: "FAILED",
          tryOnImageError: input.failureCode,
          tryOnWorkflowStatus: "FAILED",
          tryOnFailureCode: input.failureCode,
        },
      });
    },

    async persistCancelled(input) {
      await prisma.styleRecommendation.update({
        where: { id: input.recommendationId },
        data: {
          tryOnWorkflowStatus: "CANCELLED",
          tryOnFailureCode: input.reason,
        },
      });
    },
  };
}

export async function runTryOnWorkflow(input: RunTryOnWorkflowInput) {
  const dependencies: TryOnWorkflowDependencies = {
    virtualTryOn: createMockVirtualTryOnProvider(),
    identityRestore: createMockIdentityRestoreProvider(),
    quality: createMockTryOnQualityProvider(),
    persistence: createPersistence(),
  };
  return orchestrateTryOnWorkflow(input, dependencies);
}
