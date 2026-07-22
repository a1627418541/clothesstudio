import { describe, expect, it, vi } from "vitest";
import { createTencentChangeClothesProvider } from "./tencent-change-clothes";

describe("Tencent ChangeClothes provider", () => {
  it("maps internal categories and requests a temporary URL", async () => {
    const ChangeClothes = vi.fn().mockResolvedValue({
      ResultImage: "https://result.example/tencent.jpg",
      RequestId: "tc-1",
    });
    const provider = createTencentChangeClothesProvider({ ChangeClothes });

    await expect(provider.generate({
      caseId: "top-1",
      personImageUrl: "https://input.example/person.jpg",
      garmentImageUrl: "https://input.example/top.jpg",
      category: "TOP",
    })).resolves.toEqual({
      imageUrl: "https://result.example/tencent.jpg",
      requestId: "tc-1",
    });
    expect(ChangeClothes).toHaveBeenCalledWith({
      ModelUrl: "https://input.example/person.jpg",
      ClothesUrl: "https://input.example/top.jpg",
      ClothesType: "Upper-body",
      LogoAdd: 1,
      RspImgType: "url",
    });
  });

  it.each([
    ["BOTTOM", "Lower-body"],
    ["DRESS", "Dress"],
  ] as const)("maps %s to %s", async (category, ClothesType) => {
    const ChangeClothes = vi.fn().mockResolvedValue({
      ResultImage: "https://result.example/x",
      RequestId: "id",
    });
    const provider = createTencentChangeClothesProvider({ ChangeClothes });

    await provider.generate({
      caseId: "x",
      personImageUrl: "https://input.example/p",
      garmentImageUrl: "https://input.example/g",
      category,
    });

    expect(ChangeClothes).toHaveBeenCalledWith(expect.objectContaining({ ClothesType }));
  });

  it("supports every benchmark garment category", () => {
    const provider = createTencentChangeClothesProvider({ ChangeClothes: vi.fn() });

    expect(provider.supports("TOP")).toBe(true);
    expect(provider.supports("BOTTOM")).toBe(true);
    expect(provider.supports("DRESS")).toBe(true);
  });

  it("rejects an incomplete Tencent response", async () => {
    const provider = createTencentChangeClothesProvider({
      ChangeClothes: vi.fn().mockResolvedValue({ RequestId: "tc-1" }),
    });

    await expect(provider.generate({
      caseId: "top-1",
      personImageUrl: "https://input.example/person.jpg",
      garmentImageUrl: "https://input.example/top.jpg",
      category: "TOP",
    })).rejects.toThrow("TENCENT_EMPTY_RESULT");
  });
});
