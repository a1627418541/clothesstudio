# Sprint 3 AI Engine Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use `superpowers:subagent-driven-development` (recommended) or `superpowers:executing-plans` to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** 将现有的 mock 风格诊断引擎升级为可插拔的真实 AI provider 层（首个 provider 为 OpenAI），保留可靠的 mock fallback，并确保每次 AI 调用都被记录为 `AiJob`。

**Architecture:** 引入 `StyleAiProvider` 接口和工厂 `StyleAiService`。`StyleAiService` 根据 `AI_PROVIDER` 选择 provider，验证 AI 返回的 JSON，OpenAI 失败时自动回退到 mock provider，最后统一写入 `StyleDiagnosis` 与 3 条 `StyleRecommendation`。

**Tech Stack:** Next.js 15 App Router, React 19, TypeScript strict, Tailwind CSS v4, Prisma 7, Neon PostgreSQL, Auth.js v5, Cloudflare R2, OpenAI SDK, Zod。

## Global Constraints

- TypeScript strict 模式开启，所有新增文件必须无 `any` 隐式使用。
- 所有新增代码必须通过 `npm run lint`、`npx tsc --noEmit`、`npm run build`。
- AI provider 相关代码只在服务端运行；禁止任何 `NEXT_PUBLIC_` 前缀的 AI key 或 provider 配置。
- 不允许在 commit、log、markdown、报告、数据库字段中写入 `OPENAI_API_KEY`、`DATABASE_URL` 等 secret；敏感值统一写成 `[REDACTED]`。
- 图片二进制不发送到前端，也不由浏览器直接上传给 AI provider；Sprint 3 中 OpenAI 通过 R2 public URL 访问图片。
- `AiJob.status = FAILED` 仅表示真实 AI provider 失败；如果 mock fallback 成功，用户侧诊断仍然成功，`AiJob.output` 存储 fallback 结果，`errorMessage` 记录真实 provider 失败原因。
- 每次提交后 frequent commits，commit message 使用英文，格式参考 `feat: ...` / `fix: ...`。

---

## Out of Scope

- AI 生成图片 / lookbook / wardrobe 物品。
- 支付、订阅、积分。
- 社区功能（分享、关注、评论）。
- Gemini provider 完整实现（仅 placeholder）。
- Prompt 管理 UI 或运行时 A/B 测试。
-  wardrobe 上传或穿搭规划。
- AI 任务实时进度指示器。
- 超出单次尝试的高级重试/退避策略。

---

### Task 1: Schema Migration - Add `description` to `StyleRecommendation`

**Files:**
- Modify: `prisma/schema.prisma:237-238`
- Run: `npx prisma migrate dev --name add_style_recommendation_description`

**Interfaces:**
- Consumes: 现有 `StyleRecommendation` 模型。
- Produces: 数据库表新增 `description` 列；Prisma Client 类型包含 `description`。

- [ ] **Step 1: 确认 schema 已包含 `description`**

打开 `prisma/schema.prisma`，确认 `StyleRecommendation` 字段如下：

```prisma
model StyleRecommendation {
  id              String         @id @default(cuid())
  diagnosisId     String
  diagnosis       StyleDiagnosis @relation(fields: [diagnosisId], references: [id], onDelete: Cascade)

  title           String
  description     String?
  summary         String
  clothingAdvice  String
  hairstyleAdvice String
  shoesAdvice     String
  colorPalette    String[]
  avoidTips       String[]

  rank            Int            @default(0)
  isPrimary       Boolean        @default(false)

  createdAt DateTime @default(now())
  updatedAt DateTime @updatedAt

  @@index([diagnosisId])
}
```

如果 `description` 已存在，跳过 migration。

- [ ] **Step 2: 在能连接 Neon 的环境中执行 migration**

确保 `.env.local` 中的 `DATABASE_URL` 为当前有效值（不要输出该值）。运行：

```bash
npx prisma migrate dev --name add_style_recommendation_description
```

Expected: 成功创建并应用 migration，终端显示 `Your database is now in sync with your Prisma schema`。

- [ ] **Step 3: 重新生成 Prisma Client**

```bash
npx prisma generate
```

Expected: `prisma/client` 类型包含 `description`。

- [ ] **Step 4: 提交 migration 文件**

```bash
git add prisma/schema.prisma prisma/migrations/
git commit -m "feat(schema): add description to StyleRecommendation"
```

**验收标准:**
- `npx prisma migrate status` 显示数据库已同步。
- `StyleRecommendation` 表包含 `description TEXT` 列（可为空）。
- TypeScript 可以访问 `recommendation.description`。

---

### Task 2: Environment Variables

**Files:**
- Modify: `.env.example`
- Local only: `.env.local`（不提交到 git）
- Read only: `src/lib/env.ts`（如果存在；否则本任务不新建）

**Interfaces:**
- Consumes: 无。
- Produces: 文档化所需环境变量；本地环境配置好 `AI_PROVIDER`、`OPENAI_API_KEY`、`OPENAI_STYLE_MODEL`。

- [ ] **Step 1: 更新 `.env.example`**

在 `.env.example` 末尾追加：

```bash
# AI Provider (server-side only)
# Options: openai | mock | gemini
AI_PROVIDER="openai"
OPENAI_API_KEY=""
OPENAI_STYLE_MODEL="gpt-4o-mini"
```

- [ ] **Step 2: 本地配置 `.env.local`**

在 `.env.local` 中设置（不输出具体值）：

