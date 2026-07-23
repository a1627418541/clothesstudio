-- CreateTable
CREATE TABLE "PersonalTryOnGeneration" (
    "id" TEXT NOT NULL,
    "recommendationId" TEXT NOT NULL,
    "diagnosisId" TEXT NOT NULL,
    "userId" TEXT,
    "anonymousSessionId" TEXT,
    "status" "ImageStatus" NOT NULL DEFAULT 'PENDING',
    "prompt" TEXT,
    "promptCompilerVersion" INTEGER,
    "imageUrl" TEXT,
    "imageObjectKey" TEXT,
    "provider" TEXT,
    "error" TEXT,
    "attemptCount" INTEGER NOT NULL DEFAULT 0,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" TIMESTAMP(3) NOT NULL,

    CONSTRAINT "PersonalTryOnGeneration_pkey" PRIMARY KEY ("id")
);

-- CreateIndex
CREATE UNIQUE INDEX "PersonalTryOnGeneration_recommendationId_key" ON "PersonalTryOnGeneration"("recommendationId");

-- CreateIndex
CREATE INDEX "PersonalTryOnGeneration_diagnosisId_idx" ON "PersonalTryOnGeneration"("diagnosisId");

-- AddForeignKey
ALTER TABLE "PersonalTryOnGeneration" ADD CONSTRAINT "PersonalTryOnGeneration_recommendationId_fkey" FOREIGN KEY ("recommendationId") REFERENCES "StyleRecommendation"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "PersonalTryOnGeneration" ADD CONSTRAINT "PersonalTryOnGeneration_diagnosisId_fkey" FOREIGN KEY ("diagnosisId") REFERENCES "StyleDiagnosis"("id") ON DELETE CASCADE ON UPDATE CASCADE;
