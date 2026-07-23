import { Prisma, PersonalTryOnGeneration } from "@prisma/client";
import { ArchetypeRecommendationSnapshot } from "@/lib/style-archetype/v2-types";
import {
  buildPersonalTryOnPrompt,
  compilePersonalTryOnPrompt,
  PERSONAL_TRY_ON_COMPILER_VERSION,
} from "@/lib/ai/personal-try-on-compiler";
import { PersonalTryOnImageProvider } from "@/lib/ai/personal-try-on-image-provider";
import { buildProviderImageInput } from "./provider-image-input";
import { storeImageFromUrlOrBase64 } from "@/lib/r2-image-store";

const MAX_ATTEMPTS = 3;

export interface PersonalTryOnGenerationInput {
  diagnosisId: string;
  recommendationId: string;
  userId: string | null;
  anonymousSessionId: string | null;
  snapshot: ArchetypeRecommendationSnapshot;
  fullBody: { bucket: string; key: string };
  frontFace: { bucket: string; key: string };
}

export interface PersonalTryOnGenerationDependencies {
  provider: PersonalTryOnImageProvider & { name?: string };
  storeImage: typeof storeImageFromUrlOrBase64;
  buildImageInput: typeof buildProviderImageInput;
  client: {
    personalTryOnGeneration: {
      findUnique(args: Prisma.PersonalTryOnGenerationFindUniqueArgs): Promise<PersonalTryOnGeneration | null>;
      create(args: Prisma.PersonalTryOnGenerationCreateArgs): Promise<PersonalTryOnGeneration>;
      updateMany(args: Prisma.PersonalTryOnGenerationUpdateManyArgs): Promise<{ count: number }>;
      update(args: Prisma.PersonalTryOnGenerationUpdateArgs): Promise<PersonalTryOnGeneration>;
    };
    $transaction<T>(fn: (tx: unknown) => Promise<T>): Promise<T>;
  };
}

export type PersonalTryOnGenerationResult =
  | { status: "COMPLETED"; generationId: string; imageUrl: string }
  | { status: "FAILED"; error: string; generationId?: string };

function makeR2Key(recommendationId: string): string {
  const timestamp = Date.now();
  const random = Math.random().toString(36).slice(2, 10);
  return `personal-try-on/${recommendationId}-${timestamp}-${random}.png`;
}

export async function runPersonalTryOnGeneration(
  input: PersonalTryOnGenerationInput,
  dependencies: PersonalTryOnGenerationDependencies
): Promise<PersonalTryOnGenerationResult> {
  if (!input.userId && !input.anonymousSessionId) {
    return { status: "FAILED", error: "OWNER_REQUIRED" };
  }
  if (input.userId && input.anonymousSessionId) {
    return { status: "FAILED", error: "OWNER_AMBIGUOUS" };
  }

  const compiled = buildPersonalTryOnPrompt({ snapshot: input.snapshot });
  const prompt = compilePersonalTryOnPrompt(compiled);

  const [fullBody, frontFace] = await Promise.all([
    dependencies.buildImageInput(input.fullBody),
    dependencies.buildImageInput(input.frontFace),
  ]);

  const existing = await dependencies.client.personalTryOnGeneration.findUnique({
    where: { recommendationId: input.recommendationId },
  });

  let generationId: string;
  if (!existing) {
    try {
      const created = await dependencies.client.personalTryOnGeneration.create({
        data: {
          recommendationId: input.recommendationId,
          diagnosisId: input.diagnosisId,
          userId: input.userId,
          anonymousSessionId: input.anonymousSessionId,
          status: "PROCESSING",
          prompt,
          promptCompilerVersion: PERSONAL_TRY_ON_COMPILER_VERSION,
          attemptCount: 1,
        },
      });
      generationId = created.id;
    } catch (error) {
      if (
        error instanceof Prisma.PrismaClientKnownRequestError &&
        error.code === "P2002"
      ) {
        return { status: "FAILED", error: "GENERATION_ALREADY_CLAIMED" };
      }
      throw error;
    }
  } else {
    if (existing.attemptCount >= MAX_ATTEMPTS) {
      return { status: "FAILED", error: "ATTEMPT_CAP_REACHED", generationId: existing.id };
    }
    const expectedStatus = existing.status === "PENDING" ? "PENDING" : existing.status === "FAILED" ? "FAILED" : null;
    if (!expectedStatus) {
      return { status: "FAILED", error: "GENERATION_NOT_CLAIMABLE", generationId: existing.id };
    }
    const claimed = await dependencies.client.personalTryOnGeneration.updateMany({
      where: { id: existing.id, status: expectedStatus },
      data: { status: "PROCESSING", attemptCount: { increment: 1 } },
    });
    if (claimed.count !== 1) {
      return { status: "FAILED", error: "GENERATION_ALREADY_CLAIMED", generationId: existing.id };
    }
    generationId = existing.id;
  }

  const providerName = dependencies.provider.name ?? "unknown";
  const generated = await dependencies.provider.generate({
    prompt,
    fullBodyImage: fullBody.value,
    frontFaceImage: frontFace.value,
    size: "1024x1792",
  });

  if (generated.error || (!generated.url && !generated.base64)) {
    await dependencies.client.personalTryOnGeneration.update({
      where: { id: generationId },
      data: {
        status: "FAILED",
        error: generated.error ?? "PERSONAL_TRY_ON_PROVIDER_FAILED",
        provider: providerName,
      },
    });
    return { status: "FAILED", error: "PERSONAL_TRY_ON_PROVIDER_FAILED", generationId };
  }

  const key = makeR2Key(input.recommendationId);
  const stored = await dependencies.storeImage({
    url: generated.url ?? null,
    base64: generated.base64 ?? null,
    key,
  });

  if ("error" in stored) {
    await dependencies.client.personalTryOnGeneration.update({
      where: { id: generationId },
      data: { status: "FAILED", error: stored.error, provider: providerName },
    });
    return { status: "FAILED", error: "PERSONAL_TRY_ON_STORAGE_FAILED", generationId };
  }

  await dependencies.client.personalTryOnGeneration.update({
    where: { id: generationId },
    data: {
      status: "COMPLETED",
      imageUrl: stored.url,
      imageObjectKey: key,
      provider: providerName,
      error: null,
    },
  });

  return { status: "COMPLETED", generationId, imageUrl: stored.url };
}
