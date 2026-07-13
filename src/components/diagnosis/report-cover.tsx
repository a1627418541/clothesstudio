import { Calendar, CheckCircle2, Clock3 } from "lucide-react";
import { EditorialLabel } from "@/components/ui/editorial-label";

interface ReportCoverProps {
  createdAt: string;
  gender: string;
  age: number;
  heightCm: number;
  weightKg: number;
  status: string;
}

export function ReportCover({
  createdAt,
  gender,
  age,
  heightCm,
  weightKg,
  status,
}: ReportCoverProps) {
  const isReady = status === "PREVIEW_READY" || status === "COMPLETED";
  const profile = [
    ["Gender", gender],
    ["Age", `${age} yrs`],
    ["Height", `${heightCm} cm`],
    ["Weight", `${weightKg} kg`],
  ];

  return (
    <header className="border border-[var(--line)] bg-[var(--surface)] p-10 shadow-[0_24px_70px_rgba(50,39,29,0.08)]">
      <div className="flex items-start justify-between">
        <EditorialLabel>Personal edition</EditorialLabel>
        <p className="flex items-center gap-2 text-xs uppercase tracking-[0.14em] text-[var(--muted-ink)]">
          <Calendar className="h-4 w-4" aria-hidden="true" />
          {createdAt}
        </p>
      </div>
      <div className="mt-12 grid grid-cols-[1fr_310px] gap-12 border-y border-[var(--line)] py-10">
        <div>
          <p className="text-xs uppercase tracking-[0.18em] text-[var(--oxblood)]">
            Style Studio report
          </p>
          <h1 className="mt-4 max-w-3xl font-editorial text-7xl font-medium leading-[0.86] text-[var(--ink)]">
            Your personal
            <br />
            style report.
          </h1>
        </div>
        <div className="border-l border-[var(--line)] pl-8">
          <p className="flex items-center gap-2 text-xs font-semibold uppercase tracking-[0.14em] text-[var(--ink)]">
            {isReady ? (
              <CheckCircle2 className="h-4 w-4 text-[var(--success)]" aria-hidden="true" />
            ) : (
              <Clock3 className="h-4 w-4 text-[var(--warning)]" aria-hidden="true" />
            )}
            {isReady ? "Report ready" : "Report in progress"}
          </p>
          <dl className="mt-6 divide-y divide-[var(--soft-line)]">
            {profile.map(([label, value]) => (
              <div key={label} className="flex justify-between gap-4 py-2.5 text-sm">
                <dt className="text-[var(--muted-ink)]">{label}</dt>
                <dd className="font-semibold text-[var(--ink)]">{value}</dd>
              </div>
            ))}
          </dl>
        </div>
      </div>
    </header>
  );
}
