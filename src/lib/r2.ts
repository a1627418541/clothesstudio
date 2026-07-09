import { S3Client, PutObjectCommand } from "@aws-sdk/client-s3";

export function getR2Client(): S3Client {
  const accountId = process.env.CLOUDFLARE_R2_ACCOUNT_ID;
  const accessKeyId = process.env.CLOUDFLARE_R2_ACCESS_KEY_ID;
  const secretAccessKey = process.env.CLOUDFLARE_R2_SECRET_ACCESS_KEY;

  if (!accountId || !accessKeyId || !secretAccessKey) {
    throw new Error("Missing Cloudflare R2 environment variables");
  }

  return new S3Client({
    region: "auto",
    endpoint: `https://${accountId}.r2.cloudflarestorage.com`,
    credentials: {
      accessKeyId,
      secretAccessKey,
    },
  });
}

export interface UploadBufferToR2Result {
  bucket: string;
  key: string;
  url: string;
}

export async function uploadBufferToR2(params: {
  key: string;
  body: Buffer;
  contentType: string;
}): Promise<UploadBufferToR2Result> {
  const bucket = process.env.CLOUDFLARE_R2_BUCKET_NAME;
  const publicBaseUrl = process.env.CLOUDFLARE_R2_PUBLIC_BASE_URL;

  if (!bucket) {
    throw new Error("Missing CLOUDFLARE_R2_BUCKET_NAME");
  }

  const client = getR2Client();

  await client.send(
    new PutObjectCommand({
      Bucket: bucket,
      Key: params.key,
      Body: params.body,
      ContentType: params.contentType,
    })
  );

  const url = publicBaseUrl ? `${publicBaseUrl}/${params.key}` : params.key;

  return {
    bucket,
    key: params.key,
    url,
  };
}
