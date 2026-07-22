import { describe, expect, it } from "vitest";
import { loadDomesticTryOnConfig } from "./config";

describe("loadDomesticTryOnConfig", () => {
  it("reports missing Tencent variables without exposing values", () => {
    expect(() => loadDomesticTryOnConfig("tencent", {})).toThrow(
      "Missing try-on environment variables: TENCENT_CLOUD_SECRET_ID, TENCENT_CLOUD_SECRET_KEY"
    );
  });

  it("loads Volcengine credentials and defaults the region", () => {
    expect(
      loadDomesticTryOnConfig("volcengine", {
        VOLCENGINE_ACCESS_KEY_ID: "ak",
        VOLCENGINE_SECRET_ACCESS_KEY: "sk",
      })
    ).toEqual({
      provider: "volcengine",
      accessKeyId: "ak",
      secretAccessKey: "sk",
      region: "cn-beijing",
    });
  });
});
