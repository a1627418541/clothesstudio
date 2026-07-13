# 高级时尚编辑部风格 Web UI 实施计划

> **For agentic workers:** REQUIRED SUB-SKILL: Use `superpowers:executing-plans` to implement this plan task-by-task. The user has explicitly prohibited subagents, so do not use subagent-driven development. Steps use checkbox (`- [ ]`) syntax for tracking.

**目标：** 在不修改 API、数据库、匹配或图片生成行为的前提下，把 Style Studio 的桌面端首页、诊断流程、报告页和上传测试页统一为高级时尚编辑部风格。

**架构：** 先在 `layout.tsx` 与 `globals.css` 建立字体、颜色、间距、表面和焦点状态，再通过无状态共享组件向首页、诊断和报告扩散。现有客户端页面继续持有 fetch、上传、校验、提交和预览重试状态；本轮只重组展示层，并用可服务器渲染的小组件做轻量回归测试。

**技术栈：** Next.js 15 App Router、React 19、TypeScript、Tailwind CSS 4、`next/font/google`、Lucide React、Vitest、`react-dom/server`。

## 全局约束

- 仅设计和验收 1024、1280、1440 像素宽的桌面 Web；不新增手机端或平板端专门布局。
- 最终产品 UI 仅使用英文；本文档使用中文描述实施步骤。
- 不新增 UI 框架或运行时依赖。
- 不修改任何 API 请求、Prisma schema、数据库迁移、风格匹配、AI provider 或图片生成逻辑。
- 保留匿名会话、三图上传/重试、表单校验、诊断提交、报告所有权、预览自动生成及失败手动重试。
- `% match` 只能表达为确定性的规则匹配分数，不得称为 AI confidence、AI accuracy 或 AI score。
- 移除不可用的 transformation image CTA 及指向 `#` 的 Privacy、Terms、Pricing、Login 链接。
- 不主动删除现有响应式类，但本轮不做移动端视觉 QA。
- UI 验证不得触发真实付费图片生成请求。
- 实施前必须阅读仓库 `AGENTS.md`；若安装依赖后存在 `node_modules/next/dist/docs/`，先阅读其中与 App Router、CSS、字体和 Link 相关的本地 Next.js 指南。
- 始终保留用户文件 `.claude/` 与 `HANDOFF.md`，不得暂存或修改。

## 文件结构

### 新增

- `src/components/ui/brand-mark.tsx`：品牌字标及返回首页链接。
- `src/components/ui/editorial-label.tsx`：统一的编辑部式章节眉题。
- `src/components/ui/site-header.tsx`：桌面站点页头，只包含真实路由。
- `src/components/ui/editorial-components.test.tsx`：共享 UI 原语的静态渲染测试。
- `src/components/home/editorial-home.tsx`：组合首页各区块，不持有客户端状态。
- `src/components/home/editorial-home.test.tsx`：首页真实链接、英文文案和乱码回归测试。
- `src/components/diagnosis/diagnosis-progress.tsx`：三步诊断进度显示。
- `src/components/diagnosis/recommendation-meta.tsx`：archetype、personality、category 和规则匹配分数的统一展示。
- `src/components/diagnosis/report-cover.tsx`：报告封面、日期和用户资料摘要。
- `src/components/diagnosis/report-components.test.tsx`：报告元数据、封面及图片状态的静态渲染测试。

### 修改

- `src/app/layout.tsx`：加载衬线展示字体，更新 metadata 与 body 类名。
- `src/app/globals.css`：建立奶油纸张、白色表面、墨黑、暖灰和酒红设计 token。
- `src/app/page.tsx`：变为只组合共享页头、首页区块和页脚的服务器组件。
- `src/app/diagnosis/page.tsx`：保留所有状态/请求，仅替换工作区、表单和完成页结构。
- `src/app/diagnosis/[id]/page.tsx`：使用报告封面和统一组件，移除不可用 transformation CTA。
- `src/app/upload/page.tsx`：仅同步视觉语言，不改变上传测试行为。
- `src/components/diagnosis/photo-upload-card.tsx`：改为竖向杂志画框并强化可访问状态。
- `src/components/diagnosis/style-identity.tsx`：改为报告摘要区。
- `src/components/diagnosis/primary-style-direction.tsx`：改为主推荐双栏跨页。
- `src/components/diagnosis/alternative-style-card.tsx`：改为紧凑双栏替代方案。
- `src/components/diagnosis/full-styling-advice.tsx`：调整服装/发型/鞋履信息层级。
- `src/components/diagnosis/style-preview-image.tsx`：稳定加载/失败/成功三种画框状态。
- `src/components/diagnosis/uploaded-photos.tsx`：统一照片画框和标签。
- `src/components/diagnosis/color-palette.tsx`：改为编辑部式色样列表。

