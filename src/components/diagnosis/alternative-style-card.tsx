import { EditorialLabel } from "@/components/ui/editorial-label";
import { ReportRecommendation } from "@/types/diagnosis";
import { ColorPalette } from "./color-palette";
import { MarketplaceProductGrid } from "./marketplace-product-grid";
import { RecommendationItems } from "./recommendation-items";
import { RecommendationMeta } from "./recommendation-meta";
import { StylePreviewImage } from "./style-preview-image";
import { TryOnStatusPanel } from "./try-on-status-panel";

interface AlternativeStyleCardProps {
  recommendation: ReportRecommendation;
  rank: number;
  faceTryOnConsent?: boolean;
  isGeneratingTryOn?: boolean;
  onGenerateTryOn?: () => void;
}

export function AlternativeStyleCard({
  recommendation,
  rank,
  faceTryOnConsent = false,
  isGeneratingTryOn = false,
  onGenerateTryOn = () => undefined,
}: AlternativeStyleCardProps) {
  const directionNumber = String(rank + 1).padStart(2, "0");

  return (
    <article className="border border-[var(--line)] bg-[var(--surface)]">
      <div className="border-b border-[var(--line)] p-6">
        <StylePreviewImage
          status={
            recommendation.tryOnImageStatus === "COMPLETED" || recommendation.tryOnImageUrl
              ? "COMPLETED"
              : recommendation.previewImageStatus
          }
          url={recommendation.tryOnImageUrl ?? recommendation.previewImageUrl}
          title={recommendation.title}
          aspect="3/4"
          disclosure={
            recommendation.tryOnImageUrl
              ? "本人试穿为 AI 生成效果，仅供搭配参考"
              : null
          }
        />
        <TryOnStatusPanel
          recommendation={recommendation}
          faceTryOnConsent={faceTryOnConsent}
          isPrimary={false}
          isGenerating={isGeneratingTryOn}
          onGenerate={onGenerateTryOn}
        />
      </div>
      <div className="p-7">
        <EditorialLabel>Direction {directionNumber}</EditorialLabel>
        <h3 className="mt-5 font-editorial text-4xl font-medium leading-none text-[var(--ink)]">{recommendation.title}</h3>
        {recommendation.description ? <p className="mt-3 text-sm italic text-[var(--oxblood)]">{recommendation.description}</p> : null}
        <div className="mt-5">
          <RecommendationMeta
            archetype={recommendation.archetype}
            matchScore={recommendation.matchScore}
            macroCategory={recommendation.macroCategory}
            compact
          />
        </div>
        <p className="mt-5 text-sm leading-7 text-[var(--muted-ink)]">{recommendation.summary}</p>
        <div className="mt-6 border-t border-[var(--line)] pt-5"><ColorPalette colors={recommendation.colorPalette} /></div>
        {recommendation.items.length > 0 ? (
          <div className="mt-5 border-t border-[var(--line)] pt-5">
            <h4 className="text-xs font-semibold uppercase tracking-[0.14em] text-[var(--ink)]">Top items</h4>
            <div className="mt-3">
              <RecommendationItems items={recommendation.items} limit={3} showOptional={false} />
            </div>
          </div>
        ) : null}
        <MarketplaceProductGrid recommendation={recommendation} />
        {recommendation.avoidTips.length > 0 ? (
          <p className="mt-5 border-l-2 border-[var(--oxblood)] pl-3 text-xs leading-5 text-[var(--muted-ink)]">
            Avoid: {recommendation.avoidTips.slice(0, 2).join(" · ")}
          </p>
        ) : null}
      </div>
    </article>
  );
}
