import { replicateFaceSwapProvider } from "@/lib/ai/replicate-face-swap-provider";
import { createMockIdentityRestoreProvider } from "../mock-providers";
import { createFaceSwapIdentityRestoreProvider } from "./face-swap-identity-restore";
import type { IdentityRestoreProvider } from "../types";

export function createProductionIdentityRestoreProvider(): IdentityRestoreProvider {
  const providerName =
    process.env.FACE_SWAP_PROVIDER?.toLowerCase().trim() || "mock";

  if (providerName === "replicate") {
    return createFaceSwapIdentityRestoreProvider(replicateFaceSwapProvider);
  }

  // Replicate is the only real provider currently supported. Fall back to mock
  // when no provider is explicitly configured so local dev/test still works.
  return createMockIdentityRestoreProvider();
}
