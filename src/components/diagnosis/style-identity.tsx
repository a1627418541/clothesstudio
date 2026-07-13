import { EditorialLabel } from "@/components/ui/editorial-label";

interface StyleIdentityProps {
  bodyType: string | null;
  faceShape: string | null;
  vibeKeywords: string[];
  summary: string | null;
}

export function StyleIdentity({
  bodyType,
  faceShape,
  vibeKeywords,
  summary,
}: StyleIdentityProps) {
  const identity = vibeKeywords[0] ?? bodyType ?? "Custom style";

  return (
    <section className="my-10 grid grid-cols-12 gap-10 border-y border-[var(--line)] py-9">
      <div className="col-span-4">
        <EditorialLabel>Style identity</EditorialLabel>
        <h2 className="mt-5 font-editorial text-5xl font-medium capitalize leading-none text-[var(--ink)]">
          {identity}
        </h2>
      </div>
      <div className="col-span-8">
        {summary ? (
          <p className="max-w-3xl text-lg leading-8 text-[var(--muted-ink)]">{summary}</p>
        ) : null}
        <dl className="mt-7 grid grid-cols-3 border-t border-[var(--line)]">
          <div className="border-r border-[var(--line)] py-4 pr-5">
            <dt className="text-[0.65rem] uppercase tracking-[0.14em] text-[var(--muted-ink)]">Body proportion</dt>
            <dd className="mt-2 font-semibold capitalize text-[var(--ink)]">{bodyType ?? "N/A"}</dd>
          </div>
          <div className="border-r border-[var(--line)] px-5 py-4">
            <dt className="text-[0.65rem] uppercase tracking-[0.14em] text-[var(--muted-ink)]">Face shape</dt>
            <dd className="mt-2 font-semibold capitalize text-[var(--ink)]">{faceShape ?? "N/A"}</dd>
          </div>
          <div className="py-4 pl-5">
            <dt className="text-[0.65rem] uppercase tracking-[0.14em] text-[var(--muted-ink)]">Style cues</dt>
            <dd className="mt-2 font-semibold capitalize text-[var(--ink)]">{vibeKeywords.length > 0 ? vibeKeywords.join(" · ") : "N/A"}</dd>
          </div>
        </dl>
      </div>
    </section>
  );
}
