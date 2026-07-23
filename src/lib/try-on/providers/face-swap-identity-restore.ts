import type { FaceSwapProvider } from "@/lib/ai/face-swap-provider";
import { storeImageFromUrlOrBase64 } from "@/lib/r2-image-store";
import type { IdentityRestoreProvider } from "../types";

function makeR2Key(): string {
  const timestamp = Date.now();
  const random = Math.random().toString(36).slice(2, 10);
  return `try-on/identity-restore/${timestamp}-${random}.png`;
}

export function createFaceSwapIdentityRestoreProvider(
  faceSwapProvider: FaceSwapProvider
): IdentityRestoreProvider {
  return {
    name: "face-swap",
    async restore(input) {
      const swapResult = await faceSwapProvider.swap({
        faceImageUrl: input.faceImageUrl,
        sourceImageUrl: input.composedImageUrl,
      });

      if (swapResult.error) {
        throw new Error(`IDENTITY_RESTORE_FAILED: ${swapResult.error}`);
      }

      if (!swapResult.url && !swapResult.base64) {
        throw new Error("IDENTITY_RESTORE_FAILED: no image returned");
      }

      const storeResult = await storeImageFromUrlOrBase64({
        url: swapResult.url ?? null,
        base64: swapResult.base64 ?? null,
        key: makeR2Key(),
      });

      if ("error" in storeResult) {
        throw new Error(`IDENTITY_RESTORE_STORAGE_FAILED: ${storeResult.error}`);
      }

      return { imageUrl: storeResult.url };
    },
  };
}
