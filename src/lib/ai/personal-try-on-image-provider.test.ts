import { describe, expect, it } from "vitest";
import { mockPersonalTryOnProvider } from "./mock-personal-try-on-provider";

describe("mockPersonalTryOnProvider", () => {
  it("returns a fixed URL without real network calls", async () => {
    const result = await mockPersonalTryOnProvider.generate({
      prompt: "test prompt",
      fullBodyImage: "https://signed.example/full-body.jpg",
      frontFaceImage: "https://signed.example/front-face.jpg",
      size: "1024x1792",
    });
    expect(result.url).toBe("https://r2.example/personal-try-on/result.png");
    expect(result.error).toBeNull();
  });
});
