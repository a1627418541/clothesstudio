import { EditorialLabel } from "@/components/ui/editorial-label";

interface UploadedPhotosProps {
  photos: { role: string; url: string | null }[];
}

const roleLabels: Record<string, string> = {
  FACE_FRONT: "Front face",
  FACE_SIDE: "Side profile",
  FULL_BODY: "Full body",
};

export function UploadedPhotos({ photos }: UploadedPhotosProps) {
  return (
    <section className="mb-14">
      <EditorialLabel>Source photographs</EditorialLabel>
      <div className="mt-5 grid grid-cols-3 gap-5">
        {photos.map((photo) => (
          <figure key={photo.role} className="border border-[var(--line)] bg-[var(--surface)]">
            {photo.url ? (
              // eslint-disable-next-line @next/next/no-img-element
              <img src={photo.url} alt={roleLabels[photo.role] || photo.role} className="aspect-[4/5] w-full object-cover" />
            ) : (
              <div className="flex aspect-[4/5] items-center justify-center bg-[#ebe5dc] text-sm text-[var(--muted-ink)]">Image unavailable</div>
            )}
            <figcaption className="border-t border-[var(--line)] px-4 py-3 text-xs font-semibold uppercase tracking-[0.12em] text-[var(--muted-ink)]">
              {roleLabels[photo.role] || photo.role}
            </figcaption>
          </figure>
        ))}
      </div>
    </section>
  );
}