---

### Task 1：建立全局视觉基础和共享 UI 原语

**文件：**
- Create: `src/components/ui/brand-mark.tsx`
- Create: `src/components/ui/editorial-label.tsx`
- Create: `src/components/ui/site-header.tsx`
- Create: `src/components/ui/editorial-components.test.tsx`
- Modify: `src/app/layout.tsx`
- Modify: `src/app/globals.css`

**接口：**
- Produces: `BrandMark({ compact?: boolean })`
- Produces: `EditorialLabel({ children, tone?: "default" | "inverse" })`
- Produces: `SiteHeader({ actionHref?: string, actionLabel?: string })`
- 所有后续页面依赖 CSS 类：`editorial-shell`、`editorial-surface`、`editorial-rule`、`editorial-button`、`editorial-button-secondary`、`editorial-field`、`editorial-focus`。

- [ ] **Step 1：编写共享组件的失败测试**

```tsx
import { renderToStaticMarkup } from "react-dom/server";
import { describe, expect, it } from "vitest";
import { BrandMark } from "./brand-mark";
import { EditorialLabel } from "./editorial-label";
import { SiteHeader } from "./site-header";

describe("editorial UI primitives", () => {
  it("renders the canonical brand and a real diagnosis action", () => {
    const html = renderToStaticMarkup(
      <SiteHeader actionHref="/diagnosis" actionLabel="Begin diagnosis" />
    );
    expect(html).toContain("Style Studio");
    expect(html).toContain('href="/diagnosis"');
    expect(html).not.toContain('href="#"');
  });

  it("renders accessible brand and section labels", () => {
    expect(renderToStaticMarkup(<BrandMark />)).toContain('href="/"');
    expect(renderToStaticMarkup(<EditorialLabel>Report 01</EditorialLabel>))
      .toContain("Report 01");
  });
});
```

- [ ] **Step 2：运行测试，确认因组件不存在而失败**

Run: `npx vitest run src/components/ui/editorial-components.test.tsx`

Expected: FAIL，提示无法解析 `brand-mark`、`editorial-label` 或 `site-header`。

- [ ] **Step 3：实现共享组件**

`BrandMark` 使用 `Link href="/"`，视觉文本固定为 `STYLE / STUDIO`，可访问名称固定为 `Style Studio home`；`compact` 仅缩小字号，不切换品牌文案。`EditorialLabel` 输出 `<p>`，使用大写、字距和一条短酒红线；inverse 模式在深色背景使用奶油色。`SiteHeader` 输出 `<header>` 和带 `aria-label="Primary navigation"` 的 `<nav>`，左侧使用 `BrandMark`，右侧仅在 props 存在时渲染真实 `Link`。

核心实现形状：

```tsx
export function EditorialLabel({
  children,
  tone = "default",
}: {
  children: React.ReactNode;
  tone?: "default" | "inverse";
}) {
  return (
    <p className={`flex items-center gap-3 text-[0.68rem] font-semibold uppercase tracking-[0.24em] ${
      tone === "inverse" ? "text-[var(--paper)]" : "text-[var(--muted-ink)]"
    }`}>
      <span className="h-px w-8 bg-[var(--oxblood)]" aria-hidden="true" />
      {children}
    </p>
  );
}
```

- [ ] **Step 4：更新字体、metadata 和设计 token**

在 `layout.tsx` 中保留 Geist，新增 `Cormorant_Garamond`，暴露为 `--font-editorial`；metadata title 改为 `Style Studio — Personal Style Diagnosis`。在 `globals.css` 中删除暗色媒体查询和 Arial fallback，加入：

