import { Shirt, Sparkles, Footprints, Palette, Ban } from "lucide-react";
import { ColorPalette } from "./color-palette";

interface Recommendation {
  id: string;
  rank: number;
  isPrimary: boolean;
  title: string;
  description: string | null;
  summary: string;
  clothingAdvice: string;
  hairstyleAdvice: string;
  shoesAdvice: string;
  colorPalette: string[];
  avoidTips: string[];
}

interface FullStylingAdviceProps {
  recommendations: Recommendation[];
}

const ADVICE_BLOCKS: {
  key: keyof Pick<Recommendation, "clothingAdvice" | "hairstyleAdvice" | "shoesAdvice">;
  label: string;
  icon: React.ReactNode;
}[] = [
  { key: "clothingAdvice", label: "Outfit Direction", icon: <Shirt className="h-4 w-4" /> },
  { key: "hairstyleAdvice", label: "Hairstyle Direction", icon: <Sparkles className="h-4 w-4" /> },
  { key: "shoesAdvice", label: "Shoe Suggestions", icon: <Footprints className="h-4 w-4" /> },
];

export function FullStylingAdvice({ recommendations }: FullStylingAdviceProps) {
  return (
    <section className="mb-8">
      <p className="mb-4 text-xs font-semibold uppercase tracking-wide text-[#6F6A63]">
        Full Styling Advice
      </p>

      <div className="space-y-6">
        {recommendations.map((rec) => (
          <article key={rec.id} className="rounded-3xl border border-[#E8E2DA] bg-white p-5 shadow-sm md:p-6">
            <div className="mb-4 flex items-center gap-3">
              <span
                className={[
                  "rounded-full px-3 py-1 text-xs font-medium",
                  rec.isPrimary
                    ? "bg-[#B85C4F] text-white"
                    : "bg-[#F2F0EC] text-[#6F6A63]",
                ].join(" ")}
              >
                {rec.isPrimary ? "Primary" : `Option ${rec.rank}`}
              </span>
              <h3 className="text-lg font-semibold text-[#181614]">{rec.title}</h3>
            </div>

            <div className="grid grid-cols-1 gap-3 md:grid-cols-3">
              {ADVICE_BLOCKS.map(({ key, label, icon }) => (
                <div key={key} className="rounded-xl bg-[#FAFAF8] p-4">
                  <div className="mb-2 flex items-center gap-2 text-[#B85C4F]">
                    {icon}
                    <span className="text-xs font-semibold uppercase tracking-wide">{label}</span>
                  </div>
                  <p className="line-clamp-5 text-sm leading-relaxed text-[#181614]">{rec[key]}</p>
                </div>
              ))}
            </div>

            <div className="mt-4">
              <div className="mb-2 flex items-center gap-2 text-[#181614]">
                <Palette className="h-4 w-4 text-[#B85C4F]" />
                <span className="text-sm font-semibold">Recommended Colors</span>
              </div>
              <ColorPalette colors={rec.colorPalette} />
            </div>

            {rec.avoidTips.length > 0 && (
              <div className="mt-4 rounded-xl border border-[#E8E2DA] bg-[#FFF9F7] p-4">
                <div className="mb-2 flex items-center gap-2 text-[#181614]">
                  <Ban className="h-4 w-4 text-[#B85C4F]" />
                  <span className="text-sm font-semibold">Avoid</span>
                </div>
                <ul className="grid grid-cols-1 gap-1 sm:grid-cols-2">
                  {rec.avoidTips.map((tip, index) => (
                    <li key={index} className="flex items-start gap-2 text-sm text-[#6F6A63]">
                      <span className="mt-1.5 h-1 w-1 flex-shrink-0 rounded-full bg-[#C73E3E]" />
                      {tip}
                    </li>
                  ))}
                </ul>
              </div>
            )}
          </article>
        ))}
      </div>
    </section>
  );
}
