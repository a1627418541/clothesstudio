import { Prisma, RecommendationSource } from "@prisma/client";
import { describe, expect, it, vi } from "vitest";
import { StyleAiOutput } from "@/lib/ai/style-ai-provider";
import { V2_ARCHETYPE_MANIFEST } from "./archetype-v2-manifest";
import { buildRecommendationPlan } from "./recommendation-plan";
import {
  persistRecommendationPlan,
  RecommendationPersistenceClient,
} from "./recommendation-persistence";

const output: StyleAiOutput = {
  bodyType: "rectangle",
  faceShape: "oval",
  vibeKeywords: ["old money", "business formal", "streetwear"],
  summary: "Quiet luxury tailoring with formal and street alternatives.",
  recommendations: [1, 2, 3].map((rank) => ({
    title: `Legacy ${rank}`,
    description: `Legacy description ${rank}`,
    summary: `Legacy summary ${rank}`,
    clothingAdvice: `Legacy clothing ${rank}`,
    hairstyleAdvice: `Legacy hair ${rank}`,
    shoesAdvice: `Legacy shoes ${rank}`,
    colorPalette: ["black", "white"],
    avoidTips: [`Legacy avoid ${rank}`],
  })),
};

function plan(featureFlagValue = "true") {
  return buildRecommendationPlan({
    featureFlagValue,
    diagnosisAnalysis: {
      gender: "MALE",
      age: 31,
      heightCm: 178,
      weightKg: 72,
      bodyType: output.bodyType,
      faceShape: output.faceShape,
      vibeKeywords: output.vibeKeywords,
      diagnosisSummary: output.summary,
    },
    archetypes: V2_ARCHETYPE_MANIFEST,
    legacyRecommendations: output.recommendations,
  });
}

interface TransactionFixtureOptions {
  failCreateAt?: number;
  transactionError?: Error;
  diagnosisError?: Error;
}

function transactionFixture(options: TransactionFixtureOptions = {}) {
  const committed: Prisma.StyleRecommendationUncheckedCreateInput[] = [];
  const createCalls: Prisma.StyleRecommendationUncheckedCreateInput[] = [];
  const diagnosisUpdates: Prisma.StyleDiagnosisUpdateArgs[] = [];
  let createIndex = 0;

  const client: RecommendationPersistenceClient = {
    async $transaction(operation) {
      if (options.transactionError) throw options.transactionError;
      const staged: Prisma.StyleRecommendationUncheckedCreateInput[] = [];
      const tx = {
        styleDiagnosis: {
          update: vi.fn(async (args: Prisma.StyleDiagnosisUpdateArgs) => {
            diagnosisUpdates.push(args);
            if (options.diagnosisError) throw options.diagnosisError;
            return { id: "diagnosis-1", status: "PREVIEW_READY" };
          }),
        },
        styleRecommendation: {
          create: vi.fn(async (args: {
            data: Prisma.StyleRecommendationUncheckedCreateInput;
          }) => {
            createIndex += 1;
            createCalls.push(args.data);
            if (options.failCreateAt === createIndex) {
              throw new Error(`create ${createIndex} failed`);
            }
            staged.push(args.data);
            return { id: `recommendation-${createIndex}`, ...args.data };
          }),
        },
      };
      try {
        const result = await operation(
          tx as unknown as Prisma.TransactionClient
        );
        committed.push(...staged);
        return result;
      } catch (error) {
        throw error;
      }
    },
  };

  return { client, committed, createCalls, diagnosisUpdates };
}

