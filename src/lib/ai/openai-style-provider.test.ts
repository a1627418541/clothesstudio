import { describe, expect, it } from "vitest";
import { getOpenAiClientOptions } from "./openai-client-config";

describe("getOpenAiClientOptions", () => {
  it("passes a configured compatible base URL to the OpenAI SDK", () => {
    expect(
      getOpenAiClientOptions("test-key", "https://gateway.example.com/v1/")
    ).toEqual({
      apiKey: "test-key",
      baseURL: "https://gateway.example.com/v1",
    });
  });

  it("omits baseURL when none is configured", () => {
    expect(getOpenAiClientOptions("test-key", "  ")).toEqual({
      apiKey: "test-key",
    });
  });
});
