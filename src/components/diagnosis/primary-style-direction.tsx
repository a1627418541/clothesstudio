import { Ban } from "lucide-react";
import { EditorialLabel } from "@/components/ui/editorial-label";
import { ReportRecommendation } from "@/types/diagnosis";
import { ColorPalette } from "./color-palette";
import { RecommendationMeta } from "./recommendation-meta";
import { StylePreviewImage } from "./style-preview-image";

export function PrimaryStyleDirection({
  recommendation,
}: {
  recommendation: ReportRecommendation;
}) {
  return (
    <section className="mb-14">
      <EditorialLabel>Primary style direction</EditorialLabel>
      <article className="mt-5 grid grid-cols-[minmax(0,0.92fr)_minmax(0,1.08fr)] border border-[var(--line)] bg-[var(--surface)] shadow-[0_22px_65px_rgba(50,39,29,0.08)]">
        <div className="border-r border-[var(--line)] p-8">
          <StylePreviewImage
            status={recommendation.previewImageStatus}
            url={recommendation.previewImageUrl}
            title={recommendation.title}
            aspect="4/5"
          />
        </div>
        <div className="p-10">
          <p className="text-xs uppercase tracking-[0.18em] text-[var(--oxblood)]">Direction 01</p>
          <h2 className="mt-4 font-editorial text-6xl font-medium leading-[0.9] text-[var(--ink)]">
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
            <h3 className="text-xs font-semibold uppercase tracking-[0.16em] text-[var(--ink)]">Key look</h3>
            <p className="mt-3 text-sm leading-7 text-[var(--muted-ink)]">{recommendation.clothingAdvice}</p>
          </div>
          <div className="mt-7">
            <h3 className="mb-4 text-xs font-semibold uppercase tracking-[0.16em] text-[var(--ink)]">Color direction</h3>
            <ColorPalette colors={recommendation.colorPalette} />
          </div>
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
