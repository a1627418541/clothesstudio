import { GetObjectCommand } from "@aws-sdk/client-s3";
import { getSignedUrl } from "@aws-sdk/s3-request-presigner";
import { getR2Client } from "@/lib/r2";

export type ProviderImageInput =
  | { kind: "signed-url"; value: string }
  | { kind: "base64"; value: string };

export async function buildProviderImageInput(input: {
  bucket: string;
  key: string;
}): Promise<ProviderImageInput> {
  const mode = process.env.PERSONAL_TRY_ON_IMAGE_INPUT_MODE?.trim() || "signed-url";

  if (mode === "base64") {
    const signedUrl = await getSignedUrl(
      getR2Client(),
      new GetObjectCommand({ Bucket: input.bucket, Key: input.key }),
      { expiresIn: 300 }
    );
    const response = await fetch(signedUrl);
    if (!response.ok) {
      throw new Error(`IMAGE_DOWNLOAD_FAILED: ${response.status}`);
    }
    const buffer = await response.arrayBuffer();
    return { kind: "base64", value: Buffer.from(buffer).toString("base64") };
  }

  const signedUrl = await getSignedUrl(
    getR2Client(),
    new GetObjectCommand({ Bucket: input.bucket, Key: input.key }),
    { expiresIn: 300 }
  );
  return { kind: "signed-url", value: signedUrl };
}
