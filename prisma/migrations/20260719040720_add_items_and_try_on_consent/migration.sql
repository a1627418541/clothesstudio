-- AlterTable
ALTER TABLE "StyleDiagnosis" ADD COLUMN     "faceTryOnConsent" BOOLEAN NOT NULL DEFAULT false,
ADD COLUMN     "faceTryOnConsentAt" TIMESTAMP(3);

-- AlterTable
ALTER TABLE "StyleRecommendation" ADD COLUMN     "items" JSONB,
ADD COLUMN     "tryOnImageError" TEXT,
ADD COLUMN     "tryOnImagePrompt" TEXT,
ADD COLUMN     "tryOnImageStatus" "ImageStatus" NOT NULL DEFAULT 'PENDING',
ADD COLUMN     "tryOnImageUrl" TEXT;
