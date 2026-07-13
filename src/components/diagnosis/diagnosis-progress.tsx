import { Check } from "lucide-react";

export type DiagnosisStep = "upload" | "info" | "report";

const STEPS: { id: DiagnosisStep; number: string; label: string }[] = [
  { id: "upload", number: "01", label: "Photographs" },
  { id: "info", number: "02", label: "Your profile" },
  { id: "report", number: "03", label: "Your report" },
];

export function DiagnosisProgress({ current }: { current: DiagnosisStep }) {
  const currentIndex = STEPS.findIndex((step) => step.id === current);

  return (
    <nav aria-label="Diagnosis progress">
      <ol className="grid grid-cols-3 border-y border-[var(--line)]">
        {STEPS.map((step, index) => {
          const isCurrent = step.id === current;
          const isComplete = index < currentIndex;

          return (
            <li
              key={step.id}
              aria-current={isCurrent ? "step" : undefined}
              className="flex min-h-16 items-center gap-3 border-r border-[var(--line)] px-5 last:border-r-0"
            >
              <span
                className={[
                  "font-editorial text-2xl",
                  isCurrent ? "text-[var(--oxblood)]" : "text-[var(--muted-ink)]",
                ].join(" ")}
                aria-hidden="true"
              >
                {isComplete ? <Check className="h-4 w-4 text-[var(--success)]" /> : step.number}
              </span>
              <span className="text-xs font-semibold uppercase tracking-[0.12em] text-[var(--ink)]">
                {step.label}
              </span>
              {isComplete ? <span className="sr-only">Completed</span> : null}
            </li>
          );
        })}
      </ol>
    </nav>
  );
}
