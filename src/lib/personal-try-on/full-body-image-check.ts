import { GetObjectCommand, S3Client } from "@aws-sdk/client-s3";
import sharp from "sharp";
import { getR2Client } from "@/lib/r2";

const MAX_OBJECT_BYTES = 12 * 1024 * 1024; // 12 MB hard buffer cap
const MIN_LONG_EDGE_PX = 1200;
const MIN_SHORT_EDGE_PX = 700;
const ALLOWED_IMAGE_MIME_TYPES: ReadonlySet<string> = new Set([
  "image/jpeg",
  "image/png",
  "image/webp",
  "image/heic",
]);

export type FullBodyImageCheckResult =
  | { ok: true }
  | { ok: false; code: "FULL_BODY_IMAGE_TOO_SMALL" | "FULL_BODY_IMAGE_UNREADABLE" };

async function readBodyWithLimit(
  body: unknown,
  maxBytes: number
): Promise<Buffer | null> {
  if (!body || typeof (body as NodeJS.ReadableStream).pipe !== "function") {
    return null;
  }
  const chunks: Buffer[] = [];
  let total = 0;
  for await (const chunk of body as AsyncIterable<Buffer | Uint8Array | string>) {
    const buffer = Buffer.isBuffer(chunk) ? chunk : Buffer.from(chunk);
    total += buffer.length;
    if (total > maxBytes) return null;
    chunks.push(buffer);
  }
  return Buffer.concat(chunks);
}

// Zero-AI-cost hard gate for personal try-on generation. Reads the R2 object
// stream directly (no signed URLs) and never logs bucket/key or URLs — only
// stable error codes leave this module.
export async function checkFullBodyImageSize(input: {
  bucket: string;
  key: string;
  client?: S3Client;
}): Promise<FullBodyImageCheckResult> {
  const unreadable: FullBodyImageCheckResult = {
    ok: false,
    code: "FULL_BODY_IMAGE_UNREADABLE",
  };

  let response;
  try {
    response = await (input.client ?? getR2Client()).send(
      new GetObjectCommand({ Bucket: input.bucket, Key: input.key })
    );
  } catch {
    return unreadable;
  }

  if (!ALLOWED_IMAGE_MIME_TYPES.has(response.ContentType ?? "")) {
    return unreadable;
  }
  if (
    typeof response.ContentLength === "number" &&
    response.ContentLength > MAX_OBJECT_BYTES
  ) {
    return unreadable;
  }

  const buffer = await readBodyWithLimit(response.Body, MAX_OBJECT_BYTES);
  if (!buffer) return unreadable;

  let width: number | undefined;
  let height: number | undefined;
  try {
    const metadata = await sharp(buffer).metadata();
    width = metadata.width;
    height = metadata.height;
  } catch {
    return unreadable;
  }
  if (!width || !height) return unreadable;

  const longEdge = Math.max(width, height);
  const shortEdge = Math.min(width, height);
  if (longEdge < MIN_LONG_EDGE_PX || shortEdge < MIN_SHORT_EDGE_PX) {
    return { ok: false, code: "FULL_BODY_IMAGE_TOO_SMALL" };
  }
  return { ok: true };
}
