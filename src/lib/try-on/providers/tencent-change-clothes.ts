import { aiart } from "tencentcloud-sdk-nodejs-aiart";
import { GetObjectCommand } from "@aws-sdk/client-s3";
import { getSignedUrl } from "@aws-sdk/s3-request-presigner";
import { getR2Client } from "@/lib/r2";
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

function parseR2KeyFromPublicUrl(url: string): string | null {
  const publicBaseUrl = process.env.CLOUDFLARE_R2_PUBLIC_BASE_URL?.trim();
  if (!publicBaseUrl) return null;
  const normalizedBase = publicBaseUrl.replace(/\/+$/, "");
  if (!url.startsWith(normalizedBase + "/") && url !== normalizedBase) {
    return null;
  }
  const key = url.slice(normalizedBase.length).replace(/^\/+/, "");
  return key ? decodeURIComponent(key) : null;
}

async function toTencentAccessibleUrl(url: string): Promise<string> {
  const key = parseR2KeyFromPublicUrl(url);
  if (!key) return url;

  const bucket = process.env.CLOUDFLARE_R2_BUCKET_NAME;
  if (!bucket) return url;

  try {
    const signedUrl = await getSignedUrl(
      getR2Client(),
      new GetObjectCommand({ Bucket: bucket, Key: key }),
      { expiresIn: 3600 }
    );
    return signedUrl;
  } catch {
    return url;
  }
}

export function createTencentChangeClothesProvider(
  client: TencentChangeClothesClient
): DomesticTryOnProvider {
  return {
    name: "tencent",
    supports: () => true,
    async generate(input) {
      const [modelUrl, clothesUrl] = await Promise.all([
        toTencentAccessibleUrl(input.personImageUrl),
        toTencentAccessibleUrl(input.garmentImageUrl),
      ]);

      try {
        const response = await client.ChangeClothes({
          ModelUrl: modelUrl,
          ClothesUrl: clothesUrl,
          ClothesType: CATEGORY[input.category],
          LogoAdd: 1,
          RspImgType: "url",
        });

        if (!response.ResultImage || !response.RequestId) {
          throw new Error("TENCENT_EMPTY_RESULT");
        }

        return { imageUrl: response.ResultImage, requestId: response.RequestId };
      } catch (error) {
        throw error;
      }
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
