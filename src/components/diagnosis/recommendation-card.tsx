"use client";

import { Shirt, Sparkles, Footprints, Palette, Ban } from "lucide-react";
import { ColorPalette } from "./color-palette";

interface Recommendation {
  title: string;
  description?: string | null;
  summary?: string | null;
  clothingAdvice?: string | null;
  hairstyleAdvice?: string | null;
  shoesAdvice?: string | null;
  colorPalette: string[];
  avoidTips: string[];
}

interface RecommendationCardProps {
  recommendation: Recommendation;
  variant: "primary" | "alternative";
  rank?: number;
}

const ADVICE_ITEMS: {
  key: keyof Pick<Recommendation, "clothingAdvice" | "hairstyleAdvice" | "shoesAdvice">;
  label: string;
  icon: React.ReactNode;
}[] = [
  { key: "clothingAdvice", label: "Clothing", icon: <Shirt className="h-4 w-4" /> },
  { key: "hairstyleAdvice", label: "Hair", icon: <Sparkles className="h-4 w-4" /> },
  { key: "shoesAdvice", label: "Shoes", icon: <Footprints className="h-4 w-4" /> },
];

export function RecommendationCard({ recommendation, variant, rank }: RecommendationCardProps) {
  const isPrimary = variant === "primary";

  return (
    <article
      className={[
        "rounded-2xl border p-5 md:p-6",
        isPrimary
          ? "border-[#E8E6E1] bg-white shadow-sm"
          : "border-[#E8E6E1] bg-[#FAFAF8]",
      ].join(" ")}
    >
      <header className="mb-4">
        {rank !== undefined && !isPrimary && (
          <span className="mb-2 inline-block rounded-full bg-[#E8E6E1] px-2.5 py-0.5 text-xs font-medium text-[#6B6B6B]">
            Option {rank}
          </span>
        )}
        <h3
          className={[
            "font-semibold text-[#1A1A1A]",
            isPrimary ? "text-xl md:text-2xl" : "text-lg",
          ].join(" ")}
        >
          {recommendation.title}
        </h3>
        {recommendation.description && (
          <p className="mt-2 text-sm font-medium text-[#B85C4F]">{recommendation.description}</p>
        )}
        {recommendation.summary && (
          <p className="mt-2 text-sm leading-relaxed text-[#6B6B6B]">{recommendation.summary}</p>
        )}
      </header>

      {isPrimary && (
        <div className="mb-5 grid grid-cols-1 gap-3 sm:grid-cols-3">
          {ADVICE_ITEMS.map(({ key, label, icon }) => (
            <div key={key} className="rounded-xl bg-[#FAFAF8] p-4">
              <div className="mb-2 flex items-center gap-2 text-[#B85C4F]">
                {icon}
                <span className="text-xs font-semibold uppercase tracking-wide">{label}</span>
              </div>
              <p className="text-sm leading-relaxed text-[#1A1A1A]">{recommendation[key] || "No specific guidance."}</p>
            </div>
          ))}
        </div>
      )}

      {!isPrimary && (
        <div className="mb-4 space-y-2">
          {ADVICE_ITEMS.map(({ key, label }) => (
            recommendation[key] ? (
              <p key={key} className="text-sm text-[#1A1A1A]">
                <span className="font-medium">{label}:</span>{" "}
                {recommendation[key]}
              </p>
            ) : null
          ))}
        </div>
      )}

      <div className="mb-5">
        <div className="mb-2 flex items-center gap-2 text-[#1A1A1A]">
          <Palette className="h-4 w-4 text-[#B85C4F]" />
          <span className="text-sm font-semibold">Recommended Colors</span>
        </div>
        <ColorPalette colors={recommendation.colorPalette} />
      </div>

      {recommendation.avoidTips.length > 0 && (
        <div className="rounded-xl border border-[#E8E6E1] bg-[#FFF9F7] p-4">
          <div className="mb-2 flex items-center gap-2 text-[#1A1A1A]">
            <Ban className="h-4 w-4 text-[#B85C4F]" />
            <span className="text-sm font-semibold">Avoid</span>
          </div>
          <ul className="space-y-1">
            {recommendation.avoidTips.map((tip, index) => (
              <li key={index} className="flex items-start gap-2 text-sm text-[#6B6B6B]">
                <span className="mt-1.5 h-1 w-1 flex-shrink-0 rounded-full bg-[#C73E3E]" />
                {tip}
              </li>
            ))}
          </ul>
        </div>
      )}
    </article>
  );
}
