import {
  createTencentChangeClothesProvider,
  createTencentChangeClothesSdkClient,
} from "./tencent-change-clothes";
import type { TryOnGarmentCategory, VirtualTryOnProvider } from "../types";

function mapCategory(
  category: TryOnGarmentCategory
): "TOP" | "BOTTOM" | "DRESS" {
  if (category === "OUTERWEAR") return "TOP";
  return category;
}

function loadTencentConfigFromEnv() {
  const secretId = process.env.TENCENT_CLOUD_SECRET_ID?.trim();
  const secretKey = process.env.TENCENT_CLOUD_SECRET_KEY?.trim();
  const region = process.env.TENCENT_CLOUD_REGION?.trim() || "ap-guangzhou";

  if (!secretId || !secretKey) {
    throw new Error(
      "Missing TENCENT_CLOUD_SECRET_ID or TENCENT_CLOUD_SECRET_KEY"
    );
  }

  return { secretId, secretKey, region };
}

export function createTencentVirtualTryOnProvider(): VirtualTryOnProvider {
  const config = loadTencentConfigFromEnv();
  const client = createTencentChangeClothesSdkClient(config);
  const provider = createTencentChangeClothesProvider(client);

  return {
    name: "tencent",
    async applyGarment(input) {
      const result = await provider.generate({
        caseId: "production",
        personImageUrl: input.personImageUrl,
        garmentImageUrl: input.productImageUrl,
        category: mapCategory(input.category),
      });
      return { imageUrl: result.imageUrl };
    },
    async applyHat() {
      throw new Error("TENCENT_HAT_NOT_SUPPORTED");
    },
  };
}
