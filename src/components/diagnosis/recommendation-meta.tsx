import { ReportRecommendation } from "@/types/diagnosis";

interface RecommendationMetaProps {
  archetype: ReportRecommendation["archetype"];
  matchScore: number | null;
  macroCategory?: ReportRecommendation["macroCategory"];
  compact?: boolean;
}

export function RecommendationMeta({
  archetype,
  matchScore,
  macroCategory = null,
  compact = false,
}: RecommendationMetaProps) {
  if (!archetype) return null;

  const items: Array<[string, string]> = [
    ["Archetype", archetype.name],
    ...(archetype.personalityLabel
      ? [["Personality", archetype.personalityLabel] as [string, string]]
      : []),
    ["Category", archetype.category],
    ...(macroCategory
      ? [["Macro category", macroCategory.replaceAll("_", " ")] as [string, string]]
      : []),
    ...(matchScore === null
      ? []
      : [["Rules match", `${matchScore}%`] as [string, string]]),
  ];

  return (
    <dl
      aria-label="Recommendation match details"
      className={[
        "grid grid-cols-2 border-y border-[var(--line)]",
        compact ? "gap-x-4 py-2 text-[0.68rem]" : "gap-x-8 py-3 text-xs",
      ].join(" ")}
    >
      {items.map(([label, value]) => (
        <div
          key={`${label}-${value}`}
          className="flex justify-between gap-3 border-b border-[var(--soft-line)] py-2 last:border-b-0"
        >
          <dt className="uppercase tracking-[0.12em] text-[var(--muted-ink)]">
            {label}
          </dt>
          <dd className="text-right font-semibold text-[var(--ink)]">{value}</dd>
        </div>
      ))}
    </dl>
  );
}
