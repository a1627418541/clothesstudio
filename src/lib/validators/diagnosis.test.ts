import { describe, expect, it } from "vitest";
import { diagnosisFormSchema } from "./diagnosis";

const validInput = {
  gender: "FEMALE" as const,
  age: 28,
  heightCm: 165,
  weightKg: 52,
  budgetTier: "FROM_500_TO_1000" as const,
  faceTryOnConsent: true,
  photoAssetIds: {
    FACE_FRONT: "front",
    FACE_SIDE: "side",
    FULL_BODY: "body",
  },
};

describe("diagnosisFormSchema marketplace fields", () => {
  it("accepts every approved total-outfit budget tier", () => {
    for (const budgetTier of [
      "UNDER_500",
      "FROM_500_TO_1000",
      "FROM_1000_TO_2000",
      "ABOVE_2000",
    ] as const) {
      expect(
        diagnosisFormSchema.parse({ ...validInput, budgetTier }).budgetTier
      ).toBe(budgetTier);
    }
  });

  it("rejects a missing or arbitrary budget tier", () => {
    const { budgetTier: _removed, ...withoutBudget } = validInput;
    expect(diagnosisFormSchema.safeParse(withoutBudget).success).toBe(false);
    expect(
      diagnosisFormSchema.safeParse({
        ...validInput,
        budgetTier: "NO_LIMIT",
      }).success
    ).toBe(false);
  });
});
