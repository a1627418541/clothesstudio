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

interface PrimaryStyleDirectionProps {
  recommendation: Recommendation;
}

export function PrimaryStyleDirection({ recommendation }: PrimaryStyleDirectionProps) {
  return (
    <section className="mb-8">
      <p className="mb-4 text-xs font-semibold uppercase tracking-wide text-[#6F6A63]">
        Primary Style Direction
      </p>

      <article className="overflow-hidden rounded-3xl border border-[#E8E2DA] bg-white shadow-sm">
        <div className="grid grid-cols-1 md:grid-cols-2">
          <div className="p-5 md:p-8">
            <StylePreviewImage
              status={recommendation.previewImageStatus}
              url={recommendation.previewImageUrl}
              title={recommendation.title}
              aspect="4/5"
            />
          </div>

          <div className="p-5 md:p-8 md:pl-0">
            <h3 className="text-2xl font-semibold text-[#181614] md:text-3xl">
              {recommendation.title}
            </h3>
            {recommendation.description && (
              <p className="mt-2 text-sm font-medium text-[#B85C4F]">{recommendation.description}</p>
            )}
            <p className="mt-3 leading-relaxed text-[#6F6A63]">{recommendation.summary}</p>

            <div className="mt-6">
              <p className="mb-2 text-sm font-semibold text-[#181614]">Key Look</p>
              <p className="text-sm leading-relaxed text-[#6F6A63]">{recommendation.clothingAdvice}</p>
            </div>

            <div className="mt-6">
              <p className="mb-2 text-sm font-semibold text-[#181614]">Recommended Colors</p>
              <ColorPalette colors={recommendation.colorPalette} />
            </div>

            {recommendation.avoidTips.length > 0 && (
              <div className="mt-6 rounded-xl border border-[#E8E2DA] bg-[#FFF9F7] p-4">
                <div className="mb-2 flex items-center gap-2 text-[#181614]">
                  <Ban className="h-4 w-4 text-[#B85C4F]" />
                  <span className="text-sm font-semibold">Avoid</span>
                </div>
                <ul className="space-y-1">
                  {recommendation.avoidTips.slice(0, 3).map((tip, index) => (
                    <li key={index} className="flex items-start gap-2 text-sm text-[#6F6A63]">
                      <span className="mt-1.5 h-1 w-1 flex-shrink-0 rounded-full bg-[#C73E3E]" />
                      {tip}
                    </li>
                  ))}
                </ul>
              </div>
            )}
          </div>
        </div>
      </article>
    </section>
  );
}
