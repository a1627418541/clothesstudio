export interface FaceSwapInput {
  faceImageUrl: string;
  sourceImageUrl: string;
}

export interface FaceSwapResult {
  url: string | null;
  base64?: string | null;
  error?: string | null;
}

export interface FaceSwapProvider {
  swap(input: FaceSwapInput): Promise<FaceSwapResult>;
}
