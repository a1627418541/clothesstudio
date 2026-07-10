interface StylePreviewImageProps {
  status: string;
  url: string | null;
  title: string;
  aspect?: "4/5" | "3/4" | "square";
}

export function StylePreviewImage({
  status,
  url,
  title,
  aspect = "4/5",
}: StylePreviewImageProps) {
  const aspectClass =
    aspect === "4/5"
      ? "aspect-[4/5]"
      : aspect === "3/4"
      ? "aspect-[3/4]"
      : "aspect-square";

  if (status === "PENDING" || status === "PROCESSING") {
    return (
      <div
        className={[
          "flex w-full flex-col items-center justify-center rounded-2xl bg-[#F2F0EC] text-center",
          aspectClass,
        ].join(" ")}
      >
        <div className="mb-3 h-8 w-8 animate-spin rounded-full border-2 border-[#E8E2DA] border-t-[#B85C4F]" />
        <p className="px-4 text-sm text-[#6F6A63]">Generating style preview...</p>
      </div>
    );
  }

  if (status === "FAILED" || !url) {
    return (
      <div
        className={[
          "flex w-full flex-col items-center justify-center rounded-2xl bg-[#F2F0EC] text-center",
          aspectClass,
        ].join(" ")}
      >
        <svg
          className="mb-2 h-8 w-8 text-[#9B9B9B]"
          fill="none"
          viewBox="0 0 24 24"
          stroke="currentColor"
          strokeWidth={1.5}
        >
          <path
            strokeLinecap="round"
            strokeLinejoin="round"
            d="M2.25 15.75l5.159-5.159a2.25 2.25 0 013.182 0l5.159 5.159m-1.5-1.5l1.409-1.409a2.25 2.25 0 013.182 0l2.909 2.909m-18 3.75h16.5a2.25 2.25 0 002.25-2.25V6a2.25 2.25 0 00-2.25-2.25H3.75A2.25 2.25 0 001.5 6v12a2.25 2.25 0 002.25 2.25z"
          />
        </svg>
        <p className="px-4 text-sm text-[#6F6A63]">Style preview unavailable</p>
      </div>
    );
  }

  return (
    <div className={["w-full overflow-hidden rounded-2xl", aspectClass].join(" ")}>
      {/* eslint-disable-next-line @next/next/no-img-element */}
      <img
        src={url}
        alt={`${title} style preview`}
        className="h-full w-full object-cover transition-transform duration-700 hover:scale-105"
        loading="lazy"
      />
    </div>
  );
}