```css
:root {
  --paper: #f4efe7;
  --surface: #fffdf9;
  --ink: #151311;
  --muted-ink: #6f685f;
  --line: #d9d0c4;
  --soft-line: #e9e2d8;
  --oxblood: #7b2636;
  --oxblood-hover: #611c2a;
  --success: #37634d;
  --warning: #8b641f;
  --error: #9a3d3d;
  --background: var(--paper);
  --foreground: var(--ink);
}

html { background: var(--paper); }
body {
  background: var(--paper);
  color: var(--ink);
  font-family: var(--font-geist-sans), Arial, sans-serif;
}
.font-editorial { font-family: var(--font-editorial), Georgia, serif; }
.editorial-shell { width: min(100% - 64px, 1320px); margin-inline: auto; }
.editorial-surface { background: var(--surface); border: 1px solid var(--line); }
.editorial-rule { border-color: var(--line); }
.editorial-button {
  display: inline-flex; align-items: center; justify-content: center; gap: .5rem;
  min-height: 44px; padding: .75rem 1.25rem; border-radius: 2px;
  background: var(--oxblood); color: white; font-weight: 600;
  transition: background-color 180ms ease, transform 180ms ease;
}
.editorial-button:hover { background: var(--oxblood-hover); transform: translateY(-1px); }
.editorial-button-secondary {
  display: inline-flex; align-items: center; justify-content: center; min-height: 44px;
  padding: .75rem 1.25rem; border: 1px solid var(--ink); border-radius: 2px;
}
.editorial-field {
  width: 100%; min-height: 46px; border: 1px solid var(--line); border-radius: 2px;
  background: var(--surface); padding: .75rem 1rem; color: var(--ink);
}
:where(a, button, input, select, [role="button"]):focus-visible {
  outline: 2px solid var(--oxblood); outline-offset: 3px;
}
@media (prefers-reduced-motion: reduce) {
  *, *::before, *::after { scroll-behavior: auto !important; transition-duration: .01ms !important; animation-duration: .01ms !important; }
}
```

- [ ] **Step 5：运行测试和静态检查**

Run: `npx vitest run src/components/ui/editorial-components.test.tsx`

Expected: PASS，2 tests passed。

Run: `npx tsc --noEmit`

Expected: exit 0。

- [ ] **Step 6：提交视觉基础**

```bash
git add src/app/layout.tsx src/app/globals.css src/components/ui
git commit -m "feat: add editorial design foundation"
```

---

### Task 2：重构桌面首页为编辑部式落地页

**文件：**
- Create: `src/components/home/editorial-home.tsx`
- Create: `src/components/home/editorial-home.test.tsx`
- Modify: `src/app/page.tsx`

**接口：**
- Consumes: `SiteHeader`、`EditorialLabel`、全局 editorial CSS 类。
- Produces: `EditorialHome()`，由首页服务器组件直接渲染。

- [ ] **Step 1：编写首页失败测试**

```tsx
import { renderToStaticMarkup } from "react-dom/server";
import { describe, expect, it } from "vitest";
import { EditorialHome } from "./editorial-home";

describe("EditorialHome", () => {
  it("uses only real links and canonical English copy", () => {
    const html = renderToStaticMarkup(<EditorialHome />);
    expect(html).toContain("A personal style report, edited for you.");
    expect(html).toContain("Three photographs. One considered direction.");
    expect(html).toContain('href="/diagnosis"');
    expect(html).toContain('href="#process"');
    expect(html).not.toContain('href="#"');
    expect(html).not.toMatch(/Privacy|Terms|Pricing|Login/);
  });

  it("contains no known mojibake markers", () => {
    const html = renderToStaticMarkup(<EditorialHome />);
    expect(html).not.toMatch(/鈥|鈫|骞|噣|漏|�/);
  });
});
```

- [ ] **Step 2：运行测试，确认失败**

Run: `npx vitest run src/components/home/editorial-home.test.tsx`

Expected: FAIL，提示 `editorial-home` 不存在。

- [ ] **Step 3：实现首页各区块**

`EditorialHome` 在同一职责文件中定义并组合 `Hero`、`Process`、`SampleReport`、`PrivacyNotes`、`FAQ`、`ClosingCTA`、`SiteFooter`。所有 CTA 只使用 `/diagnosis` 或页面内真实锚点 `#process`；移除移动菜单状态和所有假链接。必须使用以下真实内容：

```tsx
const steps = [
  ["01", "Upload", "Front, profile, and full-length photographs in natural light."],
  ["02", "Profile", "A few practical details help shape proportion and styling context."],
  ["03", "Report", "Receive a primary direction, alternatives, colors, and practical advice."],
] as const;

const proofPoints = [
  ["Private by design", "Anonymous sessions are available; no account is required."],
  ["Durable reports", "Generated preview assets are stored for reliable report viewing."],
  ["Actionable output", "Recommendations include clothing, hair, shoes, colors, and avoid notes."],
] as const;
```

