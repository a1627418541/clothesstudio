import { renderToStaticMarkup } from "react-dom/server";
import { readFileSync } from "node:fs";
import { resolve } from "node:path";
import { describe, expect, it } from "vitest";
import { RecommendationMeta } from "./recommendation-meta";
import { ReportCover } from "./report-cover";
import { StylePreviewImage } from "./style-preview-image";

describe("editorial report components", () => {
  it("labels match score as deterministic rules data", () => {
    const html = renderToStaticMarkup(
      <RecommendationMeta
        archetype={{
          id: "a1",
          name: "Old Money",
          personalityLabel: "Quiet Authority",
          category: "Classic",
        }}
        matchScore={87}
      />
    );

    expect(html).toContain("Rules match");
    expect(html).toContain("87%");
    expect(html).not.toMatch(/AI confidence|AI accuracy|AI score/i);
  });

  it("keeps legacy recommendations empty rather than inventing metadata", () => {
    expect(
      renderToStaticMarkup(
        <RecommendationMeta archetype={null} matchScore={null} />
      )
    ).toBe("");
  });

  it("renders stable unavailable preview copy", () => {
    const html = renderToStaticMarkup(
      <StylePreviewImage status="FAILED" url={null} title="Old Money" />
    );

    expect(html).toContain("搭配图片暂不可用");
    expect(html).toContain("aspect-[4/5]");
  });

  it("renders report profile fields", () => {
    const html = renderToStaticMarkup(
      <ReportCover
        createdAt="July 13, 2026"
        gender="MALE"
        age={30}
        heightCm={178}
        weightKg={75}
        status="PREVIEW_READY"
      />
    );

    expect(html).toContain("July 13, 2026");
    expect(html).toContain("178 cm");
    expect(html).toContain("Report ready");
  });

  it("does not advertise an unavailable transformation image", () => {
    const source = readFileSync(
      resolve("src/app/diagnosis/[id]/page.tsx"),
      "utf8"
    );

    expect(source).not.toMatch(/transformation image|Coming Soon/i);
    expect(source).toContain("Retry Failed Previews");
  });
});
