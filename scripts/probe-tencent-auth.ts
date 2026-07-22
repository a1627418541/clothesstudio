import { loadEnvConfig } from "@next/env";
import { createTencentChangeClothesSdkClient } from "../src/lib/try-on/providers/tencent-change-clothes";

loadEnvConfig(process.cwd());

const client = createTencentChangeClothesSdkClient({
  secretId: process.env.TENCENT_CLOUD_SECRET_ID!,
  secretKey: process.env.TENCENT_CLOUD_SECRET_KEY!,
  region: process.env.TENCENT_CLOUD_REGION?.trim() || "ap-guangzhou",
});

async function main() {
  try {
    const response = await client.ChangeClothes({
      ModelUrl: "https://example.com/probe-person.jpg",
      ClothesUrl: "https://example.com/probe-garment.jpg",
      ClothesType: "Upper-body",
      LogoAdd: 1,
      RspImgType: "url",
    });
    console.log("UNEXPECTED_SUCCESS", JSON.stringify(response));
  } catch (error) {
    const code = (error as { code?: string }).code ?? "UNKNOWN";
    const message = (error as { message?: string }).message ?? String(error);
    console.log(`ERROR_CODE=${code}`);
    console.log(`ERROR_MESSAGE=${message.slice(0, 200)}`);
    if (code.startsWith("AuthFailure") || code === "UnauthorizedOperation") {
      console.log("VERDICT=AUTH_FAILED");
    } else {
      console.log("VERDICT=AUTH_PASSED");
    }
  }
}

void main();