```bash
AI_PROVIDER=mock   # 本地开发先用 mock；测试 OpenAI 时再改成 openai
OPENAI_API_KEY=sk-...
OPENAI_STYLE_MODEL=gpt-4o-mini
```

- [ ] **Step 3: 提交 `.env.example`**

```bash
git add .env.example
git commit -m "chore(env): add AI provider environment variables"
```

**验收标准:**
- `.env.example` 包含 `AI_PROVIDER`、`OPENAI_API_KEY`、`OPENAI_STYLE_MODEL`。
- `.env.local` 已配置且未出现在 git 工作区。

---

### Task 3: AI Types and Zod Schema

**Files:**
- Create: `src/lib/ai/style-ai-provider.ts`
- Create: `src/lib/ai/style-ai-schema.ts`

**Interfaces:**
- Consumes: 无。
- Produces: `StyleAiInput`, `StyleAiOutput`, `StyleRecommendationOutput`, `StyleAiProvider`, Zod schemas 供后续 provider 和 service 使用。

- [ ] **Step 1: 创建 `src/lib/ai/style-ai-provider.ts`**

```ts
export interface StyleAiPhotoUrls {
  FACE_FRONT: string;
  FACE_SIDE: string;
  FULL_BODY: string;
}

export interface StyleAiInput {
  userId: string | null;
  anonymousSessionId: string | null;
  diagnosisId: string;
  gender: "MALE" | "FEMALE" | "OTHER";
  age: number;
  heightCm: number;
  weightKg: number;
  photoUrls: StyleAiPhotoUrls;
}

export interface StyleRecommendationOutput {
  title: string;
  description: string;
  summary: string;
  clothingAdvice: string;
  hairstyleAdvice: string;
  shoesAdvice: string;
  colorPalette: string[];
  avoidTips: string[];
}

export interface StyleAiOutput {
  bodyType: string;
  faceShape: string;
  vibeKeywords: string[];
  summary: string;
  recommendations: StyleRecommendationOutput[]; // length === 3; [0] primary, [1][2] alternatives
}

export interface StyleAiProvider {
  analyze(input: StyleAiInput): Promise<StyleAiOutput>;
}
```

- [ ] **Step 2: 创建 `src/lib/ai/style-ai-schema.ts`**

```ts
import { z } from "zod";

export const styleRecommendationOutputSchema = z.object({
  title: z.string().min(1),
  description: z.string().min(1),
  summary: z.string().min(1),
  clothingAdvice: z.string().min(1),
  hairstyleAdvice: z.string().min(1),
  shoesAdvice: z.string().min(1),
  colorPalette: z.array(z.string().min(1)).min(3).max(7),
  avoidTips: z.array(z.string().min(1)).min(1).max(5),
});

export const styleAiOutputSchema = z.object({
  bodyType: z.string().min(1),
  faceShape: z.string().min(1),
  vibeKeywords: z.array(z.string().min(1)).min(3).max(5),
  summary: z.string().min(1),
  primaryRecommendation: styleRecommendationOutputSchema,
  alternativeRecommendations: z.array(styleRecommendationOutputSchema).length(2),
});

export type StyleAiOutputSchema = z.infer<typeof styleAiOutputSchema>;
```

- [ ] **Step 3: 提交**

```bash
git add src/lib/ai/style-ai-provider.ts src/lib/ai/style-ai-schema.ts
git commit -m "feat(ai): add StyleAiProvider types and Zod schemas"
```

**验收标准:**
- `npx tsc --noEmit` 通过。
- `styleAiOutputSchema` 能正确验证合法的 AI JSON，能拒绝字段缺失或 `alternativeRecommendations` 长度不为 2 的数据。

---

### Task 4: Prompt Constants and `ensurePromptVersion`

**Files:**
- Create: `src/lib/ai/style-ai-prompt.ts`

**Interfaces:**
- Consumes: `prisma` from `src/lib/prisma`。
- Produces: `STYLE_DIAGNOSIS_PROMPT_NAME`, `STYLE_DIAGNOSIS_PROMPT_VERSION`, `STYLE_DIAGNOSIS_MODEL`, `STYLE_DIAGNOSIS_SYSTEM_PROMPT`, `ensurePromptVersion({ name, version, model, prompt })`。

- [ ] **Step 1: 创建 `src/lib/ai/style-ai-prompt.ts`**

```ts
import { prisma } from "@/lib/prisma";

export const STYLE_DIAGNOSIS_PROMPT_NAME = "style-diagnosis-v1";
export const STYLE_DIAGNOSIS_PROMPT_VERSION = 1;
export const STYLE_DIAGNOSIS_MODEL = "gpt-4o-mini";

export const STYLE_DIAGNOSIS_SYSTEM_PROMPT = `You are a professional personal stylist and image analyst. Analyze the provided three photos and user profile, then return a single JSON object.

Photo roles:
- FACE_FRONT: observe face shape, facial proportions, hairstyle suitability.
- FACE_SIDE: observe side profile, head-neck ratio, hairstyle outline.
- FULL_BODY: observe overall body proportions, posture, and styling direction.

Profile: gender, age, heightCm, weightKg.

Output requirements:
- bodyType: one concise label (e.g., "rectangle", "apple", "hourglass", "inverted-triangle", "oval-face-lean-body").
- faceShape: one concise label (e.g., "oval", "round", "square", "heart", "long").
- vibeKeywords: 3-5 style keywords.
- summary: 2-3 sentences in Chinese, describing the user's overall style direction.
- primaryRecommendation: best everyday style for the user.
- alternativeRecommendations: exactly 2 objects.
  - Alternative 1 must be a noticeably different polished/commuter direction.
  - Alternative 2 must be a noticeably different relaxed/personal direction.

