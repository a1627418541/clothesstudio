import { uploadBufferToR2 } from "./r2";

const MAX_DOWNLOAD_SIZE = 20 * 1024 * 1024; // 20 MB

export async function storeImageFromUrlOrBase64(input: {
  url: string | null;
  base64: string | null | undefined;
  key: string;
}): Promise<{ url: string } | { error: string }> {
  if (input.base64) {
    try {
      const buffer = Buffer.from(input.base64, "base64");
      const result = await uploadBufferToR2({
        key: input.key,
        body: buffer,
        contentType: "image/png",
      });
      return { url: result.url };
    } catch (error) {
      const message = error instanceof Error ? error.message : "Failed to upload base64 image to R2";
      return { error: message };
    }
  }

  if (input.url) {
    try {
      const res = await fetch(input.url, { redirect: "follow" });
      if (!res.ok) {
        return { error: `Failed to download image: ${res.status}` };
      }

      const contentLength = res.headers.get("content-length");
      if (contentLength && Number(contentLength) > MAX_DOWNLOAD_SIZE) {
        return { error: "Generated image exceeds maximum allowed size" };
      }

      const contentType = res.headers.get("content-type") ?? "image/png";
      if (!contentType.startsWith("image/")) {
        return { error: `Unexpected content type: ${contentType}` };
      }

      const arrayBuffer = await res.arrayBuffer();
      if (arrayBuffer.byteLength > MAX_DOWNLOAD_SIZE) {
        return { error: "Downloaded image exceeds maximum allowed size" };
      }

      const buffer = Buffer.from(arrayBuffer);
      const result = await uploadBufferToR2({
        key: input.key,
        body: buffer,
        contentType,
      });
      return { url: result.url };
    } catch (error) {
      const message = error instanceof Error ? error.message : "Failed to download and upload image";
      return { error: message };
    }
  }

  return { error: "No image URL or base64 data provided" };
}
