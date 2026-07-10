export interface StylePreviewImageProvider {
  generate(input: {
    prompt: string;
    size?: "1024x1024" | "1792x1024" | "1024x1792";
  }): Promise<{
    url: string | null;
    base64?: string | null;
    error?: string | null;
  }>;
}
