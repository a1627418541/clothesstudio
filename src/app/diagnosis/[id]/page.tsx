import Link from "next/link";
import { auth } from "@/lib/auth";
import { cookies } from "next/headers";
import { getAnonymousSessionByToken } from "@/lib/anonymous-session";
import { getDiagnosisDetailForViewer } from "@/lib/diagnosis-service";
import { ArrowLeft, Calendar, Loader2 } from "lucide-react";
import { RecommendationCard } from "@/components/diagnosis/recommendation-card";
import { ReportSection } from "@/components/diagnosis/report-section";

interface PageProps {
  params: Promise<{ id: string }>;
}

function InfoPill({ label, value }: { label: string; value: React.ReactNode }) {
  return (
    <div className="rounded-xl border border-[#E8E6E1] bg-white px-4 py-3">
      <p className="text-xs text-[#6B6B6B]">{label}</p>
      <p className="mt-0.5 text-sm font-medium text-[#1A1A1A]">{value}</p>
    </div>
  );
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
        ? "This report could not be found."
        : "You do not have access to this report.";
    return (
      <main className="min-h-screen bg-[#FAFAF8] px-4 py-10">
        <div className="mx-auto max-w-2xl rounded-3xl border border-[#E8E6E1] bg-white p-8 text-center shadow-sm">
          <h1 className="mb-2 text-xl font-semibold text-[#1A1A1A]">Report Unavailable</h1>
          <p className="mb-6 text-[#6B6B6B]">{message}</p>
          <Link
            href="/diagnosis"
            className="inline-flex items-center gap-2 rounded-full bg-[#B85C4F] px-6 py-2.5 text-sm font-medium text-white transition-colors hover:bg-[#9A4A3F]"
          >
            Start a New Diagnosis
          </Link>
        </div>
      </main>
    );
  }

  const diagnosis = result.diagnosis;
  const primaryRec = diagnosis.recommendations.find((r) => r.isPrimary) ?? diagnosis.recommendations[0];
  const alternatives = diagnosis.recommendations.filter((r) => !r.isPrimary);
  const isAnonymous = !userId;

  const createdAt = new Date(diagnosis.createdAt).toLocaleDateString("en-US", {
    year: "numeric",
    month: "long",
    day: "numeric",
  });

  return (
    <main className="min-h-screen bg-[#FAFAF8] px-4 py-6 md:py-10">
      <div className="mx-auto max-w-3xl">
        <header className="mb-6 md:mb-8">
          <Link
            href="/diagnosis"
            className="mb-4 inline-flex items-center gap-1 text-sm font-medium text-[#6B6B6B] transition-colors hover:text-[#B85C4F]"
          >
            <ArrowLeft className="h-4 w-4" />
            New diagnosis
          </Link>
          <h1 className="text-2xl font-semibold text-[#1A1A1A] md:text-3xl">Your Personal Style Report</h1>
          <div className="mt-2 flex items-center gap-2 text-sm text-[#6B6B6B]">
            <Calendar className="h-4 w-4" />
            {createdAt}
          </div>
        </header>

        <section className="mb-8 rounded-3xl border border-[#E8E6E1] bg-white p-6 shadow-sm md:p-8">
          <div className="mb-4 flex items-center gap-3">
            <div className="flex h-10 w-10 items-center justify-center rounded-full bg-[#FFF9F7] text-[#B85C4F]">
              <Loader2 className="h-5 w-5" />
            </div>
            <div>
              <p className="text-xs font-medium uppercase tracking-wide text-[#6B6B6B]">AI Style Identity</p>
              <h2 className="text-lg font-semibold text-[#1A1A1A] md:text-xl">{diagnosis.bodyType ?? "Custom Style"}</h2>
            </div>
          </div>

          {diagnosis.summary && (
            <p className="leading-relaxed text-[#6B6B6B]">{diagnosis.summary}</p>
          )}

          {diagnosis.vibeKeywords.length > 0 && (
            <div className="mt-4 flex flex-wrap gap-2">
              {diagnosis.vibeKeywords.map((keyword, index) => (
                <span
                  key={index}
                  className="rounded-full bg-[#FAFAF8] px-3 py-1 text-xs font-medium text-[#1A1A1A]"
                >
                  {keyword}
                </span>
              ))}
            </div>
          )}
        </section>

        <ReportSection title="Primary Recommendation">
          {primaryRec ? (
            <RecommendationCard recommendation={primaryRec} variant="primary" />
          ) : (
            <p className="text-[#6B6B6B]">No primary recommendation available.</p>
          )}
        </ReportSection>

        {alternatives.length > 0 && (
          <ReportSection title="Alternative Recommendations">
            <div className="grid grid-cols-1 gap-4 md:grid-cols-2">
              {alternatives.map((rec, index) => (
                <RecommendationCard
                  key={rec.rank}
                  recommendation={rec}
                  variant="alternative"
                  rank={index + 1}
                />
              ))}
            </div>
          </ReportSection>
        )}

        <ReportSection title="Your Photos">
          <div className="grid grid-cols-1 gap-4 sm:grid-cols-3">
            {diagnosis.photos.map((photo) => (
              <div
                key={photo.role}
                className="overflow-hidden rounded-2xl border border-[#E8E6E1] bg-white"
              >
                {photo.url ? (
                  // eslint-disable-next-line @next/next/no-img-element
                  <img
                    src={photo.url}
                    alt={photo.role}
                    className="aspect-square w-full object-cover"
                  />
                ) : (
                  <div className="flex aspect-square items-center justify-center bg-[#FAFAF8] text-sm text-[#6B6B6B]">
                    No image
                  </div>
                )}
                <div className="p-3">
                  <p className="text-xs font-medium text-[#6B6B6B]">
                    {photo.role.replace("_", " ")}
                  </p>
                </div>
              </div>
            ))}
          </div>
        </ReportSection>

        <ReportSection title="Basic Information">
          <div className="grid grid-cols-2 gap-3 sm:grid-cols-4">
            <InfoPill label="Gender" value={diagnosis.gender} />
            <InfoPill label="Age" value={`${diagnosis.age} yrs`} />
            <InfoPill label="Height" value={`${diagnosis.heightCm} cm`} />
            <InfoPill label="Weight" value={`${diagnosis.weightKg} kg`} />
          </div>
        </ReportSection>

        {isAnonymous && (
          <section className="mb-8 rounded-2xl border border-[#E8E6E1] bg-[#FFF9F7] p-4 text-sm text-[#1A1A1A]">
            <p className="font-medium">Save your report for later</p>
            <p className="mt-1 text-[#6B6B6B]">
              Anonymous reports are tied to this browser session. Sign in to keep this report forever.
            </p>
          </section>
        )}

        <div className="flex justify-center pb-8">
          <Link
            href="/diagnosis"
            className="inline-flex items-center justify-center gap-2 rounded-full bg-[#B85C4F] px-8 py-3 text-sm font-medium text-white transition-colors hover:bg-[#9A4A3F]"
          >
            Start a New Diagnosis
          </Link>
        </div>
      </div>
    </main>
  );
}
