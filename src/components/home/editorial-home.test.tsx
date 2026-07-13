import { readFileSync } from "node:fs";
import { resolve } from "node:path";
import { renderToStaticMarkup } from "react-dom/server";
import { describe, expect, it } from "vitest";
import { EditorialHome } from "./editorial-home";

const mojibakeMarkers = [
  0x9225,
  0x922b,
  0x9a9e,
  0x5663,
  0x6f0f,
  0xfffd,
].map((codepoint) => String.fromCodePoint(codepoint));

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

    for (const marker of mojibakeMarkers) {
      expect(html).not.toContain(marker);
    }
  });

  it("keeps the upload test inside the editorial interface", () => {
    const source = readFileSync(resolve("src/app/upload/page.tsx"), "utf8");

    expect(source).toContain("SiteHeader");
    expect(source).toContain("Upload validation");
    expect(source).not.toContain("Sprint 1 Upload Test");
  });
});
