interface ColorPaletteProps {
  colors: string[];
}

export function ColorPalette({ colors }: ColorPaletteProps) {
  if (!colors || colors.length === 0) {
    return <p className="text-sm text-[var(--muted-ink)]">No color guidance available.</p>;
  }

  return (
    <ul className="flex flex-wrap gap-x-4 gap-y-3" aria-label="Recommended colors">
      {colors.map((color, index) => (
        <li key={`${color}-${index}`} className="flex items-center gap-2 text-sm text-[var(--ink)]">
          <span
            className="h-5 w-5 border border-black/15"
            style={{ backgroundColor: color }}
            aria-hidden="true"
          />
          <span className="capitalize">{color}</span>
        </li>
      ))}
    </ul>
  );
}
