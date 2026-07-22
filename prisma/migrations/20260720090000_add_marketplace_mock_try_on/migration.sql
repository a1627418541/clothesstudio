-- CreateEnum
CREATE TYPE "BudgetTier" AS ENUM ('UNDER_500', 'FROM_500_TO_1000', 'FROM_1000_TO_2000', 'ABOVE_2000');

-- CreateEnum
CREATE TYPE "MarketplacePlatform" AS ENUM ('TAOBAO', 'JD');

-- CreateEnum
CREATE TYPE "MarketplaceProductCategory" AS ENUM ('TOP', 'BOTTOM', 'OUTERWEAR', 'HAT');

-- CreateEnum
CREATE TYPE "ProductAvailabilityStatus" AS ENUM ('AVAILABLE', 'UNAVAILABLE', 'UNKNOWN');

-- CreateEnum
CREATE TYPE "ProductPlanStatus" AS ENUM ('PENDING', 'READY', 'FAILED', 'STALE');

-- CreateEnum
CREATE TYPE "TryOnWorkflowStatus" AS ENUM ('NOT_REQUESTED', 'QUEUED', 'APPLYING_GARMENTS', 'APPLYING_HAT', 'RESTORING_IDENTITY', 'QUALITY_CHECKING', 'COMPLETED', 'FAILED', 'CANCELLED', 'EXPIRED');

-- AlterTable
ALTER TABLE "StyleDiagnosis"
ADD COLUMN "budgetTier" "BudgetTier" NOT NULL DEFAULT 'FROM_500_TO_1000',
ADD COLUMN "faceTryOnRevokedAt" TIMESTAMP(3);

-- Require future creates to provide an explicit budget tier after existing rows are backfilled.
ALTER TABLE "StyleDiagnosis" ALTER COLUMN "budgetTier" DROP DEFAULT;

-- AlterTable
ALTER TABLE "StyleRecommendation"
ADD COLUMN "marketplacePlatform" "MarketplacePlatform",
ADD COLUMN "productTotalCents" INTEGER,
ADD COLUMN "productPlanStatus" "ProductPlanStatus" NOT NULL DEFAULT 'PENDING',
ADD COLUMN "tryOnWorkflowStatus" "TryOnWorkflowStatus" NOT NULL DEFAULT 'NOT_REQUESTED',
ADD COLUMN "tryOnAttemptCount" INTEGER NOT NULL DEFAULT 0,
ADD COLUMN "tryOnFailureCode" TEXT,
ADD COLUMN "tryOnProvider" TEXT,
ADD COLUMN "identityScore" DOUBLE PRECISION,
ADD COLUMN "productFidelityScore" DOUBLE PRECISION,
ADD COLUMN "tryOnExpiresAt" TIMESTAMP(3),
ADD COLUMN "tryOnProductSnapshotHash" TEXT;

-- CreateTable
CREATE TABLE "RecommendationProduct" (
  "id" TEXT NOT NULL,
  "recommendationId" TEXT NOT NULL,
  "platform" "MarketplacePlatform" NOT NULL,
  "externalProductId" TEXT NOT NULL,
  "externalSkuId" TEXT NOT NULL,
  "category" "MarketplaceProductCategory" NOT NULL,
  "title" TEXT NOT NULL,
  "imageUrl" TEXT NOT NULL,
  "purchaseUrl" TEXT NOT NULL,
  "priceCents" INTEGER NOT NULL,
  "currency" TEXT NOT NULL DEFAULT 'CNY',
  "sellerName" TEXT NOT NULL,
  "color" TEXT NOT NULL,
  "variantLabel" TEXT NOT NULL,
  "isOptional" BOOLEAN NOT NULL DEFAULT false,
  "availabilityStatus" "ProductAvailabilityStatus" NOT NULL DEFAULT 'AVAILABLE',
  "snapshotAt" TIMESTAMP(3) NOT NULL,
  "position" INTEGER NOT NULL,
  "rawSnapshot" JSONB,
  "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
  "updatedAt" TIMESTAMP(3) NOT NULL,

  CONSTRAINT "RecommendationProduct_pkey" PRIMARY KEY ("id")
);

-- CreateIndex
CREATE UNIQUE INDEX "RecommendationProduct_recommendationId_position_key" ON "RecommendationProduct"("recommendationId", "position");

-- CreateIndex
CREATE INDEX "RecommendationProduct_recommendationId_platform_idx" ON "RecommendationProduct"("recommendationId", "platform");

-- CreateIndex
CREATE INDEX "RecommendationProduct_externalProductId_externalSkuId_idx" ON "RecommendationProduct"("externalProductId", "externalSkuId");

-- AddForeignKey
ALTER TABLE "RecommendationProduct" ADD CONSTRAINT "RecommendationProduct_recommendationId_fkey" FOREIGN KEY ("recommendationId") REFERENCES "StyleRecommendation"("id") ON DELETE CASCADE ON UPDATE CASCADE;