Each recommendation must have: title (English / Chinese), description, summary, clothingAdvice, hairstyleAdvice, shoesAdvice, colorPalette (array of lowercase English colors), avoidTips (array of strings).

Return only valid JSON. Do not wrap in markdown code blocks.`;

export async function ensurePromptVersion({
  name,
  version,
  model,
  prompt,
}: {
  name: string;
  version: number;
  model: string;
  prompt: string;
}) {
  const promptVersion = await prisma.promptVersion.upsert({
    where: { name_version: { name, version } },
    update: {},
    create: { name, version, model, prompt, isActive: true },
  });
  return promptVersion;
}
```

- [ ] **Step 2: 提交**

```bash
git add src/lib/ai/style-ai-prompt.ts
git commit -m "feat(ai): add style diagnosis prompt constants and PromptVersion helper"
```

**验收标准:**
- `ensurePromptVersion` 第一次调用后会在 `PromptVersion` 表中创建记录。
- 同一 `(name, version)` 重复调用不会创建重复记录。
- 返回值包含 `id`。

---

### Task 5: Extend Mock Engine to Return 3 Recommendations

**Files:**
- Modify: `src/lib/mock-style-engine.ts`

**Interfaces:**
- Consumes: 现有 `MockStyleInput`, `MockStyleRecommendation`。
- Produces: `generateMockStyleRecommendations(input): MockStyleRecommendationsOutput`，包含 `bodyType`, `faceShape`, `vibeKeywords`, `summary`, `recommendations`（3 条）。

- [ ] **Step 1: 修改 `src/lib/mock-style-engine.ts`**

保留原有 `generateMockStyleRecommendation`，新增类型与函数：

```ts
export interface MockStyleRecommendationsOutput {
  bodyType: string;
  faceShape: string;
  vibeKeywords: string[];
  summary: string;
  recommendations: MockStyleRecommendation[];
}

function alternativeStyle(
  gender: MockStyleInput["gender"],
  variant: "polished" | "relaxed"
): MockStyleRecommendation {
  const base = generateMockStyleRecommendation({ gender, age: 30, heightCm: 170, weightKg: 65 });
  if (variant === "polished") {
    return {
      ...base,
      title: gender === "FEMALE" ? "Polished Commuter / 精致通勤" : "Smart Casual / 精明休闲",
      summary: "A refined, office-ready direction with tailored lines and neutral palettes. / 精致、适合办公的方向，剪裁利落、配色中性。",
    };
  }
  return {
    ...base,
    title: gender === "FEMALE" ? "Relaxed Personal / 随性自我" : "Laid-back Utility / 休闲机能",
    summary: "A comfortable, expressive direction that prioritizes ease and personal taste. / 舒适、富有个性的方向，强调轻松与个人喜好。",
  };
}

export function generateMockStyleRecommendations(
  input: MockStyleInput
): MockStyleRecommendationsOutput {
  const primary = generateMockStyleRecommendation(input);
  const alt1 = alternativeStyle(input.gender, "polished");
  const alt2 = alternativeStyle(input.gender, "relaxed");

  return {
    bodyType: input.gender === "FEMALE" ? "hourglass" : "rectangle",
    faceShape: "oval",
    vibeKeywords: ["clean", "minimal", "balanced", "modern", "effortless"],
    summary: "Overall direction leans toward clean, balanced silhouettes with a modern, effortless feel. / 整体方向偏向干净、平衡的廓形，呈现现代、不费力的感觉。",
    recommendations: [primary, alt1, alt2],
  };
}
```

注意：这里新增的 `description` 字段在 `MockStyleRecommendation` 中还不存在。需要给 `MockStyleRecommendation` 增加 `description: string`，并给每个返回对象补 `description`。

最终 `MockStyleRecommendation` 应为：

```ts
export interface MockStyleRecommendation {
  title: string;
  description: string;
  summary: string;
  clothingAdvice: string;
  hairstyleAdvice: string;
  shoesAdvice: string;
  colorPalette: string[];
  avoidTips: string[];
}
```

并在 `baseStyle` 中给每个 style 补 `description`：

```ts
// MALE
return {
  title: "Clean Casual / 干净休闲",
  description: "An easy-to-wear everyday style built on simple silhouettes and neutral colors. / 基于简洁廓形和中性色的易穿日常风格。",
  summary: "...",
  // ...
};
```

`alternativeStyle` 生成的对象同样会包含 `description`（来自 base）。

- [ ] **Step 2: 提交**

```bash
git add src/lib/mock-style-engine.ts
git commit -m "feat(mock): extend mock engine to return 3 recommendations with diagnosis metadata"
```

**验收标准:**
- `generateMockStyleRecommendations` 返回 `recommendations` 数组长度为 3。
- 每条推荐包含 `description` 字段。
- 原有 `generateMockStyleRecommendation` 仍可被调用（用于兼容）。

---

### Task 6: Mock Style Provider

**Files:**
- Create: `src/lib/ai/mock-style-provider.ts`

**Interfaces:**
- Consumes: `StyleAiProvider`, `StyleAiInput`, `StyleAiOutput` from `style-ai-provider.ts`；`generateMockStyleRecommendations` from `mock-style-engine.ts`。
- Produces: `MockStyleProvider` 类实现 `StyleAiProvider`。

- [ ] **Step 1: 创建 `src/lib/ai/mock-style-provider.ts`**

