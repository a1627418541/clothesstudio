import { createHash, randomUUID } from "node:crypto";
import { Prisma, RecommendationSource } from "@prisma/client";
import { parseV2RecommendationSnapshot } from "@/lib/style-archetype/recommendation-snapshot";
import { StyleRecommendationSnapshotInput } from "@/lib/style-archetype/recommendation-snapshot";
import {
  STYLE_PREVIEW_COMPILER_VERSION,
  buildCompiledStylePrompt,
  compileStylePreviewPrompt,
} from "./style-preview-compiler";
import {
  GenerateStylePreviewFromPromptInput,
  GenerateStylePreviewResult,
  generateStylePreviewImageFromPrompt,
} from "./style-preview-service";

export type StylePreviewExpectedStatus = "PENDING" | "FAILED";

export interface StylePreviewAttemptClient {
  $transaction<T>(
    operation: (tx: Prisma.TransactionClient) => Promise<T>
  ): Promise<T>;
  aiJob: {
    update(args: Prisma.AiJobUpdateArgs): Promise<unknown>;
  };
}

export interface StylePreviewAttemptRecommendation
  extends StyleRecommendationSnapshotInput {
  id: string;
  diagnosisId: string;
  previewImageStatus: string;
}

export interface RunStylePreviewAttemptInput {
  client: StylePreviewAttemptClient;
  recommendation: StylePreviewAttemptRecommendation;
  owner: {
    userId: string | null;
    anonymousSessionId: string | null;
  };
  expectedStatus: StylePreviewExpectedStatus;
  finalPrompt: string;
  compilerVersion: number | null;
}

export interface ClaimedStylePreviewAttempt {
  correlationId: string;
  attemptNumber: number;
}

export type RunStylePreviewAttemptResult =
  | {
      status: "SKIPPED";
      reason: "INVALID_V2" | "CLAIM_LOST";
    }
  | {
      status: "COMPLETED";
      url: string;
      correlationId: string;
      attemptNumber: number;
    }
  | {
      status: "FAILED";
      errorCode: "STYLE_PREVIEW_PROVIDER_FAILED";
      correlationId: string;
      attemptNumber: number;
    }
  | {
      status: "PERSISTENCE_FAILED";
      errorCode:
        | "ATTEMPT_CLAIM_PERSISTENCE_FAILED"
        | "RESULT_PERSISTENCE_FAILED";
      correlationId?: string;
      attemptNumber?: number;
    };

export interface RunStylePreviewAttemptDependencies {
  generateImage?: (
    input: GenerateStylePreviewFromPromptInput
  ) => Promise<GenerateStylePreviewResult>;
  now?: () => Date;
  logError?: (audit: {
    correlationId: string;
    errorCode:
      | "ATTEMPT_CLAIM_PERSISTENCE_FAILED"
      | "RESULT_PERSISTENCE_FAILED";
  }) => void;
}

function promptHash(prompt: string): string {
  return `sha256:${createHash("sha256").update(prompt, "utf8").digest("hex")}`;
}

function isValidPromptSource(input: RunStylePreviewAttemptInput): boolean {
  if (input.recommendation.sourceMode === RecommendationSource.LEGACY_AI) {
    return input.compilerVersion === null && input.finalPrompt.trim().length > 0;
  }
  if (input.recommendation.sourceMode !== RecommendationSource.ARCHETYPE_V2) {
    return false;
  }

  const snapshot = parseV2RecommendationSnapshot(input.recommendation);
  if (!snapshot || input.compilerVersion !== STYLE_PREVIEW_COMPILER_VERSION) {
    return false;
  }
  const expectedPrompt = compileStylePreviewPrompt(
    buildCompiledStylePrompt(snapshot)
  );
  return input.finalPrompt === expectedPrompt;
}

