import type {
  IdentityRestoreProvider,
  TryOnGarmentCategory,
  TryOnQualityProvider,
  TryOnQualityResult,
  VirtualTryOnProvider,
} from "./types";

export const MOCK_TRY_ON_DISCLOSURE = "MOCK" as const;

export interface MockAppliedLayer {
  category: TryOnGarmentCategory | "HAT";
  productImageUrl: string;
}

export function createMockVirtualTryOnProvider(): VirtualTryOnProvider & {
  appliedLayers: MockAppliedLayer[];
  disclosure: typeof MOCK_TRY_ON_DISCLOSURE;
} {
  const appliedLayers: MockAppliedLayer[] = [];
  return {
    name: "mock",
    disclosure: MOCK_TRY_ON_DISCLOSURE,
    appliedLayers,
    async applyGarment(input) {
      appliedLayers.push({
        category: input.category,
        productImageUrl: input.productImageUrl,
      });
      return { imageUrl: input.personImageUrl };
    },
    async applyHat(input) {
      appliedLayers.push({
        category: "HAT",
        productImageUrl: input.productImageUrl,
      });
      return { imageUrl: input.personImageUrl };
    },
  };
}

export function createMockIdentityRestoreProvider(): IdentityRestoreProvider {
  return {
    name: "mock",
    async restore(input) {
      return { imageUrl: input.composedImageUrl };
    },
  };
}

export function createMockTryOnQualityProvider(
  result: TryOnQualityResult = {
    passed: true,
    identityScore: 1,
    productFidelityScore: 1,
  }
): TryOnQualityProvider {
  return {
    async evaluate() {
      return { ...result };
    },
  };
}