Hero 使用 12 栏桌面网格：左侧 7 栏为标题、说明和 CTA，右侧 5 栏为带 `REPORT / 01`、`Clean Casual`、`Modern Minimalist`、颜色和建议摘要的纸张样例。不要使用虚假的人物照片或外部图片。

Sample Report 只能展示 `title`、`summary`、`clothingAdvice`、`shoesAdvice`、`colorPalette`、`avoidTips` 和 archetype 元数据等产品真实字段。FAQ 保留 `<details>` 原生交互，问答只描述当前已实现能力。

- [ ] **Step 4：把 `src/app/page.tsx` 缩减为服务器组合页**

```tsx
import { EditorialHome } from "@/components/home/editorial-home";

export default function Home() {
  return <EditorialHome />;
}
```

- [ ] **Step 5：运行首页测试、lint 和类型检查**

Run: `npx vitest run src/components/home/editorial-home.test.tsx`

Expected: PASS，2 tests passed。

Run: `npm run lint && npx tsc --noEmit`

Expected: 两条命令均 exit 0。

- [ ] **Step 6：提交首页重构**

```bash
git add src/app/page.tsx src/components/home
git commit -m "feat: redesign editorial landing page"
```

---

### Task 3：重设计诊断工作区与上传画框

**文件：**
- Create: `src/components/diagnosis/diagnosis-progress.tsx`
- Modify: `src/components/diagnosis/photo-upload-card.tsx`
- Modify: `src/app/diagnosis/page.tsx`
- Test: `src/components/diagnosis/diagnosis-workspace.test.tsx`

**接口：**
- Produces: `DiagnosisProgress({ current: "upload" | "info" | "report" })`
- `PhotoUploadCard` props 和上传回调签名保持不变。
- `DiagnosisPage` 继续独占匿名会话、上传、校验、提交和结果状态。

- [ ] **Step 1：编写进度和上传画框失败测试**

```tsx
import { renderToStaticMarkup } from "react-dom/server";
import { describe, expect, it, vi } from "vitest";
import { DiagnosisProgress } from "./diagnosis-progress";
import { PhotoUploadCard } from "./photo-upload-card";

describe("diagnosis workspace", () => {
  it("announces the active step", () => {
    const html = renderToStaticMarkup(<DiagnosisProgress current="info" />);
    expect(html).toContain('aria-current="step"');
    expect(html).toContain("Your profile");
  });

  it("keeps an accessible upload name and portrait frame", () => {
    const html = renderToStaticMarkup(
      <PhotoUploadCard
        role="FACE_FRONT" label="Front face" status="idle"
        onFileSelect={vi.fn()}
      />
    );
    expect(html).toContain('aria-label="Upload Front face"');
    expect(html).toContain("aspect-[4/5]");
    expect(html).toContain("Clear, well-lit front face");
  });
});
```

- [ ] **Step 2：运行测试，确认失败**

Run: `npx vitest run src/components/diagnosis/diagnosis-workspace.test.tsx`

Expected: FAIL，因为 `DiagnosisProgress` 不存在且上传卡仍为正方形。

- [ ] **Step 3：实现 `DiagnosisProgress`**

使用有序列表输出 `Photographs`、`Your profile`、`Your report`。当前项带 `aria-current="step"`，过去项使用 Check 图标并包含 visually hidden 文本 `Completed`；状态不能只靠颜色。

```tsx
const STEPS = [
  { id: "upload", number: "01", label: "Photographs" },
  { id: "info", number: "02", label: "Your profile" },
  { id: "report", number: "03", label: "Your report" },
] as const;
```

- [ ] **Step 4：重绘 `PhotoUploadCard`，保留所有行为**

将根容器改为 `aspect-[4/5] rounded-[2px] border border-dashed`；预览图继续 `object-cover`。上传中覆盖层保留稳定尺寸并显示 `Uploading photograph…`；失败状态显示错误文字与 Retry；成功状态使用文字 `Uploaded` 加 check 图标。保留键盘 Enter/Space、隐藏 file input、`accept="image/*"` 和原有回调。

- [ ] **Step 5：只重组诊断页展示层**

保留文件顶部所有 state、memo、effect、`handleFileSelect`、`validateForm`、`handleSubmit` 和 `canSubmit` 原样。替换 JSX：

