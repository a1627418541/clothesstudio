import { TryOnWorkflowStatus } from "@prisma/client";
import { prisma } from "@/lib/prisma";
import {
  createMockIdentityRestoreProvider,
  createMockTryOnQualityProvider,
  createMockVirtualTryOnProvider,
} from "./mock-providers";
import { createTencentVirtualTryOnProvider } from "./providers/tencent-virtual-try-on";
import { runTryOnWorkflow as orchestrateTryOnWorkflow } from "./try-on-orchestrator";
import type {
  RunTryOnWorkflowInput,
  TryOnWorkflowDependencies,
  TryOnWorkflowPersistence,
  VirtualTryOnProvider,
} from "./types";

const ACTIVE_WORKFLOW_STATUSES: TryOnWorkflowStatus[] = [
  "QUEUED",
  "APPLYING_GARMENTS",
  "APPLYING_HAT",
  "RESTORING_IDENTITY",
  "QUALITY_CHECKING",
];

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
      const updated = await prisma.styleRecommendation.updateMany({
        where: {
          id: recommendationId,
          tryOnWorkflowStatus: { in: ACTIVE_WORKFLOW_STATUSES },
          diagnosis: {
            faceTryOnConsent: true,
            faceTryOnRevokedAt: null,
          },
        },
        data: { tryOnWorkflowStatus: status },
      });
      return updated.count === 1;
    },

    async persistCompleted(input) {
      const updated = await prisma.styleRecommendation.updateMany({
        where: {
          id: input.recommendationId,
          tryOnWorkflowStatus: "QUALITY_CHECKING",
          diagnosis: {
            faceTryOnConsent: true,
            faceTryOnRevokedAt: null,
          },
        },
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
      return updated.count === 1;
    },

    async persistFailed(input) {
      const updated = await prisma.styleRecommendation.updateMany({
        where: {
          id: input.recommendationId,
          tryOnWorkflowStatus: { in: ACTIVE_WORKFLOW_STATUSES },
          diagnosis: {
            faceTryOnConsent: true,
            faceTryOnRevokedAt: null,
          },
        },
        data: {
          tryOnImageStatus: "FAILED",
          tryOnImageError: input.failureCode,
          tryOnWorkflowStatus: "FAILED",
          tryOnFailureCode: input.failureCode,
        },
      });
      return updated.count === 1;
    },

    async persistCancelled(input) {
      await prisma.styleRecommendation.updateMany({
        where: {
          id: input.recommendationId,
          tryOnWorkflowStatus: {
            in: ["NOT_REQUESTED", "FAILED", ...ACTIVE_WORKFLOW_STATUSES],
          },
        },
        data: {
          tryOnWorkflowStatus: "CANCELLED",
          tryOnFailureCode: input.reason,
        },
      });
    },
  };
}

function createProductionVirtualTryOnProvider(): VirtualTryOnProvider {
  const tencent = createTencentVirtualTryOnProvider();
  const mockHat = createMockVirtualTryOnProvider();

  return {
    name: tencent.name,
    applyGarment: (input) => tencent.applyGarment(input),
    applyHat: (input) => mockHat.applyHat(input),
  };
}

export async function runTryOnWorkflow(input: RunTryOnWorkflowInput) {
  const dependencies: TryOnWorkflowDependencies = {
    virtualTryOn: createProductionVirtualTryOnProvider(),
    identityRestore: createMockIdentityRestoreProvider(),
    quality: createMockTryOnQualityProvider(),
    persistence: createPersistence(),
  };
  return orchestrateTryOnWorkflow(input, dependencies);
}
