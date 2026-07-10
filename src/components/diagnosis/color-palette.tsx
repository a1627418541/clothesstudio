interface ColorPaletteProps {
  colors: string[];
}

export function ColorPalette({ colors }: ColorPaletteProps) {
  if (!colors || colors.length === 0) {
    return <p className="text-sm text-[#6B6B6B]">No color guidance available.</p>;
  }

  return (
    <div className="flex flex-wrap gap-2">
      {colors.map((color, index) => (
        <div
          key={index}
          className="flex items-center gap-2 rounded-full border border-[#E8E6E1] bg-white px-3 py-1.5 text-sm text-[#1A1A1A]"
        >
          <span
            className="inline-block h-4 w-4 rounded-full border border-[#E8E6E1]"
            style={{ backgroundColor: color }}
            aria-hidden="true"
          />
          <span className="capitalize">{color}</span>
        </div>
      ))}
    </div>
  );
}
