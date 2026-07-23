import { createTencentChangeClothesSdkClient } from "@/lib/try-on/providers/tencent-change-clothes";
import fs from "node:fs/promises";
import path from "node:path";
import os from "node:os";

const samplePerson =
  "https://images.unsplash.com/photo-1507003211169-0a1dd7228f2d?w=512&h=768&fit=crop";
const sampleGarment =
  "https://pub-67aa37a5479f4ccc85b8733599396e99.r2.dev/try-on/garments/top/%E5%A5%B6%E6%B2%B9%E8%89%B2%E6%97%A5%E5%B8%B8%E9%92%88%E7%BB%87%E4%B8%8A%E8%A1%A3-musgex-1784771643761.png";

async function downloadToBase64(url: string): Promise<string> {
  const response = await fetch(url);
  const buffer = Buffer.from(await response.arrayBuffer());
  const ext = path.extname(new URL(url).pathname).slice(1) || "png";
  const mime = ext === "jpg" ? "image/jpeg" : `image/${ext}`;
  return `data:${mime};base64,${buffer.toString("base64")}`;
}

async function main() {
  console.log("Downloading images and converting to base64...");
  const personBase64 = await downloadToBase64(samplePerson);
  const garmentBase64 = await downloadToBase64(sampleGarment);

  const secretId = process.env.TENCENT_CLOUD_SECRET_ID;
  const secretKey = process.env.TENCENT_CLOUD_SECRET_KEY;
  if (!secretId || !secretKey) {
    console.error("Missing TENCENT_CLOUD_SECRET_ID or TENCENT_CLOUD_SECRET_KEY");
    process.exit(1);
  }

  const client = createTencentChangeClothesSdkClient({
    secretId,
    secretKey,
    region: process.env.TENCENT_CLOUD_REGION || "ap-guangzhou",
  });

  console.log("Testing Tencent ChangeClothes with base64 data URIs...");
  try {
    const topResult = await client.ChangeClothes({
      ModelUrl: personBase64,
      ClothesUrl: garmentBase64,
      ClothesType: "Upper-body",
      LogoAdd: 1,
      RspImgType: "url",
    });
    console.log("Tencent TOP result:", topResult.ResultImage ? "OK" : "FAIL", topResult.RequestId);
  } catch (error) {
    console.error("Tencent base64 test failed:", error);
  }
}

main().catch((error) => {
  console.error(error);
  process.exit(1);
});
