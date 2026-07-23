import { describe, expect, it, vi, afterEach } from "vitest";
import { createProductionIdentityRestoreProvider } from "./identity-restore-factory";
import * as faceSwapIdentityRestore from "./face-swap-identity-restore";
import * as mockProviders from "../mock-providers";

vi.mock("./face-swap-identity-restore", () => ({
  createFaceSwapIdentityRestoreProvider: vi.fn(() => ({ name: "face-swap-mock" })),
}));

vi.mock("../mock-providers", () => ({
  createMockIdentityRestoreProvider: vi.fn(() => ({ name: "mock" })),
}));

describe("createProductionIdentityRestoreProvider", () => {
  const originalEnv = process.env;

  afterEach(() => {
    process.env = { ...originalEnv };
    vi.clearAllMocks();
  });

  it("uses replicate when FACE_SWAP_PROVIDER=replicate", () => {
    process.env.FACE_SWAP_PROVIDER = "replicate";

    const provider = createProductionIdentityRestoreProvider();

    expect(provider.name).toBe("face-swap-mock");
    expect(faceSwapIdentityRestore.createFaceSwapIdentityRestoreProvider).toHaveBeenCalledTimes(1);
    expect(mockProviders.createMockIdentityRestoreProvider).not.toHaveBeenCalled();
  });

  it("falls back to mock when no provider is configured", () => {
    delete process.env.FACE_SWAP_PROVIDER;

    const provider = createProductionIdentityRestoreProvider();

    expect(provider.name).toBe("mock");
    expect(mockProviders.createMockIdentityRestoreProvider).toHaveBeenCalledTimes(1);
    expect(faceSwapIdentityRestore.createFaceSwapIdentityRestoreProvider).not.toHaveBeenCalled();
  });

  it("falls back to mock for unknown provider names", () => {
    process.env.FACE_SWAP_PROVIDER = "volcengine";

    const provider = createProductionIdentityRestoreProvider();

    expect(provider.name).toBe("mock");
    expect(mockProviders.createMockIdentityRestoreProvider).toHaveBeenCalledTimes(1);
  });
});
