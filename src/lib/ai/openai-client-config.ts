export function getOpenAiClientOptions(
  apiKey: string,
  configuredBaseUrl: string | undefined
): { apiKey: string; baseURL?: string } {
  const baseURL = configuredBaseUrl?.trim().replace(/\/$/, "");
  return baseURL ? { apiKey, baseURL } : { apiKey };
}
