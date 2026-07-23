import { Ban } from "lucide-react";
import { EditorialLabel } from "@/components/ui/editorial-label";
import { ReportRecommendation } from "@/types/diagnosis";
import { ColorPalette } from "./color-palette";
import { MarketplaceProductGrid } from "./marketplace-product-grid";
import {
  LEGACY_TRY_ON_DISCLOSURE,
  PERSONAL_TRY_ON_DISCLOSURE,
  resolvePersonalTryOnView,
} from "./personal-try-on-view";
import { RecommendationItems } from "./recommendation-items";
import { RecommendationMeta } from "./recommendation-meta";
import { StylePreviewImage } from "./style-preview-image";
import { TryOnStatusPanel } from "./try-on-status-panel";

interface PrimaryStyleDirectionProps {
  recommendation: ReportRecommendation;
  faceTryOnConsent?: boolean;
  isGeneratingTryOn?: boolean;
  onGenerateTryOn?: () => void;
  onAuthorizeAndGenerate?: () => void;
}

export function PrimaryStyleDirection({
  recommendation,
  faceTryOnConsent = false,
  isGeneratingTryOn = false,
  onGenerateTryOn = () => undefined,
  onAuthorizeAndGenerate = () => undefined,
}: PrimaryStyleDirectionProps) {
  const personalTryOnView = resolvePersonalTryOnView(recommendation);

  return (
    <section className="mb-14">
      <EditorialLabel>Primary style direction</EditorialLabel>
      <article className="mt-5 grid border border-[var(--line)] bg-[var(--surface)] shadow-[0_22px_65px_rgba(50,39,29,0.08)] lg:grid-cols-[minmax(0,0.92fr)_minmax(0,1.08fr)]">
        <div className="border-b border-[var(--line)] p-6 lg:border-b-0 lg:border-r lg:p-8">
          <StylePreviewImage
            status={recommendation.previewImageStatus}
            url={recommendation.previewImageUrl}
            title={recommendation.title}
            aspect="4/5"
          />
          {personalTryOnView.kind === "completed" ? (
            <div className="mt-4">
              <StylePreviewImage
                status="COMPLETED"
                url={personalTryOnView.imageUrl}
                title={`${recommendation.title} 本人试穿`}
                aspect="4/5"
                disclosure={
                  personalTryOnView.legacy
                    ? LEGACY_TRY_ON_DISCLOSURE
                    : PERSONAL_TRY_ON_DISCLOSURE
                }
              />
            </div>
          ) : null}
          <TryOnStatusPanel
            recommendation={recommendation}
            faceTryOnConsent={faceTryOnConsent}
            isPrimary
            isGenerating={isGeneratingTryOn}
            onGenerate={onGenerateTryOn}
            onAuthorizeAndGenerate={onAuthorizeAndGenerate}
          />
        </div>
        <div className="p-7 lg:p-10">
          <p className="text-xs uppercase tracking-[0.18em] text-[var(--oxblood)]">Direction 01</p>
          <h2 className="mt-4 font-editorial text-5xl font-medium leading-[0.9] text-[var(--ink)] lg:text-6xl">
            {recommendation.title}
          </h2>
          {recommendation.description ? (
            <p className="mt-5 text-sm italic leading-6 text-[var(--oxblood)]">{recommendation.description}</p>
          ) : null}
          <div className="mt-7">
            <RecommendationMeta
              archetype={recommendation.archetype}
              matchScore={recommendation.matchScore}
              macroCategory={recommendation.macroCategory}
            />
          </div>
          <p className="mt-7 text-lg leading-8 text-[var(--muted-ink)]">{recommendation.summary}</p>
          <div className="mt-8 border-t border-[var(--line)] pt-6">
            <h3 className="text-xs font-semibold uppercase tracking-[0.16em] text-[var(--ink)]">Recommended items</h3>
            <div className="mt-4">
              <RecommendationItems items={recommendation.items} />
            </div>
          </div>
          <div className="mt-7">
            <h3 className="mb-4 text-xs font-semibold uppercase tracking-[0.16em] text-[var(--ink)]">Color direction</h3>
            <ColorPalette colors={recommendation.colorPalette} />
          </div>
          <MarketplaceProductGrid recommendation={recommendation} />
          {recommendation.avoidTips.length > 0 ? (
            <div className="mt-8 border-l-2 border-[var(--oxblood)] bg-[#f8efef] p-5">
              <div className="flex items-center gap-2 text-xs font-semibold uppercase tracking-[0.14em] text-[var(--ink)]">
                <Ban className="h-4 w-4 text-[var(--oxblood)]" aria-hidden="true" />
                Avoid
              </div>
              <ul className="mt-3 space-y-2 text-sm text-[var(--muted-ink)]">
                {recommendation.avoidTips.slice(0, 3).map((tip) => <li key={tip}>— {tip}</li>)}
              </ul>
            </div>
          ) : null}
        </div>
      </article>
    </section>
  );
}
