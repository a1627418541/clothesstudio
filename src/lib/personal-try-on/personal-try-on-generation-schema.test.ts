import { describe, expect, it } from "vitest";
import { Prisma } from "@prisma/client";
import { readFileSync } from "fs";
import { join } from "path";

describe("PersonalTryOnGeneration schema", () => {
  it("defines the model with expected fields and unique recommendationId", () => {
    const model = Prisma.dmmf.datamodel.models.find(
      (m) => m.name === "PersonalTryOnGeneration"
    );
    expect(model).toBeDefined();
    const fieldNames = model!.fields.map((f) => f.name);
    expect(fieldNames).toEqual(
      expect.arrayContaining([
        "id",
        "recommendationId",
        "diagnosisId",
        "userId",
        "anonymousSessionId",
        "status",
        "prompt",
        "promptCompilerVersion",
        "imageUrl",
        "imageObjectKey",
        "provider",
        "error",
        "attemptCount",
        "createdAt",
        "updatedAt",
      ])
    );
    const schemaPath = join(process.cwd(), "prisma", "schema.prisma");
    const schema = readFileSync(schemaPath, "utf-8");
    const modelMatch = schema.match(
      /model PersonalTryOnGeneration \{[\s\S]*?\n\}/
    );
    expect(modelMatch).toBeDefined();
    expect(modelMatch![0]).toMatch(/recommendationId\s+String\s+@unique/);
  });
});
