import OpenAI from "openai";
import {
  StyleAiProvider,
  StyleAiInput,
  StyleAiOutput,
  StyleRecommendationOutput,
} from "@/lib/ai/style-ai-provider";
import {
  styleAiOutputSchema,
  StyleAiOutputSchema,
} from "@/lib/ai/style-ai-schema";
import {
  STYLE_DIAGNOSIS_MODEL,
  STYLE_DIAGNOSIS_SYSTEM_PROMPT,
} from "@/lib/ai/style-ai-prompt";

export class OpenAiStyleProvider implements StyleAiProvider {
  private client: OpenAI;
  private model: string;

  constructor(apiKey: string, model = STYLE_DIAGNOSIS_MODEL) {
    this.client = new OpenAI({ apiKey });
    this.model = model;
  }

  async analyze(input: StyleAiInput): Promise<StyleAiOutput> {
    const response = await this.client.chat.completions.create({
      model: this.model,
      messages: [
        { role: "system", content: STYLE_DIAGNOSIS_SYSTEM_PROMPT },
        {
          role: "user",
          content: [
            {
              type: "text",
              text: `Profile: gender=${input.gender}, age=${input.age}, height=${input.heightCm}cm, weight=${input.weightKg}kg.`,
            },
            {
              type: "image_url",
              image_url: { url: input.photoUrls.FACE_FRONT, detail: "auto" },
            },
            {
              type: "image_url",
              image_url: { url: input.photoUrls.FACE_SIDE, detail: "auto" },
            },
            {
              type: "image_url",
              image_url: { url: input.photoUrls.FULL_BODY, detail: "auto" },
            },
          ],
        },
      ],
      max_tokens: 2048,
      temperature: 0.7,
    });

    const rawContent = response.choices[0]?.message?.content;
    if (!rawContent) {
      throw new Error("OpenAI returned empty content");
    }

    const cleaned = rawContent.trim().replace(/^```json\s*|\s*```$/g, "");
    let parsed: unknown;
    try {
      parsed = JSON.parse(cleaned);
    } catch (err) {
      throw new Error(`OpenAI returned non-JSON content: ${cleaned.slice(0, 200)}`);
    }

    const validated = styleAiOutputSchema.safeParse(parsed);
    if (!validated.success) {
      throw new Error(`OpenAI output validation failed: ${validated.error.message}`);
    }

    return this.normalizeOutput(validated.data);
  }

  private normalizeOutput(data: StyleAiOutputSchema): StyleAiOutput {
    const recommendations: StyleRecommendationOutput[] = [
      data.primaryRecommendation,
      ...data.alternativeRecommendations,
    ];

    return {
      bodyType: data.bodyType,
      faceShape: data.faceShape,
      vibeKeywords: data.vibeKeywords,
      summary: data.summary,
      recommendations,
    };
  }
}
