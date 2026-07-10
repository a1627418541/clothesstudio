import { Sparkles } from "lucide-react";

interface StyleIdentityProps {
  bodyType: string | null;
  faceShape: string | null;
  vibeKeywords: string[];
  summary: string | null;
}

export function StyleIdentity({ bodyType, faceShape, vibeKeywords, summary }: StyleIdentityProps) {
  return (
    <section className="mb-8 rounded-3xl border border-[#E8E2DA] bg-white p-6 shadow-sm md:p-8">
      <div className="mb-5 flex items-center gap-3">
        <div className="flex h-10 w-10 items-center justify-center rounded-full bg-[#FFF9F7] text-[#B85C4F]">
          <Sparkles className="h-5 w-5" />
        </div>
        <div>
          <p className="text-xs font-medium uppercase tracking-wide text-[#6F6A63]">AI Style Identity</p>
          <h2 className="text-lg font-semibold text-[#181614] md:text-xl">{bodyType ?? "Custom Style"}</h2>
        </div>
      </div>

      {summary && (
        <p className="mb-4 leading-relaxed text-[#6F6A63]">{summary}</p>
      )}

      <div className="grid grid-cols-2 gap-3 sm:grid-cols-3">
        <div className="rounded-xl bg-[#FAFAF8] p-3">
          <p className="text-xs text-[#6F6A63]">Body Proportion</p>
          <p className="mt-0.5 font-medium text-[#181614]">{bodyType ?? "N/A"}</p>
        </div>
        <div className="rounded-xl bg-[#FAFAF8] p-3">
          <p className="text-xs text-[#6F6A63]">Face Shape</p>
          <p className="mt-0.5 font-medium text-[#181614]">{faceShape ?? "N/A"}</p>
        </div>
        <div className="col-span-2 rounded-xl bg-[#FAFAF8] p-3 sm:col-span-1">
          <p className="text-xs text-[#6F6A63]">Style Vibe</p>
          <p className="mt-0.5 font-medium text-[#181614]">{vibeKeywords.length > 0 ? vibeKeywords[0] : "N/A"}</p>
        </div>
      </div>

      {vibeKeywords.length > 0 && (
        <div className="mt-4 flex flex-wrap gap-2">
          {vibeKeywords.map((keyword, index) => (
            <span
              key={index}
              className="rounded-full border border-[#E8E2DA] bg-[#FAFAF8] px-3 py-1 text-xs font-medium text-[#181614]"
            >
              {keyword}
            </span>
          ))}
        </div>
      )}
    </section>
  );
}
