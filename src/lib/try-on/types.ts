export type TryOnGarmentCategory = "TOP" | "BOTTOM" | "OUTERWEAR";
export type TryOnProductCategory = TryOnGarmentCategory | "HAT";
export type TryOnTrigger = "AUTO_PRIMARY" | "USER_REQUEST";
export type TryOnWorkflowStatusValue =
  | "NOT_REQUESTED"
  | "QUEUED"
  | "APPLYING_GARMENTS"
  | "APPLYING_HAT"
  | "RESTORING_IDENTITY"
  | "QUALITY_CHECKING"
  | "COMPLETED"
  | "FAILED"
  | "CANCELLED"
  | "EXPIRED";

export interface TryOnProductInput {
  category: TryOnProductCategory;
  imageUrl: string;
}

export interface VirtualTryOnProvider {
  name: string;
  applyGarment(input: {
    personImageUrl: string;
    productImageUrl: string;
    category: TryOnGarmentCategory;
  }): Promise<{ imageUrl: string }>;
  applyHat(input: {
    personImageUrl: string;
    productImageUrl: string;
  }): Promise<{ imageUrl: string }>;
}

export interface IdentityRestoreProvider {
  name: string;
  restore(input: {
    composedImageUrl: string;
    faceImageUrl: string;
  }): Promise<{ imageUrl: string }>;
}

export interface TryOnQualityResult {
  passed: boolean;
  identityScore: number;
  productFidelityScore: number;
}

export interface TryOnQualityProvider {
  evaluate(input: {
    imageUrl: string;
    faceImageUrl: string;
    productImageUrls: string[];
  }): Promise<TryOnQualityResult>;
}

export interface TryOnWorkflowPersistence {
  claimAttempt(input: {
    recommendationId: string;
    expectedStatuses: readonly string[];
    productSnapshotHash: string;
  }): Promise<{
    claimed: boolean;
    attemptNumber: number;
    productSnapshotHash?: string | null;
  }>;
  readConsent(diagnosisId: string): Promise<boolean>;
  setStatus(
    recommendationId: string,
    status: TryOnWorkflowStatusValue
  ): Promise<void>;
  persistCompleted(input: {
    recommendationId: string;
    imageUrl: string;
    identityScore: number;
    productFidelityScore: number;
    providerName: string;
    tryOnExpiresAt: Date | null;
  }): Promise<void>;
  persistFailed(input: {
    recommendationId: string;
    failureCode: string;
  }): Promise<void>;
  persistCancelled(input: {
    recommendationId: string;
    reason: string;
  }): Promise<void>;
}

export interface RunTryOnWorkflowInput {
  diagnosisId: string;
  recommendationId: string;
  trigger: TryOnTrigger;
  isPrimary: boolean;
  expectedStatuses: readonly TryOnWorkflowStatusValue[];
  consent: boolean;
  fullBodyImageUrl: string;
  faceImageUrl: string;
  productSnapshotHash: string;
  products: TryOnProductInput[];
  diagnosisCreatedAt?: Date;
  isAnonymous?: boolean;
}

export interface TryOnWorkflowDependencies {
  virtualTryOn: VirtualTryOnProvider;
  identityRestore: IdentityRestoreProvider;
  quality: TryOnQualityProvider;
  persistence: TryOnWorkflowPersistence;
}

export type TryOnWorkflowResult =
  | { status: "COMPLETED"; attemptNumber: number }
  | { status: "FAILED"; reason: string }
  | { status: "CANCELLED"; reason: string }
  | { status: "SKIPPED"; reason: string };
