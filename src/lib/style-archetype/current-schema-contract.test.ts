import {
  AiJobStatus,
  AiJobType,
  ImageStatus,
  MacroCategory,
  Prisma,
  RecommendationSource,
} from "@prisma/client";
import { describe, expect, expectTypeOf, it } from "vitest";

function getModel(name: string) {
  const model = Prisma.dmmf.datamodel.models.find((item) => item.name === name);
  expect(model).toBeDefined();
  return model!;
}

describe("Sprint 3.8 current Prisma contracts", () => {
  it("reuses the existing AiJob and image status values", () => {
    expect(Object.values(AiJobStatus)).toContain("PERSISTENCE_FAILED");
    expect(Object.values(AiJobType)).toContain("STYLE_GENERATION");
    expect(Object.values(ImageStatus)).toEqual([
      "PENDING",
      "PROCESSING",
      "COMPLETED",
      "FAILED",
    ]);
  });

  it("keeps the current StyleRecommendation field names", () => {
    const fieldNames = getModel("StyleRecommendation").fields.map(
      (field) => field.name
    );

    expect(fieldNames).toContain("colorPalette");
    expect(fieldNames).not.toContain("recommendedColors");
    expect(fieldNames).toEqual(
      expect.arrayContaining([
        "archetypeId",
        "matchScore",
        "previewImageUrl",
        "previewImageStatus",
        "previewImagePrompt",
        "previewImageError",
      ])
    );
  });

  it("keeps AiJob input and output as nullable Json fields", () => {
    const fields = getModel("AiJob").fields;

    for (const name of ["input", "output"]) {
      const field = fields.find((item) => item.name === name);
      expect(field).toBeDefined();
      expect(field).toMatchObject({
        kind: "scalar",
        type: "Json",
      });
    }

    expectTypeOf<Prisma.AiJobCreateInput["input"]>().toEqualTypeOf<
      Prisma.NullableJsonNullValueInput | Prisma.InputJsonValue | undefined
    >();
    expectTypeOf<Prisma.AiJobCreateInput["output"]>().toEqualTypeOf<
      Prisma.NullableJsonNullValueInput | Prisma.InputJsonValue | undefined
    >();

    const withoutJson: Prisma.AiJobCreateInput = {
      type: AiJobType.DIAGNOSIS_ANALYSIS,
    };
    expect(withoutJson.input).toBeUndefined();
    expect(withoutJson.output).toBeUndefined();
  });

  it("defines the approved Archetype V2 enums", () => {
    expect(Object.values(RecommendationSource)).toEqual([
      "LEGACY_AI",
      "ARCHETYPE_V2",
    ]);
    expect(Object.values(MacroCategory)).toEqual([
      "DAILY_CLEAN",
      "CLASSIC_PREMIUM",
      "BUSINESS_FORMAL",
      "URBAN_STREET",
      "ARTISTIC_MINIMAL",
      "OUTDOOR_FUNCTIONAL",
      "ROMANTIC_SOFT",
      "SPORT_ACTIVE",
      "TREND_YOUTH",
    ]);
  });

  it("adds only the approved V2 recommendation fields", () => {
    const fieldNames = getModel("StyleRecommendation").fields.map(
      (field) => field.name
    );

    expect(fieldNames).toEqual(
      expect.arrayContaining([
        "sourceMode",
        "archetypeVersion",
        "archetypeSnapshot",
        "promptCompilerVersion",
        "previewAttemptCount",
      ])
    );
    expect(fieldNames).not.toContain("recommendedColors");
  });

  it("adds the complete structured V2 archetype field set", () => {
    const fieldNames = getModel("StyleArchetype").fields.map(
      (field) => field.name
    );

    expect(fieldNames).toEqual(
      expect.arrayContaining([
        "macroCategory",
        "requiredItems",
        "forbiddenItems",
        "silhouetteDNA",
        "sceneMood",
        "vibeAliases",
        "clothingMatchTerms",
        "sceneMatchTerms",
        "personalityTerms",
        "preferredBodyTypes",
        "preferredFaceShapes",
        "ageMin",
        "ageMax",
      ])
    );
  });
});
