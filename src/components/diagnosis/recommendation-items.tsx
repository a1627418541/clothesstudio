import { RecommendationItem } from "@/lib/ai/style-ai-provider";

const categoryLabels: Record<RecommendationItem["category"], string> = {
  top: "Top",
  bottom: "Bottom",
  outerwear: "Outerwear",
  dress: "Dress",
  shoes: "Shoes",
  accessory: "Accessory",
  bag: "Bag",
};

function CategoryTag({ category }: { category: RecommendationItem["category"] }) {
  return (
    <span className="text-[10px] font-semibold uppercase tracking-[0.14em] text-[var(--oxblood)]">
      {categoryLabels[category]}
    </span>
  );
}

function ColorSwatches({ colors }: { colors: string[] }) {
  return (
    <div className="mt-2 flex flex-wrap items-center gap-2">
      {colors.map((color) => (
        <span
          key={color}
          className="inline-flex items-center gap-1.5 rounded-full border border-[var(--line)] bg-[var(--paper)] px-2 py-1 text-[10px] uppercase tracking-wide text-[var(--muted-ink)]"
        >
          <span
            className="inline-block h-2.5 w-2.5 rounded-full border border-black/10"
            style={{ backgroundColor: color }}
            aria-hidden="true"
          />
          {color}
        </span>
      ))}
    </div>
  );
}

export function RecommendationItems({
  items,
  limit,
  showOptional = true,
}: {
  items: RecommendationItem[];
  limit?: number;
  showOptional?: boolean;
}) {
  const displayItems = limit ? items.slice(0, limit) : items;

  if (displayItems.length === 0) {
    return (
      <p className="text-sm italic text-[var(--muted-ink)]">
        No item recommendations available for this direction.
      </p>
    );
  }

  return (
    <ul className="space-y-4">
      {displayItems.map((item, index) => (
        <li
          key={`${item.name}-${index}`}
          className="border-b border-[var(--line)] pb-4 last:border-0 last:pb-0"
        >
          <div className="flex items-start justify-between gap-4">
            <div>
              <CategoryTag category={item.category} />
              <h4 className="mt-1 font-medium text-[var(--ink)]">{item.name}</h4>
            </div>
            {showOptional && item.optional ? (
              <span className="shrink-0 text-[10px] uppercase tracking-[0.12em] text-[var(--muted-ink)]">
                Optional
              </span>
            ) : null}
          </div>
          <p className="mt-1 text-sm leading-6 text-[var(--muted-ink)]">{item.why}</p>
          <ColorSwatches colors={item.colors} />
          <p className="mt-2 text-xs leading-5 text-[var(--muted-ink)]">
            <span className="font-semibold text-[var(--ink)]">Fit: </span>
            {item.fitNotes}
          </p>
        </li>
      ))}
    </ul>
  );
}
