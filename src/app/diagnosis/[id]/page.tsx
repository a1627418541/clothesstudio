"use client";

import Link from "next/link";
import { useEffect, useState, useCallback } from "react";
import { useParams } from "next/navigation";
import { ArrowLeft, Calendar, Loader2 } from "lucide-react";
import { StyleIdentity } from "@/components/diagnosis/style-identity";
import { PrimaryStyleDirection } from "@/components/diagnosis/primary-style-direction";
import { AlternativeStyleCard } from "@/components/diagnosis/alternative-style-card";
import { FullStylingAdvice } from "@/components/diagnosis/full-styling-advice";
import { UploadedPhotos } from "@/components/diagnosis/uploaded-photos";

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
  recommendations: Recommendation[];
}

interface Recommendation {
  id: string;
  rank: number;
  isPrimary: boolean;
  title: string;
  description: string | null;
  summary: string;
  clothingAdvice: string;
  hairstyleAdvice: string;
  shoesAdvice: string;
  colorPalette: string[];
  avoidTips: string[];
  previewImageUrl: string | null;
  previewImageStatus: string;
  previewImageError: string | null;
}

function InfoPill({ label, value }: { label: string; value: React.ReactNode }) {
  return (
    <div className="rounded-xl border border-[#E8E2DA] bg-white px-4 py-3">
      <p className="text-xs text-[#6F6A63]">{label}</p>
      <p className="mt-0.5 text-sm font-medium text-[#181614]">{value}</p>
    </div>
  );
}

