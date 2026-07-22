export type BenchmarkProviderName = "tencent" | "volcengine";
export type BenchmarkGarmentCategory = "TOP" | "BOTTOM" | "DRESS";

export interface BenchmarkCase {
  caseId: string;
  personImageUrl: string;
  garmentImageUrl: string;
  category: BenchmarkGarmentCategory;
}

export interface BenchmarkProviderResult {
  imageUrl: string;
  requestId: string;
}

export interface DomesticTryOnProvider {
  name: BenchmarkProviderName;
  supports(category: BenchmarkGarmentCategory): boolean;
  generate(input: BenchmarkCase): Promise<BenchmarkProviderResult>;
}
