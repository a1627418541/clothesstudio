-- AlterEnum
BEGIN;
CREATE TYPE "Gender_new" AS ENUM ('MALE', 'FEMALE', 'OTHER');
ALTER TABLE "StyleDiagnosis" ALTER COLUMN "gender" TYPE "Gender_new" USING ("gender"::text::"Gender_new");
ALTER TYPE "Gender" RENAME TO "Gender_old";
ALTER TYPE "Gender_new" RENAME TO "Gender";
DROP TYPE "public"."Gender_old";
COMMIT;

-- AlterTable
ALTER TABLE "StyleDiagnosis" ALTER COLUMN "gender" SET NOT NULL,
ALTER COLUMN "age" SET NOT NULL,
ALTER COLUMN "heightCm" SET NOT NULL,
ALTER COLUMN "weightKg" SET NOT NULL,
ALTER COLUMN "status" SET DEFAULT 'SUBMITTED';

-- AlterTable
ALTER TABLE "StyleRecommendation" DROP COLUMN "category",
DROP COLUMN "description",
DROP COLUMN "priority",
ADD COLUMN     "avoidTips" TEXT[],
ADD COLUMN     "clothingAdvice" TEXT NOT NULL,
ADD COLUMN     "colorPalette" TEXT[],
ADD COLUMN     "hairstyleAdvice" TEXT NOT NULL,
ADD COLUMN     "isPrimary" BOOLEAN NOT NULL DEFAULT false,
ADD COLUMN     "rank" INTEGER NOT NULL DEFAULT 0,
ADD COLUMN     "shoesAdvice" TEXT NOT NULL,
ADD COLUMN     "summary" TEXT NOT NULL;

-- CreateIndex
CREATE INDEX "StyleRecommendation_diagnosisId_idx" ON "StyleRecommendation"("diagnosisId");

