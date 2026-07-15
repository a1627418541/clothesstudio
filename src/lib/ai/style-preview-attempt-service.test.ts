import { describe, expect, it, vi } from "vitest";
import { V2_ARCHETYPE_MANIFEST } from "@/lib/style-archetype/archetype-v2-manifest";
import { buildV2RecommendationSnapshot } from "@/lib/style-archetype/recommendation-snapshot";
import {
  STYLE_PREVIEW_COMPILER_VERSION,
  buildCompiledStylePrompt,
  compileStylePreviewPrompt,
} from "./style-preview-compiler";
import {
  StylePreviewAttemptClient,
  claimStylePreviewAttempt,
  runStylePreviewAttempt,
} from "./style-preview-attempt-service";

type Status = "PENDING" | "PROCESSING" | "COMPLETED" | "FAILED";

interface FakeRow {
  id: string;
  sourceMode: "ARCHETYPE_V2" | "LEGACY_AI";
  previewImageStatus: Status;
  previewImagePrompt: string | null;
  promptCompilerVersion: number | null;
  previewAttemptCount: number;
  previewImageUrl: string | null;
  previewImageError: string | null;
}

interface FakeJob {
  id: string;
  status: string;
  input: Record<string, unknown>;
  output: Record<string, unknown> | null;
  errorMessage: string | null;
}

function createFakeClient(
  initialStatus: Status,
  options: { failTransaction?: number } = {}
) {
  const state: {
    row: FakeRow;
    jobs: FakeJob[];
    whereClauses: Array<Record<string, unknown>>;
    transactionCalls: number;
  } = {
    row: {
      id: "recommendation-1",
      sourceMode: "ARCHETYPE_V2",
      previewImageStatus: initialStatus,
      previewImagePrompt: null,
      promptCompilerVersion: null,
      previewAttemptCount: 0,
      previewImageUrl: null,
      previewImageError: null,
    },
    jobs: [],
    whereClauses: [],
    transactionCalls: 0,
  };

  const updateMany = vi.fn(async (args: {
    where: Record<string, unknown>;
    data: Record<string, unknown>;
  }) => {
    state.whereClauses.push(args.where);
    const matches =
      args.where.id === state.row.id &&
      args.where.previewImageStatus === state.row.previewImageStatus &&
      args.where.sourceMode === state.row.sourceMode;
    if (!matches) return { count: 0 };

    const attemptIncrement = args.data.previewAttemptCount as { increment: number };
    state.row = {
      ...state.row,
      previewImageStatus: args.data.previewImageStatus as Status,
      previewImagePrompt: args.data.previewImagePrompt as string,
      promptCompilerVersion: args.data.promptCompilerVersion as number | null,
      previewAttemptCount:
        state.row.previewAttemptCount + attemptIncrement.increment,
      previewImageUrl: (args.data.previewImageUrl as string | null) ?? null,
      previewImageError: (args.data.previewImageError as string | null) ?? null,
    };
    return { count: 1 };
  });

  const updateRecommendation = vi.fn(async (args: {
    data: Record<string, unknown>;
  }) => {
    state.row = { ...state.row, ...args.data } as FakeRow;
    return state.row;
  });

  const createJob = vi.fn(async (args: {
    data: Record<string, unknown>;
  }) => {
    const job: FakeJob = {
      id: `job-${state.jobs.length + 1}`,
      status: String(args.data.status),
      input: args.data.input as Record<string, unknown>,
      output: null,
      errorMessage: null,
    };
    state.jobs.push(job);
    return job;
  });

  const updateJob = vi.fn(async (args: {
    where: { id: string };
    data: Record<string, unknown>;
  }) => {
    const job = state.jobs.find((candidate) => candidate.id === args.where.id);
    if (!job) throw new Error("Job not found");
    Object.assign(job, args.data);
    return job;
  });

  const tx = {
    styleRecommendation: {
      updateMany,
      findUniqueOrThrow: vi.fn(async () => ({
        previewAttemptCount: state.row.previewAttemptCount,
      })),
      update: updateRecommendation,
    },
    aiJob: { create: createJob, update: updateJob },
  };

  const client = {
    $transaction: vi.fn(async (operation: (value: typeof tx) => Promise<unknown>) => {
      state.transactionCalls += 1;
      if (options.failTransaction === state.transactionCalls) {
        throw new Error("database transaction failed");
      }
      return operation(tx);
    }),
    aiJob: { update: updateJob },
  } as unknown as StylePreviewAttemptClient;

  return { client, state, updateMany, updateRecommendation, createJob, updateJob };
}

