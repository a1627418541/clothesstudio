import { describe, expect, it } from "vitest";
import {
  assertCredentials,
  benchmarkExitCode,
  isDirectExecution,
  parseArguments,
  selectedProviderNames,
} from "./benchmark-domestic-try-on";
import type { PersistedBenchmarkResult } from "../src/lib/try-on/benchmark/run-benchmark";

describe("domestic try-on benchmark CLI helpers", () => {
  it.each([
    ["tencent", ["tencent"]],
    ["volcengine", ["volcengine"]],
    ["all", ["tencent", "volcengine"]],
  ] as const)("selects %s providers", (selection, expected) => {
    expect(selectedProviderNames(selection)).toEqual(expected);
    expect(parseArguments(["--manifest", "manifest.json", "--provider", selection]))
      .toEqual({ manifest: "manifest.json", provider: selection });
  });

  it("requires only the selected providers' credential names and never values", () => {
    const environment = {
      TENCENT_CLOUD_SECRET_ID: "",
      TENCENT_CLOUD_SECRET_KEY: "private-tencent-value",
      VOLCENGINE_ACCESS_KEY_ID: "",
      VOLCENGINE_SECRET_ACCESS_KEY: "private-volc-value",
    };

    expect(() => assertCredentials(["tencent"], environment))
      .toThrow("TENCENT_CLOUD_SECRET_ID");
    expect(() => assertCredentials(["volcengine"], environment))
      .toThrow("VOLCENGINE_ACCESS_KEY_ID");
    for (const secret of ["private-tencent-value", "private-volc-value"]) {
      try {
        assertCredentials(["tencent", "volcengine"], environment);
      } catch (error) {
        expect((error as Error).message).not.toContain(secret);
      }
    }
  });

  it("returns zero for partial success and nonzero when every result failed or was unsupported", () => {
    const success = {
      caseId: "top-01",
      category: "TOP",
      provider: "tencent",
      durationMs: 1,
      status: "SUCCEEDED",
      imageFile: "top-01-tencent.jpg",
      requestId: "t-1",
    } satisfies PersistedBenchmarkResult;
    const failed = {
      caseId: "top-01",
      category: "TOP",
      provider: "volcengine",
      durationMs: 1,
      status: "FAILED",
      errorCode: "PROVIDER_FAILED",
    } satisfies PersistedBenchmarkResult;
    const unsupported = {
      caseId: "dress-01",
      category: "DRESS",
      provider: "volcengine",
      durationMs: 0,
      status: "UNSUPPORTED",
      errorCode: "UNSUPPORTED_CATEGORY",
    } satisfies PersistedBenchmarkResult;

    expect(benchmarkExitCode([failed, success])).toBe(0);
    expect(benchmarkExitCode([failed, unsupported])).toBe(1);
  });

  it("does not treat a test import as direct CLI execution", () => {
    expect(isDirectExecution("file:///repo/script.ts", "C:/repo/other.ts")).toBe(false);
    expect(isDirectExecution("file:///C:/repo/script.ts", "C:/repo/script.ts")).toBe(true);
  });
});
