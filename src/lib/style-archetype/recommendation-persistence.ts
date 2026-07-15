import { Prisma } from "@prisma/client";
import { StyleAiOutput } from "@/lib/ai/style-ai-provider";
import {
  LegacyRecommendationDraft,
  RecommendationPlan,
  V2RecommendationDraft,
} from "./recommendation-plan";

export interface RecommendationPersistenceClient {
  $transaction<T>(
    operation: (tx: Prisma.TransactionClient) => Promise<T>
  ): Promise<T>;
}

export interface PersistRecommendationPlanInput {
  client: RecommendationPersistenceClient;
  diagnosisId: string;
  analysisOutput: StyleAiOutput;
  plan: RecommendationPlan;
}

function projectClothingAdvice(draft: V2RecommendationDraft): string {
  const { styleDNA } = draft.snapshot;
  return [
    styleDNA.clothingDNA,
    `Required items: ${styleDNA.requiredItems.join(", ")}.`,
    `Silhouette: ${styleDNA.silhouetteDNA}`,
  ].join("\n");
}

function projectAvoidTips(draft: V2RecommendationDraft): string[] {
  return [
    draft.snapshot.styleDNA.avoidDNA,
    ...draft.snapshot.styleDNA.forbiddenItems.map(
      (item) => `Avoid ${item}.`
    ),
  ];
}

function v2CreateData(
  diagnosisId: string,
  draft: V2RecommendationDraft
): Prisma.StyleRecommendationUncheckedCreateInput {
  const { snapshot } = draft;
  return {
    diagnosisId,
    title: snapshot.identity.name,
    description: snapshot.identity.description,
    summary: snapshot.identity.description,
    clothingAdvice: projectClothingAdvice(draft),
    hairstyleAdvice: snapshot.styleDNA.hairstyleDNA,
    shoesAdvice: snapshot.styleDNA.shoesDNA,
    colorPalette: [...snapshot.styleDNA.colorDNA],
    avoidTips: projectAvoidTips(draft),
    rank: snapshot.selection.rank,
    isPrimary: snapshot.selection.rank === 1,
    sourceMode: "ARCHETYPE_V2",
    archetypeId: snapshot.provenance.archetypeId,
    archetypeVersion: snapshot.archetypeVersion,
    archetypeSnapshot: snapshot as unknown as Prisma.InputJsonValue,
    matchScore: snapshot.selection.matchScore,
    promptCompilerVersion: null,
    previewImagePrompt: null,
  };
}

function legacyCreateData(
  diagnosisId: string,
  draft: LegacyRecommendationDraft
): Prisma.StyleRecommendationUncheckedCreateInput {
  return {
    diagnosisId,
    ...draft.recommendation,
    colorPalette: [...draft.recommendation.colorPalette],
    avoidTips: [...draft.recommendation.avoidTips],
    rank: draft.rank,
    isPrimary: draft.rank === 1,
    sourceMode: "LEGACY_AI",
    archetypeId: draft.archetypeId,
    archetypeVersion: null,
    archetypeSnapshot: Prisma.DbNull,
    matchScore: draft.matchScore,
    promptCompilerVersion: null,
    previewImagePrompt: null,
  };
}

function recommendationCreateData(
  diagnosisId: string,
  plan: RecommendationPlan
): Prisma.StyleRecommendationUncheckedCreateInput[] {
  return plan.mode === "ARCHETYPE_V2"
    ? plan.drafts.map((draft) => v2CreateData(diagnosisId, draft))
    : plan.drafts.map((draft) => legacyCreateData(diagnosisId, draft));
}

export async function persistRecommendationPlan(
  input: PersistRecommendationPlanInput
): Promise<unknown> {
  return input.client.$transaction(async (tx) => {
    const diagnosis = await tx.styleDiagnosis.update({
      where: { id: input.diagnosisId },
      data: {
        bodyType: input.analysisOutput.bodyType,
        faceShape: input.analysisOutput.faceShape,
        vibeKeywords: [...input.analysisOutput.vibeKeywords],
        summary: input.analysisOutput.summary,
        status: "PREVIEW_READY",
      },
    });

    const rows = recommendationCreateData(input.diagnosisId, input.plan);
    for (const data of rows) {
      await tx.styleRecommendation.create({ data });
    }

    return diagnosis;
  });
}