function v2Input(status: Status = "PENDING") {
  const archetype = V2_ARCHETYPE_MANIFEST.find(
    (candidate) => candidate.slug === "old-money"
  )!;
  const snapshot = buildV2RecommendationSnapshot({
    archetype,
    rank: 1,
    matchScore: 88,
    subjectContext: {
      genderPresentation: "MASCULINE",
      bodyTypeHint: "rectangle",
      faceShapeHint: "oval",
      ageBand: "25-34",
    },
  });
  const finalPrompt = compileStylePreviewPrompt(
    buildCompiledStylePrompt(snapshot)
  );
  return {
    recommendation: {
      id: "recommendation-1",
      diagnosisId: "diagnosis-1",
      sourceMode: "ARCHETYPE_V2" as const,
      archetypeVersion: snapshot.archetypeVersion,
      archetypeSnapshot: snapshot,
      archetypeId: snapshot.provenance.archetypeId,
      matchScore: snapshot.selection.matchScore,
      rank: snapshot.selection.rank,
      previewImageStatus: status,
    },
    owner: {
      userId: "user-1",
      anonymousSessionId: null,
    },
    finalPrompt,
    compilerVersion: STYLE_PREVIEW_COMPILER_VERSION,
  };
}

const completedImage = (prompt: string) => ({
  status: "COMPLETED" as const,
  prompt,
  providerName: "mock",
  url: "https://r2.example.com/result.png",
});

