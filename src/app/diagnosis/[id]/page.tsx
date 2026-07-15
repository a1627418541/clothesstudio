"use client";

import Link from "next/link";
import { useCallback, useEffect, useState } from "react";
import { useParams } from "next/navigation";
import { Loader2 } from "lucide-react";
import { AlternativeStyleCard } from "@/components/diagnosis/alternative-style-card";
import { FullStylingAdvice } from "@/components/diagnosis/full-styling-advice";
import { PrimaryStyleDirection } from "@/components/diagnosis/primary-style-direction";
import { ReportCover } from "@/components/diagnosis/report-cover";
import { StyleIdentity } from "@/components/diagnosis/style-identity";
import { UploadedPhotos } from "@/components/diagnosis/uploaded-photos";
import { EditorialLabel } from "@/components/ui/editorial-label";
import { SiteHeader } from "@/components/ui/site-header";
import {
  shouldAutoGenerateStylePreviews,
  shouldOfferStylePreviewRetry,
} from "@/lib/ai/style-preview-policy";
import { ReportRecommendation } from "@/types/diagnosis";

interface DiagnosisDetail {
  id: string;
  gender: string;
  age: number;
  heightCm: number;
  weightKg: number;
  status: string;
  bodyType: string | null;
  faceShape: string | null;
  vibeKeywords: string[];
  summary: string | null;
  createdAt: string;
  photos: { role: string; url: string | null }[];
  recommendations: ReportRecommendation[];
}

function ReportError({ message }: { message: string }) {
  return (
    <div className="min-h-screen bg-[var(--paper)]">
      <SiteHeader actionHref="/diagnosis" actionLabel="New diagnosis" compact />
      <main className="editorial-shell py-20">
        <section className="mx-auto max-w-3xl border border-[var(--line)] bg-[var(--surface)] p-10 text-center">
          <EditorialLabel>Report unavailable</EditorialLabel>
          <h1 className="mt-7 font-editorial text-5xl font-medium">This edition could not be opened.</h1>
          <p className="mx-auto mt-5 max-w-xl leading-7 text-[var(--muted-ink)]">{message}</p>
          <Link href="/diagnosis" className="editorial-button mt-8 px-7">Start a new diagnosis</Link>
        </section>
      </main>
    </div>
  );
}