describe("persistRecommendationPlan", () => {
  it("writes three V2 rows and diagnosis analysis atomically from snapshots", async () => {
    const selectedPlan = plan();
    if (selectedPlan.mode !== RecommendationSource.ARCHETYPE_V2) {
      throw new Error("Expected V2 plan");
    }
    const fixture = transactionFixture();

    const diagnosis = await persistRecommendationPlan({
      client: fixture.client,
      diagnosisId: "diagnosis-1",
      analysisOutput: output,
      plan: selectedPlan,
    });

    expect(diagnosis).toMatchObject({ id: "diagnosis-1", status: "PREVIEW_READY" });
    expect(fixture.diagnosisUpdates).toHaveLength(1);
    expect(fixture.diagnosisUpdates[0]).toMatchObject({
      where: { id: "diagnosis-1" },
      data: {
        bodyType: output.bodyType,
        faceShape: output.faceShape,
        vibeKeywords: output.vibeKeywords,
        summary: output.summary,
        status: "PREVIEW_READY",
      },
    });
    expect(fixture.committed).toHaveLength(3);

    fixture.committed.forEach((row, index) => {
      const snapshot = selectedPlan.drafts[index].snapshot;
      expect(row).toMatchObject({
        diagnosisId: "diagnosis-1",
        sourceMode: RecommendationSource.ARCHETYPE_V2,
        rank: index + 1,
        isPrimary: index === 0,
        archetypeId: snapshot.provenance.archetypeId,
        archetypeVersion: snapshot.archetypeVersion,
        matchScore: snapshot.selection.matchScore,
        title: snapshot.identity.name,
        description: snapshot.identity.description,
        summary: snapshot.identity.description,
        hairstyleAdvice: snapshot.styleDNA.hairstyleDNA,
        shoesAdvice: snapshot.styleDNA.shoesDNA,
        colorPalette: snapshot.styleDNA.colorDNA,
        promptCompilerVersion: null,
        previewImagePrompt: null,
      });
      expect(row.clothingAdvice).toContain(snapshot.styleDNA.clothingDNA);
      expect(row.clothingAdvice).toContain(snapshot.styleDNA.silhouetteDNA);
      expect(row.avoidTips).toContain(snapshot.styleDNA.avoidDNA);
      expect(row.archetypeSnapshot).toEqual(snapshot);
    });
  });

  it("writes a chosen legacy fallback as three legacy rows in one transaction", async () => {
    const selectedPlan = plan("false");
    if (selectedPlan.mode !== RecommendationSource.LEGACY_AI) {
      throw new Error("Expected legacy plan");
    }
    const fixture = transactionFixture();

    await persistRecommendationPlan({
      client: fixture.client,
      diagnosisId: "diagnosis-1",
      analysisOutput: output,
      plan: selectedPlan,
    });

    expect(fixture.committed).toHaveLength(3);
    expect(fixture.committed.map((row) => row.sourceMode)).toEqual([
      "LEGACY_AI", "LEGACY_AI", "LEGACY_AI",
    ]);
    expect(fixture.committed.map((row) => row.title)).toEqual([
      "Legacy 1", "Legacy 2", "Legacy 3",
    ]);
    expect(
      fixture.committed.every(
        (row) => row.archetypeSnapshot === Prisma.DbNull
      )
    ).toBe(true);
  });

  it.each([2, 3])(
    "rolls back every staged row when recommendation create %s fails",
    async (failCreateAt) => {
      const selectedPlan = plan();
      const fixture = transactionFixture({ failCreateAt });

      await expect(
        persistRecommendationPlan({
          client: fixture.client,
          diagnosisId: "diagnosis-1",
          analysisOutput: output,
          plan: selectedPlan,
        })
      ).rejects.toThrow(`create ${failCreateAt} failed`);

      expect(fixture.committed).toEqual([]);
      expect(fixture.createCalls.some((row) => row.sourceMode === "LEGACY_AI")).toBe(false);
    }
  );

  it("propagates transaction and diagnosis update failures without legacy persistence", async () => {
    const selectedPlan = plan();
    const transactionError = new Error("Neon unavailable");
    const unavailable = transactionFixture({ transactionError });
    await expect(
      persistRecommendationPlan({
        client: unavailable.client,
        diagnosisId: "diagnosis-1",
        analysisOutput: output,
        plan: selectedPlan,
      })
    ).rejects.toBe(transactionError);
    expect(unavailable.createCalls).toEqual([]);

    const diagnosisError = new Error("diagnosis update failed");
    const updateFailure = transactionFixture({ diagnosisError });
    await expect(
      persistRecommendationPlan({
        client: updateFailure.client,
        diagnosisId: "diagnosis-1",
        analysisOutput: output,
        plan: selectedPlan,
      })
    ).rejects.toBe(diagnosisError);
    expect(updateFailure.committed).toEqual([]);
    expect(updateFailure.createCalls).toEqual([]);
  });
});
