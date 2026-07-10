interface ReportSectionProps {
  title: string;
  children: React.ReactNode;
  className?: string;
}

export function ReportSection({ title, children, className = "" }: ReportSectionProps) {
  return (
    <section className={["mb-8", className].join(" ")}>
      <h2 className="mb-4 text-sm font-semibold uppercase tracking-wide text-[#6B6B6B]">
        {title}
      </h2>
      {children}
    </section>
  );
}
