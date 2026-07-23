import { Loader2 } from "lucide-react";
import type { ReportRecommendation, ReportTryOnWorkflowStatus } from "@/types/diagnosis";
import { personalTryOnErrorMessage } from "./personal-try-on-messages";
import { resolvePersonalTryOnView } from "./personal-try-on-view";

export const TRY_ON_STATUS_LABELS: Record<ReportTryOnWorkflowStatus, string> = {
  NOT_REQUESTED: "尚未生成本人试穿",
  QUEUED: "本人试穿已进入队列",
  APPLYING_GARMENTS: "正在换上推荐服装",
  APPLYING_HAT: "正在搭配推荐帽子",
  RESTORING_IDENTITY: "正在保留你的面部特征",
  QUALITY_CHECKING: "正在检查试穿效果",
  COMPLETED: "本人试穿已完成",
  FAILED: "本人试穿暂不可用",
  CANCELLED: "本人试穿授权已撤回",
  EXPIRED: "图片已过期，请重新上传后生成",
};

export function TryOnStatusPanel({
  recommendation,
  faceTryOnConsent,
  isPrimary,
  isGenerating,
  onGenerate,
  onAuthorizeAndGenerate,
}: {
  recommendation: ReportRecommendation;
  faceTryOnConsent: boolean;
  isPrimary: boolean;
  isGenerating: boolean;
  onGenerate: () => void;
  onAuthorizeAndGenerate?: () => void;
}) {
  const view = resolvePersonalTryOnView(recommendation);
  const shouldOfferAuthorize =
    isPrimary &&
    !faceTryOnConsent &&
    (view.kind === "cta" || view.kind === "failed");
  const shouldOfferGenerate =
    !shouldOfferAuthorize && (view.kind === "cta" || view.kind === "failed");
  const actionLabel =
    view.kind === "failed"
      ? "重新生成本人试穿"
      : isPrimary
        ? "生成本人试穿"
        : "生成这套试穿";

  const statusText = (() => {
    if (shouldOfferAuthorize) return "尚未授权本人试穿";
    switch (view.kind) {
      case "pending":
        return "准备生成";
      case "processing":
        return "本人试穿生成中";
      case "completed":
        return TRY_ON_STATUS_LABELS.COMPLETED;
      case "unavailable":
        return TRY_ON_STATUS_LABELS.FAILED;
      case "failed":
        return recommendation.personalTryOn
          ? personalTryOnErrorMessage(view.errorCode)
          : TRY_ON_STATUS_LABELS.FAILED;
      default:
        return TRY_ON_STATUS_LABELS.NOT_REQUESTED;
    }
  })();

  return (
    <section className="mt-6 border border-[var(--line)] bg-[#f8f4ef] p-5" aria-label="本人试穿状态">
      <div className="flex flex-wrap items-center justify-between gap-4">
        <div>
          <p className="text-[10px] font-semibold uppercase tracking-[0.16em] text-[var(--oxblood)]">Virtual try-on</p>
          <p className="mt-2 text-sm font-semibold text-[var(--ink)]">{statusText}</p>
        </div>
        {shouldOfferAuthorize ? (
          <button
            type="button"
            disabled={isGenerating}
            onClick={onAuthorizeAndGenerate}
            className="editorial-button px-5 disabled:cursor-not-allowed disabled:opacity-50"
          >
            {isGenerating ? <Loader2 className="h-4 w-4 animate-spin" aria-hidden="true" /> : null}
            授权并生成本人试穿
          </button>
        ) : shouldOfferGenerate ? (
          <button
            type="button"
            disabled={isGenerating}
            onClick={onGenerate}
            className="editorial-button px-5 disabled:cursor-not-allowed disabled:opacity-50"
          >
            {isGenerating ? <Loader2 className="h-4 w-4 animate-spin" aria-hidden="true" /> : null}
            {actionLabel}
          </button>
        ) : null}
      </div>
      {recommendation.tryOnProvider === "mock" ? (
        <p className="mt-3 text-xs leading-5 text-[var(--muted-ink)]">
          模拟试穿流程：当前图片用于验证产品流程，不代表真实换装效果
        </p>
      ) : null}
    </section>
  );
}
