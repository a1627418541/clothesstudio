-- CreateEnum
CREATE TYPE "RecommendationSource" AS ENUM ('LEGACY_AI', 'ARCHETYPE_V2');

-- CreateEnum
CREATE TYPE "MacroCategory" AS ENUM (
    'DAILY_CLEAN',
    'CLASSIC_PREMIUM',
    'BUSINESS_FORMAL',
    'URBAN_STREET',
    'ARTISTIC_MINIMAL',
    'OUTDOOR_FUNCTIONAL',
    'ROMANTIC_SOFT',
    'SPORT_ACTIVE',
    'TREND_YOUTH'
);

-- AlterTable
ALTER TABLE "StyleArchetype"
ADD COLUMN "macroCategory" "MacroCategory",
ADD COLUMN "requiredItems" TEXT[] NOT NULL DEFAULT ARRAY[]::TEXT[],
ADD COLUMN "forbiddenItems" TEXT[] NOT NULL DEFAULT ARRAY[]::TEXT[],
ADD COLUMN "silhouetteDNA" TEXT,
ADD COLUMN "sceneMood" TEXT,
ADD COLUMN "vibeAliases" TEXT[] NOT NULL DEFAULT ARRAY[]::TEXT[],
ADD COLUMN "clothingMatchTerms" TEXT[] NOT NULL DEFAULT ARRAY[]::TEXT[],
ADD COLUMN "sceneMatchTerms" TEXT[] NOT NULL DEFAULT ARRAY[]::TEXT[],
ADD COLUMN "personalityTerms" TEXT[] NOT NULL DEFAULT ARRAY[]::TEXT[],
ADD COLUMN "preferredBodyTypes" TEXT[] NOT NULL DEFAULT ARRAY[]::TEXT[],
ADD COLUMN "preferredFaceShapes" TEXT[] NOT NULL DEFAULT ARRAY[]::TEXT[],
ADD COLUMN "ageMin" INTEGER,
ADD COLUMN "ageMax" INTEGER;

-- AlterTable
ALTER TABLE "StyleRecommendation"
ADD COLUMN "sourceMode" "RecommendationSource" NOT NULL DEFAULT 'LEGACY_AI',
ADD COLUMN "archetypeVersion" INTEGER,
ADD COLUMN "archetypeSnapshot" JSONB,
ADD COLUMN "promptCompilerVersion" INTEGER,
ADD COLUMN "previewAttemptCount" INTEGER NOT NULL DEFAULT 0;

-- CreateIndex
CREATE INDEX "StyleArchetype_active_genderScope_version_idx"
ON "StyleArchetype"("active", "genderScope", "version");

-- CreateIndex
CREATE INDEX "StyleArchetype_macroCategory_active_idx"
ON "StyleArchetype"("macroCategory", "active");