- 顶部使用 `SiteHeader` 紧凑品牌导航和 `DiagnosisProgress`。
- 主区域宽度使用 `editorial-shell max-w-[1120px]`。
- 上传步骤左侧为章节标题和照片说明，右侧为三个竖向画框；1024px 仍保持三列。
- Profile 步骤使用两栏表单，所有 input 使用 `editorial-field`，错误通过 `aria-describedby` 关联。
- 初始化、失败、上传、分析状态继续同时显示图标和文字。
- disabled 按钮附近显示条件说明，如 `Upload all three photographs to continue.`。
- 结果状态改为报告封面：`REPORT COMPLETE`、推荐标题、summary、`View full report`，链接仍为 `/diagnosis/${result.id}`。
- 修复当前 `鈫?Back to photos` 为 `Back to photographs`。

- [ ] **Step 6：运行针对性测试和完整类型检查**

Run: `npx vitest run src/components/diagnosis/diagnosis-workspace.test.tsx`

Expected: PASS，2 tests passed。

Run: `npm run lint && npx tsc --noEmit`

Expected: exit 0。

- [ ] **Step 7：提交诊断工作区**

```bash
git add src/app/diagnosis/page.tsx src/components/diagnosis/diagnosis-progress.tsx src/components/diagnosis/diagnosis-workspace.test.tsx src/components/diagnosis/photo-upload-card.tsx
git commit -m "feat: redesign diagnosis workspace"
```

---

### Task 4：统一报告元数据、封面和图片状态

**文件：**
- Create: `src/components/diagnosis/recommendation-meta.tsx`
- Create: `src/components/diagnosis/report-cover.tsx`
- Create: `src/components/diagnosis/report-components.test.tsx`
- Modify: `src/components/diagnosis/style-preview-image.tsx`
- Modify: `src/components/diagnosis/style-identity.tsx`

**接口：**
- Produces: `RecommendationMeta({ archetype, matchScore, compact?: boolean })`
- Produces: `ReportCover({ createdAt, gender, age, heightCm, weightKg, status })`
- Consumes: `ReportRecommendation["archetype"]` 与 `number | null`。

- [ ] **Step 1：编写报告组件失败测试**

```tsx
import { renderToStaticMarkup } from "react-dom/server";
import { describe, expect, it } from "vitest";
import { RecommendationMeta } from "./recommendation-meta";
import { ReportCover } from "./report-cover";
import { StylePreviewImage } from "./style-preview-image";

describe("editorial report components", () => {
  it("labels match score as deterministic rules data", () => {
    const html = renderToStaticMarkup(
      <RecommendationMeta
        archetype={{ id: "a1", name: "Old Money", personalityLabel: "Quiet Authority", category: "Classic" }}
        matchScore={87}
      />
    );
    expect(html).toContain("Rules match 87%");
    expect(html).not.toMatch(/AI confidence|AI accuracy|AI score/i);
  });

  it("keeps legacy recommendations empty rather than inventing metadata", () => {
    expect(renderToStaticMarkup(<RecommendationMeta archetype={null} matchScore={null} />))
      .toBe("");
  });

  it("renders stable unavailable preview copy", () => {
    const html = renderToStaticMarkup(
      <StylePreviewImage status="FAILED" url={null} title="Old Money" />
    );
    expect(html).toContain("Style preview unavailable");
    expect(html).toContain("aspect-[4/5]");
  });

  it("renders report profile fields", () => {
    const html = renderToStaticMarkup(
      <ReportCover createdAt="July 13, 2026" gender="MALE" age={30} heightCm={178} weightKg={75} status="PREVIEW_READY" />
    );
    expect(html).toContain("July 13, 2026");
    expect(html).toContain("178 cm");
  });
});
```

- [ ] **Step 2：运行测试，确认失败**

Run: `npx vitest run src/components/diagnosis/report-components.test.tsx`

Expected: FAIL，提示新组件不存在。

- [ ] **Step 3：实现共享报告元数据**

`RecommendationMeta` 在 archetype 为 null 时返回 null；有 archetype 时输出定义列表，顺序为 `Archetype`、`Personality`、`Category`、`Rules match`。matchScore 为 null 时不输出最后一项。`compact` 只改变字号与间距，不改变文案。

