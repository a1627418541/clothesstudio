import { describe, expect, it } from "vitest";
import {
  GENERIC_PERSONAL_TRY_ON_REQUEST_MESSAGE,
  personalTryOnErrorMessage,
} from "./personal-try-on-messages";

describe("personalTryOnErrorMessage", () => {
  it("maps every stable server error code to customer-safe copy", () => {
    expect(personalTryOnErrorMessage("CONSENT_REQUIRED")).toBe("需要先授权本人试穿后再生成");
    expect(personalTryOnErrorMessage("INVALID_SNAPSHOT")).toBe("风格数据异常，请重新生成报告后再试");
    expect(personalTryOnErrorMessage("REQUIRED_PHOTOS_NOT_READY")).toBe("缺少正脸照或全身照，请先完成照片上传");
    expect(personalTryOnErrorMessage("GENERATION_ALREADY_CLAIMED")).toBe("本人试穿正在生成中，请稍后刷新查看");
    expect(personalTryOnErrorMessage("GENERATION_NOT_CLAIMABLE")).toBe("当前状态暂时无法生成，请刷新后重试");
    expect(personalTryOnErrorMessage("ATTEMPT_CAP_REACHED")).toBe("本人试穿生成次数已达上限，请稍后再试");
    expect(personalTryOnErrorMessage("PERSONAL_TRY_ON_PROVIDER_FAILED")).toBe("生成服务暂时不可用，请稍后重试");
    expect(personalTryOnErrorMessage("PERSONAL_TRY_ON_STORAGE_FAILED")).toBe("图片保存失败，请稍后重试");
    expect(personalTryOnErrorMessage("PERSONAL_TRY_ON_REQUEST_FAILED")).toBe("系统繁忙，请稍后重试");
    expect(personalTryOnErrorMessage("FULL_BODY_IMAGE_TOO_SMALL")).toBe("全身照距离过远或清晰度不足。请上传人物占画面较大、头到脚完整可见的正面全身照。");
    expect(personalTryOnErrorMessage("FULL_BODY_IMAGE_UNREADABLE")).toBe("全身照读取失败，请重新上传后再试。");
  });

  it("falls back to generic copy for unknown codes and never echoes raw provider errors", () => {
    expect(personalTryOnErrorMessage("EvoLink personal try-on failed: 401 - raw detail")).toBe(
      GENERIC_PERSONAL_TRY_ON_REQUEST_MESSAGE
    );
    expect(personalTryOnErrorMessage("NOT_FOUND")).toBe(GENERIC_PERSONAL_TRY_ON_REQUEST_MESSAGE);
    expect(personalTryOnErrorMessage(null)).toBe(GENERIC_PERSONAL_TRY_ON_REQUEST_MESSAGE);
    expect(personalTryOnErrorMessage(undefined)).toBe(GENERIC_PERSONAL_TRY_ON_REQUEST_MESSAGE);
  });
});