function ReportError({ message }: { message: string }) {
  return (
    <main className="min-h-screen bg-[#FAFAF8] px-4 py-10">
      <div className="mx-auto max-w-2xl rounded-3xl border border-[#E8E2DA] bg-white p-8 text-center shadow-sm">
        <h1 className="mb-2 text-xl font-semibold text-[#181614]">Report Unavailable</h1>
        <p className="mb-6 text-[#6F6A63]">{message}</p>
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

export default function DiagnosisDetailPage() {
  const params = useParams();
  const id = params.id as string;

  const [diagnosis, setDiagnosis] = useState<DiagnosisDetail | null>(null);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);
  const [isGeneratingPreviews, setIsGeneratingPreviews] = useState(false);

  const fetchDiagnosis = useCallback(async () => {
    try {
      const res = await fetch(`/api/diagnosis/${id}`);
      const data = await res.json();

      if (!res.ok) {
        throw new Error(data.error || "Failed to load report");
      }

      setDiagnosis(data.diagnosis);
    } catch (err) {
      const message = err instanceof Error ? err.message : "Failed to load report";
      setError(message);
    } finally {
      setLoading(false);
    }
  }, [id]);

  useEffect(() => {
    fetchDiagnosis();
  }, [fetchDiagnosis]);

  useEffect(() => {
    if (!diagnosis || isGeneratingPreviews) return;

    const hasPending = diagnosis.recommendations.some(
      (rec) => rec.previewImageStatus === "PENDING" || rec.previewImageStatus === "FAILED"
    );

    if (!hasPending) return;

    let cancelled = false;
    setIsGeneratingPreviews(true);

    fetch(`/api/diagnosis/${id}/style-previews`, { method: "POST" })
      .then((res) => res.json())
      .then((data) => {
        if (cancelled) return;
        if (data.ok) {
          fetchDiagnosis();
        }
      })
      .catch(() => {
        // Silent fail; UI will show fallback state.
      })
      .finally(() => {
        if (!cancelled) {
          setIsGeneratingPreviews(false);
        }
      });

    return () => {
      cancelled = true;
    };
  }, [diagnosis, fetchDiagnosis, id, isGeneratingPreviews]);

  if (loading) {
    return (
      <main className="flex min-h-screen items-center justify-center bg-[#FAFAF8]">
        <Loader2 className="h-8 w-8 animate-spin text-[#B85C4F]" />
      </main>
    );
  }

  if (error || !diagnosis) {
    return <ReportError message={error ?? "Report not found"} />;
  }

  const primaryRec = diagnosis.recommendations.find((r) => r.isPrimary) ?? diagnosis.recommendations[0];
  const alternatives = diagnosis.recommendations.filter((r) => !r.isPrimary);
  const createdAt = new Date(diagnosis.createdAt).toLocaleDateString("en-US", {
    year: "numeric",
    month: "long",
    day: "numeric",
  });

  return (
    <main className="min-h-screen bg-[#FAFAF8] px-4 py-6 md:py-10">
      <div className="mx-auto max-w-5xl">
        <header className="mb-6 md:mb-8">
          <Link
            href="/diagnosis"
            className="mb-4 inline-flex items-center gap-1 text-sm font-medium text-[#6F6A63] transition-colors hover:text-[#B85C4F]"
          >
            <ArrowLeft className="h-4 w-4" />
            New diagnosis
          </Link>
          <h1 className="text-2xl font-semibold text-[#181614] md:text-3xl">Your AI Style Report</h1>
          <p className="mt-1 text-[#6F6A63]">
            A personalized style direction based on your photos and basic profile.
          </p>
          <div className="mt-3 flex flex-wrap items-center gap-3">
            <span className="inline-flex items-center gap-1.5 rounded-full bg-[#FFF9F7] px-3 py-1 text-xs font-medium text-[#B85C4F]">
              <span className="h-1.5 w-1.5 rounded-full bg-[#2E7D5A]" />
              Preview Ready
            </span>
            <span className="flex items-center gap-1 text-sm text-[#6F6A63]">
              <Calendar className="h-4 w-4" />
              {createdAt}
            </span>
          </div>
        </header>

        <section className="mb-6 rounded-2xl border border-[#E8E2DA] bg-white p-4 shadow-sm">
          <div className="grid grid-cols-2 gap-3 sm:grid-cols-4">
            <InfoPill label="Gender" value={diagnosis.gender} />
            <InfoPill label="Age" value={`${diagnosis.age} yrs`} />
            <InfoPill label="Height" value={`${diagnosis.heightCm} cm`} />
            <InfoPill label="Weight" value={`${diagnosis.weightKg} kg`} />
          </div>
        </section>

        <StyleIdentity
          bodyType={diagnosis.bodyType}
          faceShape={diagnosis.faceShape}
          vibeKeywords={diagnosis.vibeKeywords}
          summary={diagnosis.summary}
        />

        {primaryRec && <PrimaryStyleDirection recommendation={primaryRec} />}

        {alternatives.length > 0 && (
          <section className="mb-8">
            <p className="mb-2 text-xs font-semibold uppercase tracking-wide text-[#6F6A63]">
              Alternative Style Directions
            </p>
            <p className="mb-4 text-sm text-[#6F6A63]">
              Two different directions you can choose from depending on the occasion.
            </p>
            <div className="grid grid-cols-1 gap-4 md:grid-cols-2">
              {alternatives.map((rec, index) => (
                <AlternativeStyleCard key={rec.id} recommendation={rec} rank={index + 1} />
              ))}
            </div>
          </section>
        )}

        <FullStylingAdvice recommendations={diagnosis.recommendations} />

        <UploadedPhotos photos={diagnosis.photos} />

        <section className="mb-8 rounded-3xl border border-[#E8E2DA] bg-white p-6 text-center shadow-sm md:p-8">
          <h2 className="text-lg font-semibold text-[#181614]">Want to see yourself in this style?</h2>
          <p className="mx-auto mt-2 max-w-md text-sm text-[#6F6A63]">
            Next, you&apos;ll be able to generate a personalized transformation image based on this style report.
          </p>
          <div className="mt-5 flex flex-col items-center gap-3">
            <button
              type="button"
              disabled
              className="inline-flex items-center justify-center gap-2 rounded-full bg-[#E8E2DA] px-8 py-3 text-sm font-medium text-[#9B9B9B] cursor-not-allowed"
            >
              Transformation Image — Coming Soon
            </button>
            <Link
              href="/diagnosis"
              className="text-sm font-medium text-[#B85C4F] hover:text-[#9A4A3F]"
            >
              Start a New Diagnosis
            </Link>
          </div>
        </section>
      </div>
    </main>
  );
}
