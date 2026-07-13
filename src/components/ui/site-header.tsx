import Link from "next/link";
import { ArrowUpRight } from "lucide-react";
import { BrandMark } from "./brand-mark";

interface SiteHeaderProps {
  actionHref?: string;
  actionLabel?: string;
  compact?: boolean;
}

export function SiteHeader({
  actionHref,
  actionLabel,
  compact = false,
}: SiteHeaderProps) {
  return (
    <header className="border-b border-[var(--line)] bg-[var(--paper)]">
      <nav
        aria-label="Primary navigation"
        className={[
          "editorial-shell flex items-center justify-between",
          compact ? "h-16" : "h-20",
        ].join(" ")}
      >
        <BrandMark compact={compact} />
        {actionHref && actionLabel ? (
          <Link
            href={actionHref}
            className="group inline-flex min-h-11 items-center gap-2 border-b border-[var(--ink)] text-sm font-semibold text-[var(--ink)] transition-colors duration-200 hover:border-[var(--oxblood)] hover:text-[var(--oxblood)]"
          >
            {actionLabel}
            <ArrowUpRight
              aria-hidden="true"
              className="h-4 w-4 transition-transform duration-200 group-hover:-translate-y-0.5 group-hover:translate-x-0.5"
            />
          </Link>
        ) : null}
      </nav>
    </header>
  );
}