```ts
import {
  StyleAiProvider,
  StyleAiInput,
  StyleAiOutput,
  StyleRecommendationOutput,
} from "@/lib/ai/style-ai-provider";
import {
  generateMockStyleRecommendations,
  MockStyleInput,
} from "@/lib/mock-style-engine";

export class MockStyleProvider implements StyleAiProvider {
  async analyze(input: StyleAiInput): Promise<StyleAiOutput> {
    const mockInput: MockStyleInput = {
      gender: input.gender,
      age: input.age,
      heightCm: input.heightCm,
      weightKg: input.weightKg,
    };

    const result = generateMockStyleRecommendations(mockInput);

    const recommendations: StyleRecommendationOutput[] = result.recommendations.map((rec) => ({
      title: rec.title,
      description: rec.description,
      summary: rec.summary,
      clothingAdvice: rec.clothingAdvice,
      hairstyleAdvice: rec.hairstyleAdvice,
      shoesAdvice: rec.shoesAdvice,
      colorPalette: rec.colorPalette,
      avoidTips: rec.avoidTips,
    }));

    return {
      bodyType: result.bodyType,
      faceShape: result.faceShape,
      vibeKeywords: result.vibeKeywords,
      summary: result.summary,
      recommendations,
    };
  }
}
```

- [ ] **Step 2: 提交**

```bash
git add src/lib/ai/mock-style-provider.ts
git commit -m "feat(ai): add mock style provider adapter"
```

**验收标准:**
- `AI_PROVIDER=mock` 时，`StyleAiService` 可以实例化 `MockStyleProvider` 并返回 3 条推荐。
- `npx tsc --noEmit` 通过。

---

### Task 7: OpenAI Style Provider

**Files:**
- Modify: `package.json`
- Create: `src/lib/ai/openai-style-provider.ts`

**Interfaces:**
- Consumes: `StyleAiProvider`, `StyleAiInput`, `StyleAiOutput` from `style-ai-provider.ts`；Zod schemas from `style-ai-schema.ts`；prompt constants from `style-ai-prompt.ts`。
- Produces: `OpenAiStyleProvider` 类实现 `StyleAiProvider`。

- [ ] **Step 1: 安装 OpenAI SDK**

```bash
npm install openai
```

- [ ] **Step 2: 创建 `src/lib/ai/openai-style-provider.ts`**

```ts
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
```

- [ ] **Step 3: 提交**

```bash
git add package.json package-lock.json src/lib/ai/openai-style-provider.ts
git commit -m "feat(ai): add OpenAI style provider"
```

**验收标准:**
- `OPENAI_API_KEY` 和 `AI_PROVIDER=openai` 配置正确时，能成功调用 OpenAI 并返回结构化结果。
- OpenAI 返回非 JSON 或格式不符时抛出可捕获的错误。
- `OPENAI_API_KEY` 不会出现在前端 bundle、API 响应或日志中。

---

### Task 8: Gemini Style Provider Placeholder

**Files:**
- Create: `src/lib/ai/gemini-style-provider.ts`

**Interfaces:**
- Consumes: `StyleAiProvider`, `StyleAiInput`, `StyleAiOutput`。
- Produces: `GeminiStyleProvider` 类实现 `StyleAiProvider`（未实现，直接抛错）。

- [ ] **Step 1: 创建 `src/lib/ai/gemini-style-provider.ts`**

```ts
import { StyleAiProvider, StyleAiInput, StyleAiOutput } from "@/lib/ai/style-ai-provider";

export class GeminiStyleProvider implements StyleAiProvider {
  async analyze(_input: StyleAiInput): Promise<StyleAiOutput> {
    throw new Error("Gemini provider is not implemented in Sprint 3");
  }
}
```

- [ ] **Step 2: 提交**

```bash
git add src/lib/ai/gemini-style-provider.ts
git commit -m "feat(ai): add Gemini provider placeholder"
```

**验收标准:**
- `AI_PROVIDER=gemini` 时（如果 service 允许选择）会抛出明确错误并回退到 mock。

---

### Task 9: Style AI Service - Provider Selection, Validation, Fallback

**Files:**
- Create: `src/lib/ai/style-ai-service.ts`

**Interfaces:**
- Consumes: `StyleAiProvider`, `StyleAiInput`, `StyleAiOutput`, `MockStyleProvider`, `OpenAiStyleProvider`, `GeminiStyleProvider`, `ensurePromptVersion`, `STYLE_DIAGNOSIS_*` constants，以及 `prisma`。
- Produces: `StyleAiService.analyze(input)` 返回 `StyleAiOutput`；负责创建/更新 `AiJob`。

- [ ] **Step 1: 创建 `src/lib/ai/style-ai-service.ts`**

```ts
import { prisma } from "@/lib/prisma";
import { StyleAiInput, StyleAiOutput } from "@/lib/ai/style-ai-provider";
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
        },
      },
    });

    await prisma.aiJob.update({
      where: { id: job.id },
      data: { status: "RUNNING", startedAt: new Date() },
    });

    const provider = this.buildProvider(this.providerName);
    let output: StyleAiOutput;
    let errorMessage: string | null = null;
    let jobStatus: "COMPLETED" | "FAILED" = "COMPLETED";

    try {
      output = await provider.analyze(input);
    } catch (error) {
      errorMessage = error instanceof Error ? error.message : "Unknown AI provider error";
      jobStatus = "FAILED";

      const fallbackProvider = new MockStyleProvider();
      output = await fallbackProvider.analyze(input);
    }

    await prisma.aiJob.update({
      where: { id: job.id },
      data: {
        status: jobStatus,
        output: output as unknown as Record<string, unknown>,
        errorMessage,
        completedAt: new Date(),
      },
    });

    return output;
  }

  private buildProvider(name: string): StyleAiOutput {
    switch (name) {
      case "openai": {
        const apiKey = process.env.OPENAI_API_KEY;
        if (!apiKey) {
          throw new Error("OPENAI_API_KEY is required when AI_PROVIDER=openai");
        }
        const model = process.env.OPENAI_STYLE_MODEL || STYLE_DIAGNOSIS_MODEL;
        return new OpenAiStyleProvider(apiKey, model);
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
```

