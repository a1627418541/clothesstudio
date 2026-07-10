import { ColorPalette } from "./color-palette";
import { StylePreviewImage } from "./style-preview-image";
import { Ban } from "lucide-react";

interface Recommendation {
  id: string;
  title: string;
  description: string | null;
  summary: string;
  clothingAdvice: string;
  hairstyleAdvice: string;
  shoesAdvice: string;
  colorPalette: string[];
  avoidTips: string[];
  previewImageUrl: string | null;
  previewImageStatus: string;
  previewImageError: string | null;
}

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
