import { createTencentChangeClothesSdkClient } from "@/lib/try-on/providers/tencent-change-clothes";
import { generateGarmentImagesForPlan } from "@/lib/try-on/garment-image-generator";
import type { OutfitProductPlan } from "@/lib/marketplace/outfit-product-matcher";

const samplePerson =
  "https://images.unsplash.com/photo-1507003211169-0a1dd7228f2d?w=512&h=768&fit=crop";

const samplePlan: OutfitProductPlan = {
  rank: 1,
  platform: "TAOBAO",
  totalCents: 100_000,
  products: [
    {
      platform: "TAOBAO",
      externalProductId: "probe-top-001",
      externalSkuId: "probe-top-001-cream-m",
      category: "TOP",
      title: "奶油色日常针织上衣",
      imageUrl: "data:image/svg+xml;base64,PHN2Zz48L3N2Zz4=",
      purchaseUrl: "https://example.invalid/top",
      priceCents: 12_900,
      currency: "CNY",
      sellerName: "淘宝模拟精选店",
      color: "cream",
      variantLabel: "奶油色 / M",
      availabilityStatus: "AVAILABLE",
      snapshotAt: new Date(),
    },
    {
      platform: "TAOBAO",
      externalProductId: "probe-bottom-001",
      externalSkuId: "probe-bottom-001-brown-m",
      category: "BOTTOM",
      title: "咖色直筒长裤",
      imageUrl: "data:image/svg+xml;base64,PHN2Zz48L3N2Zz4=",
      purchaseUrl: "https://example.invalid/bottom",
      priceCents: 15_900,
      currency: "CNY",
      sellerName: "淘宝模拟精选店",
      color: "brown",
      variantLabel: "咖色 / M",
      availabilityStatus: "AVAILABLE",
      snapshotAt: new Date(),
    },
    {
      platform: "TAOBAO",
      externalProductId: "probe-hat-001",
      externalSkuId: "probe-hat-001-brown-one",
      category: "HAT",
      title: "复古棕灯芯绒帽",
      imageUrl: "data:image/svg+xml;base64,PHN2Zz48L3N2Zz4=",
      purchaseUrl: "https://example.invalid/hat",
      priceCents: 5_900,
      currency: "CNY",
      sellerName: "淘宝模拟精选店",
      color: "brown",
      variantLabel: "棕色 / 均码",
      availabilityStatus: "AVAILABLE",
      snapshotAt: new Date(),
    },
  ],
};

async function main() {
  console.log("Step 1: Generating garment images...");
  const generatedPlan = await generateGarmentImagesForPlan(samplePlan, {
    styleDirection: "minimal daily",
  });
  console.log("Generated garment URLs:");
  for (const product of generatedPlan.products) {
    console.log(`  ${product.category}: ${product.generatedImageUrl}`);
  }

  console.log("\nStep 2: Testing Tencent ChangeClothes (TOP)...");
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

  const topResult = await client.ChangeClothes({
    ModelUrl: samplePerson,
    ClothesUrl: generatedPlan.products[0].generatedImageUrl,
    ClothesType: "Upper-body",
    LogoAdd: 1,
    RspImgType: "url",
  });
  console.log("Tencent TOP result:", topResult.ResultImage ? "OK" : "FAIL", topResult.RequestId);

  console.log("\nStep 3: Testing Tencent ChangeClothes (BOTTOM)...");
  const bottomResult = await client.ChangeClothes({
    ModelUrl: topResult.ResultImage || samplePerson,
    ClothesUrl: generatedPlan.products[1].generatedImageUrl,
    ClothesType: "Lower-body",
    LogoAdd: 1,
    RspImgType: "url",
  });
  console.log("Tencent BOTTOM result:", bottomResult.ResultImage ? "OK" : "FAIL", bottomResult.RequestId);
}

main().catch((error) => {
  console.error(error);
  process.exit(1);
});
