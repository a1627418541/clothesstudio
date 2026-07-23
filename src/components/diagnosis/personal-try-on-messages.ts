export const GENERIC_PERSONAL_TRY_ON_REQUEST_MESSAGE =
  "本人试穿暂时无法生成，请稍后重试。";

// Only stable server error codes get dedicated copy; anything else (including
// raw provider details) falls back to the generic message.
const PERSONAL_TRY_ON_ERROR_MESSAGES: Record<string, string> = {
  CONSENT_REQUIRED: "需要先授权本人试穿后再生成",
  INVALID_SNAPSHOT: "风格数据异常，请重新生成报告后再试",
  REQUIRED_PHOTOS_NOT_READY: "缺少正脸照或全身照，请先完成照片上传",
  GENERATION_ALREADY_CLAIMED: "本人试穿正在生成中，请稍后刷新查看",
  GENERATION_NOT_CLAIMABLE: "当前状态暂时无法生成，请刷新后重试",
  ATTEMPT_CAP_REACHED: "本人试穿生成次数已达上限，请稍后再试",
  PERSONAL_TRY_ON_PROVIDER_FAILED: "生成服务暂时不可用，请稍后重试",
  PERSONAL_TRY_ON_STORAGE_FAILED: "图片保存失败，请稍后重试",
  PERSONAL_TRY_ON_REQUEST_FAILED: "系统繁忙，请稍后重试",
};

export function personalTryOnErrorMessage(
  code: string | null | undefined
): string {
  if (!code) return GENERIC_PERSONAL_TRY_ON_REQUEST_MESSAGE;
  return (
    PERSONAL_TRY_ON_ERROR_MESSAGES[code] ??
    GENERIC_PERSONAL_TRY_ON_REQUEST_MESSAGE
  );
}
