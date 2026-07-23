import { getR2Client, buildR2PublicUrl } from "@/lib/r2";
import { GetObjectCommand } from "@aws-sdk/client-s3";
import { getSignedUrl } from "@aws-sdk/s3-request-presigner";
import { createTencentChangeClothesSdkClient } from "@/lib/try-on/providers/tencent-change-clothes";

async function main() {
  const key = "try-on/garments/top/%E5%A5%B6%E6%B2%B9%E8%89%B2%E6%97%A5%E5%B8%B8%E9%92%88%E7%BB%87%E4%B8%8A%E8%A1%A3-musgex-1784771643761.png";
  const decodedKey = decodeURIComponent(key);
  const client = getR2Client();
  const bucket = process.env.CLOUDFLARE_R2_BUCKET_NAME;
  if (!bucket) throw new Error("Missing CLOUDFLARE_R2_BUCKET_NAME");

  const signedUrl = await getSignedUrl(
    client,
    new GetObjectCommand({ Bucket: bucket, Key: decodedKey }),
    { expiresIn: 3600 }
  );
  console.log("Signed URL:", signedUrl);

  // Test Tencent with signed URL
  const secretId = process.env.TENCENT_CLOUD_SECRET_ID;
  const secretKey = process.env.TENCENT_CLOUD_SECRET_KEY;
  if (!secretId || !secretKey) throw new Error("Missing Tencent credentials");

  const tencent = createTencentChangeClothesSdkClient({
    secretId,
    secretKey,
    region: process.env.TENCENT_CLOUD_REGION || "ap-guangzhou",
  });

  const person = "https://images.unsplash.com/photo-1507003211169-0a1dd7228f2d?w=512&h=768&fit=crop";
  try {
    const result = await tencent.ChangeClothes({
      ModelUrl: person,
      ClothesUrl: signedUrl,
      ClothesType: "Upper-body",
      LogoAdd: 1,
      RspImgType: "url",
    });
    console.log("Tencent signed URL result:", result.ResultImage ? "OK" : "FAIL", result.RequestId);
  } catch (error) {
    console.error("Tencent signed URL test failed:", error);
  }
}

main().catch((error) => {
  console.error(error);
  process.exit(1);
});