注意：上面 `buildProvider` 返回类型写错了，应该是返回 `StyleAiProvider`，不是 `StyleAiOutput`。修正：

```ts
import { StyleAiProvider } from "@/lib/ai/style-ai-provider";

private buildProvider(name: string): StyleAiProvider {
```

- [ ] **Step 2: 提交**

```bash
git add src/lib/ai/style-ai-service.ts
git commit -m "feat(ai): add StyleAiService with provider selection and mock fallback"
```

**验收标准:**
- `AI_PROVIDER=openai` 且 OpenAI 成功时，`AiJob.status = COMPLETED`，`output` 存储 OpenAI 结果。
- `AI_PROVIDER=openai` 且 OpenAI 失败时，`AiJob.status = FAILED`，`errorMessage` 记录失败原因，`output` 存储 mock fallback 结果，函数仍返回 mock 数据。
- `AI_PROVIDER=mock` 时，`AiJob.status = COMPLETED`，`output` 存储 mock 结果。
- `PromptVersion` 表在第一次调用后存在对应记录。

---

### Task 10: Refactor `POST /api/diagnosis`

**Files:**
- Modify: `src/app/api/diagnosis/route.ts`

**Interfaces:**
- Consumes: `StyleAiService` from `src/lib/ai/style-ai-service.ts`，`StyleAiInput`。
- Produces: 创建 `StyleDiagnosis`、3 条 `DiagnosisPhoto`、3 条 `StyleRecommendation`，返回 `{ id, status, primaryRecommendation }`。

- [ ] **Step 1: 替换 `generateMockStyleRecommendation` 调用为 `StyleAiService`**

修改 `src/app/api/diagnosis/route.ts`：

```ts
import { NextRequest, NextResponse } from "next/server";
import { auth } from "@/lib/auth";
import { prisma } from "@/lib/prisma";
import { getAnonymousSessionByToken } from "@/lib/anonymous-session";
import { diagnosisFormSchema } from "@/lib/validators/diagnosis";
import { StyleAiService } from "@/lib/ai/style-ai-service";
import { StyleAiInput } from "@/lib/ai/style-ai-provider";

export async function POST(request: NextRequest) {
  try {
    const session = await auth();
    const userId = session?.user?.id ?? null;

    let anonymousSessionId: string | null = null;
    if (!userId) {
      const anonymousToken = request.cookies.get("aps_anonymous_session")?.value;
      if (!anonymousToken) {
        return NextResponse.json({ error: "Anonymous session required" }, { status: 401 });
      }
      const anonymousSession = await getAnonymousSessionByToken(anonymousToken);
      if (!anonymousSession) {
        return NextResponse.json({ error: "Invalid or expired anonymous session" }, { status: 401 });
      }
      anonymousSessionId = anonymousSession.id;
    }

    const body = await request.json();
    const parsed = diagnosisFormSchema.safeParse(body);

    if (!parsed.success) {
      return NextResponse.json(
        { error: "Invalid diagnosis form data", issues: parsed.error.issues },
        { status: 400 }
      );
    }

    const { gender, age, heightCm, weightKg, photoAssetIds } = parsed.data;

    const assetIds = Object.values(photoAssetIds);
    const assets = await prisma.mediaAsset.findMany({
      where: { id: { in: assetIds } },
    });

    if (assets.length !== assetIds.length) {
      return NextResponse.json({ error: "One or more photo assets not found" }, { status: 403 });
    }

    for (const asset of assets) {
      const ownedByUser = userId && asset.userId === userId;
      const ownedByAnonymous = anonymousSessionId && asset.anonymousSessionId === anonymousSessionId;
      if (!ownedByUser && !ownedByAnonymous) {
        return NextResponse.json(
          { error: "Photo asset not owned by current session" },
          { status: 403 }
        );
      }
    }

    const roleUrlMap: Record<string, string | undefined> = {};
    for (const asset of assets) {
      const role = (Object.entries(photoAssetIds).find(([, id]) => id === asset.id)?.[0]) as
        | "FACE_FRONT"
        | "FACE_SIDE"
        | "FULL_BODY";
      if (role) {
        roleUrlMap[role] = asset.url ?? undefined;
      }
    }

    if (!roleUrlMap.FACE_FRONT || !roleUrlMap.FACE_SIDE || !roleUrlMap.FULL_BODY) {
      return NextResponse.json({ error: "Missing photo URLs" }, { status: 400 });
    }

    const diagnosis = await prisma.$transaction(async (tx) => {
      const created = await tx.styleDiagnosis.create({
        data: {
          userId,
          anonymousSessionId,
          gender,
          age,
          heightCm,
          weightKg,
          status: "SUBMITTED",
        },
      });

      await tx.diagnosisPhoto.createMany({
        data: [
          { diagnosisId: created.id, mediaAssetId: photoAssetIds.FACE_FRONT, role: "FACE_FRONT" },
          { diagnosisId: created.id, mediaAssetId: photoAssetIds.FACE_SIDE, role: "FACE_SIDE" },
          { diagnosisId: created.id, mediaAssetId: photoAssetIds.FULL_BODY, role: "FULL_BODY" },
        ],
      });

      return created;
    });

    const styleInput: StyleAiInput = {
      userId,
      anonymousSessionId,
      diagnosisId: diagnosis.id,
      gender,
      age,
      heightCm,
      weightKg,
      photoUrls: {
        FACE_FRONT: roleUrlMap.FACE_FRONT,
        FACE_SIDE: roleUrlMap.FACE_SIDE,
        FULL_BODY: roleUrlMap.FULL_BODY,
      },
    };

    const styleAiService = new StyleAiService();
    const aiOutput = await styleAiService.analyze(styleInput);

    const updatedDiagnosis = await prisma.$transaction(async (tx) => {
      await tx.styleDiagnosis.update({
        where: { id: diagnosis.id },
        data: {
          bodyType: aiOutput.bodyType,
          faceShape: aiOutput.faceShape,
          vibeKeywords: aiOutput.vibeKeywords,
          summary: aiOutput.summary,
          status: "PREVIEW_READY",
        },
      });

      await tx.styleRecommendation.createMany({
        data: aiOutput.recommendations.map((rec, index) => ({
          diagnosisId: diagnosis.id,
          title: rec.title,
          description: rec.description,
          summary: rec.summary,
          clothingAdvice: rec.clothingAdvice,
          hairstyleAdvice: rec.hairstyleAdvice,
          shoesAdvice: rec.shoesAdvice,
          colorPalette: rec.colorPalette,
          avoidTips: rec.avoidTips,
          rank: index + 1,
          isPrimary: index === 0,
        })),
      });

      return tx.styleDiagnosis.findUniqueOrThrow({
        where: { id: diagnosis.id },
      });
    });

    return NextResponse.json(
      {
        id: updatedDiagnosis.id,
        status: updatedDiagnosis.status,
        primaryRecommendation: aiOutput.recommendations[0],
      },
      { status: 201 }
    );
  } catch (error) {
    console.error("Diagnosis submission error:", error);
    const message = error instanceof Error ? error.message : "Diagnosis submission failed";
    return NextResponse.json({ error: message }, { status: 500 });
  }
}
```

