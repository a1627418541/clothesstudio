export interface PersonalTryOnImageProvider {
  generate(input: {
    prompt: string;
    fullBodyImage: string;
    frontFaceImage: string;
    size?: "1024x1024" | "1024x1792" | "1792x1024";
  }): Promise<{
    url: string | null;
    base64?: string | null;
    error?: string | null;
  }>;
}
