import { Prisma } from "@prisma/client";
import { prisma } from "@/lib/prisma";
import {
  StyleAiProvider,
  StyleAiInput,
  StyleAiOutput,
} from "@/lib/ai/style-ai-provider";
import { MockStyleProvider } from "@/lib/ai/mock-style-provider";
import { OpenAiStyleProvider } from "@/lib/ai/openai-style-provider";
import { GeminiStyleProvider } from "@/lib/ai/gemini-style-provider";
import {
  ensurePromptVersion,
  STYLE_DIAGNOSIS_PROMPT_NAME,
  STYLE_DIAGNOSIS_PROMPT_VERSION,
  STYLE_DIAGNOSIS_MODEL,
  STYLE_DIAGNOSIS_SYSTEM_PROMPT,
} from "@/lib/ai/style-ai-prompt";

export class StyleAiService {
  private providerName: string;

  constructor() {
    this.providerName = process.env.AI_PROVIDER?.toLowerCase() || "openai";
  }

  async analyze(input: StyleAiInput): Promise<StyleAiOutput> {
    const promptVersion = await ensurePromptVersion({
      name: STYLE_DIAGNOSIS_PROMPT_NAME,
      version: STYLE_DIAGNOSIS_PROMPT_VERSION,
      model: STYLE_DIAGNOSIS_MODEL,
      prompt: STYLE_DIAGNOSIS_SYSTEM_PROMPT,
    });

    const job = await prisma.aiJob.create({
      data: {
        userId: input.userId,
        anonymousSessionId: input.anonymousSessionId,
        diagnosisId: input.diagnosisId,
        promptVersionId: promptVersion.id,
        type: "DIAGNOSIS_ANALYSIS",
        status: "PENDING",
        input: {
          diagnosisId: input.diagnosisId,
          gender: input.gender,
          age: input.age,
          heightCm: input.heightCm,
          weightKg: input.weightKg,
          photoUrls: input.photoUrls,
        } as unknown as Prisma.InputJsonValue,
      },
    });

    await prisma.aiJob.update({
      where: { id: job.id },
      data: { status: "RUNNING", startedAt: new Date() },
    });

    let provider: StyleAiProvider;
    let output: StyleAiOutput | null = null;
    let errorMessage: string | null = null;
    let jobStatus: "COMPLETED" | "FAILED" = "COMPLETED";

    try {
      provider = this.buildProvider(this.providerName);
      output = await provider.analyze(input);
    } catch (error) {
      const realError =
        error instanceof Error ? error.message : "Unknown AI provider error";
      errorMessage = realError;
      jobStatus = "FAILED";

      try {
        const fallbackProvider = new MockStyleProvider();
        output = await fallbackProvider.analyze(input);
      } catch (fallbackError) {
        const fallbackErrorMessage =
          fallbackError instanceof Error
            ? fallbackError.message
            : "Unknown fallback AI provider error";
        errorMessage = `${realError}; fallback also failed: ${fallbackErrorMessage}`;
        output = null;

        await prisma.aiJob.update({
          where: { id: job.id },
          data: {
            status: "FAILED",
            output: Prisma.DbNull,
            errorMessage,
            completedAt: new Date(),
          },
        });

        throw fallbackError;
      }
    }

    await prisma.aiJob.update({
      where: { id: job.id },
      data: {
        status: jobStatus,
        output:
          output === null
            ? Prisma.DbNull
            : (output as unknown as Prisma.InputJsonValue),
        errorMessage,
        completedAt: new Date(),
      },
    });

    return output;
  }

  private buildProvider(name: string): StyleAiProvider {
    switch (name) {
      case "openai": {
        const model = process.env.OPENAI_STYLE_MODEL || STYLE_DIAGNOSIS_MODEL;
        return new OpenAiStyleProvider(model);
      }
      case "mock":
        return new MockStyleProvider();
      case "gemini":
        return new GeminiStyleProvider();
      default:
        throw new Error(`Unknown AI provider: ${name}`);
    }
  }
}