- [ ] **Step 2: 提交**

```bash
git add src/app/api/diagnosis/route.ts
git commit -m "feat(api): wire StyleAiService into POST /api/diagnosis"
```

**验收标准:**
- `POST /api/diagnosis` 创建 `StyleDiagnosis`、`DiagnosisPhoto` 后调用 AI service。
- AI 成功后更新 `StyleDiagnosis.bodyType`、`faceShape`、`vibeKeywords`、`summary`、`status = PREVIEW_READY`。
- 创建 3 条 `StyleRecommendation`，`rank` 分别为 1、2、3，`isPrimary` 仅第一条为 true。
- API 响应仍返回 `{ id, status, primaryRecommendation }`。

---

### Task 11: `GET /api/diagnosis/[id]` and Page Display 3 Recommendations

**Files:**
- Modify: `src/lib/diagnosis-service.ts`
- Modify: `src/app/api/diagnosis/[id]/route.ts`
- Modify: `src/app/diagnosis/[id]/page.tsx`

**Interfaces:**
- Consumes: `StyleRecommendation` 表数据。
- Produces: `DiagnosisDetail` 包含 `recommendations` 数组（3 条，按 rank 排序）；页面展示 primary + 2 alternatives。

- [ ] **Step 1: 更新 `src/lib/diagnosis-service.ts`**

将 `primaryRecommendation` 改为 `recommendations` 数组：

```ts
export interface DiagnosisDetail {
  id: string;
  gender: string;
  age: number;
  heightCm: number;
  weightKg: number;
  status: string;
  bodyType: string | null;
  faceShape: string | null;
  vibeKeywords: string[];
  summary: string | null;
  createdAt: Date;
  photos: {
    role: string;
    url: string | null;
    mimeType: string;
  }[];
  recommendations: {
    rank: number;
    isPrimary: boolean;
    title: string;
    description: string | null;
    summary: string;
    clothingAdvice: string;
    hairstyleAdvice: string;
    shoesAdvice: string;
    colorPalette: string[];
    avoidTips: string[];
  }[];
}
```

修改查询：移除 `recommendations` 的 `where`/`take`，改为 `orderBy: { rank: "asc" }`。

修改返回：

```ts
const detail: DiagnosisDetail = {
  id: diagnosis.id,
  gender: diagnosis.gender,
  age: diagnosis.age,
  heightCm: diagnosis.heightCm,
  weightKg: diagnosis.weightKg,
  status: diagnosis.status,
  bodyType: diagnosis.bodyType,
  faceShape: diagnosis.faceShape,
  vibeKeywords: diagnosis.vibeKeywords,
  summary: diagnosis.summary,
  createdAt: diagnosis.createdAt,
  photos: orderedPhotos,
  recommendations: diagnosis.recommendations.map((rec) => ({
    rank: rec.rank,
    isPrimary: rec.isPrimary,
    title: rec.title,
    description: rec.description,
    summary: rec.summary,
    clothingAdvice: rec.clothingAdvice,
    hairstyleAdvice: rec.hairstyleAdvice,
    shoesAdvice: rec.shoesAdvice,
    colorPalette: rec.colorPalette,
    avoidTips: rec.avoidTips,
  })),
};
```