export async function claimStylePreviewAttempt(
  input: RunStylePreviewAttemptInput,
  now: () => Date = () => new Date()
): Promise<ClaimedStylePreviewAttempt | null> {
  if (!isValidPromptSource(input)) return null;

  return input.client.$transaction(async (tx) => {
    const claim = await tx.styleRecommendation.updateMany({
      where: {
        id: input.recommendation.id,
        sourceMode: input.recommendation.sourceMode as RecommendationSource,
        previewImageStatus: input.expectedStatus,
      },
      data: {
        previewImageStatus: "PROCESSING",
        previewImagePrompt: input.finalPrompt,
        promptCompilerVersion: input.compilerVersion,
        previewAttemptCount: { increment: 1 },
        previewImageUrl: null,
        previewImageError: null,
      },
    });
    if (claim.count !== 1) return null;

    const recommendation = await tx.styleRecommendation.findUniqueOrThrow({
      where: { id: input.recommendation.id },
      select: { previewAttemptCount: true },
    });
    const job = await tx.aiJob.create({
      data: {
        userId: input.owner.userId,
        anonymousSessionId: input.owner.anonymousSessionId,
        diagnosisId: input.recommendation.diagnosisId,
        type: "STYLE_GENERATION",
        status: "RUNNING",
        input: {
          recommendationId: input.recommendation.id,
          attemptNumber: recommendation.previewAttemptCount,
          expectedStatus: input.expectedStatus,
          compilerVersion: input.compilerVersion,
          promptHash: promptHash(input.finalPrompt),
        } as Prisma.InputJsonValue,
        startedAt: now(),
      },
      select: { id: true },
    });

    return {
      correlationId: job.id,
      attemptNumber: recommendation.previewAttemptCount,
    };
  });
}

function attemptOutput(input: {
  claim: ClaimedStylePreviewAttempt;
  providerName: string;
  completionState: "COMPLETED" | "FAILED" | "PERSISTENCE_FAILED";
  storageState: "COMPLETED" | "FAILED" | "NOT_ATTEMPTED";
  errorCode?: "STYLE_PREVIEW_PROVIDER_FAILED" | "RESULT_PERSISTENCE_FAILED";
}): Prisma.InputJsonValue {
  return {
    stylePreviewAttempt: {
      correlationId: input.claim.correlationId,
      attemptNumber: input.claim.attemptNumber,
      providerName: input.providerName,
      completionState: input.completionState,
      storageState: input.storageState,
      recoveryIdentifier: null,
      ...(input.errorCode ? { errorCode: input.errorCode } : {}),
    },
  };
}

async function persistCompleted(
  input: RunStylePreviewAttemptInput,
  claim: ClaimedStylePreviewAttempt,
  result: GenerateStylePreviewResult,
  now: () => Date
): Promise<void> {
  await input.client.$transaction(async (tx) => {
    await tx.styleRecommendation.update({
      where: { id: input.recommendation.id },
      data: {
        previewImageStatus: "COMPLETED",
        previewImageUrl: result.url,
        previewImageError: null,
      },
    });
    await tx.aiJob.update({
      where: { id: claim.correlationId },
      data: {
        status: "COMPLETED",
        output: attemptOutput({
          claim,
          providerName: result.providerName,
          completionState: "COMPLETED",
          storageState: "COMPLETED",
        }),
        errorMessage: null,
        completedAt: now(),
      },
    });
  });
}

async function persistFailed(
  input: RunStylePreviewAttemptInput,
  claim: ClaimedStylePreviewAttempt,
  result: GenerateStylePreviewResult,
  now: () => Date
): Promise<"FAILED" | "PERSISTENCE_FAILED"> {
  const persistenceFailure = result.failureKind === "PERSISTENCE";
  const status = persistenceFailure ? "PERSISTENCE_FAILED" : "FAILED";
  const errorCode = persistenceFailure
    ? "RESULT_PERSISTENCE_FAILED"
    : "STYLE_PREVIEW_PROVIDER_FAILED";

  await input.client.$transaction(async (tx) => {
    await tx.styleRecommendation.update({
      where: { id: input.recommendation.id },
      data: {
        previewImageStatus: "FAILED",
        previewImageUrl: null,
        previewImageError: errorCode,
      },
    });
    await tx.aiJob.update({
      where: { id: claim.correlationId },
      data: {
        status,
        output: attemptOutput({
          claim,
          providerName: result.providerName,
          completionState: status,
          storageState: persistenceFailure ? "FAILED" : "NOT_ATTEMPTED",
          errorCode,
        }),
        errorMessage: errorCode,
        completedAt: now(),
      },
    });
  });
  return status;
}