```tsx
type Archetype = ReportRecommendation["archetype"];

export function RecommendationMeta({ archetype, matchScore, compact = false }: {
  archetype: Archetype;
  matchScore: number | null;
  compact?: boolean;
}) {
  if (!archetype) return null;
  const items = [
    ["Archetype", archetype.name],
    ...(archetype.personalityLabel ? [["Personality", archetype.personalityLabel]] : []),
    ["Category", archetype.category],
    ...(matchScore === null ? [] : [["Rules match", `${matchScore}%`]]),
  ];
  return (
    <dl
      aria-label="Recommendation match details"
      className={`grid border-y border-[var(--line)] ${
        compact ? "grid-cols-2 gap-x-4 py-3 text-xs" : "grid-cols-2 gap-x-8 py-4 text-sm"
      }`}
    >
      {items.map(([label, value]) => (
        <div key={`${label}-${value}`} className="flex justify-between gap-3 border-b border-[var(--soft-line)] py-2 last:border-b-0">
          <dt className="uppercase tracking-[0.12em] text-[var(--muted-ink)]">{label}</dt>
          <dd className="text-right font-medium text-[var(--ink)]">{value}</dd>
        </div>
      ))}
    </dl>
  );
}
```

实现时必须把注释位置替换成实际 `items.map`，使用唯一 key `${label}-${value}`，并让最终可见文本连读为 `Rules match 87%`。

- [ ] **Step 4：实现报告封面与稳定图片画框**

`ReportCover` 使用 `<header>`、`EditorialLabel`、日期、`Your personal style report` 和 4 个资料字段。状态显示 `Report ready` 或 `Report in progress`，同时包含图标和文字。`StylePreviewImage` 保留三个分支，统一 `rounded-[2px] bg-[#ebe5dc]`，加载动画遵守 reduced motion，成功图不再 hover 放大，避免杂志画面晃动。

- [ ] **Step 5：重绘 Style Identity**

保留 props 不变。用 `EditorialLabel` 标注 `Style identity`，标题优先显示第一个 vibe keyword，bodyType、faceShape、summary 作为横向报告摘要；没有数据时继续使用 `N/A`/`Custom style`，不抛错。

- [ ] **Step 6：运行测试与静态检查**

Run: `npx vitest run src/components/diagnosis/report-components.test.tsx`

Expected: PASS，4 tests passed。

Run: `npm run lint && npx tsc --noEmit`

Expected: exit 0。

- [ ] **Step 7：提交报告基础组件**

```bash
git add src/components/diagnosis/recommendation-meta.tsx src/components/diagnosis/report-cover.tsx src/components/diagnosis/report-components.test.tsx src/components/diagnosis/style-preview-image.tsx src/components/diagnosis/style-identity.tsx
git commit -m "feat: add editorial report foundations"
```

---

### Task 5：重组完整报告页和推荐卡片

**文件：**
- Modify: `src/app/diagnosis/[id]/page.tsx`
- Modify: `src/components/diagnosis/primary-style-direction.tsx`
- Modify: `src/components/diagnosis/alternative-style-card.tsx`
- Modify: `src/components/diagnosis/full-styling-advice.tsx`
- Modify: `src/components/diagnosis/color-palette.tsx`
- Modify: `src/components/diagnosis/uploaded-photos.tsx`

**接口：**
- Consumes: `ReportCover`、`RecommendationMeta`、`EditorialLabel`。
- 现有 `ReportRecommendation` 类型和所有 preview generation 状态保持不变。

- [ ] **Step 1：先把三个推荐组件改用统一元数据组件**

在 `PrimaryStyleDirection`、`AlternativeStyleCard`、`FullStylingAdvice` 删除重复 archetype/match JSX，统一调用：

```tsx
<RecommendationMeta
  archetype={recommendation.archetype}
  matchScore={recommendation.matchScore}
  compact={variant !== "primary"}
/>
```

实际文件没有 `variant` 变量：主推荐省略 `compact`，替代卡和完整建议传 `compact`。不得更改推荐字段或截断主推荐内容。

- [ ] **Step 2：重绘主推荐与替代推荐**

主推荐使用桌面 `grid-cols-[minmax(0,0.92fr)_minmax(0,1.08fr)]`，左侧 4:5 图片，右侧依次为 `EditorialLabel`、标题、description、元数据、summary、Key look、colors、avoid。容器采用轻微不对称留白和 2px 圆角。

替代推荐在父级保持两列，每张卡内部图片和文案纵向排列；移除胶囊形 Option 标签，改为 `DIRECTION 02/03` 编辑部眉题。rank 显示使用传入值加 1 形成 02/03，不改数据库 rank。

- [ ] **Step 3：重绘完整建议、颜色和上传照片**

- `FullStylingAdvice` 每条推荐使用三列：Outfit、Hair、Shoes；移除 `line-clamp-5`，允许用户读取全部建议。
- `ColorPalette` 使用 `<ul>`/`<li>`，色点必须保留边框以显示 white；未知 CSS 颜色仍显示文字，浏览器忽略非法 backgroundColor 即可。
- `UploadedPhotos` 在桌面保持三列，图片改为 4:5，标签位于细分隔线下。

