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
    expect(html).not.toMatch(/Terms|Pricing|Login/);
  });

  it("contains no known mojibake markers", () => {
    const html = renderToStaticMarkup(<EditorialHome />);
    expect(html).not.toMatch(/鈥|鈫|骞|噣|漏|�/);
  });
});
