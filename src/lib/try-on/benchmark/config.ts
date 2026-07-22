import type { BenchmarkProviderName } from "./types";

type Environment = Record<string, string | undefined>;

export function loadDomesticTryOnConfig(
  provider: BenchmarkProviderName,
  environment: Environment = process.env
) {
  const names =
    provider === "tencent"
      ? (["TENCENT_CLOUD_SECRET_ID", "TENCENT_CLOUD_SECRET_KEY"] as const)
      : (["VOLCENGINE_ACCESS_KEY_ID", "VOLCENGINE_SECRET_ACCESS_KEY"] as const);
  const missing = names.filter((name) => !environment[name]?.trim());
  if (missing.length) {
    throw new Error(
      `Missing try-on environment variables: ${missing.join(", ")}`
    );
  }
  if (provider === "tencent") {
    return {
      provider,
      secretId: environment.TENCENT_CLOUD_SECRET_ID!,
      secretKey: environment.TENCENT_CLOUD_SECRET_KEY!,
      region: environment.TENCENT_CLOUD_REGION?.trim() || "ap-guangzhou",
    } as const;
  }
  return {
    provider,
    accessKeyId: environment.VOLCENGINE_ACCESS_KEY_ID!,
    secretAccessKey: environment.VOLCENGINE_SECRET_ACCESS_KEY!,
    region: environment.VOLCENGINE_REGION?.trim() || "cn-beijing",
  } as const;
}
