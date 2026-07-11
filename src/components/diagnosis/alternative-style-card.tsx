import { ColorPalette } from "./color-palette";
import { StylePreviewImage } from "./style-preview-image";
import { ReportRecommendation } from "@/types/diagnosis";
import { Ban } from "lucide-react";

type Recommendation = ReportRecommendation;

interface AlternativeStyleCardProps {
  recommendation: Recommendation;
  rank: number;
}

export function AlternativeStyleCard({ recommendation, rank }: AlternativeStyleCardProps) {
  return (
    <article className="overflow-hidden rounded-3xl border border-[#E8E2DA] bg-white shadow-sm">
      <div className="p-5">
        <StylePreviewImage
          status={recommendation.previewImageStatus}
          url={recommendation.previewImageUrl}
          title={recommendation.title}
          aspect="3/4"
        />
      </div>

      <div className="px-5 pb-5">
        <span className="mb-2 inline-block rounded-full bg-[#F2F0EC] px-2.5 py-0.5 text-xs font-medium text-[#6F6A63]">
          Option {rank}
        </span>

        <h3 className="text-lg font-semibold text-[#181614]">{recommendation.title}</h3>
        {recommendation.description && (
          <p className="mt-1 text-sm font-medium text-[#B85C4F]">{recommendation.description}</p>
        )}

        {recommendation.archetype && (
          <div className="mt-2 flex flex-wrap items-center gap-2">
            <span className="inline-flex items-center rounded-full bg-[#B85C4F] px-2.5 py-0.5 text-xs font-medium text-white">
              {recommendation.archetype.name}
            </span>
            {recommendation.archetype.personalityLabel && (
              <span className="text-xs font-medium text-[#6F6A63]">
                {recommendation.archetype.personalityLabel}
              </span>
            )}
            <span className="inline-flex items-center rounded-full border border-[#E8E2DA] bg-[#FAFAF8] px-2.5 py-0.5 text-xs font-medium text-[#6F6A63]">
              {recommendation.archetype.category}
            </span>
            {recommendation.matchScore !== null && (
              <span className="inline-flex items-center gap-1 text-xs font-medium text-[#2E7D5A]">
                <span className="h-1.5 w-1.5 rounded-full bg-[#2E7D5A]" />
                {recommendation.matchScore}% match
              </span>
            )}
          </div>
        )}

        <p className="mt-2 line-clamp-3 text-sm leading-relaxed text-[#6F6A63]">{recommendation.summary}</p>

        <div className="mt-4">
          <ColorPalette colors={recommendation.colorPalette} />
        </div>

        {recommendation.avoidTips.length > 0 && (
          <div className="mt-4 rounded-xl border border-[#E8E2DA] bg-[#FFF9F7] p-3">
            <div className="mb-1 flex items-center gap-2 text-[#181614]">
              <Ban className="h-3.5 w-3.5 text-[#B85C4F]" />
              <span className="text-xs font-semibold">Avoid</span>
            </div>
            <ul className="space-y-1">
              {recommendation.avoidTips.slice(0, 2).map((tip, index) => (
                <li key={index} className="flex items-start gap-2 text-xs text-[#6F6A63]">
                  <span className="mt-1 h-1 w-1 flex-shrink-0 rounded-full bg-[#C73E3E]" />
                  {tip}
                </li>
              ))}
            </ul>
          </div>
        )}
      </div>
    </article>
  );
}
