import { ImageOff, Loader2 } from "lucide-react";

interface StylePreviewImageProps {
  status: string;
  url: string | null;
  title: string;
  aspect?: "4/5" | "3/4" | "square";
  disclosure?: string | null;
}

export function StylePreviewImage({
  status,
  url,
  title,
  aspect = "4/5",
  disclosure = null,
}: StylePreviewImageProps) {
  const aspectClass =
    aspect === "4/5"
      ? "aspect-[4/5]"
      : aspect === "3/4"
        ? "aspect-[3/4]"
        : "aspect-square";
  const frameClass = `flex w-full flex-col items-center justify-center rounded-[2px] bg-[#ebe5dc] text-center ${aspectClass}`;

  if (status === "PENDING" || status === "PROCESSING") {
    return (
      <div className={frameClass} role="status">
        <Loader2 className="h-7 w-7 animate-spin text-[var(--oxblood)]" aria-hidden="true" />
        <p className="mt-4 px-4 text-xs uppercase tracking-[0.12em] text-[var(--muted-ink)]">
          Generating style preview…
        </p>
      </div>
    );
  }

  if (status === "FAILED" || !url) {
    return (
      <div className={frameClass}>
        <ImageOff className="h-7 w-7 text-[#8c847b]" aria-hidden="true" />
        <p className="mt-4 px-4 text-xs uppercase tracking-[0.12em] text-[var(--muted-ink)]">
          Style preview unavailable
        </p>
      </div>
    );
  }

  return (
    <div className="w-full">
      <div className={`w-full overflow-hidden rounded-[2px] ${aspectClass}`}>
        {/* eslint-disable-next-line @next/next/no-img-element */}
        <img
          src={url}
          alt={`${title} style preview`}
          className="h-full w-full object-cover"
          loading="lazy"
        />
      </div>
      {disclosure ? (
        <p className="mt-2 text-[10px] uppercase tracking-[0.12em] text-[var(--muted-ink)]">
          {disclosure}
        </p>
      ) : null}
    </div>
  );
}
