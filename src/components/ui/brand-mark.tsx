import Link from "next/link";

interface BrandMarkProps {
  compact?: boolean;
}

export function BrandMark({ compact = false }: BrandMarkProps) {
  return (
    <Link
      href="/"
      aria-label="Style Studio home"
      className="inline-flex items-center gap-2 text-[var(--ink)]"
    >
      <span className="sr-only">Style Studio</span>
      <span
        aria-hidden="true"
        className={[
          "font-editorial uppercase leading-none tracking-[0.08em]",
          compact ? "text-xl" : "text-2xl",
        ].join(" ")}
      >
        Style
      </span>
      <span
        aria-hidden="true"
        className="h-5 w-px -skew-x-12 bg-[var(--oxblood)]"
      />
      <span
        aria-hidden="true"
        className={[
          "uppercase leading-none tracking-[0.28em] text-[var(--muted-ink)]",
          compact ? "text-[0.58rem]" : "text-[0.64rem]",
        ].join(" ")}
      >
        Studio
      </span>
    </Link>
  );
}