- [ ] **Step 4：重组报告页但保留请求逻辑**

保留 `fetchDiagnosis`、`requestStylePreviews`、自动生成 `useEffect`、FAILED 判断和 Retry 按钮逻辑原样。页面结构依次为：

1. `SiteHeader`，action 为 `New diagnosis` → `/diagnosis`。
2. `ReportCover`。
3. `StyleIdentity`。
4. `PrimaryStyleDirection`。
5. 两列 Alternative directions。
6. `FullStylingAdvice`。
7. `UploadedPhotos`。
8. 失败预览 retry 区。
9. 仅保留真实 `Start a new diagnosis` 末尾链接。

完全删除 `Want to see yourself in this style?`、disabled transformation button 及 `Coming Soon` 文案。Loading/Error 页面也使用设计 token 和真实 `/diagnosis` 链接。

- [ ] **Step 5：增加源文件级防回归断言**

在 `report-components.test.tsx` 增加：

```tsx
import { readFileSync } from "node:fs";
import { resolve } from "node:path";

it("does not advertise an unavailable transformation image", () => {
  const source = readFileSync(resolve("src/app/diagnosis/[id]/page.tsx"), "utf8");
  expect(source).not.toMatch(/transformation image|Coming Soon/i);
  expect(source).toContain("Retry Failed Previews");
});
```

- [ ] **Step 6：运行报告测试和完整静态检查**

Run: `npx vitest run src/components/diagnosis/report-components.test.tsx src/lib/ai/style-preview-policy.test.ts`

Expected: PASS；报告组件测试 5 条，preview policy 测试 2 条。

Run: `npm run lint && npx tsc --noEmit`

Expected: exit 0。

- [ ] **Step 7：提交完整报告页**

```bash
git add src/app/diagnosis/[id]/page.tsx src/components/diagnosis/primary-style-direction.tsx src/components/diagnosis/alternative-style-card.tsx src/components/diagnosis/full-styling-advice.tsx src/components/diagnosis/color-palette.tsx src/components/diagnosis/uploaded-photos.tsx src/components/diagnosis/report-components.test.tsx
git commit -m "feat: redesign editorial style report"
```

---

### Task 6：统一上传测试页并清除可见乱码

**文件：**
- Modify: `src/app/upload/page.tsx`
- Modify: `src/components/home/editorial-home.test.tsx`

**接口：**
- 上传测试页的状态类型、匿名会话请求和 `/api/upload` 调用保持不变。

- [ ] **Step 1：添加乱码扫描失败测试**

在 `editorial-home.test.tsx` 中追加：

```tsx
import { readFileSync } from "node:fs";
import { resolve } from "node:path";

it("contains no mojibake in user-facing UI sources", () => {
  const files = [
    "src/app/page.tsx",
    "src/app/diagnosis/page.tsx",
    "src/app/diagnosis/[id]/page.tsx",
    "src/app/upload/page.tsx",
    "src/components/home/editorial-home.tsx",
    "src/components/diagnosis/full-styling-advice.tsx",
  ];
  for (const file of files) {
    expect(readFileSync(resolve(file), "utf8"), file).not.toMatch(/鈥|鈫|骞|噣|漏|�/);
  }
});
```

- [ ] **Step 2：运行测试并记录当前乱码失败位置**

Run: `npx vitest run src/components/home/editorial-home.test.tsx`

Expected: FAIL，并指出仍含乱码的源文件；若前序任务已清完则直接 PASS，继续下一步。

- [ ] **Step 3：同步上传测试页视觉**

保留所有 hooks、fetch、FormData 和结果展示逻辑。外层使用 `SiteHeader` 和 `editorial-shell`，标题改为 `Upload pipeline test`，三张上传卡采用 4:5 编辑部画框，session id 和结果作为等宽小字元数据。按钮、错误、成功状态改用全局 token，不增加新功能。

- [ ] **Step 4：清除扫描范围内全部乱码**

将误编码字符替换成正确英文标点或文案；不要把中文加入产品 UI。再次搜索：

Run: `Get-ChildItem src -Recurse -File | Select-String -Pattern '鈥|鈫|骞|噣|漏|�'`

Expected: 无输出。

- [ ] **Step 5：运行测试与静态检查**

Run: `npx vitest run src/components/home/editorial-home.test.tsx`

