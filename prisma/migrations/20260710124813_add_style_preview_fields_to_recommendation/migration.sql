-- CreateEnum
CREATE TYPE "ImageStatus" AS ENUM ('PENDING', 'PROCESSING', 'COMPLETED', 'FAILED');

-- AlterTable
ALTER TABLE "StyleRecommendation" ADD COLUMN     "previewImageError" TEXT,
ADD COLUMN     "previewImagePrompt" TEXT,
ADD COLUMN     "previewImageStatus" "ImageStatus" NOT NULL DEFAULT 'PENDING',
ADD COLUMN     "previewImageUrl" TEXT;
