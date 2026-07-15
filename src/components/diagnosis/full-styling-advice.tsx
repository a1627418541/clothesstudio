import { Footprints, Scissors, Shirt } from "lucide-react";
import { EditorialLabel } from "@/components/ui/editorial-label";
import { ReportRecommendation } from "@/types/diagnosis";
import { ColorPalette } from "./color-palette";
import { RecommendationMeta } from "./recommendation-meta";

const adviceBlocks = [
  ["clothingAdvice", "Outfit", Shirt],
  ["hairstyleAdvice", "Hair", Scissors],
  ["shoesAdvice", "Shoes", Footprints],
] as const;

export function FullStylingAdvice({ recommendations }: { recommendations: ReportRecommendation[] }) {
  return (
    <section className="mb-14">
      <EditorialLabel>Full styling advice</EditorialLabel>
      <div className="mt-5 space-y-8">
        {recommendations.map((recommendation) => (
          <article key={recommendation.id} className="border border-[var(--line)] bg-[var(--surface)] p-8">
            <div className="flex items-start justify-between gap-8 border-b border-[var(--line)] pb-6">
              <div>
                <p className="text-xs uppercase tracking-[0.16em] text-[var(--oxblood)]">{recommendation.isPrimary ? "Primary direction" : `Direction ${String(recommendation.rank).padStart(2, "0")}`}</p>
                <h3 className="mt-2 font-editorial text-4xl font-medium">{recommendation.title}</h3>
              </div>
              <div className="w-[430px]">
                <RecommendationMeta
                  archetype={recommendation.archetype}
                  matchScore={recommendation.matchScore}
                  macroCategory={recommendation.macroCategory}
                  compact
                />
              </div>
            </div>
            <div className="mt-7 grid grid-cols-3 divide-x divide-[var(--line)]">
              {adviceBlocks.map(([key, label, Icon], index) => (
                <div key={key} className={index === 0 ? "pr-6" : index === 2 ? "pl-6" : "px-6"}>
                  <div className="flex items-center gap-2 text-[var(--oxblood)]"><Icon className="h-4 w-4" aria-hidden="true" /><span className="text-xs font-semibold uppercase tracking-[0.14em]">{label}</span></div>
                  <p className="mt-4 text-sm leading-7 text-[var(--muted-ink)]">{recommendation[key]}</p>
                </div>
              ))}
            </div>
            <div className="mt-7 grid grid-cols-[1fr_1fr] gap-10 border-t border-[var(--line)] pt-6">
              <div><p className="mb-4 text-xs font-semibold uppercase tracking-[0.14em]">Recommended colors</p><ColorPalette colors={recommendation.colorPalette} /></div>
              {recommendation.avoidTips.length > 0 ? <div><p className="mb-4 text-xs font-semibold uppercase tracking-[0.14em]">Avoid</p><p className="text-sm leading-6 text-[var(--muted-ink)]">{recommendation.avoidTips.join(" · ")}</p></div> : null}
            </div>
          </article>
        ))}
      </div>
    </section>
  );
}
