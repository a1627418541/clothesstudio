-- CreateEnum
CREATE TYPE "GenderScope" AS ENUM ('MALE', 'FEMALE', 'UNISEX', 'OTHER');

-- AlterTable
ALTER TABLE "StyleRecommendation" ADD COLUMN     "archetypeId" TEXT,
ADD COLUMN     "matchScore" INTEGER;

-- CreateTable
CREATE TABLE "StyleArchetype" (
    "id" TEXT NOT NULL,
    "slug" TEXT NOT NULL,
    "name" TEXT NOT NULL,
    "genderScope" "GenderScope" NOT NULL,
    "category" TEXT NOT NULL,
    "description" TEXT NOT NULL,
    "personalityLabel" TEXT,
    "keywords" TEXT[],
    "clothingDNA" TEXT NOT NULL,
    "hairstyleDNA" TEXT NOT NULL,
    "shoesDNA" TEXT NOT NULL,
    "colorDNA" TEXT[],
    "avoidDNA" TEXT NOT NULL,
    "imagePromptTemplate" TEXT NOT NULL,
    "version" INTEGER NOT NULL DEFAULT 1,
    "active" BOOLEAN NOT NULL DEFAULT true,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" TIMESTAMP(3) NOT NULL,

    CONSTRAINT "StyleArchetype_pkey" PRIMARY KEY ("id")
);

-- CreateIndex
CREATE UNIQUE INDEX "StyleArchetype_slug_key" ON "StyleArchetype"("slug");

-- CreateIndex
CREATE INDEX "StyleArchetype_genderScope_active_idx" ON "StyleArchetype"("genderScope", "active");

-- CreateIndex
CREATE INDEX "StyleArchetype_category_idx" ON "StyleArchetype"("category");

-- AddForeignKey
ALTER TABLE "StyleRecommendation" ADD CONSTRAINT "StyleRecommendation_archetypeId_fkey" FOREIGN KEY ("archetypeId") REFERENCES "StyleArchetype"("id") ON DELETE SET NULL ON UPDATE CASCADE;
