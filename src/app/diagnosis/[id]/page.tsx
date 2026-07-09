import Link from "next/link";
import { auth } from "@/lib/auth";
import { cookies } from "next/headers";
import { getAnonymousSessionByToken } from "@/lib/anonymous-session";
import { getDiagnosisDetailForViewer } from "@/lib/diagnosis-service";

interface PageProps {
  params: Promise<{ id: string }>;
}

export default async function DiagnosisDetailPage({ params }: PageProps) {
  const { id } = await params;

  const session = await auth();
  const userId = session?.user?.id ?? null;

  let anonymousSessionId: string | null = null;
  if (!userId) {
    const cookieStore = await cookies();
    const anonymousToken = cookieStore.get("aps_anonymous_session")?.value;
    if (anonymousToken) {
      const anonymousSession = await getAnonymousSessionByToken(anonymousToken);
      anonymousSessionId = anonymousSession?.id ?? null;
    }
  }

  const result = await getDiagnosisDetailForViewer({
    diagnosisId: id,
    userId,
    anonymousSessionId,
  });

  if (!result.ok) {
    const message =
      result.code === "NOT_FOUND"
        ? "Diagnosis not found."
        : "You do not have access to this diagnosis.";
    return (
      <main className="max-w-2xl mx-auto p-6">
        <h1 className="text-xl font-bold mb-4">Error</h1>
        <p className="mb-4">{message}</p>
        <Link href="/diagnosis" className="text-blue-600 hover:underline">
          Back to diagnosis
        </Link>
      </main>
    );
  }

  const diagnosis = result.diagnosis;
  const rec = diagnosis.primaryRecommendation;
  const isAnonymous = !userId;

  return (
    <main className="max-w-2xl mx-auto p-6">
      <h1 className="text-2xl font-bold mb-4">Diagnosis Report</h1>

      <section className="mb-6 border rounded-lg p-4">
        <h2 className="font-semibold mb-2">Basic Info</h2>
        <p>ID: {diagnosis.id}</p>
        <p>Gender: {diagnosis.gender}</p>
        <p>Age: {diagnosis.age}</p>
        <p>Height: {diagnosis.heightCm} cm</p>
        <p>Weight: {diagnosis.weightKg} kg</p>
        <p>Status: {diagnosis.status}</p>
      </section>

      <section className="mb-6 border rounded-lg p-4">
        <h2 className="font-semibold mb-2">Photos</h2>
        <div className="grid grid-cols-1 gap-4">
          {diagnosis.photos.map((photo) => (
            <div key={photo.role}>
              <p className="text-sm font-medium mb-1">{photo.role}</p>
              {photo.url ? (
                <img
                  src={photo.url}
                  alt={photo.role}
                  className="max-w-full h-auto rounded border"
                />
              ) : (
                <p className="text-gray-500">No image available</p>
              )}
            </div>
          ))}
        </div>
      </section>

      <section className="mb-6 border rounded-lg p-4">
        <h2 className="font-semibold mb-2">Primary Recommendation</h2>
        {rec ? (
          <div className="space-y-2">
            <h3 className="text-xl font-semibold">{rec.title}</h3>
            <p>{rec.summary}</p>
            <p><strong>Clothing:</strong> {rec.clothingAdvice}</p>
            <p><strong>Hair:</strong> {rec.hairstyleAdvice}</p>
            <p><strong>Shoes:</strong> {rec.shoesAdvice}</p>
            <p><strong>Colors:</strong> {rec.colorPalette.join(", ")}</p>
            <p><strong>Avoid:</strong> {rec.avoidTips.join(", ")}</p>
          </div>
        ) : (
          <p className="text-gray-500">No recommendation available.</p>
        )}
      </section>

      {isAnonymous && (
        <section className="border rounded-lg p-4 bg-yellow-50">
          <p>
            <strong>Login to view your full report later.</strong>{" "}
            Anonymous reports are tied to this browser session.
          </p>
        </section>
      )}

      <div className="mt-6">
        <Link href="/diagnosis" className="text-blue-600 hover:underline">
          Start a new diagnosis
        </Link>
      </div>
    </main>
  );
}
