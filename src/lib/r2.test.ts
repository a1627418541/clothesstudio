import { describe, expect, it } from "vitest";
import { buildR2PublicUrl } from "./r2";

describe("buildR2PublicUrl", () => {
  it("normalizes the public base URL", () => {
    expect(
      buildR2PublicUrl("https://assets.example.com/", "style-previews/a.png")
    ).toBe("https://assets.example.com/style-previews/a.png");
  });

  it("requires an absolute HTTP(S) public base URL", () => {
    expect(() => buildR2PublicUrl("", "a.png")).toThrow(
      "Missing CLOUDFLARE_R2_PUBLIC_BASE_URL"
    );
    expect(() => buildR2PublicUrl("assets.example.com", "a.png")).toThrow(
      "CLOUDFLARE_R2_PUBLIC_BASE_URL must be an absolute HTTP(S) URL"
    );
  });
});
