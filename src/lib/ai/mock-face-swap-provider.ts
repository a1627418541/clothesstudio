import { FaceSwapProvider, FaceSwapInput, FaceSwapResult } from "./face-swap-provider";

export function createMockFaceSwapProvider({
  delayMs = 500,
  shouldFail = false,
}: {
  delayMs?: number;
  shouldFail?: boolean;
} = {}): FaceSwapProvider {
  return {
    swap: async (input: FaceSwapInput): Promise<FaceSwapResult> => {
      await new Promise((resolve) => setTimeout(resolve, delayMs));

      if (shouldFail || !input.faceImageUrl || !input.sourceImageUrl) {
        return { url: null, error: "Mock face swap failed" };
      }

      return {
        url: "https://mock.example/face-swapped.png",
        base64: null,
      };
    },
  };
}

export const mockFaceSwapProvider: FaceSwapProvider = createMockFaceSwapProvider();