describe("style preview attempt exact CAS and audit", () => {
  it("claims only exact PENDING and persists audit before provider execution", async () => {
    const fake = createFakeClient("PENDING");
    const input = v2Input();
    const generateImage = vi.fn(async ({ prompt }: { prompt: string }) => {
      expect(fake.state.row).toMatchObject({
        previewImageStatus: "PROCESSING",
        previewImagePrompt: prompt,
        promptCompilerVersion: 1,
        previewAttemptCount: 1,
      });
      expect(fake.state.jobs[0]).toMatchObject({ status: "RUNNING" });
      return completedImage(prompt);
    });

    const result = await runStylePreviewAttempt(
      { ...input, client: fake.client, expectedStatus: "PENDING" },
      { generateImage }
    );

    expect(fake.state.whereClauses[0]).toEqual({
      id: "recommendation-1",
      sourceMode: "ARCHETYPE_V2",
      previewImageStatus: "PENDING",
    });
    expect(fake.state.whereClauses[0]).not.toHaveProperty("previewImageStatus.in");
    expect(fake.state.jobs[0].input).toMatchObject({
      recommendationId: "recommendation-1",
      attemptNumber: 1,
      expectedStatus: "PENDING",
      compilerVersion: 1,
    });
    expect(fake.state.jobs[0].input).toHaveProperty("promptHash");
    expect(JSON.stringify(fake.state.jobs[0].input)).not.toContain(
      input.finalPrompt
    );
    expect(generateImage).toHaveBeenCalledWith({
      diagnosisId: "diagnosis-1",
      recommendationId: "recommendation-1",
      prompt: input.finalPrompt,
    });
    expect(result).toMatchObject({
      status: "COMPLETED",
      correlationId: "job-1",
      attemptNumber: 1,
    });
    expect(fake.state.row).toMatchObject({
      previewImageStatus: "COMPLETED",
      previewImageUrl: "https://r2.example.com/result.png",
      previewImagePrompt: input.finalPrompt,
      promptCompilerVersion: 1,
    });
    expect(fake.state.jobs[0]).toMatchObject({ status: "COMPLETED" });
  });

  it("allows explicit retry only from exact FAILED and replaces latest-attempt fields", async () => {
    const fake = createFakeClient("FAILED");
    fake.state.row.previewImagePrompt = "old prompt";
    fake.state.row.promptCompilerVersion = 1;
    fake.state.row.previewAttemptCount = 2;
    const input = v2Input("FAILED");
    const generateImage = vi.fn(async ({ prompt }: { prompt: string }) =>
      completedImage(prompt)
    );

    const result = await runStylePreviewAttempt(
      { ...input, client: fake.client, expectedStatus: "FAILED" },
      { generateImage }
    );

    expect(fake.state.whereClauses[0].previewImageStatus).toBe("FAILED");
    expect(fake.state.row.previewAttemptCount).toBe(3);
    expect(fake.state.row.previewImagePrompt).toBe(input.finalPrompt);
    expect(result).toMatchObject({ attemptNumber: 3 });
    expect(generateImage).toHaveBeenCalledOnce();
  });

  it("allows one provider call for concurrent attempts", async () => {
    const fake = createFakeClient("PENDING");
    const input = v2Input();
    const generateImage = vi.fn(async ({ prompt }: { prompt: string }) =>
      completedImage(prompt)
    );

    const results = await Promise.all([
      runStylePreviewAttempt(
        { ...input, client: fake.client, expectedStatus: "PENDING" },
        { generateImage }
      ),
      runStylePreviewAttempt(
        { ...input, client: fake.client, expectedStatus: "PENDING" },
        { generateImage }
      ),
    ]);

    expect(generateImage).toHaveBeenCalledOnce();
    expect(results.map((result) => result.status).sort()).toEqual([
      "COMPLETED",
      "SKIPPED",
    ]);
  });

  it.each(["PROCESSING", "COMPLETED"] as const)(
    "does not call provider when current status is %s",
    async (status) => {
      const fake = createFakeClient(status);
      const generateImage = vi.fn();
      const result = await runStylePreviewAttempt(
        { ...v2Input(status), client: fake.client, expectedStatus: "PENDING" },
        { generateImage }
      );

      expect(result).toMatchObject({ status: "SKIPPED" });
      expect(generateImage).not.toHaveBeenCalled();
    }
  );

  it("rejects invalid V2 before claim and preserves latest attempt audit", async () => {
    const fake = createFakeClient("FAILED");
    fake.state.row.previewImagePrompt = "preserve me";
    const input = v2Input("FAILED");
    const invalidSnapshot = {
      ...input.recommendation.archetypeSnapshot,
      imagePromptTemplate: "do not execute",
    };
    const generateImage = vi.fn();

    const result = await runStylePreviewAttempt(
      {
        ...input,
        client: fake.client,
        expectedStatus: "FAILED",
        recommendation: {
          ...input.recommendation,
          archetypeSnapshot: invalidSnapshot,
        },
      },
      { generateImage }
    );

    expect(result).toEqual({ status: "SKIPPED", reason: "INVALID_V2" });
    expect(fake.state.transactionCalls).toBe(0);
    expect(fake.state.row.previewImagePrompt).toBe("preserve me");
    expect(generateImage).not.toHaveBeenCalled();
  });

  it("enforces V2 validation at the exported claim boundary", async () => {
    const fake = createFakeClient("PENDING");
    const input = v2Input();
    const claim = await claimStylePreviewAttempt({
      ...input,
      client: fake.client,
      expectedStatus: "PENDING",
      finalPrompt: `${input.finalPrompt}\nUNVALIDATED SUFFIX`,
    });

    expect(claim).toBeNull();
    expect(fake.state.transactionCalls).toBe(0);
    expect(fake.state.row.previewImagePrompt).toBeNull();
  });

  it("does not call provider when atomic Prompt audit persistence fails", async () => {
    const fake = createFakeClient("PENDING", { failTransaction: 1 });
    const generateImage = vi.fn();
    const result = await runStylePreviewAttempt(
      { ...v2Input(), client: fake.client, expectedStatus: "PENDING" },
      { generateImage }
    );

    expect(result).toMatchObject({
      status: "PERSISTENCE_FAILED",
      errorCode: "ATTEMPT_CLAIM_PERSISTENCE_FAILED",
    });
    expect(generateImage).not.toHaveBeenCalled();
  });
});