async function markResultPersistenceFailed(
  input: RunStylePreviewAttemptInput,
  claim: ClaimedStylePreviewAttempt,
  providerName: string,
  storageState: "COMPLETED" | "FAILED" | "NOT_ATTEMPTED",
  now: () => Date,
  logError: NonNullable<RunStylePreviewAttemptDependencies["logError"]>
): Promise<void> {
  try {
    await input.client.aiJob.update({
      where: { id: claim.correlationId },
      data: {
        status: "PERSISTENCE_FAILED",
        output: attemptOutput({
          claim,
          providerName,
          completionState: "PERSISTENCE_FAILED",
          storageState,
          errorCode: "RESULT_PERSISTENCE_FAILED",
        }),
        errorMessage: "RESULT_PERSISTENCE_FAILED",
        completedAt: now(),
      },
    });
  } catch {
    logError({
      correlationId: claim.correlationId,
      errorCode: "RESULT_PERSISTENCE_FAILED",
    });
  }
}

export async function runStylePreviewAttempt(
  input: RunStylePreviewAttemptInput,
  dependencies: RunStylePreviewAttemptDependencies = {}
): Promise<RunStylePreviewAttemptResult> {
  if (!isValidPromptSource(input)) {
    return { status: "SKIPPED", reason: "INVALID_V2" };
  }

  const now = dependencies.now ?? (() => new Date());
  const logError = dependencies.logError ?? ((audit) => console.error(audit));
  let claim: ClaimedStylePreviewAttempt | null;
  try {
    claim = await claimStylePreviewAttempt(input, now);
  } catch {
    logError({
      correlationId: randomUUID(),
      errorCode: "ATTEMPT_CLAIM_PERSISTENCE_FAILED",
    });
    return {
      status: "PERSISTENCE_FAILED",
      errorCode: "ATTEMPT_CLAIM_PERSISTENCE_FAILED",
    };
  }
  if (!claim) return { status: "SKIPPED", reason: "CLAIM_LOST" };

  const generateImage =
    dependencies.generateImage ?? generateStylePreviewImageFromPrompt;
  let result: GenerateStylePreviewResult;
  try {
    result = await generateImage({
      diagnosisId: input.recommendation.diagnosisId,
      recommendationId: input.recommendation.id,
      prompt: input.finalPrompt,
    });
  } catch {
    result = {
      status: "FAILED",
      prompt: input.finalPrompt,
      providerName: "unknown",
      failureKind: "PROVIDER",
      error: "STYLE_PREVIEW_PROVIDER_FAILED",
    };
  }

  if (result.status === "COMPLETED" && result.url) {
    try {
      await persistCompleted(input, claim, result, now);
      return {
        status: "COMPLETED",
        url: result.url,
        correlationId: claim.correlationId,
        attemptNumber: claim.attemptNumber,
      };
    } catch {
      await markResultPersistenceFailed(
        input,
        claim,
        result.providerName,
        "COMPLETED",
        now,
        logError
      );
      return {
        status: "PERSISTENCE_FAILED",
        errorCode: "RESULT_PERSISTENCE_FAILED",
        correlationId: claim.correlationId,
        attemptNumber: claim.attemptNumber,
      };
    }
  }

  try {
    const persistedStatus = await persistFailed(input, claim, result, now);
    return persistedStatus === "PERSISTENCE_FAILED"
      ? {
          status: "PERSISTENCE_FAILED",
          errorCode: "RESULT_PERSISTENCE_FAILED",
          correlationId: claim.correlationId,
          attemptNumber: claim.attemptNumber,
        }
      : {
          status: "FAILED",
          errorCode: "STYLE_PREVIEW_PROVIDER_FAILED",
          correlationId: claim.correlationId,
          attemptNumber: claim.attemptNumber,
        };
  } catch {
    await markResultPersistenceFailed(
      input,
      claim,
      result.providerName,
      result.failureKind === "PERSISTENCE" ? "FAILED" : "NOT_ATTEMPTED",
      now,
      logError
    );
    return {
      status: "PERSISTENCE_FAILED",
      errorCode: "RESULT_PERSISTENCE_FAILED",
      correlationId: claim.correlationId,
      attemptNumber: claim.attemptNumber,
    };
  }
}
