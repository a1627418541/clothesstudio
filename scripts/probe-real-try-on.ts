import { createTencentChangeClothesSdkClient } from "@/lib/try-on/providers/tencent-change-clothes";

const bodyUrl = "https://pub-67aa37a5479f4ccc85b8733599396e99.r2.dev/uploads/anonymous/cmrwuo2zl0000jou9yqmy7h1d/z3BGBFSxmF6BHigb.jpg";
const topUrl = "https://pub-67aa37a5479f4ccc85b8733599396e99.r2.dev/try-on/garments/top/clean-casual-%E5%B9%B2%E5%87%80%E4%BC%91%E9%97%B2-top-w6n11e-1784771346250.png";
const bottomUrl = "https://pub-67aa37a5479f4ccc85b8733599396e99.r2.dev/try-on/garments/bottom/clean-casual-%E5%B9%B2%E5%87%80%E4%BC%91%E9%97%B2-bottom-ky0ymd-1784771343474.png";

async function main() {
  const secretId = process.env.TENCENT_CLOUD_SECRET_ID;
  const secretKey = process.env.TENCENT_CLOUD_SECRET_KEY;
  if (!secretId || !secretKey) throw new Error("Missing Tencent credentials");

  const client = createTencentChangeClothesSdkClient({
    secretId,
    secretKey,
    region: process.env.TENCENT_CLOUD_REGION || "ap-guangzhou",
  });

  console.log("Step 1: TOP on body...");
  try {
    const topResult = await client.ChangeClothes({
      ModelUrl: bodyUrl,
      ClothesUrl: topUrl,
      ClothesType: "Upper-body",
      LogoAdd: 1,
      RspImgType: "url",
    });
    console.log("TOP OK:", topResult.RequestId, topResult.ResultImage?.slice(0, 60));

    console.log("Step 2: BOTTOM on result...");
    const bottomResult = await client.ChangeClothes({
      ModelUrl: topResult.ResultImage!,
      ClothesUrl: bottomUrl,
      ClothesType: "Lower-body",
      LogoAdd: 1,
      RspImgType: "url",
    });
    console.log("BOTTOM OK:", bottomResult.RequestId, bottomResult.ResultImage?.slice(0, 60));
  } catch (error) {
    console.error("Failed:", error);
  }
}

main().catch((error) => {
  console.error(error);
  process.exit(1);
});