- [ ] **Step 2: 更新页面 `src/app/diagnosis/[id]/page.tsx`**

替换 `const rec = diagnosis.primaryRecommendation;` 为：

```tsx
const primaryRec = diagnosis.recommendations.find((r) => r.isPrimary) ?? diagnosis.recommendations[0];
const alternatives = diagnosis.recommendations.filter((r) => !r.isPrimary);
```

新增 AI 诊断摘要区块（在 Basic Info 之后）：

```tsx
<section className="mb-6 border rounded-lg p-4">
  <h2 className="font-semibold mb-2">AI Analysis</h2>
  <p><strong>Body Type:</strong> {diagnosis.bodyType ?? "N/A"}</p>
  <p><strong>Face Shape:</strong> {diagnosis.faceShape ?? "N/A"}</p>
  <p><strong>Vibe:</strong> {diagnosis.vibeKeywords.join(", ")}</p>
  <p><strong>Summary:</strong> {diagnosis.summary ?? "N/A"}</p>
</section>
```

将 Primary Recommendation 区块改为渲染 `primaryRec`；新增 Alternatives 区块：

```tsx
<section className="mb-6 border rounded-lg p-4">
  <h2 className="font-semibold mb-2">Alternative Recommendations</h2>
  {alternatives.length > 0 ? (
    <div className="space-y-4">
      {alternatives.map((rec) => (
        <div key={rec.rank} className="border rounded p-3">
          <h3 className="text-lg font-semibold">{rec.title}</h3>
          {rec.description && <p className="text-sm text-gray-600 mb-2">{rec.description}</p>}
          <p>{rec.summary}</p>
          <p><strong>Clothing:</strong> {rec.clothingAdvice}</p>
          <p><strong>Hair:</strong> {rec.hairstyleAdvice}</p>
          <p><strong>Shoes:</strong> {rec.shoesAdvice}</p>
          <p><strong>Colors:</strong> {rec.colorPalette.join(", ")}</p>
          <p><strong>Avoid:</strong> {rec.avoidTips.join(", ")}</p>
        </div>
      ))}
    </div>
  ) : (
    <p className="text-gray-500">No alternative recommendations available.</p>
  )}
</section>
```

- [ ] **Step 3: 提交**

```bash
git add src/lib/diagnosis-service.ts src/app/api/diagnosis/[id]/route.ts src/app/diagnosis/[id]/page.tsx
git commit -m "feat(diagnosis): return and display 3 recommendations"
```

**验收标准:**
- `GET /api/diagnosis/[id]` 返回 `recommendations` 数组，按 `rank asc` 排序。
- 页面显示 `bodyType`、`faceShape`、`vibeKeywords`、`summary`。
- 页面显示 primary recommendation 和 2 条 alternatives。

---

### Task 12: README / Docs Update

**Files:**
- Modify: `README.md`

**Interfaces:**
- Consumes: 新增 env vars、AI provider 行为。
- Produces: 文档说明如何配置 AI provider、mock fallback、验证流程。

- [ ] **Step 1: 在 README 新增 Sprint 3 环境变量段落**

在 README 的环境变量章节追加：

```markdown
### AI Provider (server-side only)

| Variable | Required | Default | Description |
|----------|----------|---------|-------------|
| `AI_PROVIDER` | no | `openai` | `openai`, `mock`, or `gemini` (gemini not implemented). |
| `OPENAI_API_KEY` | yes if provider=openai | — | Server-side only. |
| `OPENAI_STYLE_MODEL` | no | `gpt-4o-mini` | Model used for diagnosis. |

- Set `AI_PROVIDER=mock` for local development without OpenAI costs.
- Set `AI_PROVIDER=openai` and provide `OPENAI_API_KEY` for real AI diagnosis.
- If OpenAI fails, the system automatically falls back to the mock engine.
```

- [ ] **Step 2: 提交**

```bash
git add README.md
git commit -m "docs: document AI provider env vars and fallback behavior"
```

**验收标准:**
- README 包含 `AI_PROVIDER`、`OPENAI_API_KEY`、`OPENAI_STYLE_MODEL` 说明。
- README 不包含任何真实 secret 值。

---

### Task 13: Local Validation

**Files:**
- 无新文件。

**Interfaces:**
- Consumes: 全部已实现代码。
- Produces: 验证报告。

- [ ] **Step 1: Lint 与类型检查**

```bash
npm run lint
npx tsc --noEmit
npm run build
```

Expected: 全部通过，无错误。

- [ ] **Step 2: Mock 流程验证**

```bash
AI_PROVIDER=mock npm run dev
```

在另一个终端：

```bash
curl -X POST http://localhost:3000/api/anonymous-session -c cookies.txt -b cookies.txt
curl -X POST http://localhost:3000/api/diagnosis \
  -H "Content-Type: application/json" \
  -b cookies.txt -c cookies.txt \
  -d '{"gender":"MALE","age":28,"heightCm":175,"weightKg":70,"photoAssetIds":{"FACE_FRONT":"id1","FACE_SIDE":"id2","FULL_BODY":"id3"}}'
```

注意：上述 curl 需要真实上传后的 asset id；完整验证应通过上传页面完成。

Expected:
- `POST /api/diagnosis` 返回 201，包含 `primaryRecommendation`。
- Neon 中该 diagnosis 的 `status = PREVIEW_READY`。
- 有 3 条 `StyleRecommendation` 记录，`rank` 为 1/2/3。
- 有 1 条 `AiJob` 记录，`type = DIAGNOSIS_ANALYSIS`，`status = COMPLETED`（mock 模式下）。

