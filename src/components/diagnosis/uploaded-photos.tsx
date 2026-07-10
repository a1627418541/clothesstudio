interface Photo {
  role: string;
  url: string | null;
}

interface UploadedPhotosProps {
  photos: Photo[];
}

export function UploadedPhotos({ photos }: UploadedPhotosProps) {
  const roleLabels: Record<string, string> = {
    FACE_FRONT: "Front Face",
    FACE_SIDE: "Side Face",
    FULL_BODY: "Full Body",
  };

  return (
    <section className="mb-8">
      <p className="mb-4 text-xs font-semibold uppercase tracking-wide text-[#6F6A63]">
        Uploaded Photos
      </p>

      <div className="grid grid-cols-1 gap-4 sm:grid-cols-3">
        {photos.map((photo) => (
          <div
            key={photo.role}
            className="overflow-hidden rounded-2xl border border-[#E8E2DA] bg-white"
          >
            {photo.url ? (
              // eslint-disable-next-line @next/next/no-img-element
              <img
                src={photo.url}
                alt={roleLabels[photo.role] || photo.role}
                className="aspect-square w-full object-cover"
              />
            ) : (
              <div className="flex aspect-square items-center justify-center bg-[#FAFAF8] text-sm text-[#6F6A63]">
                Image unavailable
              </div>
            )}
            <div className="p-3">
              <p className="text-xs font-medium text-[#6F6A63]">{roleLabels[photo.role] || photo.role}</p>
            </div>
          </div>
        ))}
      </div>
    </section>
  );
}