export default function DiagnosisDetailPage() {
  const params = useParams();
  const id = params.id as string;

  const [diagnosis, setDiagnosis] = useState<DiagnosisDetail | null>(null);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);
  const [isGeneratingPreviews, setIsGeneratingPreviews] = useState(false);
  const [previewGenerationError, setPreviewGenerationError] = useState<string | null>(null);

  const fetchDiagnosis = useCallback(async () => {
    try {
      const response = await fetch(`/api/diagnosis/${id}`);
      const data = await response.json();
      if (!response.ok) throw new Error(data.error || "Failed to load report");
      setDiagnosis(data.diagnosis);
    } catch (fetchError) {
      setError(fetchError instanceof Error ? fetchError.message : "Failed to load report");
    } finally {
      setLoading(false);
    }
  }, [id]);

  useEffect(() => {
    void fetchDiagnosis();
  }, [fetchDiagnosis]);

  const requestStylePreviews = useCallback(
    async (retryFailed: boolean) => {
      if (isGeneratingPreviews) return;
      setIsGeneratingPreviews(true);
      setPreviewGenerationError(null);

      try {
        const query = retryFailed ? "?retryFailed=true" : "";
        const response = await fetch(`/api/diagnosis/${id}/style-previews${query}`, {
          method: "POST",
        });
        const data = await response.json();
        if (!response.ok || !data.ok) {
          throw new Error(data.error || "Style preview generation failed");
        }
        await fetchDiagnosis();
      } catch (generationError) {
        setPreviewGenerationError(
          generationError instanceof Error
            ? generationError.message
            : "Style preview generation failed"
        );
      } finally {
        setIsGeneratingPreviews(false);
      }
    },
    [fetchDiagnosis, id, isGeneratingPreviews]
  );

  useEffect(() => {
    if (!diagnosis || isGeneratingPreviews) return;
    if (!shouldAutoGenerateStylePreviews(diagnosis.recommendations)) return;
    void requestStylePreviews(false);
  }, [diagnosis, isGeneratingPreviews, requestStylePreviews]);

  if (loading) {
    return (
      <main className="flex min-h-screen flex-col items-center justify-center bg-[var(--paper)]" role="status">
        <Loader2 className="h-8 w-8 animate-spin text-[var(--oxblood)]" aria-hidden="true" />
        <p className="mt-4 text-xs uppercase tracking-[0.14em] text-[var(--muted-ink)]">Opening your report…</p>
      </main>
    );
  }

  if (error || !diagnosis) {
    return <ReportError message={error ?? "Report not found"} />;
  }

  const primaryRecommendation =
    diagnosis.recommendations.find((recommendation) => recommendation.isPrimary) ??
    diagnosis.recommendations[0];
  const alternatives = diagnosis.recommendations.filter(
    (recommendation) => !recommendation.isPrimary
  );
  const hasRetryableFailedPreviews = shouldOfferStylePreviewRetry(
    diagnosis.recommendations
  );
  const createdAt = new Date(diagnosis.createdAt).toLocaleDateString("en-US", {
    year: "numeric",
    month: "long",
    day: "numeric",
  });

  return (
    <div className="min-h-screen bg-[var(--paper)]">
      <SiteHeader actionHref="/diagnosis" actionLabel="New diagnosis" compact />
      <main className="editorial-shell max-w-[1240px] py-12">
        <ReportCover
          createdAt={createdAt}
          gender={diagnosis.gender}
          age={diagnosis.age}
          heightCm={diagnosis.heightCm}
          weightKg={diagnosis.weightKg}
          status={diagnosis.status}
        />

        <StyleIdentity
          bodyType={diagnosis.bodyType}
          faceShape={diagnosis.faceShape}
          vibeKeywords={diagnosis.vibeKeywords}
          summary={diagnosis.summary}
        />

        {primaryRecommendation ? (
          <PrimaryStyleDirection recommendation={primaryRecommendation} />
        ) : null}

        {alternatives.length > 0 ? (
          <section className="mb-14">
            <div className="flex items-end justify-between">
              <div>
                <EditorialLabel>Alternative directions</EditorialLabel>
                <h2 className="mt-5 font-editorial text-5xl font-medium">Two more ways forward.</h2>
              </div>
              <p className="max-w-sm text-right text-sm leading-6 text-[var(--muted-ink)]">
                Choose according to setting and mood while keeping the same underlying style logic.
              </p>
            </div>
            <div className="mt-7 grid grid-cols-2 gap-6">
              {alternatives.map((recommendation, index) => (
                <AlternativeStyleCard
                  key={recommendation.id}
                  recommendation={recommendation}
                  rank={index + 1}
                />
              ))}
            </div>
          </section>
        ) : null}

        <FullStylingAdvice recommendations={diagnosis.recommendations} />
        <UploadedPhotos photos={diagnosis.photos} />

        {hasRetryableFailedPreviews ? (
          <section className="mb-14 border border-[var(--line)] bg-[var(--surface)] p-8 text-center">
            <EditorialLabel>Preview status</EditorialLabel>
            <p className="mx-auto mt-5 max-w-xl text-sm leading-6 text-[var(--muted-ink)]">
              One or more style previews could not be generated. Failed previews never retry automatically.
            </p>
            {previewGenerationError ? (
              <p className="mt-3 text-sm text-[var(--error)]" role="alert">{previewGenerationError}</p>
            ) : null}
            <button
              type="button"
              disabled={isGeneratingPreviews}
              onClick={() => void requestStylePreviews(true)}
              className="editorial-button mt-6 px-7 disabled:cursor-not-allowed disabled:opacity-50"
            >
              {isGeneratingPreviews ? <Loader2 className="h-4 w-4 animate-spin" aria-hidden="true" /> : null}
              Retry Failed Previews
            </button>
          </section>
        ) : null}

        <div className="flex items-center justify-between border-t border-[var(--line)] py-8">
          <p className="text-xs uppercase tracking-[0.14em] text-[var(--muted-ink)]">End of personal edition</p>
          <Link href="/diagnosis" className="text-sm font-semibold text-[var(--oxblood)] hover:text-[var(--oxblood-hover)]">Start a new diagnosis</Link>
        </div>
      </main>
    </div>
  );
}