- [ ] **Step 3: OpenAI 真实流程验证**

设置 `.env.local`：

```bash
AI_PROVIDER=openai
OPENAI_API_KEY=sk-...
```

重启 dev server，上传三张真实照片，提交诊断。

Expected:
- `StyleDiagnosis` 包含 `bodyType`、`faceShape`、`vibeKeywords`、`summary`。
- 3 条 `StyleRecommendation` 包含真实 AI 生成的内容（标题/描述/建议）。
- `AiJob.status = COMPLETED`。

- [ ] **Step 4: Fallback 流程验证**

临时设置错误的 `OPENAI_API_KEY` 或断开网络，提交诊断。

Expected:
- 用户页面或 API 响应仍然成功返回推荐。
- `AiJob.status = FAILED`。
- `AiJob.errorMessage` 包含真实 provider 失败原因。
- `AiJob.output` 存储 mock fallback 结果。
- 3 条 `StyleRecommendation` 仍然创建成功。

- [ ] **Step 5: R2 图片 URL 可访问性检查**

从 `MediaAsset` 表中取 3 条记录的 `url`，运行：

```bash
curl -I <url>
```

Expected: HTTP 200。

- [ ] **Step 6: 提交验证结果记录（可选）**

如需记录验证结果，写入 `docs/superpowers/reports/YYYY-MM-DD-sprint3-validation-report.md`，其中 `DATABASE_URL` 和 `OPENAI_API_KEY` 统一写成 `[REDACTED]`。

**验收标准:**
- `npm run lint`、`npx tsc --noEmit`、`npm run build` 全部通过。
- mock、openai、fallback 三种流程至少各跑通一次。
- Neon 数据与 R2 URL 检查通过。

---

### Task 14: Vercel Production Validation

**Files:**
- Vercel Dashboard / CLI only。

**Interfaces:**
- Consumes: 已部署的 Production 环境。
- Produces: 线上验证结果。

- [ ] **Step 1: 确保 Vercel 环境变量正确**

在 Vercel Project Settings > Environment Variables 中确认：

- `DATABASE_URL` = `[REDACTED]`（当前有效的 Neon URL）。
- `AUTH_SECRET` = `[REDACTED]`。
- `CLOUDFLARE_R2_*` 已配置。
- `AI_PROVIDER` = `openai`。
- `OPENAI_API_KEY` = `[REDACTED]`。
- `OPENAI_STYLE_MODEL` = `gpt-4o-mini`。

- [ ] **Step 2: 部署 Production**

```bash
vercel --prod
```

或推送 `main` 触发 Vercel 自动部署。

Expected: Vercel build 成功，无错误。

- [ ] **Step 3: 线上端到端验证**

1. 访问 production `/api/health` → 200 `{"status":"ok"}`。
2. 匿名会话 → 上传 3 张照片 → 提交诊断。
3. 确认 `POST /api/diagnosis` 返回 201。
4. 访问 `/diagnosis/[id]`，页面显示 AI 分析摘要与 3 套推荐。
5. 检查 Neon：`StyleDiagnosis` 字段已填充，`StyleRecommendation` 有 3 条，`AiJob` 有记录。

- [ ] **Step 4: Fallback 线上验证（可选）**

临时将 Vercel `AI_PROVIDER` 改为 `mock` 或提供无效 `OPENAI_API_KEY`，重新部署，提交诊断。

Expected: 用户侧仍然成功，`AiJob.status = FAILED`。

- [ ] **Step 5: 归档**

验证完成后，在 Git 上打 tag：

```bash
git tag -a sprint-3.0 -m "Sprint 3: real AI style diagnosis engine with mock fallback"
git push origin sprint-3.0
```

**验收标准:**
- Vercel Production 部署成功。
- 线上完整流程可跑通。
- 所有敏感变量在报告/日志中显示为 `[REDACTED]`。

---

## Validation Checklist

- [ ] `npm run lint` 无错误。
- [ ] `npx tsc --noEmit` 无类型错误。
- [ ] `npm run build` 成功。
- [ ] `AI_PROVIDER=mock` 本地流程成功。
- [ ] `AI_PROVIDER=openai` 真实 AI 流程成功。
- [ ] OpenAI 失败时 fallback 流程成功，且 `AiJob.status = FAILED`。
- [ ] Neon 中 `StyleDiagnosis`、`StyleRecommendation`（3 条）、`AiJob`、`PromptVersion` 数据正确。
- [ ] R2 图片 URL 可公开访问（HTTP 200）。
- [ ] Vercel Production 部署并验证通过。

---

## Security Reminders

- 不要在任何文档、commit message、log、API 响应、数据库字段中写入 `OPENAI_API_KEY`、`DATABASE_URL` 或其他 secret。
- 报告中所有敏感变量统一写成 `[REDACTED]`。
- `AiJob.input` / `output` 仅存储业务数据（profile、photo URLs、推荐内容），不存储 API key。

---

## Execution Choice

Plan complete and saved to `docs/superpowers/plans/2026-07-10-sprint3-ai-engine.md`.

Two execution options:

1. **Subagent-Driven (recommended)** - 每个 Task 由一个独立子代理执行，我在 Task 之间做 review。
2. **Inline Execution** - 在本会话中使用 `superpowers:executing-plans` 按顺序执行，定期 checkpoint。

**请批准该计划并选择执行方式。**
