import { aiart } from "tencentcloud-sdk-nodejs-aiart";
import type { BenchmarkGarmentCategory, DomesticTryOnProvider } from "../benchmark/types";

const CATEGORY: Record<BenchmarkGarmentCategory, "Upper-body" | "Lower-body" | "Dress"> = {
  TOP: "Upper-body",
  BOTTOM: "Lower-body",
  DRESS: "Dress",
};

export interface TencentChangeClothesClient {
  ChangeClothes(input: {
    ModelUrl: string;
    ClothesUrl: string;
    ClothesType: "Upper-body" | "Lower-body" | "Dress";
    LogoAdd: number;
    RspImgType: "url";
  }): Promise<{ ResultImage?: string; RequestId?: string }>;
}

export function createTencentChangeClothesProvider(
  client: TencentChangeClothesClient
): DomesticTryOnProvider {
  return {
    name: "tencent",
    supports: () => true,
    async generate(input) {
      const response = await client.ChangeClothes({
        ModelUrl: input.personImageUrl,
        ClothesUrl: input.garmentImageUrl,
        ClothesType: CATEGORY[input.category],
        LogoAdd: 1,
        RspImgType: "url",
      });

      if (!response.ResultImage || !response.RequestId) {
        throw new Error("TENCENT_EMPTY_RESULT");
      }

      return { imageUrl: response.ResultImage, requestId: response.RequestId };
    },
  };
}

export function createTencentChangeClothesSdkClient(config: {
  secretId: string;
  secretKey: string;
  region: string;
}): TencentChangeClothesClient {
  const Client = aiart.v20221229.Client;
  return new Client({
    credential: { secretId: config.secretId, secretKey: config.secretKey },
    region: config.region,
    profile: { httpProfile: { endpoint: "aiart.tencentcloudapi.com" } },
  });
}
