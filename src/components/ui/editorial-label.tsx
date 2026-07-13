interface EditorialLabelProps {
  children: React.ReactNode;
  tone?: "default" | "inverse";
}

export function EditorialLabel({
  children,
  tone = "default",
}: EditorialLabelProps) {
  return (
    <p
      className={[
        "flex items-center gap-3 text-[0.68rem] font-semibold uppercase tracking-[0.24em]",
        tone === "inverse"
          ? "text-[var(--paper)]"
          : "text-[var(--muted-ink)]",
      ].join(" ")}
    >
      <span
        className={[
          "h-px w-8",
          tone === "inverse" ? "bg-[#c6949d]" : "bg-[var(--oxblood)]",
        ].join(" ")}
        aria-hidden="true"
      />
      {children}
    </p>
  );
}
