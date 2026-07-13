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
    expect(
      renderToStaticMarkup(<EditorialLabel>Report 01</EditorialLabel>)
    ).toContain("Report 01");
  });
});
