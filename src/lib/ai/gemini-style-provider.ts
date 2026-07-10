import { StyleAiProvider, StyleAiInput, StyleAiOutput } from "@/lib/ai/style-ai-provider";

export class GeminiStyleProvider implements StyleAiProvider {
  // eslint-disable-next-line @typescript-eslint/no-unused-vars
  async analyze(_input: StyleAiInput): Promise<StyleAiOutput> {
    throw new Error("Gemini provider is not implemented in Sprint 3");
  }
}