describe("style preview attempt results and cost protection", () => {
  it("preserves Prompt/version and marks FAILED when the provider fails", async () => {
    const fake = createFakeClient("PENDING");
    const input = v2Input();
    const result = await runStylePreviewAttempt(
      { ...input, client: fake.client, expectedStatus: "PENDING" },
      {
        generateImage: vi.fn().mockResolvedValue({
          status: "FAILED",
          prompt: input.finalPrompt,
          providerName: "mock",
          failureKind: "PROVIDER",
          error: "provider unavailable",
        }),
      }
    );

    expect(result).toMatchObject({
      status: "FAILED",
      errorCode: "STYLE_PREVIEW_PROVIDER_FAILED",
    });
    expect(fake.state.row).toMatchObject({
      previewImageStatus: "FAILED",
      previewImagePrompt: input.finalPrompt,
      promptCompilerVersion: 1,
    });
    expect(fake.state.jobs[0]).toMatchObject({ status: "FAILED" });
  });

  it("marks the attempt PERSISTENCE_FAILED when durable image storage fails", async () => {
    const fake = createFakeClient("PENDING");
    const input = v2Input();
    const result = await runStylePreviewAttempt(
      { ...input, client: fake.client, expectedStatus: "PENDING" },
      {
        generateImage: vi.fn().mockResolvedValue({
          status: "FAILED",
          prompt: input.finalPrompt,
          providerName: "mock",
          failureKind: "PERSISTENCE",
          error: "R2 unavailable",
        }),
      }
    );

    expect(result).toMatchObject({
      status: "PERSISTENCE_FAILED",
      errorCode: "RESULT_PERSISTENCE_FAILED",
    });
    expect(fake.state.row.previewImageStatus).toBe("FAILED");
    expect(fake.state.jobs[0]).toMatchObject({
      status: "PERSISTENCE_FAILED",
      errorMessage: "RESULT_PERSISTENCE_FAILED",
    });
  });

  it("does not automatically call provider again after result DB persistence fails", async () => {
    const fake = createFakeClient("PENDING", { failTransaction: 2 });
    const input = v2Input();
    const generateImage = vi.fn(async ({ prompt }: { prompt: string }) =>
      completedImage(prompt)
    );

    const first = await runStylePreviewAttempt(
      { ...input, client: fake.client, expectedStatus: "PENDING" },
      { generateImage }
    );
    const refresh = await runStylePreviewAttempt(
      { ...input, client: fake.client, expectedStatus: "PENDING" },
      { generateImage }
    );

    expect(first).toMatchObject({
      status: "PERSISTENCE_FAILED",
      errorCode: "RESULT_PERSISTENCE_FAILED",
    });
    expect(refresh).toMatchObject({ status: "SKIPPED" });
    expect(generateImage).toHaveBeenCalledOnce();
    expect(fake.state.jobs[0]).toMatchObject({ status: "PERSISTENCE_FAILED" });
    expect(fake.state.jobs[0].output).toMatchObject({
      stylePreviewAttempt: {
        completionState: "PERSISTENCE_FAILED",
        storageState: "COMPLETED",
        errorCode: "RESULT_PERSISTENCE_FAILED",
      },
    });
  });
});