Expected: PASS，3 tests passed。

Run: `npm run lint && npx tsc --noEmit`

Expected: exit 0。

- [ ] **Step 6：提交上传页和乱码修复**

```bash
git add src/app/upload/page.tsx src/components/home/editorial-home.test.tsx
git commit -m "refactor: align upload test with editorial UI"
```

---

### Task 7：完整验证与桌面浏览器视觉验收

**文件：**
- Modify only if verification exposes a concrete defect in files already listed above.

**接口：**
- 本任务不创建产品功能，只验证前六个任务形成的可发布 UI。

- [ ] **Step 1：确认工作树范围**

Run: `git status --short`

Expected: 仅允许用户自有的 `?? .claude/`、`?? HANDOFF.md`；没有未提交的 UI 文件。

- [ ] **Step 2：运行完整测试套件**

Run: `npm run test`

Expected: 所有测试文件和测试用例 PASS，exit 0。

- [ ] **Step 3：运行 lint、TypeScript 和生产构建**

Run: `npm run lint`

Expected: exit 0，无 error。

Run: `npx tsc --noEmit`

Expected: exit 0。

Run: `npm run build`

Expected: Next.js production build 成功，exit 0。

- [ ] **Step 4：以不触发付费图片生成的方式准备浏览器数据**

优先使用已有诊断报告 URL 检查报告页。不要点击会创建新 style preview 的报告；若没有安全的现有报告，只检查首页、诊断上传/资料页、静态 loading/error 状态，并通过已有单元测试验证预览状态组件。不得调用 POST `/api/diagnosis/[id]/style-previews`。

- [ ] **Step 5：启动本地开发服务并检查桌面宽度**

Run: `npm run dev`

Expected: 本地 Next.js 服务启动且无启动错误。

在浏览器中分别设置 1024×900、1280×900、1440×1000，检查：

- `/`：Hero 非对称、过程编号、样例报告、Privacy proof、FAQ、深色 CTA、无假链接。
- `/diagnosis`：会话状态、三张 4:5 上传画框、键盘焦点、disabled 说明。
- Profile step：字段 label/单位、错误、Back、submit loading。
- Completion state：报告封面和真实报告链接。
- `/diagnosis/[safe-id]`：封面、主推荐、两列替代推荐、完整建议、上传照片、preview loading/failure/retry。
- `/upload`：视觉统一且上传测试功能未改变。

每个宽度都检查横向滚动、文字截断、图像变形、布局跳动、对比度、焦点环和按钮状态。

- [ ] **Step 6：修复视觉验收发现的具体问题并重复验证**

每次只修复已观察到的问题，重新运行相关 Vitest 文件、`npm run lint` 和 `npx tsc --noEmit`。若改动影响整体布局，再重复 1024、1280、1440 三个宽度截图检查。

- [ ] **Step 7：提交最终 QA 修复（仅在确有改动时）**

????????? UI ???Git ?????????

```bash
git add -- src/app/globals.css src/app/layout.tsx src/app/page.tsx src/app/diagnosis/page.tsx src/app/diagnosis/[id]/page.tsx src/app/upload/page.tsx src/components/ui src/components/home src/components/diagnosis
git commit -m "fix: polish editorial desktop layouts"
```

- [ ] **Step 8：最终交付核对**

Run: `git log --oneline --max-count=8`

Expected: 设计文档提交后依次出现 foundation、landing、diagnosis、report foundations、report redesign、upload alignment，以及可选 QA 修复提交。

Run: `git status --short`

Expected: UI 工作树干净；`.claude/` 与 `HANDOFF.md` 仍保持未跟踪且未被修改。

## 自检结果

- 规范覆盖：视觉系统、首页、诊断、报告、上传测试页、错误/空状态、可访问性、桌面宽度和非目标均已对应到明确任务。
- 行为边界：计划没有修改 API、数据库、matching 或 provider；预览自动生成和失败重试明确保留。
- 链接边界：所有导航只指向 `/`、`/diagnosis`、`/upload` 或真实页面锚点。
- 类型一致性：报告组件统一消费现有 `ReportRecommendation`，没有创建平行推荐类型。
- 测试策略：可服务器渲染组件使用 `react-dom/server`，客户端 fetch 页面保持现有业务测试并由浏览器验收覆盖。
- 付费安全：视觉 QA 明确禁止触发 style-preview POST。
- 子代理限制：执行方式固定为当前会话内的 `superpowers:executing-plans`。
